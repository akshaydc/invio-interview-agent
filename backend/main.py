import io
import json
import os
import random
import re
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import PyPDF2
    _PYPDF2_AVAILABLE = True
except ImportError:
    _PYPDF2_AVAILABLE = False

import aiofiles
import anthropic
import httpx
import openai
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe")
RECRUITER_EMAIL = os.getenv("RECRUITER_EMAIL")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://your-frontend.railway.app")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
LINKEDIN_ENRICHMENT_URL = os.getenv("LINKEDIN_ENRICHMENT_URL")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
CANDIDATES_FILE = DATA_DIR / "candidates.json"
SLOTS_FILE = DATA_DIR / "slots.json"

app = FastAPI(title="AI Interview Agent")
active_sessions: dict = {}
active_calls: dict = {}  # call_sid -> call context data

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_FILE = DATA_DIR / "jobs.json"


@app.get("/debug/env")
async def debug_env():
    return {
        "RESEND_API_KEY_set": bool(os.getenv("RESEND_API_KEY")),
        "RESEND_API_KEY_prefix": os.getenv("RESEND_API_KEY", "")[:8] if os.getenv("RESEND_API_KEY") else "NOT SET",
        "FROM_EMAIL": os.getenv("FROM_EMAIL", "NOT SET"),
        "FRONTEND_URL": os.getenv("FRONTEND_URL", "NOT SET"),
        "ANTHROPIC_KEY_set": bool(os.getenv("ANTHROPIC_API_KEY")),
    }


@app.post("/debug/test-email")
async def test_email(x_auth_token: str = Header(None)):
    resend_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"ASTRA <{from_email}>",
                    "to": ["akshaydc102@gmail.com"],
                    "subject": "ASTRA Test Email",
                    "html": "<h1>Test email from ASTRA</h1><p>Email is working!</p>",
                },
                timeout=10.0,
            )
            return {
                "status_code": response.status_code,
                "response": response.text,
                "success": response.status_code == 200,
            }
    except Exception as e:
        return {
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


_SEED_JOBS = [
    {
        "id": "b1e2c3d4-0001-0000-0000-000000000001",
        "title": "Software Engineer",
        "department": "Engineering",
        "location": "Remote",
        "job_type": "Full-time",
        "experience": "3-5 years",
        "description": (
            "We are looking for a Software Engineer to join our growing engineering team. "
            "You will design, develop, and maintain scalable backend and frontend systems. "
            "You will work closely with product managers and designers to ship high-quality features "
            "that impact thousands of users. Strong problem-solving skills and a passion for clean code are a must."
        ),
        "requirements": ["Python", "React", "FastAPI", "PostgreSQL", "REST APIs", "Git"],
        "status": "open",
        "created_at": "2026-01-15T00:00:00+00:00",
    },
    {
        "id": "b1e2c3d4-0002-0000-0000-000000000002",
        "title": "Salesforce Administrator",
        "department": "Sales Operations",
        "location": "Hybrid – Mumbai",
        "job_type": "Full-time",
        "experience": "2-4 years",
        "description": (
            "We are hiring an experienced Salesforce Administrator to manage and enhance our CRM platform. "
            "You will configure Salesforce to meet evolving business requirements, maintain data integrity, "
            "build reports and dashboards, and support sales and operations teams with day-to-day needs. "
            "Salesforce Admin certification is highly preferred."
        ),
        "requirements": [
            "Salesforce Administration",
            "Flows & Process Builder",
            "Reports & Dashboards",
            "Data Loader",
            "Apex basics",
            "Salesforce Admin Certification",
        ],
        "status": "open",
        "created_at": "2026-02-01T00:00:00+00:00",
    },
    {
        "id": "b1e2c3d4-0003-0000-0000-000000000003",
        "title": "Product Manager",
        "department": "Product",
        "location": "Remote",
        "job_type": "Full-time",
        "experience": "4-7 years",
        "description": (
            "We are seeking a Product Manager to drive strategy and execution for our core platform. "
            "You will gather requirements from stakeholders, define the product roadmap, write PRDs, "
            "and work cross-functionally with engineering, design, and sales to deliver impactful products. "
            "Experience in SaaS or HR-tech is a plus."
        ),
        "requirements": [
            "Product Roadmapping",
            "Stakeholder Management",
            "Data-driven Decision Making",
            "Agile / Scrum",
            "User Research",
            "PRD Writing",
        ],
        "status": "open",
        "created_at": "2026-02-15T00:00:00+00:00",
    },
]

if not CANDIDATES_FILE.exists():
    CANDIDATES_FILE.write_text("[]")

if not JOBS_FILE.exists():
    JOBS_FILE.write_text("[]")
if not json.loads(JOBS_FILE.read_text()):
    JOBS_FILE.write_text(json.dumps(_SEED_JOBS, indent=2))

MOCK_SCORECARD = {
    "communication": 7,
    "technical_depth": 8,
    "problem_solving": 6,
    "cultural_fit": 7,
    "summary": "Strong candidate with good communication skills and structured thinking.",
    "strengths": ["clear explanations", "structured thinking"],
    "red_flags": ["limited system design experience"],
    "transcript": [],
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RecruiterLoginRequest(BaseModel):
    username: str
    password: str


class CandidateLoginRequest(BaseModel):
    ct_number: str


class CreateCandidateRequest(BaseModel):
    name: str
    ct_number: str
    job_role: str
    job_description: str = ""


class StartSessionRequest(BaseModel):
    job_role: str = "Software Engineer"
    job_description: str = ""


class CreateJobRequest(BaseModel):
    title: str
    department: str
    location: str
    job_type: str
    experience: str
    description: str
    requirements: list[str]


class UpdateJobRequest(BaseModel):
    title: str | None = None
    department: str | None = None
    location: str | None = None
    job_type: str | None = None
    experience: str | None = None
    description: str | None = None
    requirements: list[str] | None = None
    role_budget: str | None = None
    preferred_notice: str | None = None
    status: str | None = None


class ApplyRequest(BaseModel):
    name: str
    email: str
    phone: str
    current_role: str
    current_ctc: str
    expected_ctc: str
    notice_period: str


class ProctorRequest(BaseModel):
    image: str  # base64 data URL


class EndSessionRequest(BaseModel):
    violations: list[dict] = []


class BookSlotRequest(BaseModel):
    slot: str  # "YYYY-MM-DD HH:MM"
    job_id: str | None = None


class RescheduleRequest(BaseModel):
    new_slot: str  # "YYYY-MM-DD HH:MM"


class BookSlotConfirmRequest(BaseModel):
    token: str
    ct_number: str
    slot: str  # "YYYY-MM-DD HH:MM"


class WithdrawRequest(BaseModel):
    job_id: str


class JobActionRequest(BaseModel):
    job_id: str | None = None


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def verify_recruiter_token(x_auth_token: str = Header(None)) -> dict:
    if not x_auth_token or x_auth_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")
    sess = active_sessions[x_auth_token]
    if sess["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Forbidden")
    return sess


def verify_candidate_token(x_auth_token: str = Header(None)) -> dict:
    if not x_auth_token or x_auth_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")
    sess = active_sessions[x_auth_token]
    if sess["role"] != "candidate":
        raise HTTPException(status_code=403, detail="Forbidden")
    return sess


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _migrate_candidate(candidate: dict) -> dict:
    """Convert old flat candidate structure to new applications-array structure if needed."""
    if "applications" in candidate and isinstance(candidate["applications"], list):
        return candidate

    application = {
        "job_id": candidate.get("job_id", ""),
        "job_title": candidate.get("job_role", candidate.get("job_title", "")),
        "status": candidate.get("status", "applied"),
        "applied_at": candidate.get("created_at", datetime.now(timezone.utc).isoformat()),
        "match_percentage": candidate.get("match_percentage"),
        "recommendation": candidate.get("recommendation"),
        "match_summary": candidate.get("match_summary", ""),
        "strengths": candidate.get("strengths", []),
        "gaps": candidate.get("gaps", []),
        "compensation_fit": candidate.get("compensation_fit", ""),
        "notice_fit": candidate.get("notice_fit", ""),
        "resume_text": candidate.get("resume_text", ""),
        "interview_slot": candidate.get("interview_slot"),
        "session_id": candidate.get("session_id"),
        "scorecard": candidate.get("scorecard"),
        "call_status": candidate.get("call_status"),
        "slot_booking_token": candidate.get("slot_booking_token", ""),
    }

    applications = []
    if application["job_id"] or application["job_title"]:
        applications.append(application)

    candidate["applications"] = applications
    return candidate


async def _read_candidates() -> list:
    async with aiofiles.open(CANDIDATES_FILE, "r") as f:
        candidates = json.loads(await f.read())
    return [_migrate_candidate(c) for c in candidates]


async def _write_candidates(candidates: list) -> None:
    async with aiofiles.open(CANDIDATES_FILE, "w") as f:
        await f.write(json.dumps(candidates, indent=2))


async def _read_session(session_id: str) -> dict:
    path = DATA_DIR / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    async with aiofiles.open(path, "r") as f:
        return json.loads(await f.read())


async def _write_session(session_id: str, data: dict) -> None:
    path = DATA_DIR / f"{session_id}.json"
    async with aiofiles.open(path, "w") as f:
        await f.write(json.dumps(data, indent=2))


async def _read_jobs() -> list:
    async with aiofiles.open(JOBS_FILE, "r") as f:
        return json.loads(await f.read())


async def _write_jobs(jobs: list) -> None:
    async with aiofiles.open(JOBS_FILE, "w") as f:
        await f.write(json.dumps(jobs, indent=2))


async def _read_slots() -> dict:
    if not SLOTS_FILE.exists():
        return {}
    async with aiofiles.open(SLOTS_FILE, "r") as f:
        return json.loads(await f.read())


async def _write_slots(slots: dict) -> None:
    async with aiofiles.open(SLOTS_FILE, "w") as f:
        await f.write(json.dumps(slots, indent=2))


DEMO_BLOCKED_TIMES = {
    "09:00", "09:15", "09:30",
    "11:00", "11:15",
    "14:00", "14:15", "14:30",
    "16:00",
}


def _generate_slots(date_str: str | None = None, timezone_str: str = "Asia/Kolkata") -> list[dict]:
    try:
        import pytz
        tz = pytz.timezone(timezone_str)
        now = datetime.now(tz)
    except Exception:
        tz = None
        now = datetime.now()

    if date_str:
        try:
            base_naive = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            base_naive = now.replace(hour=0, minute=0, second=0, microsecond=0) if tz is None else now.replace(tzinfo=None).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        base_naive = now.replace(tzinfo=None).replace(hour=0, minute=0, second=0, microsecond=0) if tz else now.replace(hour=0, minute=0, second=0, microsecond=0)

    current = base_naive.replace(hour=9, minute=0, second=0, microsecond=0)
    end = base_naive.replace(hour=18, minute=0, second=0, microsecond=0)
    now_naive = now.replace(tzinfo=None) if tz else now

    slots = []
    while current < end:
        time_key = current.strftime("%H:%M")
        slot_str = current.strftime("%Y-%m-%d %H:%M")
        is_demo_blocked = time_key in DEMO_BLOCKED_TIMES
        if current > now_naive + timedelta(minutes=15):
            slots.append({
                "slot": slot_str,
                "display": _format_slot_display(slot_str),
                "date_display": current.strftime("%A, %d %B %Y"),
                "available": not is_demo_blocked,
                "booked_by": "DEMO_BLOCKED" if is_demo_blocked else None,
            })
        current += timedelta(minutes=15)
    return slots


def _get_available_dates() -> list[dict]:
    today = datetime.now().date()
    dates = []
    for i in range(7):
        d = today + timedelta(days=i)
        if i == 0:
            display = "Today"
        elif i == 1:
            display = "Tomorrow"
        else:
            display = d.strftime("%a %d")
        dates.append({"date": d.strftime("%Y-%m-%d"), "display": display})
    return dates


def _format_slot_display(slot: str) -> str:
    try:
        dt = datetime.strptime(slot, "%Y-%m-%d %H:%M")
        am_pm = "AM" if dt.hour < 12 else "PM"
        display_hour = dt.hour % 12 or 12
        return f"{display_hour}:{dt.minute:02d} {am_pm}"
    except Exception:
        return slot


async def _find_candidate_by_session(session_id: str) -> dict | None:
    candidates = await _read_candidates()
    return next((c for c in candidates if c.get("session_id") == session_id), None)


def find_candidate_by_session(session_id: str) -> dict | None:
    if not CANDIDATES_FILE.exists():
        return None
    candidates = json.loads(CANDIDATES_FILE.read_text())
    return next((c for c in candidates if c.get("session_id") == session_id), None)


def _get_applications(candidate: dict) -> list[dict]:
    """Normalize flat or nested candidate record to a list of application dicts."""
    if "applications" in candidate:
        return candidate["applications"]
    app: dict = {}
    for k in (
        "job_id", "job_role", "job_description", "status", "session_id",
        "interview_slot", "slot_booking_token", "match_percentage", "match_summary",
        "match_strengths", "match_gaps", "resume_text", "resume_filename",
        "compensation_fit", "notice_fit", "recommendation",
        "applied_at", "shortlisted_at", "scheduled_at", "rejected_at",
    ):
        if k in candidate:
            app[k] = candidate[k]
    app.setdefault("job_title", candidate.get("job_role", ""))
    app.setdefault("status", "applied")
    return [app] if app.get("job_id") else []


def _parse_experience_years(text: str) -> float | None:
    """Best-effort extraction for phrases like '4 years' or '5.5 yrs'."""
    if not text:
        return None
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*(?:\+?\s*)?(?:years?|yrs?)\b", text, flags=re.IGNORECASE)
    if not matches:
        return None
    return max(float(m) for m in matches)


def _extract_linkedin_url(text: str) -> str:
    if not text:
        return ""
    match = re.search(
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9%_\-./]+",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return ""
    url = match.group(0).rstrip(").,;]")
    if not url.lower().startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def _experience_requirement_min(job_text: str) -> float | None:
    if not job_text:
        return None
    range_match = re.search(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)", job_text, flags=re.IGNORECASE)
    if range_match:
        return float(range_match.group(1))
    plus_match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)", job_text, flags=re.IGNORECASE)
    if plus_match:
        return float(plus_match.group(1))
    return None


def _format_years(value: float | None) -> str:
    if value is None:
        return "Not found"
    return f"{value:g} years"


def _job_experience_for_id(job_id: str | None) -> str:
    if not job_id:
        return ""
    try:
        jobs = json.loads(JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return ""
    job = next((j for j in jobs if j.get("id") == job_id), None)
    return str(job.get("experience", "")) if job else ""


def _build_experience_verification(candidate: dict, application: dict) -> dict:
    resume_text = application.get("resume_text", "") or ""
    summary_text = application.get("match_summary", "") or ""
    gap_text = " ".join(application.get("match_gaps", []) or [])
    strength_text = " ".join(application.get("match_strengths", []) or [])
    claimed_years = _parse_experience_years(" ".join([resume_text, summary_text, strength_text, gap_text]))
    linkedin_url = candidate.get("linkedin_url", "") or _extract_linkedin_url(resume_text)

    if not linkedin_url:
        status = "missing"
        label = "LinkedIn missing"
        verdict = "Resume and LinkedIn cannot be compared because no LinkedIn URL was provided."
    elif not LINKEDIN_ENRICHMENT_URL:
        status = "review"
        label = "Resume matched" if claimed_years is not None else "Needs review"
        if claimed_years is None:
            verdict = "LinkedIn URL is available, but resume experience could not be extracted confidently."
        else:
            verdict = (
                f"Resume shows {_format_years(claimed_years)} of experience. "
                "LinkedIn experience was not found, so resume and LinkedIn cannot be compared."
            )
    elif claimed_years is None:
        status = "review"
        label = "Needs review"
        verdict = "LinkedIn URL is available, but resume experience could not be extracted confidently."
    else:
        status = "review"
        label = "Pending LinkedIn check"
        verdict = "Resume experience was found. LinkedIn profile experience is pending comparison."

    evidence = []
    if claimed_years is not None:
        evidence.append(f"Matched: Resume indicates about {_format_years(claimed_years)} of experience.")
    else:
        evidence.append("Failing: Resume experience years were not found clearly.")
    if linkedin_url:
        evidence.append("Failing: LinkedIn experience was not found, so resume and LinkedIn are not synced yet.")
    else:
        evidence.append("Failing: LinkedIn URL is missing.")

    return {
        "status": status,
        "label": label,
        "claimed_years": claimed_years,
        "linkedin_years": None,
        "required_years": None,
        "linkedin_url": linkedin_url,
        "verdict": verdict,
        "evidence": evidence,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


async def _enrich_experience_verification(candidate: dict, application: dict) -> dict:
    verification = _build_experience_verification(candidate, application)
    linkedin_url = verification.get("linkedin_url")
    if not LINKEDIN_ENRICHMENT_URL or not linkedin_url:
        return verification

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.post(
                LINKEDIN_ENRICHMENT_URL,
                json={
                    "linkedin_url": linkedin_url,
                    "name": candidate.get("name", ""),
                    "current_role": candidate.get("current_role", ""),
                    "resume_text": application.get("resume_text", ""),
                    "job_role": application.get("job_role") or application.get("job_title", ""),
                    "job_description": application.get("job_description", ""),
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        verification["evidence"].append("LinkedIn enrichment call failed; resume-only check shown.")
        return verification

    linkedin_years = data.get("experience_years")
    try:
        linkedin_years = float(linkedin_years) if linkedin_years is not None else None
    except (TypeError, ValueError):
        linkedin_years = None

    verification["linkedin_years"] = linkedin_years
    if data.get("activity_summary"):
        verification["evidence"].append(f"LinkedIn activity: {data['activity_summary']}")
    for item in data.get("evidence", []) or []:
        verification["evidence"].append(str(item))

    claimed_years = verification.get("claimed_years")
    if linkedin_years is None:
        verification["status"] = "review"
        verification["label"] = "Needs review"
        verification["verdict"] = "LinkedIn experience was not returned, so resume and LinkedIn cannot be compared."
    elif claimed_years is None:
        verification["status"] = "review"
        verification["label"] = "LinkedIn found"
        verification["verdict"] = f"LinkedIn indicates {_format_years(linkedin_years)}, but resume experience was not extracted confidently."
    elif abs(linkedin_years - claimed_years) <= 0.75:
        verification["status"] = "match"
        verification["label"] = "Resume matched"
        verification["verdict"] = f"LinkedIn and resume experience are aligned at about {_format_years(claimed_years)}."
    else:
        verification["status"] = "mismatch"
        verification["label"] = "LinkedIn not matched"
        verification["verdict"] = (
            f"Resume indicates {_format_years(claimed_years)}, while LinkedIn indicates "
            f"{_format_years(linkedin_years)}."
        )

    verification["checked_at"] = datetime.now(timezone.utc).isoformat()
    return verification


def _flatten_for_recruiter(candidate: dict) -> list[dict]:
    """Return one flat dict per application, merged with candidate identity fields."""
    identity = {k: candidate.get(k) for k in (
        "ct_number", "name", "email", "phone", "linkedin_url", "location",
        "current_role", "current_ctc", "expected_ctc", "notice_period",
    )}
    identity["call_status"] = candidate.get("call_status", {})
    rows = []
    for app in _get_applications(candidate):
        row = {**identity, **app}
        row["job_role"] = app.get("job_title") or app.get("job_role", "")
        verification = app.get("experience_verification")
        has_linkedin_data = bool(verification and verification.get("linkedin_years") is not None)
        row["experience_verification"] = verification if has_linkedin_data else _build_experience_verification(candidate, row)
        rows.append(row)
    return rows


def _build_claude_messages(transcript: list[dict]) -> list[dict]:
    messages = []
    for entry in transcript:
        if entry.get("q"):
            messages.append({"role": "assistant", "content": entry["q"]})
        if entry.get("a"):
            messages.append({"role": "user", "content": entry["a"]})
    return messages


def _strip_code_fence(text: str) -> str:
    if "```" not in text:
        return text
    parts = text.split("```")
    inner = parts[1]
    if inner.startswith("json"):
        inner = inner[4:]
    return inner.strip()


def _safe_parse_json(text: str) -> dict:
    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        import re as _re
        fixed = _re.sub(r"'([^']*)'", r'"\1"', text)
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass
    try:
        start = text.index('{')
        end = text.rindex('}') + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        pass
    raise ValueError("Could not parse JSON from Claude response")


def _extract_resume_text(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".pdf"):
        if not _PYPDF2_AVAILABLE:
            return ""
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            return "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
        except Exception:
            return ""
    return file_bytes.decode("utf-8", errors="replace").strip()


async def _analyze_resume_match(
    resume_text: str,
    job: dict,
    expected_ctc: str = "",
    notice_period: str = "",
) -> dict:
    if not ANTHROPIC_API_KEY or not resume_text:
        return {}
    requirements_str = ", ".join(job.get("requirements", []))
    role_budget = job.get("role_budget", "")
    preferred_notice = job.get("preferred_notice", "")

    extra_lines = ""
    if role_budget:
        extra_lines += f"- Role budget: {role_budget}\n"
    if preferred_notice:
        extra_lines += f"- Preferred notice period: {preferred_notice}\n"
    if expected_ctc:
        extra_lines += f"- Candidate's expected CTC: {expected_ctc}\n"
    if notice_period:
        extra_lines += f"- Candidate's notice period: {notice_period}\n"

    compensation_instruction = (
        "\nAlso consider:\n" + extra_lines +
        "Give a match percentage (0-100) that factors in skills match, experience match, "
        "AND compensation and notice period fit.\n"
        if extra_lines else
        "\nGive a match percentage (0-100) based on skills and experience fit.\n"
    )

    fit_instructions = ""
    if role_budget and expected_ctc:
        fit_instructions += (
            f"\nFor compensation_fit: compare the candidate's expected CTC ({expected_ctc}) "
            f"against the role budget ({role_budget}). "
            "Use 'good' if within range, 'partial' if slightly outside (up to 20% above), "
            "'mismatch' if significantly outside.\n"
        )
    if preferred_notice and notice_period:
        fit_instructions += (
            f"\nFor notice_fit: compare the candidate's notice period ({notice_period}) "
            f"against the preferred notice ({preferred_notice}). "
            "Use 'good' if it matches or is shorter, 'partial' if slightly longer, "
            "'mismatch' if much longer.\n"
        )

    prompt = (
        f"Compare this resume with the job description.{compensation_instruction}"
        f"{fit_instructions}"
        "Based on the overall match, also provide a hiring recommendation: "
        "'Strong Hire' (80%+ match, strong skills alignment), "
        "'Hire' (65-79% match, good overall fit), "
        "'Consider' (50-64% match, some gaps but potential), "
        "'Reject' (below 50% match, significant gaps). "
        "Return ONLY valid JSON with no extra text:\n"
        '{"match_percentage": 75, "match_summary": "...", '
        '"strengths": ["...", "..."], "gaps": ["...", "..."], '
        '"compensation_fit": "good", "notice_fit": "good", '
        '"recommendation": "Hire"}\n\n'
        f"Job Description: {job['description']}\n"
        f"Requirements: {requirements_str}\n\n"
        f"Resume: {resume_text}"
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text
        return json.loads(_strip_code_fence(raw))
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def mask_email(email: str) -> str:
    parts = email.split("@")
    if len(parts) != 2:
        return email
    name = parts[0]
    masked = name[0] + "***" if len(name) > 1 else "***"
    return f"{masked}@{parts[1]}"


async def send_email(to_email: str, subject: str, html_body: str) -> bool:
    resend_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("FROM_EMAIL", "onboarding@resend.dev")
    actual_to = os.getenv("EMAIL_OVERRIDE") or to_email
    if os.getenv("EMAIL_OVERRIDE"):
        subject = f"[To: {to_email}] {subject}"
    if not resend_key:
        print("RESEND_API_KEY not configured")
        return False
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"ASTRA Recruitment <{from_email}>",
                    "to": [actual_to],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=10.0,
            )
            print(f"Resend response: {response.status_code} {response.text[:200]}")
            return response.status_code == 200
    except Exception as e:
        print(f"Email send error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return False


def send_email_sync(to_email: str, subject: str, html_body: str) -> bool:
    import asyncio
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(send_email(to_email, subject, html_body))
        loop.close()
        return result
    except Exception as e:
        print(f"send_email_sync error: {e}")
        return False


def make_twilio_call(
    to_phone: str,
    candidate_name: str,
    job_title: str,
    booking_url: str,
    ct_number: str = "",
) -> dict:
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        return {"success": False, "error": "Twilio not configured"}
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        # Demo mode — all calls redirected to fixed number
        DEMO_PHONE = "+919740346303"
        actual_phone = DEMO_PHONE
        print(f"Demo mode: redirecting call from {to_phone} to {actual_phone}")

        backend_url = os.getenv(
            "RAILWAY_PUBLIC_DOMAIN",
            "invio-interview-agent-production.up.railway.app",
        )
        if not backend_url.startswith("http"):
            backend_url = f"https://{backend_url}"

        call = client.calls.create(
            to=actual_phone,
            from_=TWILIO_PHONE_NUMBER,
            url=f"{backend_url}/twilio/outbound-call",
            status_callback=f"{backend_url}/twilio/call-status",
            status_callback_method="POST",
            method="POST",
        )

        active_calls[call.sid] = {
            "candidate_name": candidate_name,
            "job_title": job_title,
            "booking_url": booking_url,
            "history": [],
            "turn": 0,
            "ct_number": ct_number,
            "call_made": True,
            "call_made_at": datetime.now(timezone.utc).isoformat(),
            "call_answered": False,
            "call_answered_at": None,
            "call_complete": False,
            "call_complete_at": None,
            "no_response_count": 0,
            "message_delivered": False,
        }

        print(f"Twilio call created: {call.sid}")
        return {"success": True, "call_sid": call.sid, "status": call.status, "to": actual_phone}
    except Exception as e:
        print(f"Twilio error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def _update_call_status(call_sid: str, updates: dict) -> None:
    """Persist call status updates to the candidate's record in candidates.json."""
    try:
        call_data = active_calls.get(call_sid, {})
        ct_number = call_data.get("ct_number", "")
        if not ct_number:
            return
        candidates = await _read_candidates()
        for i, c in enumerate(candidates):
            if c.get("ct_number") == ct_number:
                if "call_status" not in c:
                    c["call_status"] = {}
                c["call_status"].update(updates)
                candidates[i] = c
                break
        await _write_candidates(candidates)
    except Exception as e:
        print(f"Error updating call status: {e}")


@app.post("/twilio/outbound-call")
async def twilio_outbound_call(request: Request) -> Response:
    """Initial TwiML when the outbound call connects."""
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    call_data = active_calls.get(call_sid, {})
    candidate_name = call_data.get("candidate_name", "there")
    first_name = candidate_name.split()[0]

    call_data["call_answered"] = True
    call_data["call_answered_at"] = datetime.now(timezone.utc).isoformat()
    active_calls[call_sid] = call_data
    await _update_call_status(call_sid, {
        "call_answered": True,
        "call_answered_at": datetime.now(timezone.utc).isoformat(),
    })

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Say voice="Polly.Joanna" rate="98%">Hi {first_name}, this is Rina, the AI assistant from ASTRA calling you. Is this a good time to talk?</Say>'
        '<Gather input="speech" action="/twilio/handle-response" method="POST"'
        ' speechTimeout="1" timeout="4" language="en-IN">'
        "</Gather>"
        f'<Redirect method="POST">/twilio/no-response?sid={call_sid}&amp;attempt=1</Redirect>'
        "</Response>"
    )
    return Response(content=twiml, media_type="application/xml")


@app.post("/twilio/no-response")
async def twilio_no_response(request: Request) -> Response:
    """Retry on silence — after two failed attempts deliver the core message anyway."""
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    attempt = int(request.query_params.get("attempt", "1"))

    call_data = active_calls.get(call_sid, {})
    candidate_name = call_data.get("candidate_name", "")
    job_title = call_data.get("job_title", "")
    first_name = candidate_name.split()[0] if candidate_name else "there"

    if attempt == 1:
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            f'<Say voice="Polly.Joanna" rate="95%">Sorry, I could not hear you. Am I speaking with {first_name}?</Say>'
            '<Gather input="speech" action="/twilio/handle-response" method="POST"'
            ' speechTimeout="1" timeout="4" language="en-IN">'
            "</Gather>"
            f'<Redirect>/twilio/no-response?sid={call_sid}&amp;attempt=2</Redirect>'
            "</Response>"
        )
    else:
        call_data["message_delivered"] = True
        active_calls[call_sid] = call_data
        await _update_call_status(call_sid, {
            "call_complete": True,
            "call_complete_at": datetime.now(timezone.utc).isoformat(),
            "message_delivered": True,
        })
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            f'<Say voice="Polly.Joanna" rate="95%">Hi {first_name}, this is Rina from ASTRA. '
            f"Congratulations, you have been shortlisted for {job_title}. "
            "An email with your interview scheduling link will be sent to you shortly. "
            "Please check your inbox and book your slot at your earliest convenience. "
            "For any questions, please contact the recruiter directly. Have a great day!"
            "</Say>"
            "<Hangup/>"
            "</Response>"
        )
    return Response(content=twiml, media_type="application/xml")


@app.post("/twilio/handle-response")
async def twilio_handle_response(request: Request) -> Response:
    """Handle candidate spoken responses — drives conversation via Claude."""
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    speech_result = str(form.get("SpeechResult", "")).strip()

    call_data = active_calls.get(call_sid, {})
    candidate_name = call_data.get("candidate_name", "")
    job_title = call_data.get("job_title", "")
    first_name = candidate_name.split()[0] if candidate_name else "there"
    history: list = call_data.get("history", [])
    turn: int = call_data.get("turn", 0)
    no_response_count: int = call_data.get("no_response_count", 0)

    # Deliver core message if speech is missing or too short
    if not speech_result or len(speech_result) < 2:
        no_response_count += 1
        call_data["no_response_count"] = no_response_count
        active_calls[call_sid] = call_data
        if no_response_count >= 2:
            call_data["message_delivered"] = True
            active_calls[call_sid] = call_data
            await _update_call_status(call_sid, {
                "call_complete": True,
                "call_complete_at": datetime.now(timezone.utc).isoformat(),
                "message_delivered": True,
            })
            twiml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response>"
                f'<Say voice="Polly.Joanna" rate="95%">Hi {first_name}, this is Rina from ASTRA. '
                f"Congratulations, you have been shortlisted for {job_title}. "
                "An email with your interview scheduling link will be sent to you shortly. "
                "Please check your inbox and book your slot at your earliest convenience. "
                "For any questions, please contact the recruiter directly. Have a great day!"
                "</Say>"
                "<Hangup/>"
                "</Response>"
            )
        else:
            twiml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response>"
                '<Say voice="Polly.Joanna" rate="98%">Sorry, I could not hear you clearly. Could you please say that again?</Say>'
                '<Gather input="speech" action="/twilio/handle-response" method="POST"'
                ' speechTimeout="1" timeout="4" language="en-IN">'
                "</Gather>"
                '<Say voice="Polly.Joanna" rate="98%">I did not hear a response. Thank you for your time. Have a great day!</Say>'
                "<Hangup/>"
                "</Response>"
            )
        return Response(content=twiml, media_type="application/xml")

    history.append({"role": "user", "content": speech_result.lower()})

    # Block sensitive topics before calling Claude
    blocked_topics = [
        "salary", "ctc", "compensation", "package",
        "pay", "lpa", "lakhs", "offer", "hike",
        "company revenue", "team size", "headcount",
        "funding", "valuation", "clients",
    ]
    if any(topic in speech_result.lower() for topic in blocked_topics):
        ai_response = (
            "I am not able to discuss that topic. "
            "Please reach out to the recruiter directly for any such questions. "
            "What I can confirm is that you will receive an email with your interview scheduling link shortly. "
            "Do you have any other questions?"
        )
        call_data["email_mentioned"] = True
        should_call_claude = False
    else:
        should_call_claude = True
        ai_response = "Thank you for your time. We will be in touch. Have a great day!"

    if should_call_claude and ANTHROPIC_API_KEY:
        system_prompt = (
            f"You are Rina, the AI recruitment assistant from ASTRA. "
            f"You are on a phone call with {candidate_name} who has applied for {job_title}.\n\n"
            "YOUR MISSION (complete all in order):\n"
            "1. Respond naturally to their answer about timing\n"
            "2. Congratulate them on being shortlisted\n"
            "3. Explain an AI agent will conduct the interview\n"
            "4. ALWAYS mention: an email with an interview scheduling link will be sent to them — this is MANDATORY to convey in EVERY conversation\n"
            "5. Ask if they have any questions\n"
            "6. Close warmly\n\n"
            "STRICT GUIDELINES — NEVER VIOLATE:\n"
            "- NEVER discuss salary, compensation, CTC, package, or any pay-related topics. Say: 'I am not able to discuss compensation details. Please reach out to the recruiter for that.'\n"
            "- NEVER reveal company internal information, team sizes, revenue, or confidential details\n"
            f"- ONLY speak about the {job_title} role and the interview scheduling process\n"
            "- If asked anything outside scope, say: 'For that, please contact the recruiter directly.'\n"
            "- ALWAYS end by confirming the email will be sent\n\n"
            "TONE:\n"
            "- Warm, clear, professional\n"
            "- Keep each response under 3 sentences\n"
            "- Speak naturally like a real phone conversation\n"
            "- Do NOT end abruptly — always ask if they have questions before closing\n"
            "- Never use markdown or special characters\n\n"
            f"CLOSING (when all objectives complete): Say something like: "
            f"'Do you have any other questions for me? No worries at all if not — the recruiter will be happy to help with anything further. "
            f"Have a wonderful day {candidate_name}, and best of luck with your interview!'\n\n"
            f"Current turn: {turn}\n"
            "If turn >= 6: wrap up gracefully with the closing above.\n"
            "MANDATORY: Before any closing, confirm email will be sent."
        )
        try:
            claude = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            messages = history if history else [{"role": "user", "content": "call started"}]
            result = await claude.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=60,
                temperature=0.3,
                system=system_prompt,
                messages=messages,
            )
            ai_response = result.content[0].text.strip()
        except Exception as e:
            print(f"Claude error in call: {e}")

    # Ensure email mention is made by turn 3 if not already done
    email_mentioned = call_data.get("email_mentioned", False) or any(
        "email" in msg.get("content", "").lower()
        for msg in history
        if msg.get("role") == "assistant"
    )
    if turn >= 3 and not email_mentioned:
        ai_response += (
            " Also, please do check your email — "
            "we will be sending you an interview scheduling link shortly."
        )
        call_data["email_mentioned"] = True

    history.append({"role": "assistant", "content": ai_response})
    call_data["history"] = history
    call_data["turn"] = turn + 1
    active_calls[call_sid] = call_data

    end_phrases = ["have a great day", "goodbye", "take care", "good luck", "all the best"]
    should_end = turn >= 5 or any(p in ai_response.lower() for p in end_phrases)

    if should_end:
        await _update_call_status(call_sid, {
            "call_complete": True,
            "call_complete_at": datetime.now(timezone.utc).isoformat(),
            "message_delivered": True,
        })
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            f'<Say voice="Polly.Joanna" rate="98%">{ai_response}</Say>'
            "<Hangup/>"
            "</Response>"
        )
    else:
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response>"
            f'<Say voice="Polly.Joanna" rate="98%">{ai_response}</Say>'
            '<Gather input="speech" action="/twilio/handle-response" method="POST"'
            ' speechTimeout="1" timeout="4" language="en-IN">'
            "</Gather>"
            '<Say voice="Polly.Joanna" rate="98%">I did not hear a response. Thank you for your time. Have a great day!</Say>'
            "<Hangup/>"
            "</Response>"
        )
    return Response(content=twiml, media_type="application/xml")


@app.post("/twilio/call-status")
async def twilio_call_status(request: Request) -> Response:
    """Receive call status callbacks from Twilio and clean up finished calls."""
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    status = str(form.get("CallStatus", ""))
    print(f"Call {call_sid} status: {status}")
    if status == "no-answer":
        await _update_call_status(call_sid, {
            "call_answered": False,
            "call_complete": True,
            "call_complete_at": datetime.now(timezone.utc).isoformat(),
            "message_delivered": False,
            "note": "Candidate did not answer",
        })
    elif status == "completed":
        await _update_call_status(call_sid, {
            "call_complete": True,
            "call_complete_at": datetime.now(timezone.utc).isoformat(),
        })
    if status in ("completed", "failed", "busy", "no-answer"):
        active_calls.pop(call_sid, None)
    return Response(content="OK", media_type="text/plain")


async def send_scorecard_email(scorecard: dict, job_role: str, session_id: str, candidate_name: str = "") -> None:
    if not RECRUITER_EMAIL:
        print("RECRUITER_EMAIL not configured — skipping scorecard email.")
        return

    def score_box(label: str, value: int) -> str:
        return (
            f'<div style="display:inline-block;width:140px;margin:8px;padding:20px;'
            f'background:#1a1d27;border-radius:10px;text-align:center;">'
            f'<div style="font-size:2.5rem;font-weight:800;color:#6366f1;">{value}</div>'
            f'<div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;'
            f'color:#64748b;margin-top:4px;">{label}</div></div>'
        )

    strengths_html = "".join(
        f'<li style="margin:6px 0;color:#22c55e;">{s}</li>'
        for s in scorecard.get("strengths", [])
    )
    red_flags_html = "".join(
        f'<li style="margin:6px 0;color:#f87171;">{f}</li>'
        for f in scorecard.get("red_flags", [])
    ) or '<li style="color:#64748b;">None identified.</li>'

    transcript_html = "".join(
        f'<div style="margin-bottom:16px;padding:14px;background:#22263a;border-radius:8px;">'
        f'<p style="margin:0 0 6px;color:#e2e8f0;"><strong>Q:</strong> {e.get("q","")}</p>'
        f'<p style="margin:0;color:#64748b;"><strong>A:</strong> {e.get("a","") or "—"}</p>'
        f'</div>'
        for e in scorecard.get("transcript", [])
        if e.get("q")
    )

    name_line = f" &nbsp;·&nbsp; Candidate: <strong>{candidate_name}</strong>" if candidate_name else ""
    html = f"""
    <html><body style="background:#0f1117;color:#e2e8f0;font-family:system-ui,sans-serif;padding:32px;">
      <h1 style="color:#e2e8f0;margin-bottom:4px;">Interview Scorecard</h1>
      <p style="color:#64748b;margin-top:0;">Role: <strong style="color:#6366f1;">{job_role}</strong>
         {name_line} &nbsp;·&nbsp; Session: {session_id}</p>
      <hr style="border-color:#2e3248;margin:24px 0;">
      <h2 style="color:#e2e8f0;">Scores</h2>
      <div style="margin-bottom:24px;">
        {score_box("Communication", scorecard.get("communication", 0))}
        {score_box("Technical Depth", scorecard.get("technical_depth", 0))}
        {score_box("Problem Solving", scorecard.get("problem_solving", 0))}
        {score_box("Cultural Fit", scorecard.get("cultural_fit", 0))}
      </div>
      <h2 style="color:#e2e8f0;">Summary</h2>
      <p style="color:#e2e8f0;line-height:1.6;">{scorecard.get("summary","")}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px;">
        <div>
          <h3 style="color:#22c55e;">Strengths</h3>
          <ul style="padding-left:20px;">{strengths_html}</ul>
        </div>
        <div>
          <h3 style="color:#f87171;">Red Flags</h3>
          <ul style="padding-left:20px;">{red_flags_html}</ul>
        </div>
      </div>
      <h2 style="color:#e2e8f0;margin-top:32px;">Transcript</h2>
      {transcript_html}
    </body></html>
    """

    subject = f"Interview Scorecard — {job_role}" + (f" — {candidate_name}" if candidate_name else "")
    await send_email(RECRUITER_EMAIL, subject, html)


def send_scorecard_email_sync(scorecard: dict, job_role: str, session_id: str, candidate_name: str = "") -> None:
    import asyncio
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(send_scorecard_email(scorecard, job_role, session_id, candidate_name))
        loop.close()
    except Exception as e:
        print(f"send_scorecard_email_sync error: {e}")


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/auth/recruiter/login")
async def recruiter_login(body: RecruiterLoginRequest) -> dict:
    if body.username != "recruiter" or body.password != "hire2024":
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = str(uuid.uuid4())
    active_sessions[token] = {"role": "recruiter"}
    return {"token": token, "role": "recruiter"}


@app.post("/auth/candidate/login")
async def candidate_login(body: CandidateLoginRequest) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == body.ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="CT number not found. Please check and try again.")
    token = str(uuid.uuid4())
    active_sessions[token] = {
        "role": "candidate",
        "ct_number": candidate["ct_number"],
        "name": candidate["name"],
    }
    applications = _get_applications(candidate)
    return {
        "token": token,
        "role": "candidate",
        "name": candidate["name"],
        "ct_number": candidate["ct_number"],
        "applications": applications,
    }


# ---------------------------------------------------------------------------
# Recruiter endpoints
# ---------------------------------------------------------------------------

@app.post("/recruiter/candidates")
async def create_candidate(
    body: CreateCandidateRequest,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    if any(c["ct_number"] == body.ct_number for c in candidates):
        raise HTTPException(status_code=409, detail="CT number already exists")
    candidate = {
        "name": body.name,
        "ct_number": body.ct_number,
        "job_role": body.job_role,
        "job_description": body.job_description,
        "session_id": None,
        "status": "not_started",
    }
    candidates.append(candidate)
    await _write_candidates(candidates)
    return candidate


@app.get("/recruiter/analytics")
async def get_analytics(_auth: dict = Depends(verify_recruiter_token)) -> dict:
    candidates = await _read_candidates()
    jobs = await _read_jobs()

    # Flatten all applications across all candidates
    all_apps = []
    for c in candidates:
        for app in _get_applications(c):
            all_apps.append(app)

    total = len(all_apps)
    by_status: dict = {
        "applied": 0,
        "shortlisted": 0,
        "interview_scheduled": 0,
        "interview_complete": 0,
        "rejected": 0,
    }
    for app in all_apps:
        status = app.get("status", "applied")
        if status in by_status:
            by_status[status] += 1

    role_breakdown: dict = {}
    for job in jobs:
        job_apps = [a for a in all_apps if a.get("job_id") == job["id"]]
        if not job_apps:
            continue
        with_match = [a for a in job_apps if a.get("match_percentage")]
        role_breakdown[job["title"]] = {
            "job_id": job["id"],
            "total": len(job_apps),
            "applied": sum(1 for a in job_apps if a.get("status") == "applied"),
            "shortlisted": sum(1 for a in job_apps if a.get("status") == "shortlisted"),
            "interview_scheduled": sum(1 for a in job_apps if a.get("status") == "interview_scheduled"),
            "interview_complete": sum(1 for a in job_apps if a.get("status") == "interview_complete"),
            "rejected": sum(1 for a in job_apps if a.get("status") == "rejected"),
            "avg_match": round(
                sum(a.get("match_percentage", 0) for a in with_match) / max(1, len(with_match)),
                1,
            ),
        }

    shortlist_rate = round(
        (by_status["shortlisted"] + by_status["interview_scheduled"] + by_status["interview_complete"])
        / max(1, total)
        * 100,
        1,
    )
    completion_rate = round(by_status["interview_complete"] / max(1, total) * 100, 1)

    return {
        "total": total,
        "by_status": by_status,
        "role_breakdown": role_breakdown,
        "shortlist_rate": shortlist_rate,
        "completion_rate": completion_rate,
    }


@app.get("/recruiter/candidates")
async def list_candidates(_auth: dict = Depends(verify_recruiter_token)) -> list:
    candidates = await _read_candidates()
    rows = []
    for c in candidates:
        rows.extend(_flatten_for_recruiter(c))
    return rows


@app.post("/recruiter/candidates/{ct_number}/experience-check")
async def recheck_candidate_experience(
    ct_number: str,
    body: JobActionRequest,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    applications = _get_applications(candidate)
    application = None
    if body.job_id:
        application = next((a for a in applications if a.get("job_id") == body.job_id), None)
    if not application and applications:
        application = applications[0]
    if not application:
        raise HTTPException(status_code=404, detail="Candidate application not found")

    extracted_url = _extract_linkedin_url(application.get("resume_text", ""))
    if extracted_url and not candidate.get("linkedin_url"):
        candidate["linkedin_url"] = extracted_url

    verification = await _enrich_experience_verification(candidate, application)
    application["experience_verification"] = verification
    await _write_candidates(candidates)
    return verification


@app.get("/recruiter/candidates/{ct_number}/scorecard")
async def get_candidate_scorecard(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    session_id = candidate.get("session_id")
    if session_id:
        try:
            session = await _read_session(session_id)
            scorecard = session.get("scorecard")
            if scorecard:
                if "violations" not in scorecard:
                    violations = session.get("violations", [])
                    scorecard["violations"] = violations
                    scorecard["proctoring"] = {
                        "total_violations": len(violations),
                        "clean": len(violations) == 0,
                        "details": violations,
                        "auto_ended": session.get("auto_ended_proctoring", False),
                    }
                elif "proctoring" not in scorecard:
                    violations = scorecard.get("violations", [])
                    scorecard["proctoring"] = {
                        "total_violations": len(violations),
                        "clean": len(violations) == 0,
                        "details": violations,
                        "auto_ended": session.get("auto_ended_proctoring", False),
                    }
                return {"candidate": candidate, "scorecard": scorecard}
        except Exception:
            pass

    # No real interview — build a mock scorecard from match data
    scorecard = {
        "communication": random.randint(6, 9),
        "technical_depth": random.randint(6, 9),
        "problem_solving": random.randint(6, 9),
        "cultural_fit": random.randint(6, 9),
        "summary": candidate.get("match_summary", ""),
        "strengths": candidate.get("strengths", []),
        "red_flags": candidate.get("gaps", []),
        "transcript": [],
        "violations": [],
        "proctoring": {"total_violations": 0, "clean": True, "details": []},
        "match_percentage": candidate.get("match_percentage"),
        "recommendation": candidate.get("recommendation"),
        "note": "This candidate was pre-screened. Interview not yet conducted.",
    }
    return {"candidate": candidate, "scorecard": scorecard}


@app.get("/recruiter/candidates/{ct_number}/resume")
async def get_candidate_resume(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    resume_text = candidate.get("resume_text", "")
    if not resume_text:
        raise HTTPException(status_code=404, detail="No resume found for this candidate")
    return {
        "ct_number": ct_number,
        "name": candidate.get("name", ""),
        "resume_text": resume_text,
        "resume_filename": candidate.get("resume_filename", ""),
    }


@app.get("/recruiter/candidates/{ct_number}/match")
async def get_candidate_match(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.get("match_percentage") is None:
        raise HTTPException(status_code=404, detail="No match analysis available")
    return {
        "ct_number": ct_number,
        "match_percentage": candidate.get("match_percentage"),
        "match_summary": candidate.get("match_summary"),
        "strengths": candidate.get("match_strengths", []),
        "gaps": candidate.get("match_gaps", []),
    }


async def _set_candidate_status(ct_number: str, status: str, ts_key: str) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate["status"] = status
    candidate[ts_key] = datetime.now(timezone.utc).isoformat()
    await _write_candidates(candidates)
    return {"success": True}


async def _update_application(
    ct_number: str,
    job_id: str | None,
    updates: dict,
) -> tuple[dict, dict]:
    """Update a specific application (or first application if job_id is None).
    Returns (candidate, application)."""
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    if "applications" in candidate:
        apps = candidate["applications"]
        app = next((a for a in apps if a.get("job_id") == job_id), None) if job_id else (apps[0] if apps else None)
        if app is None:
            raise HTTPException(status_code=404, detail="Application not found")
        app.update(updates)
    else:
        # Flat legacy candidate — update top-level fields
        candidate.update(updates)
        app = candidate

    await _write_candidates(candidates)
    return candidate, app


@app.post("/recruiter/candidates/{ct_number}/schedule")
async def schedule_candidate(
    ct_number: str,
    background_tasks: BackgroundTasks,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    result = await _set_candidate_status(ct_number, "interview_scheduled", "scheduled_at")
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = candidate.get("job_role", "the role")
    if cand_email:
        schedule_html = (
            f"<h2>You have been invited for an AI Interview</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>Congratulations! You have been shortlisted for an AI-powered interview for <b>{job_title}</b>.</p>"
            f"<p>Login with your CT Number <b>{ct_number}</b> at "
            f'<a href="{FRONTEND_URL}">{FRONTEND_URL}</a> to start your interview.</p>'
            f"<p>Best regards,<br>Invio Recruitment Team</p>"
        )
        background_tasks.add_task(send_email_sync, cand_email, f"Interview Invitation — {job_title}", schedule_html)
    return result


@app.post("/recruiter/candidates/{ct_number}/invite")
async def invite_candidate_alias(
    ct_number: str,
    background_tasks: BackgroundTasks,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    result = await _set_candidate_status(ct_number, "interview_scheduled", "scheduled_at")
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = candidate.get("job_role", "the role")
    if cand_email:
        schedule_html = (
            f"<h2>You have been invited for an AI Interview</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>Congratulations! You have been shortlisted for an AI-powered interview for <b>{job_title}</b>.</p>"
            f"<p>Login with your CT Number <b>{ct_number}</b> at "
            f'<a href="{FRONTEND_URL}">{FRONTEND_URL}</a> to start your interview.</p>'
            f"<p>Best regards,<br>Invio Recruitment Team</p>"
        )
        background_tasks.add_task(send_email_sync, cand_email, f"Interview Invitation — {job_title}", schedule_html)
    return result


@app.post("/recruiter/candidates/{ct_number}/shortlist")
async def shortlist_candidate(
    ct_number: str,
    background_tasks: BackgroundTasks,
    body: JobActionRequest = JobActionRequest(),
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    slot_booking_token = str(uuid.uuid4())
    candidate, app = await _update_application(ct_number, body.job_id, {
        "status": "shortlisted",
        "slot_booking_token": slot_booking_token,
        "shortlisted_at": datetime.now(timezone.utc).isoformat(),
    })
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = app.get("job_title") or app.get("job_role", "the role")
    slot_booking_url = f"{FRONTEND_URL}/book-slot?token={slot_booking_token}&ct={ct_number}"
    email_queued = False
    if cand_email:
        shortlist_html = (
            f"<h2>Congratulations! You have been shortlisted.</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>We are pleased to inform you that your profile has been shortlisted for <b>{job_title}</b>.</p>"
            f"<p>Please click the link below to choose your preferred interview slot:</p>"
            f'<p><a href="{slot_booking_url}" style="background:#0C447C;color:white;padding:12px 24px;'
            f'border-radius:6px;text-decoration:none;display:inline-block">Book Your Interview Slot →</a></p>'
            f"<p>Slots are available between 9 AM and 6 PM. Please book at the earliest.</p>"
            f"<p>Best regards,<br>ASTRA Recruitment Team</p>"
        )
        background_tasks.add_task(
            send_email_sync,
            cand_email,
            f"You've been shortlisted! Book your interview slot — {job_title}",
            shortlist_html,
        )
        email_queued = True
    candidate_phone = candidate.get("phone", "")
    call_result: dict = {"success": False, "error": "No phone number"}
    if candidate_phone:
        call_result = make_twilio_call(
            to_phone=candidate_phone,
            candidate_name=cand_name,
            job_title=job_title,
            booking_url=slot_booking_url,
            ct_number=ct_number,
        )
    print(f"Call result: {call_result}")
    # Store call status on the candidate top-level for backwards compat
    candidates = await _read_candidates()
    cand_rec = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if cand_rec:
        cand_rec["call_status"] = {
            "call_made": call_result.get("success", False),
            "call_made_at": datetime.now(timezone.utc).isoformat() if call_result.get("success") else None,
            "call_answered": False,
            "call_answered_at": None,
            "call_complete": False,
            "call_complete_at": None,
            "message_delivered": False,
            "call_sid": call_result.get("call_sid", ""),
        }
        await _write_candidates(candidates)
    return {
        "success": True,
        "email_sent": email_queued,
        "email_to": mask_email(cand_email) if cand_email else None,
        "call_result": call_result,
        "call_made": call_result.get("success", False),
        "call_sid": call_result.get("call_sid", ""),
        "slot_booking_url": slot_booking_url,
        "message": "Candidate shortlisted successfully",
    }


@app.post("/recruiter/candidates/{ct_number}/reject")
async def reject_candidate(
    ct_number: str,
    background_tasks: BackgroundTasks,
    body: JobActionRequest = JobActionRequest(),
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidate, app = await _update_application(ct_number, body.job_id, {
        "status": "rejected",
        "rejected_at": datetime.now(timezone.utc).isoformat(),
    })
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = app.get("job_title") or app.get("job_role", "the role")
    if cand_email:
        reject_html = (
            f"<h2>Application Status Update</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>Thank you for your interest in {job_title}.</p>"
            f"<p>After careful review, we will not be moving forward with your application at this time.</p>"
            f"<p>We encourage you to apply for future openings.</p>"
            f"<p>Best regards,<br>Invio Recruitment Team</p>"
        )
        background_tasks.add_task(send_email_sync, cand_email, f"Application Update — {job_title}", reject_html)
    return {"success": True}


@app.post("/recruiter/candidates/{ct_number}/cancel-schedule")
async def cancel_schedule(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    interview_slot = candidate.get("interview_slot")
    if interview_slot:
        slots_data = await _read_slots()
        if slots_data.get(interview_slot) == ct_number:
            del slots_data[interview_slot]
            await _write_slots(slots_data)
        candidate["interview_slot"] = None
    candidate["status"] = "applied"
    candidate["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _write_candidates(candidates)
    return {"success": True}


@app.get("/recruiter/slots")
async def get_recruiter_slots(
    date: str | None = None,
    timezone: str = "Asia/Kolkata",
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    slots_data = await _read_slots()
    all_slots = _generate_slots(date, timezone)
    slot_list = []
    for s in all_slots:
        booked = slots_data.get(s["slot"])
        demo_blocked = s.get("booked_by") == "DEMO_BLOCKED"
        slot_list.append({
            "slot": s["slot"],
            "display": s["display"],
            "available": booked is None and not demo_blocked,
            "booked_by": booked or s.get("booked_by"),
        })
    return {"slots": slot_list, "available_dates": _get_available_dates()}


@app.post("/recruiter/candidates/{ct_number}/book-slot")
async def book_slot(
    ct_number: str,
    body: BookSlotRequest,
    background_tasks: BackgroundTasks,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    slots_data = await _read_slots()
    existing = slots_data.get(body.slot)
    if existing and existing != ct_number:
        raise HTTPException(status_code=409, detail="Slot already booked by another candidate")

    job_id = body.job_id
    # Find the target application
    if "applications" in candidate:
        apps = candidate["applications"]
        app = next((a for a in apps if a.get("job_id") == job_id), None) if job_id else (apps[0] if apps else None)
        if app is None:
            raise HTTPException(status_code=404, detail="Application not found")
        old_slot = app.get("interview_slot")
        if old_slot and slots_data.get(old_slot) == ct_number:
            del slots_data[old_slot]
        slots_data[body.slot] = ct_number
        await _write_slots(slots_data)
        app["interview_slot"] = body.slot
        app["status"] = "interview_scheduled"
        app["scheduled_at"] = datetime.now(timezone.utc).isoformat()
    else:
        old_slot = candidate.get("interview_slot")
        if old_slot and slots_data.get(old_slot) == ct_number:
            del slots_data[old_slot]
        slots_data[body.slot] = ct_number
        await _write_slots(slots_data)
        candidate["interview_slot"] = body.slot
        candidate["status"] = "interview_scheduled"
        candidate["scheduled_at"] = datetime.now(timezone.utc).isoformat()
        app = candidate

    await _write_candidates(candidates)
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = app.get("job_title") or app.get("job_role", "the role")
    slot_display = _format_slot_display(body.slot)
    if cand_email:
        schedule_html = (
            f"<h2>Your Interview Has Been Scheduled</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>Your AI interview for <b>{job_title}</b> has been scheduled for <b>{slot_display}</b>.</p>"
            f"<p>Login with your CT Number <b>{ct_number}</b> at "
            f'<a href="{FRONTEND_URL}">{FRONTEND_URL}</a> to join at the scheduled time.</p>'
            f"<p>Best regards,<br>Invio Recruitment Team</p>"
        )
        background_tasks.add_task(send_email_sync, cand_email, f"Interview Scheduled — {job_title}", schedule_html)
    return {"success": True, "slot": body.slot}


@app.post("/recruiter/candidates/{ct_number}/make-call")
async def make_call(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate["status"] = "interview_scheduled"
    candidate["scheduled_at"] = datetime.now(timezone.utc).isoformat()
    await _write_candidates(candidates)
    return {"success": True, "message": f"Call initiated for {candidate['name']}. They can join immediately."}


# ---------------------------------------------------------------------------
# Candidate slot endpoints
# ---------------------------------------------------------------------------

@app.get("/candidate/slots")
async def get_candidate_slots(
    date: str | None = None,
    timezone: str = "Asia/Kolkata",
    _auth: dict = Depends(verify_candidate_token),
) -> dict:
    ct_number = _auth["ct_number"]
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    slots_data = await _read_slots()
    all_slots = _generate_slots(date, timezone)
    available_slots = [
        {"slot": s["slot"], "display": s["display"]}
        for s in all_slots
        if (slots_data.get(s["slot"]) is None or slots_data[s["slot"]] == ct_number)
        and s.get("booked_by") != "DEMO_BLOCKED"
    ]
    return {
        "available_slots": available_slots,
        "available_dates": _get_available_dates(),
        "current_slot": candidate.get("interview_slot"),
    }


# ---------------------------------------------------------------------------
# Public slot-booking endpoints (for shortlisted candidates via email link)
# ---------------------------------------------------------------------------

def _find_app_by_token(candidate: dict, token: str) -> dict | None:
    """Return the application dict that holds the given slot_booking_token."""
    if "applications" in candidate:
        return next((a for a in candidate["applications"] if a.get("slot_booking_token") == token), None)
    return candidate if candidate.get("slot_booking_token") == token else None


@app.get("/book-slot/available")
async def book_slot_available(token: str, ct: str, timezone: str = "Asia/Kolkata") -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct), None)
    if not candidate:
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    app = _find_app_by_token(candidate, token)
    if app is None:
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    slots_data = await _read_slots()
    dates_with_slots = []
    for d in _get_available_dates():
        date_slots = _generate_slots(d["date"], timezone)
        available = [
            {"slot": s["slot"], "display": s["display"]}
            for s in date_slots
            if slots_data.get(s["slot"]) is None and s.get("booked_by") != "DEMO_BLOCKED"
        ]
        if available:
            dates_with_slots.append({**d, "slot_count": len(available), "slots": available})
    return {
        "name": candidate.get("name", ""),
        "job_title": app.get("job_title") or app.get("job_role", ""),
        "available_dates": dates_with_slots,
    }


@app.post("/book-slot/confirm")
async def book_slot_confirm(
    body: BookSlotConfirmRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == body.ct_number), None)
    if not candidate:
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    app = _find_app_by_token(candidate, body.token)
    if app is None:
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    slots_data = await _read_slots()
    existing = slots_data.get(body.slot)
    if existing and existing != body.ct_number:
        raise HTTPException(status_code=409, detail="This slot has already been booked. Please choose another.")
    old_slot = app.get("interview_slot")
    if old_slot and slots_data.get(old_slot) == body.ct_number:
        del slots_data[old_slot]
    slots_data[body.slot] = body.ct_number
    await _write_slots(slots_data)
    app["interview_slot"] = body.slot
    app["status"] = "interview_scheduled"
    app["scheduled_at"] = datetime.now(timezone.utc).isoformat()
    app["slot_booking_token"] = None
    await _write_candidates(candidates)
    cand_email = candidate.get("email", "")
    cand_name = candidate.get("name", "Candidate")
    job_title = app.get("job_title") or app.get("job_role", "the role")
    ct_number = body.ct_number
    slot_display = _format_slot_display(body.slot)
    if cand_email:
        confirm_html = (
            f"<h2>Interview Slot Confirmed!</h2>"
            f"<p>Dear {cand_name},</p>"
            f"<p>Your interview for <b>{job_title}</b> has been confirmed for <b>{slot_display}</b>.</p>"
            f"<p>To join your interview, login with your CT Number: <b style=\"color:#0C447C\">{ct_number}</b></p>"
            f'<p><a href="{FRONTEND_URL}" style="background:#0C447C;color:white;padding:12px 24px;'
            f'border-radius:6px;text-decoration:none;display:inline-block">Login to ASTRA →</a></p>'
            f"<p>Best regards,<br>ASTRA Recruitment Team</p>"
        )
        background_tasks.add_task(
            send_email, cand_email,
            f"Interview slot confirmed — {slot_display}",
            confirm_html,
        )
    return {"success": True, "slot": body.slot, "slot_display": slot_display}


@app.get("/candidate/applications")
async def get_candidate_applications(_auth: dict = Depends(verify_candidate_token)) -> list:
    ct_number = _auth["ct_number"]
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _get_applications(candidate)


@app.post("/candidate/withdraw")
async def withdraw_application(
    body: WithdrawRequest,
    _auth: dict = Depends(verify_candidate_token),
) -> dict:
    ct_number = _auth["ct_number"]
    candidate, app = await _update_application(ct_number, body.job_id, {
        "status": "withdrawn",
        "withdrawn_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"success": True}


@app.post("/candidate/reschedule")
async def reschedule_interview(
    body: RescheduleRequest,
    _auth: dict = Depends(verify_candidate_token),
) -> dict:
    ct_number = _auth["ct_number"]
    candidates = await _read_candidates()
    candidate = next((c for c in candidates if c["ct_number"] == ct_number), None)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    slots_data = await _read_slots()
    existing = slots_data.get(body.new_slot)
    if existing and existing != ct_number:
        raise HTTPException(status_code=409, detail="Slot already booked")
    old_slot = candidate.get("interview_slot")
    if old_slot and slots_data.get(old_slot) == ct_number:
        del slots_data[old_slot]
    slots_data[body.new_slot] = ct_number
    await _write_slots(slots_data)
    candidate["interview_slot"] = body.new_slot
    await _write_candidates(candidates)
    return {"success": True, "slot": body.new_slot}


# ---------------------------------------------------------------------------
# Public job endpoints
# ---------------------------------------------------------------------------

@app.post("/resume/match")
async def match_resume_to_jobs(
    resume: UploadFile = File(...),
    name: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    linkedin_url: str = Form(""),
    current_role: str = Form(""),
    location: str = Form(""),
) -> dict:
    """Match uploaded resume against all open jobs using Claude AI."""
    try:
        audio_bytes = await resume.read()

        resume_text = ""
        if resume.filename and resume.filename.endswith(".pdf"):
            try:
                reader = PyPDF2.PdfReader(io.BytesIO(audio_bytes))
                for page in reader.pages:
                    resume_text += page.extract_text() or ""
            except Exception as e:
                print(f"PDF extraction error: {e}")
                resume_text = audio_bytes.decode("utf-8", errors="ignore")
        else:
            resume_text = audio_bytes.decode("utf-8", errors="ignore")

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from resume")

        jobs = await _read_jobs()
        open_jobs = [j for j in jobs if j.get("status") == "open"]

        if not open_jobs:
            return {
                "candidate_profile": {
                    "skills": [], "experience_years": 0,
                    "current_role": current_role, "education": "",
                },
                "matches": [],
                "resume_text": resume_text,
            }

        jobs_summary = json.dumps([{
            "id": j["id"], "title": j["title"],
            "description": j.get("description", ""),
            "requirements": j.get("requirements", []),
            "role_budget": j.get("role_budget", ""),
            "preferred_notice": j.get("preferred_notice", ""),
        } for j in open_jobs])

        if ANTHROPIC_API_KEY:
            try:
                client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=2000,
                    messages=[{
                        "role": "user",
                        "content": (
                            "You must respond with ONLY a valid JSON object. "
                            "Use double quotes for all keys and string values. "
                            "No single quotes. No markdown. No explanation. "
                            "Start your response with { and end with }.\n\n"
                            "You are a recruitment AI. Analyse this resume "
                            "and match it against these job openings. "
                            "For each job calculate a match percentage. "
                            "Also extract from the resume: top skills, "
                            "years of experience, current role, education. "
                            "Also extract contact information if present in the resume:\n"
                            "- full_name: candidate's full name if found, else \"\"\n"
                            "- email: email address if found, else \"\"\n"
                            "- phone: phone number if found, else \"\"\n"
                            "- linkedin: LinkedIn URL if found, else \"\"\n"
                            "- location: city/location if found, else \"\"\n\n"
                            "Return ONLY valid JSON with no markdown:\n"
                            "{\n"
                            '  "candidate_profile": {\n'
                            '    "skills": ["skill1", "skill2"],\n'
                            '    "experience_years": 4,\n'
                            '    "current_role": "...",\n'
                            '    "education": "...",\n'
                            '    "full_name": "...",\n'
                            '    "email": "...",\n'
                            '    "phone": "...",\n'
                            '    "linkedin": "...",\n'
                            '    "location": "..."\n'
                            "  },\n"
                            '  "matches": [\n'
                            "    {\n"
                            '      "job_id": "...",\n'
                            '      "job_title": "...",\n'
                            '      "match_percentage": 88,\n'
                            '      "match_reason": "...",\n'
                            '      "strengths": ["..."],\n'
                            '      "gaps": ["..."]\n'
                            "    }\n"
                            "  ]\n"
                            "}\n\n"
                            f"Resume:\n{resume_text[:3000]}\n\n"
                            f"Jobs:\n{jobs_summary}"
                        ),
                    }],
                )
                raw = response.content[0].text
                result = _safe_parse_json(raw)

                # Enrich matches with full job metadata
                job_map = {j["id"]: j for j in open_jobs}
                enriched = []
                for m in result.get("matches", []):
                    job = job_map.get(m.get("job_id", ""))
                    if job:
                        enriched.append({
                            **m,
                            "job_title": job["title"],
                            "job_department": job.get("department", ""),
                            "job_location": job.get("location", ""),
                            "job_type": job.get("job_type", ""),
                        })
                result["matches"] = enriched
                result["resume_text"] = resume_text
                result["candidate_info"] = {
                    "name": name, "email": email, "phone": phone,
                    "linkedin_url": linkedin_url,
                    "current_role": current_role, "location": location,
                }
                return result
            except Exception as e:
                print(f"Claude error in resume match: {e}")
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"AI matching error: {str(e)}")
        else:
            return {
                "candidate_profile": {
                    "skills": ["Salesforce", "Python"], "experience_years": 3,
                    "current_role": current_role, "education": "B.Tech",
                },
                "matches": [{
                    "job_id": open_jobs[0]["id"],
                    "job_title": open_jobs[0]["title"],
                    "job_department": open_jobs[0].get("department", ""),
                    "job_location": open_jobs[0].get("location", ""),
                    "job_type": open_jobs[0].get("job_type", ""),
                    "match_percentage": 75,
                    "match_reason": "Good overall fit",
                    "strengths": ["Relevant experience"],
                    "gaps": ["Some skills missing"],
                }],
                "resume_text": resume_text,
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"FATAL ERROR in resume match: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs")
async def list_jobs() -> list:
    jobs = await _read_jobs()
    return [j for j in jobs if j.get("status") == "open"]


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    jobs = await _read_jobs()
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _recommendation_from_pct(pct: int | float | None) -> str | None:
    if pct is None:
        return None
    if pct >= 80:
        return "Strong Hire"
    if pct >= 65:
        return "Hire"
    if pct >= 50:
        return "Consider"
    return "Reject"


@app.post("/jobs/{job_id}/apply")
async def apply_for_job(
    background_tasks: BackgroundTasks,
    job_id: str,
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    linkedin_url: str = Form(""),
    location: str = Form(""),
    current_role: str = Form(""),
    current_ctc: str = Form(""),
    expected_ctc: str = Form(""),
    notice_period: str = Form(""),
    additional_comments: str = Form(""),
    terms_accepted: str = Form(""),
    match_data: str = Form(""),
    resume: UploadFile | None = File(None),
) -> dict:
    if terms_accepted.lower() not in ("true", "1", "yes"):
        raise HTTPException(status_code=400, detail="You must accept the terms and conditions")

    jobs = await _read_jobs()
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "open":
        raise HTTPException(status_code=400, detail="This position is no longer accepting applications")

    candidates = await _read_candidates()

    # Check for duplicate: same email + same job
    for c in candidates:
        apps = _get_applications(c)
        if c.get("email", "").lower() == email.lower() and any(a.get("job_id") == job_id for a in apps):
            raise HTTPException(
                status_code=409,
                detail="You have already applied for this position. Check your email for your CT number.",
            )

    resume_text = ""
    resume_filename = ""
    if resume and resume.filename:
        file_bytes = await resume.read()
        resume_text = _extract_resume_text(file_bytes, resume.filename)
        resume_filename = resume.filename
    linkedin_url = linkedin_url.strip() or _extract_linkedin_url(resume_text)

    if match_data.strip():
        try:
            parsed = json.loads(match_data)
            pct = parsed.get("match_percentage")
            match_result = {
                "match_percentage": pct,
                "match_summary": parsed.get("match_reason", parsed.get("match_summary", "")),
                "strengths": parsed.get("strengths", []),
                "gaps": parsed.get("gaps", []),
                "compensation_fit": parsed.get("compensation_fit"),
                "notice_fit": parsed.get("notice_fit"),
                "recommendation": parsed.get("recommendation") or _recommendation_from_pct(pct),
            }
        except Exception:
            match_result = await _analyze_resume_match(
                resume_text, job, expected_ctc=expected_ctc, notice_period=notice_period,
            )
    else:
        match_result = await _analyze_resume_match(
            resume_text, job, expected_ctc=expected_ctc, notice_period=notice_period,
        )

    new_application = {
        "job_id": job_id,
        "job_title": job["title"],
        "job_role": job["title"],
        "job_description": job["description"],
        "job_experience": job.get("experience", ""),
        "resume_text": resume_text,
        "resume_filename": resume_filename,
        "match_percentage": match_result.get("match_percentage"),
        "match_summary": match_result.get("match_summary"),
        "match_strengths": match_result.get("strengths", []),
        "match_gaps": match_result.get("gaps", []),
        "compensation_fit": match_result.get("compensation_fit"),
        "notice_fit": match_result.get("notice_fit"),
        "recommendation": match_result.get("recommendation"),
        "session_id": None,
        "interview_slot": None,
        "slot_booking_token": None,
        "status": "applied",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }
    candidate_identity = {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin_url": linkedin_url,
        "location": location,
        "current_role": current_role,
        "current_ctc": current_ctc,
        "expected_ctc": expected_ctc,
        "notice_period": notice_period,
    }
    new_application["experience_verification"] = await _enrich_experience_verification(candidate_identity, new_application)

    # Check if this email belongs to an existing candidate (returning applicant)
    existing = next((c for c in candidates if c.get("email", "").lower() == email.lower()), None)

    if existing:
        ct_number = existing["ct_number"]
        # Migrate flat record to applications array if needed
        if "applications" not in existing:
            legacy_apps = _get_applications(existing)
            existing["applications"] = legacy_apps
            for k in ("job_id", "job_role", "job_description", "status", "session_id",
                      "interview_slot", "slot_booking_token", "match_percentage", "match_summary",
                      "match_strengths", "match_gaps", "resume_text", "resume_filename",
                      "compensation_fit", "notice_fit", "recommendation",
                      "applied_at", "shortlisted_at", "scheduled_at", "rejected_at"):
                existing.pop(k, None)
        existing["applications"].append(new_application)
        is_new = False
    else:
        # New candidate — generate CT number
        year = datetime.now(timezone.utc).year
        existing_ct = {c["ct_number"] for c in candidates}
        ct_number = None
        for _ in range(20):
            n = random.randint(1, 9999)
            candidate_ct = f"CT{year}{n:04d}"
            if candidate_ct not in existing_ct:
                ct_number = candidate_ct
                break
        if not ct_number:
            raise HTTPException(status_code=500, detail="Could not generate unique CT number")

        new_candidate = {
            "name": name,
            "ct_number": ct_number,
            "email": email,
            "phone": phone,
            "linkedin_url": linkedin_url,
            "location": location,
            "current_role": current_role,
            "current_ctc": current_ctc,
            "expected_ctc": expected_ctc,
            "notice_period": notice_period,
            "additional_comments": additional_comments,
            "applications": [new_application],
        }
        candidates.append(new_candidate)
        is_new = True

    await _write_candidates(candidates)

    if is_new:
        apply_html = (
            f"<h2>Application Received</h2>"
            f"<p>Dear {name},</p>"
            f"<p>Thank you for applying for <b>{job['title']}</b>.</p>"
            f"<p>Your CT Number is: <b style=\"color:#0C447C\">{ct_number}</b></p>"
            f"<p>Use this CT number to login and track all your applications.</p>"
            f"<p>We will be in touch if your profile matches our requirements.</p>"
            f"<p>Best regards,<br>ASTRA Recruitment Team</p>"
        )
    else:
        apply_html = (
            f"<h2>New Application Received</h2>"
            f"<p>Dear {name},</p>"
            f"<p>Thank you for applying for <b>{job['title']}</b>.</p>"
            f"<p>This application has been added to your existing account. "
            f"Log in with your CT Number <b style=\"color:#0C447C\">{ct_number}</b> to track all your applications.</p>"
            f"<p>Best regards,<br>ASTRA Recruitment Team</p>"
        )
    background_tasks.add_task(
        send_email,
        email,
        f"Your application to {job['title']} — CT Number: {ct_number}",
        apply_html,
    )

    response: dict = {"ct_number": ct_number, "message": "Application submitted"}
    if match_result.get("match_percentage") is not None:
        response["match_percentage"] = match_result["match_percentage"]
    return response


# ---------------------------------------------------------------------------
# Recruiter job management endpoints
# ---------------------------------------------------------------------------

@app.get("/recruiter/jobs")
async def list_all_jobs(_auth: dict = Depends(verify_recruiter_token)) -> list:
    return await _read_jobs()


@app.post("/recruiter/jobs")
async def create_job(
    _auth: dict = Depends(verify_recruiter_token),
    title: str = Form(...),
    department: str = Form(...),
    location: str = Form(...),
    job_type: str = Form(...),
    experience: str = Form(""),
    description: str = Form(""),
    requirements: str = Form(""),
    role_budget: str = Form(""),
    preferred_notice: str = Form("Flexible"),
    jd_file: UploadFile | None = File(None),
) -> dict:
    jobs = await _read_jobs()

    final_description = description
    if jd_file and jd_file.filename:
        file_bytes = await jd_file.read()
        extracted = _extract_resume_text(file_bytes, jd_file.filename)
        if extracted:
            final_description = extracted

    requirements_list = [r.strip() for r in requirements.split(",") if r.strip()]

    job = {
        "id": str(uuid.uuid4()),
        "title": title,
        "department": department,
        "location": location,
        "job_type": job_type,
        "experience": experience,
        "description": final_description,
        "requirements": requirements_list,
        "role_budget": role_budget,
        "preferred_notice": preferred_notice,
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    jobs.append(job)
    await _write_jobs(jobs)
    return job


@app.put("/recruiter/jobs/{job_id}")
async def update_job(
    job_id: str,
    body: UpdateJobRequest,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    jobs = await _read_jobs()
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    updates = body.model_dump(exclude_none=True)
    job.update(updates)
    await _write_jobs(jobs)

    candidates = await _read_candidates()
    recalculated = 0
    for candidate in candidates:
        if candidate.get("job_id") == job_id and candidate.get("resume_text"):
            match_result = await _analyze_resume_match(
                candidate["resume_text"],
                job,
                expected_ctc=candidate.get("expected_ctc", ""),
                notice_period=candidate.get("notice_period", ""),
            )
            candidate["match_percentage"] = match_result.get("match_percentage")
            candidate["match_summary"] = match_result.get("match_summary")
            candidate["match_strengths"] = match_result.get("strengths", [])
            candidate["match_gaps"] = match_result.get("gaps", [])
            candidate["compensation_fit"] = match_result.get("compensation_fit")
            candidate["notice_fit"] = match_result.get("notice_fit")
            candidate["recommendation"] = match_result.get("recommendation")
            recalculated += 1
    if recalculated > 0:
        await _write_candidates(candidates)

    return {"success": True, "recalculated": recalculated, "job": job}


def _seed_demo_data() -> None:
    """Seed 4 demo jobs, 14 demo candidates, and mock scorecards."""
    DEMO_JOB_IDS = {
        "sf_admin": "d1e2f3a4-0001-0000-0000-000000000001",
        "sf_dev":   "d1e2f3a4-0002-0000-0000-000000000002",
        "qa_eng":   "d1e2f3a4-0003-0000-0000-000000000003",
        "ba":       "d1e2f3a4-0004-0000-0000-000000000004",
    }

    existing_jobs = json.loads(JOBS_FILE.read_text()) if JOBS_FILE.exists() else []
    if len(existing_jobs) < 4:
        demo_jobs = [
            {
                "id": DEMO_JOB_IDS["sf_admin"],
                "title": "Salesforce Administrator",
                "department": "Sales Operations",
                "location": "Hybrid - Bangalore",
                "job_type": "Full-time",
                "experience": "2-4 years",
                "description": (
                    "We are hiring an experienced Salesforce Administrator to manage and enhance "
                    "our CRM platform. You will be responsible for user management, configuration, "
                    "and customization of Salesforce to meet business needs. You will work closely "
                    "with sales and service teams to optimize workflows and reporting."
                ),
                "requirements": [
                    "Salesforce Admin", "Sales Cloud", "Service Cloud", "Flow Builder",
                    "Reports & Dashboards", "User Management", "Data Management",
                ],
                "role_budget": "8-15 LPA",
                "preferred_notice": "Up to 30 days",
                "status": "open",
                "created_at": "2026-01-15T00:00:00+00:00",
            },
            {
                "id": DEMO_JOB_IDS["sf_dev"],
                "title": "Salesforce Developer",
                "department": "Engineering",
                "location": "Remote",
                "job_type": "Full-time",
                "experience": "3-5 years",
                "description": (
                    "We are looking for a skilled Salesforce Developer to design and build custom "
                    "solutions on the Salesforce platform. You will develop Apex classes, Lightning "
                    "Web Components, and integrations with third-party systems. Experience with "
                    "DevOps and CI/CD pipelines is a plus."
                ),
                "requirements": [
                    "Apex", "LWC", "SOQL", "REST APIs", "Integration",
                    "Sales Cloud", "Experience Cloud", "Git", "Agile",
                ],
                "role_budget": "15-25 LPA",
                "preferred_notice": "Up to 30 days",
                "status": "open",
                "created_at": "2026-01-20T00:00:00+00:00",
            },
            {
                "id": DEMO_JOB_IDS["qa_eng"],
                "title": "QA Engineer",
                "department": "Quality Assurance",
                "location": "Hybrid - Mumbai",
                "job_type": "Full-time",
                "experience": "2-4 years",
                "description": (
                    "We are seeking a detail-oriented QA Engineer to ensure the quality of our "
                    "software products. You will design test plans, execute test cases, and report "
                    "bugs. You will work closely with developers to ensure timely resolution of "
                    "issues and maintain high product quality standards."
                ),
                "requirements": [
                    "Manual Testing", "Selenium", "JIRA", "Test Cases", "API Testing",
                    "Postman", "Regression Testing", "Agile", "SQL",
                ],
                "role_budget": "8-14 LPA",
                "preferred_notice": "Immediate to 30 days",
                "status": "open",
                "created_at": "2026-02-01T00:00:00+00:00",
            },
            {
                "id": DEMO_JOB_IDS["ba"],
                "title": "Business Analyst",
                "department": "Product",
                "location": "Hybrid - Pune",
                "job_type": "Full-time",
                "experience": "3-6 years",
                "description": (
                    "We are looking for a Business Analyst to bridge the gap between business needs "
                    "and technical solutions. You will gather requirements, create user stories, and "
                    "work with development teams to deliver solutions. Experience with Salesforce or "
                    "CRM systems is a plus."
                ),
                "requirements": [
                    "Requirements Gathering", "Process Mapping", "User Stories", "JIRA",
                    "Stakeholder Management", "SQL", "Agile", "Wireframing", "Data Analysis",
                ],
                "role_budget": "12-20 LPA",
                "preferred_notice": "Up to 45 days",
                "status": "open",
                "created_at": "2026-02-10T00:00:00+00:00",
            },
        ]
        existing_ids = {j["id"] for j in existing_jobs}
        new_jobs = [j for j in demo_jobs if j["id"] not in existing_ids]
        if new_jobs:
            JOBS_FILE.write_text(json.dumps(existing_jobs + new_jobs, indent=2))
            print(f"Seeded {len(new_jobs)} demo job(s).")

    existing_candidates = json.loads(CANDIDATES_FILE.read_text()) if CANDIDATES_FILE.exists() else []
    existing_cts = {c["ct_number"] for c in existing_candidates}

    if "CT20260001" not in existing_cts:
        sf_admin_jd = "We are hiring an experienced Salesforce Administrator to manage and enhance our CRM platform."
        sf_dev_jd = "We are looking for a skilled Salesforce Developer to design and build custom solutions on the Salesforce platform."
        qa_jd = "We are seeking a detail-oriented QA Engineer to ensure the quality of our software products."
        ba_jd = "We are looking for a Business Analyst to bridge the gap between business needs and technical solutions."

        demo_candidates = [
        {
            "name": "Priya Sharma", "ct_number": "CT20260001",
            "email": "priya.sharma@gmail.com", "phone": "9876543210",
            "location": "Bangalore, Karnataka",
            "linkedin_url": "https://linkedin.com/in/priyasharma",
            "current_role": "Junior Salesforce Admin",
            "current_ctc": "600000", "expected_ctc": "900000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["sf_admin"],
            "job_role": "Salesforce Administrator", "job_description": sf_admin_jd,
            "resume_text": "",
            "match_percentage": 88, "recommendation": "Strong Hire",
            "match_summary": "Priya has 3 years of hands-on Salesforce Admin experience with Sales Cloud and Service Cloud. Holds Salesforce Admin certification. Strong fit for the role.",
            "match_strengths": ["Certified Salesforce Admin", "Sales Cloud expertise", "Flow Builder experience"],
            "match_gaps": ["Limited Service Cloud exposure"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-10T09:00:00+00:00",
        },
        {
            "name": "Rahul Mehta", "ct_number": "CT20260002",
            "email": "rahul.mehta@outlook.com", "phone": "9823456710",
            "location": "Bangalore, Karnataka",
            "linkedin_url": "https://linkedin.com/in/rahulmehta",
            "current_role": "Salesforce Support Analyst",
            "current_ctc": "750000", "expected_ctc": "1100000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["sf_admin"],
            "job_role": "Salesforce Administrator", "job_description": sf_admin_jd,
            "resume_text": "",
            "match_percentage": 72, "recommendation": "Hire",
            "match_summary": "Rahul has solid Salesforce support experience with good reporting skills. Lacks deep Flow Builder exposure but has the fundamentals.",
            "match_strengths": ["Salesforce configuration experience", "Reports & Dashboards", "User management"],
            "match_gaps": ["No Flow Builder experience", "Limited Sales Cloud depth"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "interview_scheduled",
            "applied_at": "2026-04-11T10:30:00+00:00",
        },
        {
            "name": "Sneha Patel", "ct_number": "CT20260003",
            "email": "sneha.patel@yahoo.com", "phone": "9765432180",
            "location": "Pune, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/snehapatel",
            "current_role": "CRM Executive",
            "current_ctc": "400000", "expected_ctc": "700000",
            "notice_period": "15 days",
            "job_id": DEMO_JOB_IDS["sf_admin"],
            "job_role": "Salesforce Administrator", "job_description": sf_admin_jd,
            "resume_text": "",
            "match_percentage": 55, "recommendation": "Consider",
            "match_summary": "Sneha has basic CRM experience but limited Salesforce-specific skills. Would need significant onboarding for the Admin role.",
            "match_strengths": ["CRM familiarity", "Quick learner", "Good communication"],
            "match_gaps": ["No Salesforce certification", "No Apex/Flow experience", "Limited technical depth"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "applied",
            "applied_at": "2026-04-12T14:00:00+00:00",
        },
        {
            "name": "Arjun Kumar", "ct_number": "CT20260004",
            "email": "arjun.kumar@gmail.com", "phone": "9988776655",
            "location": "Hyderabad, Telangana",
            "linkedin_url": "https://linkedin.com/in/arjunkumar",
            "current_role": "Salesforce Developer",
            "current_ctc": "1200000", "expected_ctc": "1800000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["sf_dev"],
            "job_role": "Salesforce Developer", "job_description": sf_dev_jd,
            "resume_text": "",
            "match_percentage": 91, "recommendation": "Strong Hire",
            "match_summary": "Arjun brings 4 years of strong Salesforce development experience including Apex, LWC, and third-party integrations. Excellent technical fit.",
            "match_strengths": ["Apex & LWC expertise", "REST API integrations", "CI/CD with Salesforce DX"],
            "match_gaps": ["Limited Experience Cloud exposure"],
            "compensation_fit": "partial", "notice_fit": "good",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-08T11:00:00+00:00",
        },
        {
            "name": "Kavya Nair", "ct_number": "CT20260005",
            "email": "kavya.nair@gmail.com", "phone": "9876012345",
            "location": "Chennai, Tamil Nadu",
            "linkedin_url": "https://linkedin.com/in/kavyanair",
            "current_role": "Salesforce Developer",
            "current_ctc": "1000000", "expected_ctc": "1500000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["sf_dev"],
            "job_role": "Salesforce Developer", "job_description": sf_dev_jd,
            "resume_text": "",
            "match_percentage": 76, "recommendation": "Hire",
            "match_summary": "Kavya has strong Apex skills and good LWC experience. Integration experience is limited but she demonstrates solid fundamentals.",
            "match_strengths": ["Strong Apex development", "LWC proficiency", "SOQL optimization"],
            "match_gaps": ["Limited REST API integration work", "No Experience Cloud exposure"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "interview_scheduled",
            "applied_at": "2026-04-09T09:45:00+00:00",
        },
        {
            "name": "Vikram Singh", "ct_number": "CT20260006",
            "email": "vikram.singh@hotmail.com", "phone": "9812345670",
            "location": "Noida, Uttar Pradesh",
            "linkedin_url": "https://linkedin.com/in/vikramsingh",
            "current_role": "Junior Apex Developer",
            "current_ctc": "800000", "expected_ctc": "1400000",
            "notice_period": "60 days",
            "job_id": DEMO_JOB_IDS["sf_dev"],
            "job_role": "Salesforce Developer", "job_description": sf_dev_jd,
            "resume_text": "",
            "match_percentage": 62, "recommendation": "Consider",
            "match_summary": "Vikram has basic Apex knowledge but lacks LWC and integration experience. Long notice period may be a constraint.",
            "match_strengths": ["Apex fundamentals", "SOQL basics", "Agile familiarity"],
            "match_gaps": ["No LWC experience", "No REST API integrations", "60-day notice exceeds preference"],
            "compensation_fit": "partial", "notice_fit": "mismatch",
            "session_id": None, "status": "applied",
            "applied_at": "2026-04-13T16:00:00+00:00",
        },
        {
            "name": "Anita Desai", "ct_number": "CT20260007",
            "email": "anita.desai@gmail.com", "phone": "9765098765",
            "location": "Mumbai, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/anitadesai",
            "current_role": "Senior QA Engineer",
            "current_ctc": "900000", "expected_ctc": "1300000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["qa_eng"],
            "job_role": "QA Engineer", "job_description": qa_jd,
            "resume_text": "",
            "match_percentage": 85, "recommendation": "Strong Hire",
            "match_summary": "Anita has 4 years of QA experience with strong automation and API testing skills. Excellent match for the Mumbai hybrid role.",
            "match_strengths": ["Selenium automation", "API testing with Postman", "JIRA expertise"],
            "match_gaps": ["Limited SQL proficiency"],
            "compensation_fit": "partial", "notice_fit": "good",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-07T10:00:00+00:00",
        },
        {
            "name": "Rohan Sharma", "ct_number": "CT20260008",
            "email": "rohan.sharma@gmail.com", "phone": "9823109876",
            "location": "Mumbai, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/rohansharma",
            "current_role": "QA Analyst",
            "current_ctc": "650000", "expected_ctc": "950000",
            "notice_period": "15 days",
            "job_id": DEMO_JOB_IDS["qa_eng"],
            "job_role": "QA Engineer", "job_description": qa_jd,
            "resume_text": "",
            "match_percentage": 68, "recommendation": "Hire",
            "match_summary": "Rohan has solid manual testing background and is learning automation. Good cultural fit for a growing QA team.",
            "match_strengths": ["Manual testing expertise", "Test case writing", "Agile experience"],
            "match_gaps": ["Selenium still learning", "Limited API testing exposure"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "applied",
            "applied_at": "2026-04-14T11:00:00+00:00",
        },
        {
            "name": "Pooja Gupta", "ct_number": "CT20260009",
            "email": "pooja.gupta@rediffmail.com", "phone": "9901234560",
            "location": "Navi Mumbai, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/poojavgupta",
            "current_role": "Manual Tester",
            "current_ctc": "450000", "expected_ctc": "750000",
            "notice_period": "Immediate",
            "job_id": DEMO_JOB_IDS["qa_eng"],
            "job_role": "QA Engineer", "job_description": qa_jd,
            "resume_text": "",
            "match_percentage": 52, "recommendation": "Consider",
            "match_summary": "Pooja has basic manual testing skills but lacks automation and API testing experience required for this role.",
            "match_strengths": ["Manual testing", "Bug reporting", "Immediate availability"],
            "match_gaps": ["No Selenium experience", "No API testing", "No SQL knowledge"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "applied",
            "applied_at": "2026-04-15T09:30:00+00:00",
        },
        {
            "name": "Deepak Verma", "ct_number": "CT20260010",
            "email": "deepak.verma@gmail.com", "phone": "9876123450",
            "location": "Pune, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/deepakverma",
            "current_role": "Senior Business Analyst",
            "current_ctc": "1100000", "expected_ctc": "1600000",
            "notice_period": "45 days",
            "job_id": DEMO_JOB_IDS["ba"],
            "job_role": "Business Analyst", "job_description": ba_jd,
            "resume_text": "",
            "match_percentage": 87, "recommendation": "Strong Hire",
            "match_summary": "Deepak has 5 years of BA experience with strong stakeholder management and process mapping skills. Salesforce CRM background is a bonus.",
            "match_strengths": ["Stakeholder management", "User story writing", "Salesforce CRM experience"],
            "match_gaps": ["Notice period slightly above preference"],
            "compensation_fit": "partial", "notice_fit": "partial",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-06T14:00:00+00:00",
        },
        {
            "name": "Meera Joshi", "ct_number": "CT20260011",
            "email": "meera.joshi@gmail.com", "phone": "9823456780",
            "location": "Pune, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/meerajoshi",
            "current_role": "Business Analyst",
            "current_ctc": "850000", "expected_ctc": "1300000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["ba"],
            "job_role": "Business Analyst", "job_description": ba_jd,
            "resume_text": "",
            "match_percentage": 74, "recommendation": "Hire",
            "match_summary": "Meera has good BA fundamentals with experience in Agile environments. Solid JIRA and user story skills.",
            "match_strengths": ["Agile/Scrum experience", "JIRA proficiency", "Requirements gathering"],
            "match_gaps": ["Limited data analysis skills", "No Salesforce experience"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "interview_scheduled",
            "applied_at": "2026-04-11T15:00:00+00:00",
        },
        {
            "name": "Sanjay Rao", "ct_number": "CT20260012",
            "email": "sanjay.rao@gmail.com", "phone": "9901287650",
            "location": "Pune, Maharashtra",
            "linkedin_url": "https://linkedin.com/in/sanjayrao",
            "current_role": "Jr. Business Analyst",
            "current_ctc": "550000", "expected_ctc": "900000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["ba"],
            "job_role": "Business Analyst", "job_description": ba_jd,
            "resume_text": "",
            "match_percentage": 58, "recommendation": "Consider",
            "match_summary": "Sanjay is a junior BA with limited hands-on experience. Shows promise but needs mentoring to meet the 3-6 year experience requirement.",
            "match_strengths": ["Eager learner", "Good communication", "Basic JIRA knowledge"],
            "match_gaps": ["Only 1 year of experience", "No process mapping exposure", "Limited stakeholder management"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "applied",
            "applied_at": "2026-04-16T10:00:00+00:00",
        },
    ]

        new_candidates = [c for c in demo_candidates if c["ct_number"] not in existing_cts]
        if new_candidates:
            existing_candidates = existing_candidates + new_candidates
            existing_cts = {c["ct_number"] for c in existing_candidates}
            CANDIDATES_FILE.write_text(json.dumps(existing_candidates, indent=2))
            print(f"Seeded {len(new_candidates)} demo candidate(s).")

    # ── New demo candidates (always check) ──────────────────────────────────
    sf_dev_jd2 = "We are looking for a skilled Salesforce Developer to design and build custom solutions on the Salesforce platform."
    qa_jd2 = "We are seeking a detail-oriented QA Engineer to ensure the quality of our software products."
    new_v2 = [
        {
            "name": "Ananya Krishnan", "ct_number": "CT20260013",
            "email": "ananya.k@gmail.com", "phone": "9812309876",
            "location": "Chennai, Tamil Nadu",
            "linkedin_url": "https://linkedin.com/in/ananyak",
            "current_role": "Junior QA Analyst",
            "current_ctc": "380000", "expected_ctc": "620000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["qa_eng"],
            "job_role": "QA Engineer", "job_description": qa_jd2,
            "resume_text": "",
            "match_percentage": 48, "recommendation": "Consider",
            "match_summary": "Ananya has basic manual testing knowledge but lacks automation skills and technical depth required for the role.",
            "match_strengths": ["Enthusiastic learner", "Basic manual testing"],
            "match_gaps": ["No automation experience", "Limited API testing", "Short answers"],
            "compensation_fit": "good", "notice_fit": "good",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-17T09:00:00+00:00",
        },
        {
            "name": "Vikram Nair", "ct_number": "CT20260014",
            "email": "vikram.nair@gmail.com", "phone": "9876540123",
            "location": "Bangalore, Karnataka",
            "linkedin_url": "https://linkedin.com/in/vikramnair",
            "current_role": "Senior Salesforce Developer",
            "current_ctc": "1400000", "expected_ctc": "2000000",
            "notice_period": "30 days",
            "job_id": DEMO_JOB_IDS["sf_dev"],
            "job_role": "Salesforce Developer", "job_description": sf_dev_jd2,
            "resume_text": "",
            "match_percentage": 79, "recommendation": "Hire",
            "match_summary": "Vikram is technically strong with real Apex and integration experience. Minor dip on system design questions but recovered well.",
            "match_strengths": ["Strong Apex", "Platform events", "CI/CD experience"],
            "match_gaps": ["Multi-org architecture gap", "Could improve structured delivery"],
            "compensation_fit": "partial", "notice_fit": "good",
            "session_id": None, "status": "interview_complete",
            "applied_at": "2026-04-17T11:00:00+00:00",
        },
    ]
    v2_to_add = [c for c in new_v2 if c["ct_number"] not in existing_cts]
    if v2_to_add:
        existing_candidates = existing_candidates + v2_to_add
        existing_cts = {c["ct_number"] for c in existing_candidates}
        CANDIDATES_FILE.write_text(json.dumps(existing_candidates, indent=2))
        print(f"Seeded {len(v2_to_add)} new v2 demo candidate(s).")

    # ── Mock call_status for demo candidates (always check) ─────────────────
    _demo_call_statuses = {
        "CT20260001": {
            "call_made": True,
            "call_made_at": "2026-05-13T09:30:00+00:00",
            "call_answered": True,
            "call_answered_at": "2026-05-13T09:30:15+00:00",
            "call_complete": True,
            "call_complete_at": "2026-05-13T09:32:45+00:00",
            "message_delivered": True,
            "call_sid": "CAxxxx001",
            "note": "Candidate confirmed receipt of email",
        },
        "CT20260002": {
            "call_made": True,
            "call_made_at": "2026-05-13T10:00:00+00:00",
            "call_answered": False,
            "call_answered_at": None,
            "call_complete": True,
            "call_complete_at": "2026-05-13T10:00:45+00:00",
            "message_delivered": False,
            "call_sid": "CAxxxx002",
            "note": "Candidate did not answer. Email sent.",
        },
        "CT20260013": {
            "call_made": True,
            "call_made_at": "2026-05-13T11:15:00+00:00",
            "call_answered": True,
            "call_answered_at": "2026-05-13T11:15:08+00:00",
            "call_complete": False,
            "call_complete_at": None,
            "message_delivered": False,
            "call_sid": "CAxxxx003",
            "note": "Call disconnected before message delivered",
        },
        "CT20260014": {
            "call_made": True,
            "call_made_at": "2026-05-13T14:00:00+00:00",
            "call_answered": True,
            "call_answered_at": "2026-05-13T14:00:12+00:00",
            "call_complete": True,
            "call_complete_at": "2026-05-13T14:03:22+00:00",
            "message_delivered": True,
            "call_sid": "CAxxxx004",
            "note": "Candidate asked about interview format. Informed about AI interview.",
        },
    }
    _call_status_changed = False
    for _ct, _cs in _demo_call_statuses.items():
        _cand = next((c for c in existing_candidates if c["ct_number"] == _ct), None)
        if _cand and "call_status" not in _cand:
            _cand["call_status"] = _cs
            _call_status_changed = True
    if _call_status_changed:
        CANDIDATES_FILE.write_text(json.dumps(existing_candidates, indent=2))
        print("Updated demo candidates with call_status data.")

    # ── Mock scorecards ──────────────────────────────────────────────────────
    mock_scorecards: dict[str, dict] = {
        "CT20260001": {
            "communication": 9, "technical_depth": 8,
            "problem_solving": 8, "cultural_fit": 9,
            "summary": (
                "Priya demonstrated exceptional communication throughout the interview. Her answers were "
                "structured, confident, and backed by specific examples from her 4+ years at TCS. She showed "
                "deep Salesforce Admin knowledge and a clear passion for the role."
            ),
            "strengths": [
                "Certified Salesforce Administrator with hands-on Sales Cloud and Service Cloud experience",
                "Articulate and structured communication — used STAR method consistently",
                "Strong cultural alignment — values collaboration and continuous learning",
            ],
            "red_flags": ["Limited exposure to large-scale data migrations"],
            "recommendation": "Strong Hire",
            "transcript": [
                {
                    "q": "Tell me about your Salesforce experience and what you enjoy most about it.",
                    "a": "I have been working with Salesforce for over 4 years at TCS, primarily as a Salesforce Administrator. I have handled Sales Cloud and Service Cloud implementations, user management for teams of 200 plus users, and built complex Flow automations. What I enjoy most is solving business problems elegantly using declarative tools.",
                    "score": 9, "confidence": 85,
                    "metrics": {"volume": 0.78, "consistency": 0.82, "word_count": 68, "hesitant_signals": 0, "confident_signals": 4},
                },
                {
                    "q": "Describe a challenging Salesforce project you led and its outcome.",
                    "a": "I led a full Sales Cloud implementation for a 150-person sales team. The challenge was migrating 5 years of legacy CRM data while keeping the team productive. I built a phased rollout plan, trained 8 super users, and we went live on time with 95 percent user adoption in the first month.",
                    "score": 9, "confidence": 88,
                    "metrics": {"volume": 0.81, "consistency": 0.85, "word_count": 72, "hesitant_signals": 0, "confident_signals": 5},
                },
                {
                    "q": "How do you handle a situation where a business requirement conflicts with Salesforce best practices?",
                    "a": "I always start by understanding the underlying business need rather than just the stated requirement. Then I present two options — one that meets the requirement as stated and one aligned with best practices — with pros and cons for each. I have found that stakeholders almost always choose the better approach when they understand the long term implications.",
                    "score": 8, "confidence": 82,
                    "metrics": {"volume": 0.75, "consistency": 0.79, "word_count": 78, "hesitant_signals": 1, "confident_signals": 3},
                },
                {
                    "q": "Where do you see yourself in 3 years within the Salesforce ecosystem?",
                    "a": "I am actively working towards my Salesforce Architect certification. In 3 years I see myself leading a Salesforce Centre of Excellence within an organisation, setting standards and mentoring junior admins and developers. I want to be the person who bridges business strategy and Salesforce capability.",
                    "score": 8, "confidence": 79,
                    "metrics": {"volume": 0.72, "consistency": 0.76, "word_count": 65, "hesitant_signals": 1, "confident_signals": 3},
                },
                {
                    "q": "Do you have any questions for us about the role or the company?",
                    "a": "Yes, I would love to know more about the current Salesforce org setup — how many objects, integrations, and active users. Also what does success look like in the first 90 days for this role?",
                    "score": 9, "confidence": 83,
                    "metrics": {"volume": 0.76, "consistency": 0.80, "word_count": 48, "hesitant_signals": 0, "confident_signals": 2},
                },
            ],
            "violations": [],
            "confidence_analysis": {
                "average_score": 83, "label": "High Confidence", "color": "#0F6E56", "trend": "steady",
                "peak_question": "Describe a challenging Salesforce project you led and its outcome.",
                "peak_score": 88,
                "lowest_question": "Where do you see yourself in 3 years within the Salesforce ecosystem?",
                "lowest_score": 79,
                "per_question": [
                    {"question_num": 1, "question": "Tell me about your Salesforce experience...", "score": 85, "word_count": 68, "hesitant": 0, "volume": 0.78},
                    {"question_num": 2, "question": "Describe a challenging Salesforce project...", "score": 88, "word_count": 72, "hesitant": 0, "volume": 0.81},
                    {"question_num": 3, "question": "How do you handle conflicting requirements...", "score": 82, "word_count": 78, "hesitant": 1, "volume": 0.75},
                    {"question_num": 4, "question": "Where do you see yourself in 3 years...", "score": 79, "word_count": 65, "hesitant": 1, "volume": 0.72},
                    {"question_num": 5, "question": "Do you have any questions for us...", "score": 83, "word_count": 48, "hesitant": 0, "volume": 0.76},
                ],
                "total_words": 331,
            },
        },
        "CT20260002": {
            "communication": 7, "technical_depth": 7,
            "problem_solving": 6, "cultural_fit": 7,
            "summary": (
                "Rahul showed solid technical knowledge but struggled with confidence in the early questions. "
                "He visibly warmed up as the interview progressed and his later answers showed genuine depth. "
                "With some coaching he could be a strong performer."
            ),
            "strengths": [
                "Good Salesforce Developer fundamentals — Apex and LWC knowledge confirmed",
                "Honest and self-aware — acknowledged gaps openly and explained how he is addressing them",
                "Improved significantly as interview progressed",
            ],
            "red_flags": [
                "Hesitant in early answers — may struggle under pressure",
                "Limited integration experience beyond REST APIs",
            ],
            "recommendation": "Hire",
            "transcript": [
                {
                    "q": "Walk me through your experience with Apex and Lightning Web Components.",
                    "a": "Um, so I have been working with Apex for about 2 years now. I have built triggers and batch classes. LWC I am still kind of learning but I have done a few components. I think I am getting better at it.",
                    "score": 6, "confidence": 42,
                    "metrics": {"volume": 0.45, "consistency": 0.48, "word_count": 45, "hesitant_signals": 4, "confident_signals": 0},
                },
                {
                    "q": "Tell me about a bug you found and fixed in production.",
                    "a": "Yes so there was a governor limit issue in a trigger that was causing failures for bulk imports. I think it was maybe because of SOQL queries inside loops. I used debug logs to find it and refactored the code to use collections. It was quite a tricky one to be honest.",
                    "score": 7, "confidence": 55,
                    "metrics": {"volume": 0.55, "consistency": 0.58, "word_count": 58, "hesitant_signals": 3, "confident_signals": 1},
                },
                {
                    "q": "How do you approach writing test classes in Salesforce?",
                    "a": "I always aim for at least 85 percent coverage but I focus on meaningful assertions rather than just hitting the coverage number. I write test data factories to keep things clean and I test both positive and negative scenarios. I have started using Test.startTest and stopTest properly to isolate governor limits.",
                    "score": 8, "confidence": 71,
                    "metrics": {"volume": 0.68, "consistency": 0.72, "word_count": 68, "hesitant_signals": 0, "confident_signals": 3},
                },
                {
                    "q": "What is your experience with Salesforce integrations?",
                    "a": "I have built REST API integrations using Named Credentials and Connected Apps. I integrated Salesforce with an ERP system to sync order data in real time. The main challenges were handling error responses and building retry logic for failed callouts. I am now learning about platform events for event-driven integrations.",
                    "score": 8, "confidence": 76,
                    "metrics": {"volume": 0.72, "consistency": 0.74, "word_count": 72, "hesitant_signals": 0, "confident_signals": 3},
                },
                {
                    "q": "Do you have any questions for us?",
                    "a": "Yes — what is the team structure like? And is there a mentoring programme for developers? I am keen to grow quickly and would love to know how the organisation supports that.",
                    "score": 8, "confidence": 74,
                    "metrics": {"volume": 0.70, "consistency": 0.72, "word_count": 40, "hesitant_signals": 0, "confident_signals": 2},
                },
            ],
            "violations": [],
            "confidence_analysis": {
                "average_score": 64, "label": "Moderate Confidence", "color": "#854F0B", "trend": "improving",
                "peak_question": "What is your experience with Salesforce integrations?",
                "peak_score": 76,
                "lowest_question": "Walk me through your experience with Apex and Lightning Web Components.",
                "lowest_score": 42,
                "per_question": [
                    {"question_num": 1, "question": "Walk me through your Apex and LWC experience...", "score": 42, "word_count": 45, "hesitant": 4, "volume": 0.45},
                    {"question_num": 2, "question": "Tell me about a bug you found in production...", "score": 55, "word_count": 58, "hesitant": 3, "volume": 0.55},
                    {"question_num": 3, "question": "How do you approach writing test classes...", "score": 71, "word_count": 68, "hesitant": 0, "volume": 0.68},
                    {"question_num": 4, "question": "What is your experience with integrations...", "score": 76, "word_count": 72, "hesitant": 0, "volume": 0.72},
                    {"question_num": 5, "question": "Do you have any questions for us...", "score": 74, "word_count": 40, "hesitant": 0, "volume": 0.70},
                ],
                "total_words": 283,
            },
        },
        "CT20260013": {
            "communication": 5, "technical_depth": 4,
            "problem_solving": 5, "cultural_fit": 6,
            "summary": (
                "Ananya struggled to articulate her testing experience with specificity. Answers were brief and "
                "lacked concrete examples. She showed willingness to learn but the technical depth required for "
                "this role was not evident in her responses."
            ),
            "strengths": [
                "Enthusiastic and eager to learn",
                "Basic manual testing knowledge confirmed",
            ],
            "red_flags": [
                "Could not explain automation framework setup",
                "Very short answers — limited elaboration on past experience",
                "High hesitancy signals throughout",
            ],
            "recommendation": "Consider",
            "transcript": [
                {
                    "q": "Describe your experience with test automation frameworks.",
                    "a": "Um I have used Selenium a bit. I am not that experienced with it yet but I am learning. I think I can pick it up quickly.",
                    "score": 4, "confidence": 28,
                    "metrics": {"volume": 0.32, "consistency": 0.35, "word_count": 28, "hesitant_signals": 5, "confident_signals": 0},
                },
                {
                    "q": "How do you decide what to test and what not to test?",
                    "a": "I guess I test the main features first. Maybe the important ones. I am not sure exactly, I just kind of go through the requirements.",
                    "score": 4, "confidence": 31,
                    "metrics": {"volume": 0.34, "consistency": 0.38, "word_count": 30, "hesitant_signals": 5, "confident_signals": 0},
                },
                {
                    "q": "Tell me about a bug you found that had significant impact.",
                    "a": "There was a bug in the login page once. It was not loading properly for some users. I reported it and the developers fixed it. It was important I think.",
                    "score": 5, "confidence": 38,
                    "metrics": {"volume": 0.40, "consistency": 0.42, "word_count": 36, "hesitant_signals": 3, "confident_signals": 0},
                },
                {
                    "q": "How do you handle tight deadlines in testing?",
                    "a": "I prioritise the important test cases and try to finish as fast as possible. I communicate with the team if I am falling behind. I think that is the right approach.",
                    "score": 6, "confidence": 44,
                    "metrics": {"volume": 0.46, "consistency": 0.48, "word_count": 38, "hesitant_signals": 2, "confident_signals": 1},
                },
                {
                    "q": "Do you have any questions for us?",
                    "a": "No I think I am okay. Thank you.",
                    "score": 3, "confidence": 25,
                    "metrics": {"volume": 0.28, "consistency": 0.30, "word_count": 8, "hesitant_signals": 0, "confident_signals": 0},
                },
            ],
            "violations": [
                {"type": "tab_switch", "timestamp": "2026-05-13T10:04:22"},
                {"type": "face_detection", "timestamp": "2026-05-13T10:06:15", "reason": "Not looking at screen"},
            ],
            "confidence_analysis": {
                "average_score": 33, "label": "Low Confidence", "color": "#A32D2D", "trend": "declining",
                "peak_question": "How do you handle tight deadlines in testing?",
                "peak_score": 44,
                "lowest_question": "Do you have any questions for us?",
                "lowest_score": 25,
                "per_question": [
                    {"question_num": 1, "question": "Describe your automation framework experience...", "score": 28, "word_count": 28, "hesitant": 5, "volume": 0.32},
                    {"question_num": 2, "question": "How do you decide what to test...", "score": 31, "word_count": 30, "hesitant": 5, "volume": 0.34},
                    {"question_num": 3, "question": "Tell me about a bug with significant impact...", "score": 38, "word_count": 36, "hesitant": 3, "volume": 0.40},
                    {"question_num": 4, "question": "How do you handle tight deadlines...", "score": 44, "word_count": 38, "hesitant": 2, "volume": 0.46},
                    {"question_num": 5, "question": "Do you have any questions for us...", "score": 25, "word_count": 8, "hesitant": 0, "volume": 0.28},
                ],
                "total_words": 140,
            },
        },
        "CT20260014": {
            "communication": 8, "technical_depth": 8,
            "problem_solving": 7, "cultural_fit": 8,
            "summary": (
                "Vikram is a technically strong developer who showed excellent command of Apex and integration "
                "patterns. He had a noticeable dip mid-interview when asked about system design but recovered well. "
                "His closing answer showed genuine enthusiasm and preparation."
            ),
            "strengths": [
                "Strong Apex knowledge with real production experience",
                "Good integration architecture understanding",
                "Enthusiastic and well-prepared for the interview",
            ],
            "red_flags": [
                "Struggled briefly with system design concepts",
                "Could improve on structured answer delivery",
            ],
            "recommendation": "Hire",
            "transcript": [
                {
                    "q": "Tell me about your most complex Apex development work.",
                    "a": "I built a real-time stock sync system between Salesforce and an ERP using platform events and batch Apex. It processed 50,000 records nightly with zero failures over 18 months. The key was building robust error handling and a dead letter queue for failed records.",
                    "score": 9, "confidence": 84,
                    "metrics": {"volume": 0.80, "consistency": 0.82, "word_count": 58, "hesitant_signals": 0, "confident_signals": 5},
                },
                {
                    "q": "How do you design a Salesforce solution for scalability?",
                    "a": "I start with data model design — getting that right is 80 percent of scalability. Then I think about sharing rules, governor limits, and async processing. I always prototype in a scratch org first.",
                    "score": 8, "confidence": 76,
                    "metrics": {"volume": 0.72, "consistency": 0.75, "word_count": 48, "hesitant_signals": 0, "confident_signals": 3},
                },
                {
                    "q": "Design a multi-org data synchronisation architecture.",
                    "a": "Hmm that is a complex one. I think you would use maybe a middleware layer, possibly MuleSoft or something. I have not done this exactly but I understand the concept. It is quite involved I think.",
                    "score": 6, "confidence": 45,
                    "metrics": {"volume": 0.48, "consistency": 0.50, "word_count": 42, "hesitant_signals": 5, "confident_signals": 0},
                },
                {
                    "q": "How do you ensure code quality in a team environment?",
                    "a": "We use a strict pull request process with mandatory peer review. I also enforce PMD static analysis in our CI pipeline. Every PR needs 90 percent test coverage and I personally review all governor limit implications before approving.",
                    "score": 9, "confidence": 80,
                    "metrics": {"volume": 0.78, "consistency": 0.80, "word_count": 55, "hesitant_signals": 0, "confident_signals": 4},
                },
                {
                    "q": "Do you have any questions for us?",
                    "a": "Absolutely. I would love to understand the current technical debt situation and what the roadmap looks like for the next 12 months. I am also curious about the deployment process — are you using SFDX and CI/CD pipelines currently?",
                    "score": 9, "confidence": 82,
                    "metrics": {"volume": 0.79, "consistency": 0.81, "word_count": 52, "hesitant_signals": 0, "confident_signals": 3},
                },
            ],
            "violations": [],
            "confidence_analysis": {
                "average_score": 73, "label": "High Confidence", "color": "#0F6E56", "trend": "improving",
                "peak_question": "Tell me about your most complex Apex development work.",
                "peak_score": 84,
                "lowest_question": "Design a multi-org data synchronisation architecture.",
                "lowest_score": 45,
                "per_question": [
                    {"question_num": 1, "question": "Tell me about your most complex Apex work...", "score": 84, "word_count": 58, "hesitant": 0, "volume": 0.80},
                    {"question_num": 2, "question": "How do you design for scalability...", "score": 76, "word_count": 48, "hesitant": 0, "volume": 0.72},
                    {"question_num": 3, "question": "Design a multi-org sync architecture...", "score": 45, "word_count": 42, "hesitant": 5, "volume": 0.48},
                    {"question_num": 4, "question": "How do you ensure code quality...", "score": 80, "word_count": 55, "hesitant": 0, "volume": 0.78},
                    {"question_num": 5, "question": "Do you have any questions for us...", "score": 82, "word_count": 52, "hesitant": 0, "volume": 0.79},
                ],
                "total_words": 255,
            },
        },
    }

    candidates_updated = False
    for ct, scorecard_data in mock_scorecards.items():
        cand = next((c for c in existing_candidates if c["ct_number"] == ct), None)
        if not cand:
            continue
        existing_sid = cand.get("session_id")
        if existing_sid:
            session_path = DATA_DIR / f"{existing_sid}.json"
            if session_path.exists():
                try:
                    sess = json.loads(session_path.read_text())
                    if sess.get("scorecard", {}).get("confidence_analysis"):
                        continue
                except Exception:
                    pass
        session_id = str(uuid.uuid4())
        session_data = {
            "session_id": session_id,
            "ct_number": ct,
            "job_role": cand.get("job_role", ""),
            "job_description": cand.get("job_description", ""),
            "status": "complete",
            "transcript": scorecard_data.get("transcript", []),
            "violations": scorecard_data.get("violations", []),
            "scorecard": scorecard_data,
        }
        (DATA_DIR / f"{session_id}.json").write_text(json.dumps(session_data, indent=2))
        cand["session_id"] = session_id
        cand["status"] = "interview_complete"
        candidates_updated = True
        print(f"Seeded mock scorecard for {ct} → session {session_id[:8]}…")

    if candidates_updated:
        CANDIDATES_FILE.write_text(json.dumps(existing_candidates, indent=2))
        print("Candidate records updated with session IDs.")


@app.on_event("startup")
async def on_startup() -> None:
    _seed_demo_data()


# ---------------------------------------------------------------------------
# Confidence analysis helpers
# ---------------------------------------------------------------------------

def analyze_audio_confidence(audio_bytes: bytes) -> dict:
    try:
        samples = []
        step = max(1, len(audio_bytes) // 200)
        for i in range(0, len(audio_bytes) - 1, step):
            val = audio_bytes[i]
            normalized = abs(val - 128) / 128.0
            samples.append(normalized)
        if not samples:
            return {"volume": 0.5, "consistency": 0.5}
        avg_volume = sum(samples) / len(samples)
        variance = sum((s - avg_volume) ** 2 for s in samples) / len(samples)
        consistency = max(0, 1 - (variance * 10))
        return {
            "volume": round(min(1.0, avg_volume * 4), 2),
            "consistency": round(consistency, 2),
        }
    except Exception:
        return {"volume": 0.5, "consistency": 0.5}


def analyze_text_confidence(text: str, question: str) -> dict:
    words = text.split()
    word_count = len(words)
    confident_words = [
        "definitely", "certainly", "absolutely", "successfully", "achieved",
        "led", "built", "delivered", "managed", "expert", "proficient", "strong",
    ]
    hesitant_words = [
        "um", "uh", "maybe", "perhaps", "not sure", "i think", "possibly",
        "kind of", "sort of", "i guess", "like",
    ]
    text_lower = text.lower()
    confident_count = sum(1 for w in confident_words if w in text_lower)
    hesitant_count = sum(1 for w in hesitant_words if w in text_lower)
    base = 0.5
    length_bonus = min(0.3, word_count / 100)
    confident_bonus = min(0.2, confident_count * 0.05)
    hesitant_penalty = min(0.3, hesitant_count * 0.08)
    score = base + length_bonus + confident_bonus - hesitant_penalty
    score = max(0.1, min(1.0, score))
    return {
        "word_count": word_count,
        "confident_signals": confident_count,
        "hesitant_signals": hesitant_count,
        "text_score": round(score, 2),
    }


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------

@app.post("/session/start")
async def start_session(
    body: StartSessionRequest,
    x_auth_token: str = Header(None),
) -> dict:
    print(f"Token received: {x_auth_token[:8] if x_auth_token else 'NONE'}")
    print(f"Active sessions: {list(active_sessions.keys())[:3]}")

    session_id = str(uuid.uuid4())
    ct_number = None

    if x_auth_token and x_auth_token in active_sessions:
        sess = active_sessions[x_auth_token]
        if sess["role"] == "candidate":
            job_role = sess.get("job_role") or body.job_role
            job_description = sess.get("job_description", "") or body.job_description
            ct_number = sess["ct_number"]
        else:
            job_role = body.job_role
            job_description = body.job_description
    elif x_auth_token:
        print(f"Token not found in active_sessions — likely expired after server restart")
        raise HTTPException(status_code=401, detail="Session expired. Please log out and log in again.")
    else:
        job_role = body.job_role
        job_description = body.job_description

    if ct_number:
        _cands = await _read_candidates()
        _cand = next((c for c in _cands if c["ct_number"] == ct_number), None)
        if _cand:
            slot_str = _cand.get("interview_slot")
            if not slot_str:
                for _app in _get_applications(_cand):
                    if _app.get("status") == "interview_scheduled" and _app.get("interview_slot"):
                        slot_str = _app["interview_slot"]
                        break
            if slot_str:
                try:
                    slot_time = datetime.strptime(slot_str, "%Y-%m-%d %H:%M")
                    now = datetime.now()
                    minutes_diff = (slot_time - now).total_seconds() / 60
                    if minutes_diff > 2:
                        return JSONResponse(
                            status_code=403,
                            content={
                                "detail": "too_early",
                                "slot": slot_str,
                                "minutes_remaining": round(minutes_diff),
                            },
                        )
                except Exception as e:
                    print(f"Slot parse error: {e}")

    first_question = "Welcome! Tell me about yourself and what interests you about this role."

    if ANTHROPIC_API_KEY:
        try:
            jd_context = (
                f" Here is the job description: {job_description}. Ask questions specifically tailored to this JD."
                if job_description else ""
            )
            client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=512,
                system=(
                    f"You are a professional interviewer conducting an interview for the role of {job_role}.{jd_context} "
                    "Begin by warmly welcoming the candidate by name if known, introduce yourself briefly as the AI interviewer, "
                    "and then ask your first interview question. "
                    "Keep the entire opening under 4 sentences total. "
                    "Do not use markdown formatting."
                ),
                messages=[{"role": "user", "content": "Please begin the interview."}],
            )
            first_question = response.content[0].text
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Claude API error: {e}")

    session = {
        "session_id": session_id,
        "job_role": job_role,
        "job_description": job_description,
        "ct_number": ct_number,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "interview_start_time": datetime.now(timezone.utc).isoformat(),
        "transcript": [{"q": first_question, "a": "", "score": None}],
        "scorecard": None,
    }
    await _write_session(session_id, session)

    if ct_number:
        candidates = await _read_candidates()
        for c in candidates:
            if c["ct_number"] == ct_number:
                c["session_id"] = session_id
                break
        await _write_candidates(candidates)

    return {"session_id": session_id, "first_question": first_question}


@app.post("/session/{session_id}/audio")
async def process_audio(session_id: str, audio: UploadFile = File(...)) -> Response:
    try:
        session = await _read_session(session_id)
        job_role = session.get("job_role", "Software Engineer")
        job_description = session.get("job_description", "")
        audio_bytes = await audio.read()

        print(f"Audio filename: {audio.filename}")
        print(f"Audio content type: {audio.content_type}")
        print(f"Audio size: {len(audio_bytes)} bytes")

        audio_metrics = analyze_audio_confidence(audio_bytes)

        candidate_answer = "I have relevant experience and have worked on similar challenges."
        if OPENAI_API_KEY:
            try:
                import tempfile
                oai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name
                try:
                    with open(tmp_path, "rb") as audio_file:
                        whisper_resp = await oai_client.audio.transcriptions.create(
                            model=OPENAI_TRANSCRIPTION_MODEL,
                            file=audio_file,
                        )
                except Exception as transcribe_error:
                    if OPENAI_TRANSCRIPTION_MODEL == "whisper-1":
                        raise
                    print(
                        f"GPT transcription model failed ({transcribe_error}); "
                        "falling back to whisper-1"
                    )
                    with open(tmp_path, "rb") as audio_file:
                        whisper_resp = await oai_client.audio.transcriptions.create(
                            model="whisper-1",
                            file=audio_file,
                        )
                os.unlink(tmp_path)
                candidate_answer = whisper_resp.text
            except Exception as e:
                print(f"WHISPER ERROR: {type(e).__name__}: {e}")
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Whisper API error: {e}")

        prev_question = ""
        transcript = session["transcript"]
        if transcript and transcript[-1].get("q"):
            prev_question = transcript[-1]["q"]

        text_metrics = analyze_text_confidence(candidate_answer, prev_question)
        confidence_score = round((
            audio_metrics["volume"] * 0.35
            + audio_metrics["consistency"] * 0.25
            + text_metrics["text_score"] * 0.40
        ) * 100)
        confidence_payload = {
            "confidence": confidence_score,
            "metrics": {
                "volume": audio_metrics["volume"],
                "consistency": audio_metrics["consistency"],
                "word_count": text_metrics["word_count"],
                "hesitant_signals": text_metrics["hesitant_signals"],
                "confident_signals": text_metrics["confident_signals"],
            },
        }

        if transcript and transcript[-1]["a"] == "":
            transcript[-1]["a"] = candidate_answer
            transcript[-1].update(confidence_payload)
        else:
            transcript.append({"q": "", "a": candidate_answer, "score": None, **confidence_payload})

        # Check interview duration
        elapsed_minutes = 0.0
        interview_start_time = session.get("interview_start_time")
        if interview_start_time:
            try:
                start_dt = datetime.fromisoformat(interview_start_time)
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
                elapsed_minutes = (datetime.now(timezone.utc) - start_dt).total_seconds() / 60
            except Exception:
                pass

        closing_asked = session.get("closing_asked", False)

        # If closing question was already asked, this is the final answer → auto end
        if closing_asked:
            session["transcript"] = transcript
            await _write_session(session_id, session)
            return Response(
                content=json.dumps({
                    "response": "Thank you so much for your time today. It was a pleasure speaking with you and we will be in touch soon.",
                    "candidate_answer": candidate_answer,
                    "auto_end": True,
                }),
                media_type="application/json",
            )

        # Backup: max 8 answered questions
        answered_count = sum(1 for e in transcript if e.get("q") and e.get("a"))
        if answered_count >= 8:
            session["transcript"] = transcript
            await _write_session(session_id, session)
            return Response(
                content=json.dumps({
                    "response": "Thank you for completing all the questions. Your interview is now complete.",
                    "candidate_answer": candidate_answer,
                    "auto_end": True,
                }),
                media_type="application/json",
            )

        # Hard 10-minute time limit
        if elapsed_minutes >= 10:
            session["transcript"] = transcript
            await _write_session(session_id, session)
            return Response(
                content=json.dumps({
                    "response": "We have reached the end of our allotted interview time. Thank you very much for your time today.",
                    "candidate_answer": candidate_answer,
                    "auto_end": True,
                }),
                media_type="application/json",
            )

        n_questions = sum(1 for e in transcript if e.get("q"))
        next_question = "That's a great point. Can you walk me through a specific example from your previous work?"

        # At 9-minute mark, ask the closing question
        use_closing_prompt = elapsed_minutes >= 9 and not closing_asked
        if use_closing_prompt:
            session["closing_asked"] = True

        if ANTHROPIC_API_KEY:
            try:
                messages = _build_claude_messages(transcript)
                if messages and messages[0]["role"] == "assistant":
                    messages = [{"role": "user", "content": "Please begin the interview."}] + messages

                if use_closing_prompt:
                    system = (
                        "This is your FINAL question. Ask the candidate: "
                        "'Do you have any questions for us about the role or the company?' "
                        "Keep it brief and professional. One sentence only."
                    )
                else:
                    system = (
                        f"You are a professional interviewer for {job_role}. "
                        + (f"Job description: {job_description}. " if job_description else "")
                        + f"You have asked {n_questions} questions so far. Ask a relevant "
                        "follow-up question based on the candidate's answers. "
                        "Keep your response to ONE short sentence only. Maximum 20 words. "
                        "No long introductions or preambles. Ask one direct question only. "
                        "Do not use markdown formatting."
                    )

                client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=150,
                    system=system,
                    messages=messages,
                )
                next_question = response.content[0].text
            except Exception as e:
                print(f"CLAUDE ERROR: {type(e).__name__}: {e}")
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Claude API error: {e}")

        transcript.append({"q": next_question, "a": "", "score": None})
        session["transcript"] = transcript
        await _write_session(session_id, session)

        return Response(
            content=json.dumps({"response": next_question, "candidate_answer": candidate_answer}),
            media_type="application/json",
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        with open("error.log", "w") as f:
            f.write(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/{session_id}/proctor")
async def proctor_frame(session_id: str, body: ProctorRequest) -> dict:
    result: dict = {"faces": 1, "looking_at_screen": True, "flag": False, "reason": ""}

    if ANTHROPIC_API_KEY:
        try:
            image_data = body.image
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]

            client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=256,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Is there exactly one person visible and looking at the screen? "
                                "Return ONLY valid JSON: "
                                "{\"faces\": 0, \"looking_at_screen\": true, \"flag\": false, \"reason\": \"\"}"
                            ),
                        },
                    ],
                }],
            )
            raw = response.content[0].text.strip()
            result = json.loads(_strip_code_fence(raw))
        except Exception:
            pass  # never block interview for proctoring errors

    if result.get("flag"):
        try:
            flag_type = "face_detection"
            session = await _read_session(session_id)
            if "violations" not in session:
                session["violations"] = []
            violation_entry = {
                "type": flag_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "reason": result.get("reason", ""),
            }
            session["violations"].append(violation_entry)
            await _write_session(session_id, session)
            print(f"Violation saved: {violation_entry}")
            print(f"Total violations: {len(session['violations'])}")
        except Exception as ex:
            print(f"Error saving violation: {ex}")

    return result


@app.post("/session/{session_id}/end")
async def end_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    x_auth_token: str = Header(None),
) -> dict:
    try:
        session = await _read_session(session_id)
        job_role = session.get("job_role", "Software Engineer")
        job_description = session.get("job_description", "")

        print(f"END SESSION called for {session_id}")
        print(f"Session keys: {list(session.keys())}")
        print(f"Transcript length: {len(session.get('transcript', []))}")

        if ANTHROPIC_API_KEY:
            try:
                transcript_text = "\n".join(
                    f"Q: {e['q']}\nA: {e['a']}"
                    for e in session["transcript"]
                    if e.get("q") and e.get("a")
                )
                print(f"Transcript text length: {len(transcript_text)}")

                client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1024,
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Based on this interview transcript for the role of {job_role}, "
                            "provide a scorecard in valid JSON format only with these exact fields: "
                            "communication (1-10), technical_depth (1-10), problem_solving (1-10), "
                            "cultural_fit (1-10), summary (string), strengths (array of strings), "
                            "red_flags (array of strings). "
                            "Return ONLY valid JSON, no markdown, no explanation. "
                            f"\n\nTranscript:\n{transcript_text}"
                        ),
                    }],
                )
                raw = response.content[0].text
                print(f"Claude response: {raw[:200]}")
                scorecard = json.loads(_strip_code_fence(raw))
            except Exception as e:
                print(f"CLAUDE ERROR in end_session: {type(e).__name__}: {e}")
                traceback.print_exc()
                scorecard = MOCK_SCORECARD.copy()
        else:
            scorecard = MOCK_SCORECARD.copy()

        scorecard["transcript"] = session.get("transcript", [])
        violations = session.get("violations", [])
        print(f"END SESSION - violations count: {len(violations)}")
        scorecard["violations"] = violations
        scorecard["proctoring"] = {
            "total_violations": len(violations),
            "clean": len(violations) == 0,
            "details": violations,
            "auto_ended": session.get("auto_ended_proctoring", False),
        }

        # Confidence analytics across all answered questions
        answered = [e for e in scorecard["transcript"] if e.get("a") and e.get("confidence")]
        if answered:
            scores = [e["confidence"] for e in answered]
            avg_confidence = round(sum(scores) / len(scores))
            peak_q = max(answered, key=lambda x: x["confidence"])
            lowest_q = min(answered, key=lambda x: x["confidence"])
            if len(scores) >= 3:
                half = len(scores) // 2
                first_half = sum(scores[:half]) / half
                second_half = sum(scores[half:]) / (len(scores) - half)
                trend = ("improving" if second_half > first_half + 5
                         else "declining" if first_half > second_half + 5
                         else "steady")
            else:
                trend = "steady"
            if avg_confidence >= 75:
                confidence_label, confidence_color = "High Confidence", "#0F6E56"
            elif avg_confidence >= 50:
                confidence_label, confidence_color = "Moderate Confidence", "#854F0B"
            else:
                confidence_label, confidence_color = "Low Confidence", "#A32D2D"
            scorecard["confidence_analysis"] = {
                "average_score": avg_confidence,
                "label": confidence_label,
                "color": confidence_color,
                "trend": trend,
                "peak_question": peak_q.get("q", "")[:80],
                "peak_score": peak_q["confidence"],
                "lowest_question": lowest_q.get("q", "")[:80],
                "lowest_score": lowest_q["confidence"],
                "per_question": [
                    {
                        "question_num": i + 1,
                        "question": e.get("q", "")[:60],
                        "score": e.get("confidence", 50),
                        "word_count": e.get("metrics", {}).get("word_count", 0),
                        "hesitant": e.get("metrics", {}).get("hesitant_signals", 0),
                        "volume": e.get("metrics", {}).get("volume", 0.5),
                    }
                    for i, e in enumerate(answered)
                ],
                "total_words": sum(e.get("metrics", {}).get("word_count", 0) for e in answered),
            }

        session["status"] = "complete"
        session["scorecard"] = scorecard
        await _write_session(session_id, session)
        print(f"Session saved successfully")

        candidate_name = ""
        try:
            candidate = find_candidate_by_session(session_id)
            if candidate:
                print(f"Found candidate: {candidate.get('ct_number')}")
                candidates = await _read_candidates()
                for c in candidates:
                    if c.get("ct_number") == candidate.get("ct_number"):
                        c["status"] = "interview_complete"
                        candidate_name = c.get("name", "")
                        break
                await _write_candidates(candidates)
                print("Candidate status updated to interview_complete")
            else:
                print(f"WARNING: No candidate found for session {session_id}")
        except Exception as e:
            print(f"WARNING: Could not update candidate status: {e}")
            traceback.print_exc()

        background_tasks.add_task(send_scorecard_email_sync, scorecard, job_role, session_id, candidate_name)
        return scorecard

    except Exception as e:
        print(f"FATAL ERROR in end_session: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"End session error: {str(e)}")


@app.get("/session/{session_id}/scorecard")
async def get_scorecard(session_id: str) -> dict:
    session = await _read_session(session_id)
    if session.get("scorecard") is None:
        raise HTTPException(status_code=404, detail="Scorecard not yet available")
    return session["scorecard"]
