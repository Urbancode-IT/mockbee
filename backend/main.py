from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import db
import email_service
import mocker
import json
import os
import random
import re
import secrets
import datetime

# Load custom questions
try:
    with open(os.path.join(os.path.dirname(__file__), "prep_questions", "interview_question_bank.json"), "r") as f:
        CUSTOM_QUESTIONS = json.load(f)
except Exception:
    CUSTOM_QUESTIONS = {}

COMPANY_PREP_COMPANIES = {"google", "amazon", "meta"}
COMPANY_QA_FILES = {
    "amazon": "from_amazon.json",
    "google": "from_google.json",
    "meta": "from_meta.json",
}

def _normalise_prep_item(item: Any) -> dict:
    if isinstance(item, dict):
        return {
            "id": item.get("id"),
            "year": item.get("year"),
            "company": str(item.get("company") or "").strip(),
            "category": str(item.get("category") or item.get("topic") or "General").strip() or "General",
            "question": str(item.get("question") or item.get("q") or "").strip(),
            "answer": str(item.get("answer") or item.get("a") or "").strip(),
            "difficulty": str(item.get("difficulty") or "").strip(),
            "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
        }
    return {
        "id": None,
        "year": None,
        "company": "",
        "category": "General",
        "question": str(item).strip(),
        "answer": "",
        "difficulty": "",
        "tags": [],
    }

def _load_company_prep_bank(company: str) -> dict:
    qa_dir = os.path.join(os.path.dirname(__file__), "QA")
    filename = COMPANY_QA_FILES.get(company.lower())
    topics = {}

    if not filename:
        return topics

    path = os.path.join(qa_dir, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return topics

    if not isinstance(data, list):
        return topics

    for item in data:
        normalised = _normalise_prep_item(item)
        if not normalised["question"]:
            continue
        category = normalised["category"]
        topics.setdefault(category, []).append(normalised)

    return topics

app = FastAPI(title="MockBee API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_DEFAULT_USERNAME = os.environ.get("MOCKBEE_ADMIN_USERNAME", "admin")
ADMIN_DEFAULT_PASSWORD = os.environ.get("MOCKBEE_ADMIN_PASSWORD", "mockb@urban")

def _normalise_email(email: str) -> str:
    return (email or "").strip().lower()

def _is_student_role(role: str) -> bool:
    return role in {"STUDENT", "PREMIUM"}

def _ensure_admin_user() -> dict:
    users = db._col("users")
    admin = users.find_one({"role": "ADMIN"})
    if admin:
        if not admin.get("admin_token"):
            users.update_one({"_id": admin["_id"]}, {"$set": {"admin_token": secrets.token_urlsafe(32)}})
            admin = users.find_one({"_id": admin["_id"]})
        return admin

    admin_id = _normalise_email(ADMIN_DEFAULT_USERNAME)
    admin_doc = {
        "_id": admin_id,
        "name": "Admin",
        "username": ADMIN_DEFAULT_USERNAME,
        "password": ADMIN_DEFAULT_PASSWORD,
        "role": "ADMIN",
        "admin_token": secrets.token_urlsafe(32),
        "created_by": "system",
        "created_at": db._now(),
        "last_seen": db._now(),
    }
    users.update_one({"_id": admin_id}, {"$setOnInsert": admin_doc}, upsert=True)
    return users.find_one({"_id": admin_id})

def _require_admin(token: str):
    _ensure_admin_user()
    if not token or not db._col("users").find_one({"role": "ADMIN", "admin_token": token}):
        raise HTTPException(status_code=403, detail="Unauthorized")

def _public_user_payload(user: dict, is_admin: bool = False) -> dict:
    role = user.get("role", "PUBLIC")
    return {
        "status": "success",
        "name": user.get("name"),
        "email": user.get("_id"),
        "is_admin": is_admin,
        "role": "STUDENT" if role == "PREMIUM" else role,
        "is_student": _is_student_role(role),
        "admin_token": user.get("admin_token") if is_admin else None,
    }

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/signup")
def signup(req: SignupRequest):
    users = db._col("users")
    email = _normalise_email(req.email)
    user = users.find_one({"_id": email})
    if user:
        raise HTTPException(status_code=400, detail="Account already exists. Try logging in.")
    db.upsert_user(email, req.name.strip(), role="PUBLIC")
    users.update_one({"_id": email}, {"$set": {"password": req.password}})
    email_service.send_welcome_email(email, req.name.strip())
    return {"status": "success", "message": "Account created", "email": email, "name": req.name.strip(), "role": "PUBLIC"}

@app.post("/api/login")
def login(req: LoginRequest):
    users = db._col("users")
    _ensure_admin_user()
    identifier = (req.email or "").strip()
    identifier_lc = identifier.lower()

    if "@" in identifier_lc:
        candidates = list(users.find({"_id": identifier_lc}))
    else:
        escaped = re.escape(identifier)
        candidates = list(users.find({
            "$or": [
                {"username": {"$regex": f"^{escaped}$", "$options": "i"}},
                {"name": {"$regex": f"^{escaped}$", "$options": "i"}},
            ]
        }))

    if not candidates:
        raise HTTPException(status_code=400, detail="No account found with this email or username.")

    password_matches = [user for user in candidates if user.get("password") == req.password]
    if not password_matches:
        raise HTTPException(status_code=400, detail="Incorrect password.")

    if "@" not in identifier_lc and len(password_matches) > 1:
        raise HTTPException(status_code=409, detail="Multiple users match that username and password. Please log in with your email address.")

    user = password_matches[0]
    users.update_one({"_id": user["_id"]}, {"$set": {"last_seen": db._now()}})
    return _public_user_payload(user, is_admin=user.get("role") == "ADMIN")

class OAuthLoginRequest(BaseModel):
    provider: str
    email: str
    name: Optional[str] = None

@app.post("/api/oauth-login")
def oauth_login(req: OAuthLoginRequest):
    email = _normalise_email(req.email)
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required for social login.")

    provider = (req.provider or "google").strip().lower()
    name = (req.name or email.split("@")[0]).strip()
    users = db._col("users")
    existing = users.find_one({"_id": email})

    if existing and existing.get("role") == "ADMIN":
        raise HTTPException(status_code=400, detail="Admin accounts must use password login.")

    if not existing:
        db.upsert_user(email, name, role="PUBLIC")
        users.update_one({"_id": email}, {"$set": {"auth_provider": provider, "password": f"oauth:{provider}:{email}"}})
        existing = users.find_one({"_id": email})
        email_service.send_welcome_email(email, name)
    else:
        users.update_one({"_id": email}, {"$set": {"last_seen": db._now(), "auth_provider": existing.get("auth_provider", provider)}})
        existing = users.find_one({"_id": email})

    return _public_user_payload(existing, is_admin=False)

class ChatRequest(BaseModel):
    role: str
    level: str
    history: List[Dict[str, str]]
    phase: Optional[str] = "self_intro"
    questions_in_phase: Optional[int] = 0

@app.post("/api/interview/chat")
def interview_chat(req: ChatRequest):
    phase = req.phase
    if phase == "pro_feedback":
        system_prompt = f"""You are an expert technical interviewer providing concise feedback. b
Role: {req.role} | Level: {req.level}

The candidate has just answered a technical or behavioural question.
Your job:
- Provide a brief 1-2 sentence feedback on their last answer.
- Praise strong points or highlight what is missing.
- CRITICAL: DO NOT ask any new questions. ONLY provide feedback on their answer.
"""
    else:
        if phase not in mocker.PHASES:
            phase = "self_intro"
        
        q_target = mocker.PHASE_Q_TARGETS[phase]
        system_prompt = mocker.PHASE_PROMPTS[phase].format(role=req.role, level=req.level, q_target=q_target)
        
        # Ensure we always enforce analyzing previous answers if it's not the very first question of the interview
        if len(req.history) > 1:
            system_prompt += "\n\nCRITICAL INSTRUCTION: First, carefully analyze the candidate's last answer and provide brief, constructive feedback before moving to the next point."

        # Enforce question count constraint
        if req.questions_in_phase >= q_target:
            system_prompt += "\n\nCRITICAL INSTRUCTION: You have reached the required number of questions for this phase. DO NOT ask any more questions. ONLY provide your feedback on their last answer (if applicable), state your transition sentence, and end with [PHASE_COMPLETE]."
        else:
            system_prompt += f"\n\nPROGRESS: You have asked {req.questions_in_phase} questions out of {q_target} in this phase. You MUST ask exactly ONE new question now."

        # Inject specific questions from JSON if available
        if phase == "technical" and req.questions_in_phase < q_target:
            role_key = next((k for k in CUSTOM_QUESTIONS.keys() if k.lower() in req.role.lower() or req.role.lower() in k.lower()), None)
            if role_key:
                q_list = CUSTOM_QUESTIONS[role_key]
                if isinstance(q_list, list) and len(q_list) > 0:
                    # Pick a question using the index (modulo to prevent out of bounds)
                    q_idx = req.questions_in_phase % len(q_list)
                    specific_q = q_list[q_idx]
                    system_prompt += f"\n\nCRITICAL INSTRUCTION: For this turn, you MUST ask the following technical question:\n\"{specific_q}\""

        if phase != "self_intro":
            system_prompt += "\n\nCRITICAL RULE: DO NOT ask the candidate to introduce themselves or ask for their background. That was already done. Focus ONLY on your current phase."

    try:
        reply = mocker.ai_chat(system_prompt, req.history)
        return {"status": "success", "reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@app.post("/api/interview/evaluate")
def interview_evaluate(req: ChatRequest):
    try:
        evaluation = mocker.ai_evaluate(req.role, req.level, req.history)
        return {"status": "success", "evaluation": evaluation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveSessionRequest(BaseModel):
    email: str
    role: str
    date: str
    score: Optional[int] = None
    analysis: Optional[dict] = None
    transcript: list
    conversationHistory: Optional[list] = None
    totalQuestions: Optional[int] = None
    mode: Optional[str] = "standard"
    session_id: Optional[str] = None
    isQuick: Optional[bool] = None
    isPro: Optional[bool] = None
    topic: Optional[str] = None

@app.post("/api/interview/save")
def save_interview(req: SaveSessionRequest):
    col = db._col("interview_sessions")
    user_email = _normalise_email(req.email)
    quick_modes = {"1-q", "5-min", "rapid", "warmup"}
    is_quick = req.isQuick if req.isQuick is not None else req.mode in quick_modes
    is_pro = req.isPro if req.isPro is not None else not is_quick
    doc = {
        "user_email": user_email,
        "role": req.role,
        "mode": req.mode,
        "date": req.date,
        "score": req.score,
        "analysis": req.analysis or {},
        "transcript": req.transcript,
        "conversationHistory": req.conversationHistory or [],
        "totalQuestions": req.totalQuestions,
        "isQuick": is_quick,
        "isPro": is_pro,
        "topic": req.topic,
        "saved_at": db._now(),
        # Use frontend session ID if provided, otherwise it gets mongo _id
        "id": req.session_id if req.session_id else str(db._now())
    }
    
    # Simple upsert based on the frontend's unique session id
    col.update_one(
        {"user_email": user_email, "id": doc["id"]},
        {"$set": doc},
        upsert=True
    )
    if req.analysis and req.score is not None:
        users = db._col("users")
        user = users.find_one({"_id": user_email}) or {}
        sent_report_ids = user.get("report_email_session_ids") or []
        should_send = doc["id"] not in sent_report_ids
        if should_send:
            event = email_service.send_interview_report_email(user_email, user.get("name", ""), doc)
            if event.get("status") in {"sent", "skipped"}:
                users.update_one(
                    {"_id": user_email},
                    {"$addToSet": {"report_email_session_ids": doc["id"]}, "$set": {"last_report_email_at": db._now()}},
                )
    return {"status": "success", "message": "Performance saved to DB"}

class TaskCompletionEmailRequest(BaseModel):
    email: str
    task_name: str
    detail: Optional[str] = ""

@app.post("/api/email/task-completed")
def email_task_completed(req: TaskCompletionEmailRequest):
    email = _normalise_email(req.email)
    user = db._col("users").find_one({"_id": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    event = email_service.send_task_completion_email(email, user.get("name", ""), req.task_name, req.detail or "")
    return {"status": "success", "email_status": event.get("status")}

@app.post("/api/admin/email/reminders")
def admin_send_inactivity_reminders(key: str, inactive_days: int = 7, limit: int = 100):
    _require_admin(key)
    if inactive_days < 1:
        raise HTTPException(status_code=400, detail="inactive_days must be at least 1")

    cutoff = email_service._utc_now() - datetime.timedelta(days=inactive_days)
    users = db._col("users")
    candidates = list(users.find({"role": {"$ne": "ADMIN"}}, {"password": 0}).limit(max(1, min(limit, 500))))
    results = []

    for user in candidates:
        email = user.get("_id")
        last_seen = email_service.parse_db_datetime(user.get("last_seen") or user.get("created_at"))
        if not last_seen or last_seen > cutoff:
            continue

        last_reminder = email_service.parse_db_datetime(user.get("last_inactivity_reminder_at"))
        if last_reminder and last_reminder > cutoff:
            continue

        inactive_for = max(inactive_days, (email_service._utc_now() - last_seen).days)
        event = email_service.send_inactivity_reminder_email(email, user.get("name", ""), inactive_for)
        if event.get("status") in {"sent", "skipped"}:
            users.update_one({"_id": email}, {"$set": {"last_inactivity_reminder_at": db._now()}})
        results.append({"email": email, "status": event.get("status")})

    return {"status": "success", "checked": len(candidates), "queued": len(results), "results": results}

@app.get("/api/interview/history")
def get_user_history(email: str):
    docs = list(db._col("interview_sessions").find({"user_email": email}, {"_id": 0}).sort("saved_at", -1))
    return {"status": "success", "history": docs}

@app.get("/api/company-prep/questions")
def get_company_prep_questions(company: str = "Google", topic: Optional[str] = None):
    if company.lower() not in COMPANY_PREP_COMPANIES:
        raise HTTPException(status_code=404, detail="Company prep is available for Google, Amazon, and Meta.")

    topics = _load_company_prep_bank(company)
    if topic:
        matched_key = next((key for key in topics if key.lower() == topic.lower()), None)
        if not matched_key:
            raise HTTPException(status_code=404, detail="No questions found for this topic.")
        topics = {matched_key: topics[matched_key]}

    total_questions = sum(len(items) for items in topics.values())
    return {
        "status": "success",
        "company": company,
        "topics": topics,
        "topic_count": len(topics),
        "question_count": total_questions,
    }

# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/users")
def admin_get_all_users(key: str):
    """Returns all registered users. Requires admin key for access."""
    _require_admin(key)
    users = list(db._col("users").find({}, {"password": 0}))
    for u in users:
        u["email"] = u.pop("_id")
        if u.get("role") == "PREMIUM":
            u["role"] = "STUDENT"
    return {"status": "success", "users": users}

class AdminCreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    key: str

@app.post("/api/admin/users")
def admin_create_user(req: AdminCreateUserRequest):
    """Creates a new admin-managed user (Student) that has free access."""
    _require_admin(req.key)
    users = db._col("users")
    email = _normalise_email(req.email)
    if users.find_one({"_id": email}):
        raise HTTPException(status_code=400, detail="User already exists")
    db.upsert_user(email, req.name.strip(), role="STUDENT", created_by="admin")
    users.update_one({"_id": email}, {"$set": {"password": req.password, "student_access": True}})
    return {"status": "success", "message": "Student created successfully"}

@app.get("/api/admin/sessions")
def admin_get_all_sessions(key: str):
    """Returns all interview sessions across all users. Requires admin key."""
    _require_admin(key)
    docs = list(db._col("interview_sessions").find({}, {"_id": 0}).sort("saved_at", -1))

    users_dict = {u["_id"]: u for u in db._col("users").find({})}
    for d in docs:
        user_email = d.get("user_email")
        if user_email in users_dict:
            role = users_dict[user_email].get("role", "PUBLIC")
            d["user_role"] = "STUDENT" if _is_student_role(role) else role
            d["candidate_name"] = users_dict[user_email].get("name", "")
        else:
            d["user_role"] = "PUBLIC"
            d["candidate_name"] = ""

    return {"status": "success", "sessions": docs}

@app.delete("/api/admin/users/{email}")
def admin_delete_user(email: str, key: str):
    """Deletes a user and all their sessions. Requires admin key."""
    _require_admin(key)
    db._col("users").delete_one({"_id": email})
    db._col("interview_sessions").delete_many({"user_email": email})
    return {"status": "success", "message": "User and their sessions deleted"}

@app.delete("/api/admin/sessions/{session_id}")
def admin_delete_session(session_id: str, key: str):
    """Deletes a specific interview session. Requires admin key."""
    _require_admin(key)
    db._col("interview_sessions").delete_one({"id": session_id})
    return {"status": "success", "message": "Session deleted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001)
