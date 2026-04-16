from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from playwright.sync_api import Locator, Page

from utils import normalize_text
from config import get_selectors

@dataclass 
class CardCandidate:
    card: Locator
    clickable: Optional[Locator]
    product_name: str = ""
    price: str = ""
    
class ListingCrawler:
    def __init__(self, page: Page,selector_config: dict, scroll_pause_ms: int = 1500):
        self.page = page
        self.selector_config = selector_config
        self.scroll_pause_ms = scroll_pause_ms
    
    def _selectors(self, *keys: str) -> list[str]:
        return get_selectors(self.selector_config, *keys)
    
    def wait_until_ready(self,timeout_ms: int = 15000) -> None:
        ready_selectors = self._selectors("listing", "readySelectors")
        card_selectors = self._selectors("listing", "productCard")
        
        last_error = None
        for selector in ready_selectors + card_selectors:
            try: 
                self.page.locator(selector).first.wait_for(
                    state="visible", 
                    timeout=timeout_ms
                )
                return
            except Exception as error:
                last_error = error
        
        raise TimeoutError(f"Listing page chưa sẵn sàng: {last_error}")
    
    def get_visible_cards(self) -> list[CardCandidate]:
        product_card_selectors = self._selectors("listing", "productCard")
        clickable_selectors = self._selectors("listing", "productClickable")
        name_selectors = self._selectors("listing", "productName")
        price_selectors = self._selectors("listing", "price")
        
        cards: list[CardCandidate] = []
        
        for card_selector in product_card_selectors:
            locator = self.page.locator(card_selector)
            count = locator.count()
            
            for idx in range(count):
                card = locator.nth(idx)
                
                clickable: Optional[Locator] = None
                for clickable_selector in clickable_selectors:
                    inner = card.locator(clickable_selector)
                    if inner.count() > 0:
                        clickable = inner.first
                        break
                
                product_name = ""
                for name_selector in name_selectors:
                    inner = card.locator(name_selector)
                    if inner.count() > 0:
                        try: 
                            product_name = normalize_text(
                                inner.first.inner_text(timeout=1000)
                            )
                            if product_name:
                                break
                        except Exception: 
                            pass
                
                price = ""
                for price_selector in price_selectors:
                    inner = card.locator(price_selector)
                    if inner.count() > 0:
                        try: 
                            price = normalize_text(
                                inner.first.inner_text(timeout=1000)
                            )   
                            if price:
                                break
                        except Exception:
                            pass
                
                if not clickable and not product_name:
                    continue
                
                cards.append(
                    CardCandidate(
                        card=card,
                        clickable=clickable,
                        product_name=product_name,
                        price=price,
                    )
                )
            if cards:
                return cards
        return []
    
    def scroll_for_new_batch(self) -> None:
        self.page.mouse.wheel(0, 2500)
        self.page.wait_for_timeout(self.scroll_pause_ms)
    
    def get_page_signature(self) -> str:
        cards = self.get_visible_cards()
        parts: list[str] = []
        
        for item in cards[:12]:
            parts.append(f"{item.product_name}|{item.price}")
        return " || ".join(parts)