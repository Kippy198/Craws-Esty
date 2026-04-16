from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
SELECTOR_FILE = BASE_DIR/"selector_config.json"

def load_selector_config() -> dict[str, Any]:
    if not SELECTOR_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file selector: {SELECTOR_FILE}")

    try:
        with SELECTOR_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"File selector JSON bị lỗi format: {e}")
    
def get_selectors(config: dict[str, Any], *keys:str) -> list[str]:
    node:Any = config
    for key in keys:
        if not isinstance(node, dict):
            return []
        node = node.get(key)
    
    if isinstance(node,list):
        return [x for x in node if isinstance(x,str) and x.strip()]
    
    return[]

def get_site_base_url(config: dict[str, Any]) -> str:
    return config.get("site",{}).get("baseUrl","")

def get_listing_url(config: dict[str, Any]) -> str:
    return config.get("site", {}).get("listingUrl","")

def get_listing_url_match(config: dict[str, Any]) -> str:
    return config.get("pageDetection",{}).get("listingUrlIncludes","")