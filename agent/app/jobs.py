"""Background jobs that must not be lost: research runs, spec checks.

Production (TASKS_MODE=cloudtasks): each job becomes a Cloud Task that calls the private `saathi-worker` service with an OIDC
token. Cloud Tasks retries failures with backoff, caps how many run at once (protecting model quota) and keeps the job if an
instance restarts. Handlers are idempotent: they check the job's state before doing work.
Local development (TASKS_MODE=inline): the job runs in a background thread of the same process.
"""
import asyncio
import json
import logging
import threading
from typing import Awaitable, Callable

from fastapi import APIRouter, Header, HTTPException

from .config import PROJECT, TASKS_LOCATION, TASKS_MODE, TASKS_SA, WORKER_URL

log = logging.getLogger("saathi.jobs")
router = APIRouter()

Handler = Callable[[str], Awaitable[None]]
_handlers: dict[str, Handler] = {}
# one queue per workload so a burst of spec checks never delays research, and vice versa
QUEUES = {"research": "saathi-research", "spec": "saathi-jobs"}
_client = None


def register(kind: str, fn: Handler) -> None:
    _handlers[kind] = fn


def _queue_for(kind: str) -> str:
    return QUEUES.get(kind.split("-", 1)[0], "saathi-jobs")


def enqueue(kind: str, arg: str) -> None:
    if kind not in _handlers:
        raise ValueError(f"unknown job {kind}")
    if TASKS_MODE != "cloudtasks":
        threading.Thread(target=lambda: asyncio.run(_run(kind, arg)), daemon=True, name=f"job-{kind}").start()
        return
    global _client
    from google.cloud import tasks_v2

    if _client is None:
        _client = tasks_v2.CloudTasksClient()
    parent = _client.queue_path(PROJECT, TASKS_LOCATION, _queue_for(kind))
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{WORKER_URL}/tasks/{kind}/{arg}",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"kind": kind, "arg": arg}).encode(),
            "oidc_token": {"service_account_email": TASKS_SA, "audience": WORKER_URL},
        },
        "dispatch_deadline": {"seconds": 900},
    }
    _client.create_task(request={"parent": parent, "task": task})


async def _run(kind: str, arg: str) -> None:
    try:
        await _handlers[kind](arg)
    except Exception:
        log.exception("job %s(%s) failed", kind, arg)
        raise


@router.post("/tasks/{kind}/{arg}")
async def run_task(kind: str, arg: str, x_cloudtasks_queuename: str = Header(default="")):
    """Called by Cloud Tasks only: the worker service is private (Cloud Run IAM checks the OIDC token before this runs)."""
    if kind not in _handlers or not x_cloudtasks_queuename:
        raise HTTPException(404, "Not found")
    await _run(kind, arg)  # an exception → 500 → Cloud Tasks retries with backoff
    return {"ok": True}
