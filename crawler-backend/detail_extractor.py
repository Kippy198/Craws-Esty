from __future__ import annotations

from typing import Optional

from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

from config import get_selectors
from models import ListingDetailRaw

from utils import (
    normalize_text,
    normalize_url
)

class DetailExtractor: 
    def __init__(
            self, 
            page: Page, 
            selector_config: dict, 
            base_url:str, 
            modal_timeout_ms: int = 8000
        ):
            self.page = page
            self.selector_config = selector_config
            self.base_url = base_url
            self.modal_timeout_ms = modal_timeout_ms
        
    def _selectors(self, *keys: str) -> list[str]:
        return get_selectors(self.selector_config, *keys)
    
    def _first_page_locator(self, selectors: list[str]) -> Optional[Locator]:
        for selector in selectors:
            try: 
                locator = self.page.locator(selector)
                if locator.count() > 0:
                    return locator.first
            except Exception: 
                continue
        return None
    
    def _safe_text_from_page(
        self, 
        selectors: list[str], 
        timeout: int = 1500
        ) -> str:
        locator = self._first_page_locator(selectors)
        if locator is None:
            return ""
        try: 
            return normalize_text(locator.inner_text(timeout=timeout))
        except Exception:
            return ""
        
    def _safe_all_texts_from_page(self, selectors: list[str]) -> list[str]:
        for selector in selectors:
            try: 
                locator = self.page.locator(selector)
                if locator.count() == 0:
                    continue
                texts = locator.all_inner_texts()
                cleaned = [normalize_text(text) for text in texts if normalize_text(text)]
                if cleaned:
                    return cleaned
            except Exception:
                continue
        return []
    
    def _safe_attr_from_page(
            self, 
            selectors: list[str], 
            attr_name: str,
            timeout: int = 1500,
        ) -> str:
            locator = self._first_page_locator(selectors)
            if not locator:
                return ""
            try:
                value = locator.get_attribute(attr_name, timeout=timeout)
                return (value or "").strip()
            except Exception:
                return ""

    def wait_modal_open(self) -> None:
        root_selectors = self._selectors("detailModal", "root")
        content_selector_groups = [
            self._selectors("detailModal", "productName"),
            self._selectors("detailModal", "mainImage"),
        ]
        last_error = None
        
        for selector in root_selectors:
            try:
                self.page.locator(selector).first.wait_for(
                    state="visible",
                    timeout=self.modal_timeout_ms,
                )
                self.page.wait_for_timeout(1500)
                
                for content_selectors in content_selector_groups:
                    for content_selector in content_selectors:
                        try:
                            self.page.locator(content_selector).first.wait_for(
                                state="visible",
                                timeout=2000,
                            )
                            return
                        except Exception:
                            continue
                
                for content_selectors in content_selector_groups:
                    locator = self._first_page_locator(content_selectors)
                    if locator is not None:
                        return
                last_error = "Modal root mở nhưng không thấy content chính"
            except Exception as error: 
                last_error = error
        raise PlaywrightTimeoutError(f"Khôn thấy modal detail mở ra: {last_error}")
    
    def wait_modal_close(self) -> None:
        root_selectors = self._selectors("detailModal","root")
        for selector in root_selectors:
            try:
                self.page.locator(selector).first.wait_for(
                    state="hidden",
                    timeout=3000,
                )
                return
            except Exception:
                continue
    
    def open_detail_from_card(self, clickable:Locator) -> bool:
        try:
            clickable.scroll_into_view_if_needed(timeout=2000)
            
            try:
                clickable.click(timeout=3000)
            except Exception:
                clickable.click(timeout=3000, force=True)  
                
            self.page.wait_for_timeout(1200)
            self.wait_modal_open()
            
            return True
        except Exception:
            return False
    
    def close_modal(self) -> None:
        close_selectors = self._selectors("detailModal", "closeButton")
        
        for selector in close_selectors:
            try:
                locator = self.page.locator(selector)
                if locator.count() == 0:
                    continue
                locator.first.click(timeout=1500)
                self.wait_modal_close()
                return
            except Exception:
                continue
        try: 
            self.page.keyboard.press("Escape")
            self.wait_modal_close()
        except Exception:
            pass
    
    def extract_modal_data(self) -> ListingDetailRaw:
        self.page.wait_for_timeout(1000)
        product_name = self._safe_text_from_page(
            self._selectors("detailModal", "productName")
        )
        price = self._safe_text_from_page(
            self._selectors("detailModal", "price")
        )
        if price:
            price = price.replace("Price","").strip()
        shop_name = self._safe_text_from_page(
            self._selectors("detailModal", "shopName")
        )
        sold = self._safe_text_from_page(
            self._selectors("detailModal", "sold")
        )

        shop_link = normalize_url(
            self._safe_attr_from_page(
                self._selectors("detailModal", "shopLink"),
                "href",
            ),
            self.base_url,
        )

        main_image = normalize_url(
            self._safe_attr_from_page(
                self._selectors("detailModal", "mainImage"),
                "src",
            ),
            self.base_url,
        )

        listing_link = normalize_url(
            self._safe_attr_from_page(
                self._selectors("detailModal", "listingLink"),
                "href",
            ),
            self.base_url,
        )

        shop_redirect_link = normalize_url(
            self._safe_attr_from_page(
                self._selectors("detailModal", "shopRedirectLink"),
                "href",
            ),
            self.base_url,
        )

        breadcrumb_links = self._safe_all_texts_from_page(
            self._selectors("detailModal", "breadcrumbLinks")
        )
        
        return ListingDetailRaw(
            product_name=product_name,
            price=price or None,
            shop_name=shop_name or None,
            shop_link=shop_link or None,
            main_image=main_image,
            listing_link=listing_link,
            shop_redirect_link=shop_redirect_link or None,
            sold=sold or None,
            breadcrumb_links=breadcrumb_links,
        )