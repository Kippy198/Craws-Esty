from __future__ import annotations

from models import ListingDetailRaw, ProductRecord
from utils import build_shop_url, category_to_string, normalize_text, normalize_url

def transform_raw_to_record(raw: ListingDetailRaw, base_url: str = "")->ProductRecord:
    product_name = normalize_text(raw.product_name)
    main_image = normalize_url(raw.main_image,base_url)
    
    price = normalize_text(raw.price) if raw.price else None
    sold = normalize_text(raw.sold) if raw.sold else None

    shop_name = normalize_text(raw.shop_name) if raw.shop_name else None
    shop_identifier = normalize_text(raw.shop_identifier) if raw.shop_identifier else None

    breadcrumb_links = [normalize_text(x) for x in raw.breadcrumb_links if normalize_text(x)]
    category = category_to_string(breadcrumb_links)

    shop_listing_url = (
        build_shop_url(base_url, shop_identifier)
        if shop_identifier
        else None
    )
    
    return ProductRecord(
        product_name=product_name,
        main_image=main_image,
        category=category,
        price=price,
        sold=sold,
        shop_name=shop_name,
        shop_identifier=shop_identifier,
        shop_listing_url=shop_listing_url,
    )