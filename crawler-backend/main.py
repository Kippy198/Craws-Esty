from __future__ import annotations

from typing import Optional
from playwright.sync_api import Browser, Page, sync_playwright

from config import(
    get_listing_url,
    get_listing_url_match,
    get_site_base_url,
    load_selector_config,
)

from detail_extractor import DetailExtractor
from listing_crawler import ListingCrawler
from models import CrawlOptions,CrawlResult
from transformer import transform_raw_to_record
from utils import build_fingerprint, save_json

def pick_existing_page(browser: Browser, preferred_base_url: str) -> Optional[Page]:
    for context in browser.contexts:
        for page in context.pages:
            try:
                url = page.url or ""
                if preferred_base_url and preferred_base_url in url:
                    return page
            except Exception:
                continue
    for context in browser.contexts:
        for page in context.pages:
            return page
    
    return None

def is_listing_page(url: str, listing_url_match: str ) -> bool:
    if not url or not listing_url_match:
        return False
    return listing_url_match in url

def run_crawl(options: CrawlOptions) -> CrawlResult:
    selector_config = load_selector_config()
    base_url = get_site_base_url(selector_config)
    listing_url = get_listing_url(selector_config)
    listing_url_match = get_listing_url_match(selector_config)
    
    result = CrawlResult()
    result.stats.requested_count = options.max_items
    
    seen_fingerprints: set[str] = set()
    empty_rounds = 0
    modal_fail_streak = 0
    
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(options.connect_url)
        page = pick_existing_page(browser, base_url)
        
        if page is None:
            raise RuntimeError("Không tìm thấy tab/page nào để crawl")
        
        page.set_default_timeout(options.page_timeout_ms)
        
        if not is_listing_page(page.url, listing_url_match):
            if listing_url:
                page.goto(listing_url, wait_until="domcontentloaded")
            else: 
                raise RuntimeError("Page hiện tại không phairm listing page")
        
        listing = ListingCrawler(
            page=page,
            selector_config=selector_config,
            scroll_pause_ms=options.scroll_pause_ms,
        )
        detail = DetailExtractor(
            page=page,
            selector_config=selector_config,
            base_url=base_url,
            modal_timeout_ms=options.modal_timeout_ms,
        )
        
        
        
        listing.wait_until_ready(timeout_ms=options.page_timeout_ms)
        
        while True:
            if options.max_items is not None and len(result.items) >= options.max_items:
                result.stats.stop_reason = "reached_requested_count"
                break
            cards = listing.get_visible_cards()
            
            if not cards:
                empty_rounds += 1
                if empty_rounds >= options.max_empty_rounds:
                    result.stats.stop_reason = "no_visible_cards"
                    break
                listing.scroll_for_new_batch()
                result.stats.scroll_rounds += 1
                continue
            
            new_item_found_in_found = False
            
            for candidate in cards: 
                result.stats.scanned_card_count += 1
                
                if options.max_items is not None and len(result.items) >= options.max_items:
                    result.stats.stop_reason = "reached_requested_count"
                    break
                
                if candidate.clickable is None:
                    continue
                
                opened = detail.open_detail_from_card(candidate.clickable)
                if not opened:
                    result.stats.modal_open_fail_count += 1
                    modal_fail_streak += 1
                    
                    if modal_fail_streak >= options.max_modal_fail_streak:
                        result.stats.stop_reason = "too_many_modal_failures"
                        return result

                    continue
                try: 
                    raw = detail.extract_modal_data()
                    if not raw.product_name:
                        raise Exception('Modal chưa render xong')
                    record = transform_raw_to_record(raw, base_url=base_url)
                    
                    fingerprint = build_fingerprint(
                        listing_link=record.listing_link,
                        main_image=record.main_image,
                        product_name=record.product_name,
                        price=record.price or "",
                        shop_name=record.shop_name or "",
                    )
                    
                    if not fingerprint:
                        fingerprint = f"{candidate.product_name}|{candidate.price}"
                    if fingerprint in seen_fingerprints:
                        result.stats.duplicate_count += 1
                        continue
                    
                    seen_fingerprints.add(fingerprint)
                    new_item_found_in_found = True
                    modal_fail_streak = 0
                    
                    if record.is_valid():
                        result.items.append(record)
                        result.stats.valid_count += 1
                    else:
                        result.stats.invalid_count += 1
                except Exception:
                    result.stats.extract_fail_count += 1
                finally:
                    detail.close_modal()
            if result.stats.stop_reason:
                break
            if new_item_found_in_found:
                empty_rounds = 0
            else :
                empty_rounds += 1
            
            if empty_rounds >= options.max_empty_rounds:
                result.stats.stop_reason = "no_new_items_after_scroll_rounds"
                break
            
            before_signature = listing.get_page_signature()
            listing.scroll_for_new_batch()
            after_signature = listing.get_page_signature()
            result.stats.scroll_rounds += 1
            
            if before_signature == after_signature:
                empty_rounds += 1
            
            if empty_rounds >= options.max_empty_rounds:
                result.stats.stop_reason = "listing_not_changing"
                break
    save_json(options.output_path, result.to_dict())
    return result

if __name__ == "__main__":
    options = CrawlOptions(
        max_items=42,
        connect_url="http://127.0.0.1:9222",
        output_path="output/product.json",
    ) 
    
    result = run_crawl(options)
    print(f"Scanned cards: {result.stats.scanned_card_count}")
    print(f"Valid items: {result.stats.valid_count}")
    print(f"Invalid items: {result.stats.invalid_count}")
    print(f"Duplicates: {result.stats.duplicate_count}")
    print(f"Stop reason: {result.stats.stop_reason}")
    print(f"Saved to: {options.output_path}")