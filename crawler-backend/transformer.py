from __future__ import annotations

from models import ListingDetailRaw, ProductRecord
from utils import category_to_string, normalize_text, normalize_url

def transform_raw_to_record(raw: ListingDetailRaw, base_url: str = "")->ProductRecord:
    product_name = normalize_text(raw.product_name)
    main_image = normalize_url(raw.main_image,base_url)
    listing_link = normalize_url(raw.listing_link, base_url)
    
    price = normalize_text(raw.price) if raw.price else None
    sold = normalize_text(raw.sold) if raw.sold else None
    shop_name = normalize_text(raw.shop_name) if raw.shop_name else None
    shop_link = normalize_url(raw.shop_link, base_url) if raw.shop_link else None
    
    breadcrumb_links = [normalize_text(x) for x in raw.breadcrumb_links if normalize_text(x)]
    category = category_to_string(breadcrumb_links)
    
    return ProductRecord(
        product_name=product_name,
        main_image=main_image,
        listing_link=listing_link,
        category=category,
        price=price,
        sold=sold,
        shop_name=shop_name,
        shop_link=shop_link,
        breadcrumb_links=breadcrumb_links,
    )