from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

#
# XỬ LÝ TEXT
#

def normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()

def first_non_empty(values: list[Optional[str]]) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return normalize_text(value)
    return ""

#
# XỬ LÝ URL
#

def normalize_url(url: Optional[str],base_url: str = "") -> str:
    if not url:
        return ""
    
    url = (url or "").strip()
    
    if base_url:
        return urljoin(base_url,url)
    return url

def is_listing_url(url: str, listing_url_includes: str) -> bool:
    if not url or not listing_url_includes:
        return False
    return listing_url_includes in url
#
#  XỬ LÝ CATEGORY 
#

def build_category_path(parts: list[str]) -> list[str]:
    result: list[str] = []
    seen = set()
    
    for part in parts:
        clean = normalize_text(part)
        if not clean:
            continue
        if clean in seen:
            continue
        
        seen.add(clean)
        result.append(clean)
    return result

def category_to_string(parts: list[str]) -> str:
    cleaned = build_category_path(parts)
    return " -> ".join(cleaned)
    
#
# TẠO FINGERPRINT ĐỂ XÁC NHẬN SẢN PHẨM
#
def build_fingerprint(
    listing_link: str = "",
    main_image: str = "",
    product_name: str = "",
    price: str = "",
    shop_name: str = "",
) -> str: 
    candidates = [
        listing_link.strip(),
        main_image.strip(),
        "|".join(
            [
                product_name.strip(),
                price.strip(),
                shop_name.strip(),
            ]
        ).strip("|"),
    ]
    
    for item in candidates:
        if item:
            return item
    return ""

#
# FILE OUTPUT
#
def ensure_output_dir(file_path: str) -> None:
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    
def save_json(file_path: str, payload: dict) -> None:
    ensure_output_dir(file_path)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)