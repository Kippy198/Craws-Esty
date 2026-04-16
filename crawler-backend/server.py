from __future__ import annotations
#tạo luồng chạy song song
import threading 
import time
import uuid
from typing import Any, Dict, Literal, Optional #Khai báo dữ liệu

from fastapi import FastAPI, Header,HTTPException #Framework API chính
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field, field_validator # Validate dữ liệu đầu vào

from crawler import crawl_products

app = FastAPI(title="Crawl Backend") #Tạo ứng dụng FastAPi
JobStatus = Literal["queued", "running","done","error"] #trạng thái

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StartCrawRequest(BaseModel):
    url: str = Field(...,min_length=1)
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
    targetCount: int = 0
    crawledCount: int = 0
    uploadedCount: int = 0
    uploadTotal: int = 0
    queuedProducts: int = 0
    estimatedMinutes: int = 0
    done: bool = False
    errorMessage: str = ""
    products: list[dict[str, Any]] = Field(default_factory=list)

jobs_store: Dict[str, Dict[str,Any]] = {}
jobs_lock = threading.Lock()

def make_default_job(job_id: str, target_count: int) -> Dict[str, Any]:
    return {
        "jobId": job_id,
        "targetCount": target_count,
        "crawledCount": 0,
        "uploadedCount": 0,
        "uploadTotal": 0,
        "queuedProducts": 0,
        "estimatedMinutes": 0,
        "done": False,
        "errorMessage": "",
        "products": [],
    }

def get_job_or_404(job_id: str) -> Dict[str, Any]:
    with jobs_lock:
        job = jobs_store.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail = 'Cant find a Job' )
        return dict(job)

def update_job(job_id: str, patch:Dict[str,Any]) -> None:
    with jobs_lock:
        if job_id not in job_store:
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
        def on_progess(snapshot: Dict[str,Any]) -> None:
            update_job(job_id, snapshot)
        
        result = crawl_products(
            url=url,
            count=count,
            job_id=job_id,
            config_path="selector-config.json",
            headless=True,
            progress_callback=on_progess,
        )

        final_patch = {
            "jobId": job_id,
            "targetCount": int(result.get("targetCount") or 0),
            "crawledCount": int(result.get("crawledCount") or 0),
            "uploadedCount": int(result.get("uploadedCount") or 0),
            "uploadTotal": int(result.get("uploadTotal") or 0),
            "queuedProducts": int(result.get("queuedProducts") or 0),
            "estimatedMinutes": int(result.get("estimatedMinutes") or 0),
            "done": bool(result.get("done")),
            "errorMessage": str(result.get("errorMessage") or ""),
            "products": result.get("products") or [],
        }
        update_job(job_id, final_patch)
    except Exception as exc:
        update_job(
            job_id,
            {
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
    