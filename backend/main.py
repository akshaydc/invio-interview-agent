import io
import json
import os
import random
import smtplib
import traceback
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

try:
    import PyPDF2
    _PYPDF2_AVAILABLE = True
except ImportError:
    _PYPDF2_AVAILABLE = False

import aiofiles
import anthropic
import openai
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
RECRUITER_EMAIL = os.getenv("RECRUITER_EMAIL")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
CANDIDATES_FILE = DATA_DIR / "candidates.json"

app = FastAPI(title="AI Interview Agent")
active_sessions: dict = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS_FILE = DATA_DIR / "jobs.json"

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


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

async def _read_candidates() -> list:
    async with aiofiles.open(CANDIDATES_FILE, "r") as f:
        return json.loads(await f.read())


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


async def _find_candidate_by_session(session_id: str) -> dict | None:
    candidates = await _read_candidates()
    return next((c for c in candidates if c.get("session_id") == session_id), None)


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

    prompt = (
        f"Compare this resume with the job description.{compensation_instruction}"
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

def send_scorecard_email(scorecard: dict, job_role: str, session_id: str, candidate_name: str = "") -> None:
    print(f"GMAIL_USER: {GMAIL_USER}")
    print(f"GMAIL_APP_PASSWORD set: {bool(GMAIL_APP_PASSWORD)}")
    print(f"RECRUITER_EMAIL: {RECRUITER_EMAIL}")
    if not GMAIL_USER or not GMAIL_APP_PASSWORD or not RECRUITER_EMAIL:
        print("Email not configured — skipping scorecard email.")
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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Interview Scorecard — {job_role}" + (f" — {candidate_name}" if candidate_name else "")
    msg["From"] = GMAIL_USER
    msg["To"] = RECRUITER_EMAIL
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, RECRUITER_EMAIL, msg.as_string())
        print(f"Scorecard email sent to {RECRUITER_EMAIL}")
    except Exception:
        traceback.print_exc()
        print("Failed to send scorecard email.")


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
        "job_role": candidate["job_role"],
        "job_description": candidate.get("job_description", ""),
    }
    return {
        "token": token,
        "role": "candidate",
        "name": candidate["name"],
        "ct_number": candidate["ct_number"],
        "job_role": candidate["job_role"],
        "job_description": candidate.get("job_description", ""),
        "session_id": candidate.get("session_id"),
        "status": candidate.get("status", "applied"),
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


@app.get("/recruiter/candidates")
async def list_candidates(_auth: dict = Depends(verify_recruiter_token)) -> list:
    return await _read_candidates()


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
    if not session_id:
        raise HTTPException(status_code=404, detail="No interview session found")
    session = await _read_session(session_id)
    scorecard = session.get("scorecard")
    if not scorecard:
        raise HTTPException(status_code=404, detail="Scorecard not yet available")
    return {"candidate": candidate, "scorecard": scorecard}


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


@app.post("/recruiter/candidates/{ct_number}/schedule")
async def schedule_candidate(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    return await _set_candidate_status(ct_number, "interview_scheduled", "scheduled_at")


@app.post("/recruiter/candidates/{ct_number}/invite")
async def invite_candidate_alias(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    return await _set_candidate_status(ct_number, "interview_scheduled", "scheduled_at")


@app.post("/recruiter/candidates/{ct_number}/reject")
async def reject_candidate(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    return await _set_candidate_status(ct_number, "rejected", "rejected_at")


@app.post("/recruiter/candidates/{ct_number}/cancel-schedule")
async def cancel_schedule(
    ct_number: str,
    _auth: dict = Depends(verify_recruiter_token),
) -> dict:
    return await _set_candidate_status(ct_number, "applied", "updated_at")


# ---------------------------------------------------------------------------
# Public job endpoints
# ---------------------------------------------------------------------------

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


@app.post("/jobs/{job_id}/apply")
async def apply_for_job(
    job_id: str,
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    current_role: str = Form(""),
    current_ctc: str = Form(""),
    expected_ctc: str = Form(""),
    notice_period: str = Form(""),
    resume: UploadFile | None = File(None),
) -> dict:
    jobs = await _read_jobs()
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "open":
        raise HTTPException(status_code=400, detail="This position is no longer accepting applications")

    candidates = await _read_candidates()

    duplicate = next(
        (c for c in candidates if c.get("email", "").lower() == email.lower() and c.get("job_id") == job_id),
        None,
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="You have already applied for this position. Check your email for your CT number.",
        )

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

    resume_text = ""
    if resume and resume.filename:
        file_bytes = await resume.read()
        resume_text = _extract_resume_text(file_bytes, resume.filename)

    match_result = await _analyze_resume_match(
        resume_text, job,
        expected_ctc=expected_ctc,
        notice_period=notice_period,
    )

    candidate = {
        "name": name,
        "ct_number": ct_number,
        "email": email,
        "phone": phone,
        "current_role": current_role,
        "current_ctc": current_ctc,
        "expected_ctc": expected_ctc,
        "notice_period": notice_period,
        "job_id": job_id,
        "job_role": job["title"],
        "job_description": job["description"],
        "resume_text": resume_text,
        "match_percentage": match_result.get("match_percentage"),
        "match_summary": match_result.get("match_summary"),
        "match_strengths": match_result.get("strengths", []),
        "match_gaps": match_result.get("gaps", []),
        "compensation_fit": match_result.get("compensation_fit"),
        "notice_fit": match_result.get("notice_fit"),
        "recommendation": match_result.get("recommendation"),
        "session_id": None,
        "status": "applied",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }
    candidates.append(candidate)
    await _write_candidates(candidates)

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


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------

@app.post("/session/start")
async def start_session(
    body: StartSessionRequest,
    x_auth_token: str = Header(None),
) -> dict:
    session_id = str(uuid.uuid4())
    ct_number = None

    if x_auth_token and x_auth_token in active_sessions:
        sess = active_sessions[x_auth_token]
        if sess["role"] == "candidate":
            job_role = sess["job_role"]
            job_description = sess["job_description"]
            ct_number = sess["ct_number"]
        else:
            job_role = body.job_role
            job_description = body.job_description
    else:
        job_role = body.job_role
        job_description = body.job_description

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

        candidate_answer = "I have relevant experience and have worked on similar challenges."
        if OPENAI_API_KEY:
            try:
                import tempfile
                oai_client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name
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

        transcript = session["transcript"]
        if transcript and transcript[-1]["a"] == "":
            transcript[-1]["a"] = candidate_answer
        else:
            transcript.append({"q": "", "a": candidate_answer, "score": None})

        answered_count = sum(1 for e in transcript if e.get("q") and e.get("a"))
        if answered_count >= 7:
            session["transcript"] = transcript
            await _write_session(session_id, session)
            return Response(
                content=json.dumps({
                    "response": "Thank you for completing all questions. Your interview is now complete.",
                    "candidate_answer": candidate_answer,
                    "auto_end": True,
                }),
                media_type="application/json",
            )

        n_questions = sum(1 for e in transcript if e.get("q"))
        next_question = "That's a great point. Can you walk me through a specific example from your previous work?"

        if ANTHROPIC_API_KEY:
            try:
                messages = _build_claude_messages(transcript)
                if messages and messages[0]["role"] == "assistant":
                    messages = [{"role": "user", "content": "Please begin the interview."}] + messages

                client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=512,
                    system=(
                        f"You are a professional interviewer for {job_role}. "
                        + (f"Job description: {job_description}. " if job_description else "")
                        + f"You have asked {n_questions} questions so far. Ask a relevant "
                        "follow-up question based on the candidate's answers. "
                        "Keep all questions short and crisp - maximum 2 sentences. "
                        "No long introductions or preambles. Ask one direct question only. "
                        "Do not use markdown formatting."
                    ),
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
            session = await _read_session(session_id)
            violations = session.get("violations", [])
            violations.append({
                "type": "face_detection",
                "reason": result.get("reason", ""),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            session["violations"] = violations
            await _write_session(session_id, session)
        except Exception:
            pass

    return result


@app.post("/session/{session_id}/end")
async def end_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    body: EndSessionRequest | None = None,
) -> dict:
    session = await _read_session(session_id)
    job_role = session.get("job_role", "Software Engineer")
    ct_number = session.get("ct_number")

    if ANTHROPIC_API_KEY:
        try:
            transcript_text = "\n".join(
                f"Q: {e['q']}\nA: {e['a']}"
                for e in session["transcript"]
                if e.get("q") and e.get("a")
            )
            client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Based on this interview transcript for the role of {job_role}, "
                            "provide a scorecard in valid JSON format only with these exact fields: "
                            "communication (1-10), technical_depth (1-10), problem_solving (1-10), "
                            "cultural_fit (1-10), summary (string), strengths (array of strings), "
                            "red_flags (array of strings). "
                            "Do not use markdown formatting. "
                            f"\n\nTranscript:\n{transcript_text}"
                        ),
                    }
                ],
            )
            raw = response.content[0].text
            scorecard = json.loads(_strip_code_fence(raw))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse Claude scorecard JSON: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Claude API error: {e}")
    else:
        scorecard = MOCK_SCORECARD.copy()

    scorecard["transcript"] = session["transcript"]

    client_violations = body.violations if body else []
    server_violations = session.get("violations", [])
    scorecard["violations"] = client_violations + server_violations

    session["status"] = "complete"
    session["scorecard"] = scorecard
    await _write_session(session_id, session)

    candidate_name = ""
    try:
        candidates = await _read_candidates()
        updated = False
        for c in candidates:
            if c.get("session_id") == session_id:
                c["status"] = "interview_complete"
                candidate_name = c.get("name", "")
                updated = True
                break
        if updated:
            await _write_candidates(candidates)
        else:
            print(f"Warning: no candidate linked to session {session_id}")
    except Exception as e:
        print(f"Warning: failed to update candidate status: {e}")

    background_tasks.add_task(send_scorecard_email, scorecard, job_role, session_id, candidate_name)
    return scorecard


@app.get("/session/{session_id}/scorecard")
async def get_scorecard(session_id: str) -> dict:
    session = await _read_session(session_id)
    if session.get("scorecard") is None:
        raise HTTPException(status_code=404, detail="Scorecard not yet available")
    return session["scorecard"]
