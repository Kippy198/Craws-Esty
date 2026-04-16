from __future__ import annotations

from dataclasses import dataclass, field,asdict
from datetime import datetime
from typing import Any, Optional

@dataclass
class ListingCardPreview:
    product_name: str = ""
    price: Optional[str] = None
    
    def to_dict(self) -> dict[str,Any]:
        return asdict(self)

@dataclass
class ListingDetailRaw:
    product_name: str = ""
    price: Optional[str] = None
    
    shop_name: str = ""
    shop_link: Optional[str] = None
    
    main_image: str = ""
    listing_link: str = ""
    shop_redirect_link: Optional[str] = None
    
    sold: Optional[str] = None
    breadcrumb_links: list[str] = field(default_factory=list)
    
    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

@dataclass
class ProductRecord:
    product_name: str = ""
    main_image: str = ""
    listing_link: str = ""
    category: str = ""
    
    price: Optional[str] = None
    sold: Optional[str] = None
    shop_name: Optional[str] = None
    shop_link: Optional[str] = None
    
    breadcrumb_links: list[str] = field(default_factory=list)
    
    def is_valid(self) -> bool:
        return bool(
            self.product_name.strip()
            and self.main_image.strip()
            and self.listing_link.strip()
            and self.category.strip()
        )
    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
    
@dataclass
class CrawlOptions:
    max_items: Optional[int] = None
    connect_url: str = "http://127.0.0.1:9222"
    
    page_timeout_ms: int = 15000
    modal_timeout_ms: int = 8000
    scroll_pause_ms: int = 1500
    
    max_empty_rounds: int = 5
    max_modal_fail_streak: int = 10
    
    output_path: str = "output/product.json"
    
@dataclass
class CrawlStats:
    requested_count: Optional[int] = None 
    
    scanned_card_count: int = 0
    valid_count: int = 0
    invalid_count: int = 0
    duplicate_count: int = 0
    
    modal_open_fail_count: int = 0
    extract_fail_count: int = 0
    scroll_rounds: int = 0
    
    stop_reason: str = ""
    
    def to_dict(self) -> dict[str,Any]:
        return asdict(self)
    
@dataclass
class CrawlResult:
    items: list[ProductRecord] = field(default_factory=list)
    stats: CrawlStats = field(default_factory=CrawlStats)
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "items": [item.to_dict() for item in self.items],
            "stats": self.stats.to_dict(),
        }