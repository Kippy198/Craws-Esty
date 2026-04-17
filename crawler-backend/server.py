from __future__ import annotations

import threading
import uuid
from typing import Any, Dict, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from main import run_crawl
from models import CrawlOptions

app = FastAPI(title="Crawl Backend")
JobStatus = Literal["queued", "running", "done", "error"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartCrawRequest(BaseModel):
    url: str = Field(..., min_length=1)
    count: Optional[int] = Field(default=None)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("url is required")
        return value

    @field_validator("count")
    @classmethod
    def validate_count(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value <= 0:
            raise ValueError("count must be > 0")
        return value

class JobState(BaseModel):
    jobId: str
    status: JobStatus = "queued"
    targetCount: int = 0
    crawledCount: int = 0
    validCount: int = 0
    invalidCount: int = 0
    duplicateCount: int = 0
    scrollRounds: int = 0
    done: bool = False
    errorMessage: str = ""
    stopReason: str = ""
    products: list[dict[str, Any]] = Field(default_factory=list)

jobs_store: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()

def make_default_job(job_id: str, target_count: int) -> Dict[str, Any]:
    return {
        "jobId": job_id,
        "status": "queued",
        "targetCount": target_count,
        "crawledCount": 0,
        "validCount": 0,
        "invalidCount": 0,
        "duplicateCount": 0,
        "scrollRounds": 0,
        "done": False,
        "errorMessage": "",
        "stopReason": "",
        "products": [],
    }

def get_job_or_404(job_id: str) -> Dict[str, Any]:
    with jobs_lock:
        job = jobs_store.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Cant find a Job")
        return dict(job)


def update_job(job_id: str, patch: Dict[str, Any]) -> None:
    with jobs_lock:
        if job_id not in jobs_store:
            return
        jobs_store[job_id].update(patch)

def require_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    return token

def run_crawl_job(job_id: str, url: str, count: Optional[int]) -> None:
    try:
        update_job(job_id, {"status": "running"})

        options = CrawlOptions(
            max_items=count,
            connect_url="http://127.0.0.1:9222",
            output_path=f"output/{job_id}_products.json",
        )

        result = run_crawl(options)

        final_patch = {
            "status": "done",
            "targetCount": int(result.stats.requested_count or 0),
            "crawledCount": int(result.stats.scanned_card_count or 0),
            "validCount": int(result.stats.valid_count or 0),
            "invalidCount": int(result.stats.invalid_count or 0),
            "duplicateCount": int(result.stats.duplicate_count or 0),
            "scrollRounds": int(result.stats.scroll_rounds or 0),
            "done": True,
            "errorMessage": "",
            "stopReason": str(result.stats.stop_reason or ""),
            "products": [item.to_dict() for item in result.items],
        }
        update_job(job_id, final_patch)

    except Exception as exc:
        update_job(
            job_id,
            {
                "status": "error",
                "done": False,
                "errorMessage": str(exc),
            },
        )

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/crawl/start")
def start_crawl(
    payload: StartCrawRequest,
    authorization: Optional[str] = Header(default=None)
) -> Dict[str, Any]:
    require_bearer_token(authorization)

    job_id = uuid.uuid4().hex
    target_count = 0 if payload.count is None else int(payload.count)

    with jobs_lock:
        jobs_store[job_id] = make_default_job(job_id=job_id, target_count=target_count)

    worker = threading.Thread(
        target=run_crawl_job,
        args=(job_id, payload.url, payload.count),
        daemon=True,
    )
    worker.start()

    return {
        "jobId": job_id,
        "targetCount": target_count,
    }


@app.get("/api/crawl/jobs/{job_id}")
def get_crawl_job_status(
    job_id: str,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    require_bearer_token(authorization)
    return get_job_or_404(job_id)