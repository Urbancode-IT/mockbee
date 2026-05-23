from __future__ import annotations

import datetime
import hashlib
import html
import json
import os
import urllib.error
import urllib.request
from typing import Optional

import db


APP_NAME = os.environ.get("MOCKBEE_APP_NAME", "MockBee")
APP_URL = os.environ.get("MOCKBEE_APP_URL", "http://127.0.0.1:8001")
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "resend").strip().lower()
EMAIL_FROM = os.environ.get("EMAIL_FROM", "MockBee <onboarding@resend.dev>")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_API_URL = os.environ.get("RESEND_API_URL", "https://api.resend.com/emails")


def is_email_enabled() -> bool:
    if EMAIL_PROVIDER == "resend":
        return bool(RESEND_API_KEY and EMAIL_FROM)
    if EMAIL_PROVIDER in {"disabled", "none"}:
        return False
    return False


def _utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()


def _html_document(title: str, body: str) -> str:
    return f"""<!doctype html>
<html>
  <body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #e7e2d8;border-radius:10px;padding:26px;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">{title}</h1>
        {body}
        <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Team {APP_NAME}</p>
      </div>
    </div>
  </body>
</html>"""


def _send_email(to_email: str, subject: str, html_body: str, text_body: str, event_type: str, metadata: Optional[dict] = None) -> dict:
    event = {
        "to_email": to_email,
        "subject": subject,
        "event_type": event_type,
        "metadata": metadata or {},
        "created_at": db._now(),
        "status": "skipped",
        "provider": EMAIL_PROVIDER,
    }

    if not to_email or "@" not in to_email:
        event["status"] = "failed"
        event["error"] = "Invalid recipient email"
        db._col("email_events").insert_one(event)
        return event

    if not is_email_enabled():
        event["reason"] = f"{EMAIL_PROVIDER} email provider is not configured"
        db._col("email_events").insert_one(event)
        return event

    if EMAIL_PROVIDER == "resend":
        return _send_with_resend(to_email, subject, html_body, text_body, event)

    event["status"] = "failed"
    event["error"] = f"Unsupported email provider: {EMAIL_PROVIDER}"
    db._col("email_events").insert_one(event)
    return event


def _send_with_resend(to_email: str, subject: str, html_body: str, text_body: str, event: dict) -> dict:
    idempotency_seed = f"{event['event_type']}:{to_email}:{event.get('metadata', {}).get('session_id') or event['created_at']}"
    idempotency_key = hashlib.sha256(idempotency_seed.encode("utf-8")).hexdigest()
    payload = {
        "from": EMAIL_FROM,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        RESEND_API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
        event["status"] = "sent"
        event["sent_at"] = db._now()
        event["provider_response"] = json.loads(response_body) if response_body else {}
    except urllib.error.HTTPError as exc:
        event["status"] = "failed"
        event["error"] = exc.read().decode("utf-8") or str(exc)
        event["status_code"] = exc.code
    except Exception as exc:
        event["status"] = "failed"
        event["error"] = str(exc)

    db._col("email_events").insert_one(event)
    return event


def send_welcome_email(to_email: str, name: str = "") -> dict:
    first_name = html.escape((name or "there").strip().split(" ")[0])
    subject = f"Welcome to {APP_NAME}"
    body = _html_document(
        subject,
        f"""
        <p style="line-height:1.6;">Hi {first_name},</p>
        <p style="line-height:1.6;">Welcome to {APP_NAME}. Your account is ready, and you can start practicing interviews, reviewing reports, and tracking progress from your dashboard.</p>
        <p style="margin:22px 0;"><a href="{APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Open Dashboard</a></p>
        """,
    )
    text = f"Hi {first_name}, welcome to {APP_NAME}. Open your dashboard: {APP_URL}/dashboard.html"
    return _send_email(to_email, subject, body, text, "welcome")


def send_interview_report_email(to_email: str, name: str, session: dict) -> dict:
    first_name = html.escape((name or "there").strip().split(" ")[0])
    role = html.escape(session.get("role") or "your interview")
    score = session.get("score")
    analysis = session.get("analysis") or {}
    score_text = f"{score}%" if score is not None else "available"
    feedback = html.escape(analysis.get("feedback") or "Your interview report has been generated.")
    subject = f"Your {APP_NAME} interview report is ready"
    body = _html_document(
        subject,
        f"""
        <p style="line-height:1.6;">Hi {first_name},</p>
        <p style="line-height:1.6;">Your report for <strong>{role}</strong> is ready. Overall score: <strong>{score_text}</strong>.</p>
        <p style="line-height:1.6;background:#f9fafb;border-left:4px solid #d4a017;padding:12px 14px;">{feedback}</p>
        <p style="margin:22px 0;"><a href="{APP_URL}/performance.html?view=report" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">View Report</a></p>
        """,
    )
    text = f"Hi {first_name}, your {role} report is ready. Score: {score_text}. View it: {APP_URL}/performance.html?view=report"
    return _send_email(to_email, subject, body, text, "interview_report", {"session_id": session.get("id")})


def send_task_completion_email(to_email: str, name: str, task_name: str, detail: str = "") -> dict:
    first_name = html.escape((name or "there").strip().split(" ")[0])
    task = html.escape(task_name or "your task")
    safe_detail = html.escape(detail)
    subject = f"Nice work completing {task}"
    body = _html_document(
        subject,
        f"""
        <p style="line-height:1.6;">Hi {first_name},</p>
        <p style="line-height:1.6;">You completed <strong>{task}</strong>. {safe_detail}</p>
        <p style="margin:22px 0;"><a href="{APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Continue Practicing</a></p>
        """,
    )
    text = f"Hi {first_name}, you completed {task}. {detail} Continue: {APP_URL}/dashboard.html"
    return _send_email(to_email, subject, body, text, "task_completed", {"task_name": task})


def send_inactivity_reminder_email(to_email: str, name: str, inactive_days: int) -> dict:
    first_name = html.escape((name or "there").strip().split(" ")[0])
    subject = f"Ready for your next {APP_NAME} practice?"
    body = _html_document(
        subject,
        f"""
        <p style="line-height:1.6;">Hi {first_name},</p>
        <p style="line-height:1.6;">It has been about {inactive_days} days since your last practice. A short session today can keep your interview rhythm fresh.</p>
        <p style="margin:22px 0;"><a href="{APP_URL}/dashboard.html" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold;">Start Practice</a></p>
        """,
    )
    text = f"Hi {first_name}, it has been about {inactive_days} days since your last practice. Start here: {APP_URL}/dashboard.html"
    return _send_email(to_email, subject, body, text, "inactivity_reminder", {"inactive_days": inactive_days})


def parse_db_datetime(value: str) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None
