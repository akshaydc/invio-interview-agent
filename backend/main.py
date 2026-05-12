import json
import os
import smtplib
import traceback
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiofiles
import anthropic
import openai
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, UploadFile
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

if not CANDIDATES_FILE.exists():
    CANDIDATES_FILE.write_text("[]")

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
        raise HTTPException(status_code=404, detail="Candidate not found. Please ask your recruiter.")
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
        "status": candidate.get("status", "not_started"),
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
                    f"You are a professional interviewer for the role of {job_role}.{jd_context} "
                    "Keep all questions short and crisp - maximum 2 sentences. "
                    "No long introductions. Ask one direct question only. "
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
                c["status"] = "in_progress"
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


@app.post("/session/{session_id}/end")
async def end_session(session_id: str, background_tasks: BackgroundTasks) -> dict:
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
    session["status"] = "complete"
    session["scorecard"] = scorecard
    await _write_session(session_id, session)

    candidate_name = ""
    if ct_number:
        candidates = await _read_candidates()
        for c in candidates:
            if c["ct_number"] == ct_number:
                c["status"] = "completed"
                candidate_name = c.get("name", "")
                break
        await _write_candidates(candidates)

    background_tasks.add_task(send_scorecard_email, scorecard, job_role, session_id, candidate_name)
    return scorecard


@app.get("/session/{session_id}/scorecard")
async def get_scorecard(session_id: str) -> dict:
    session = await _read_session(session_id)
    if session.get("scorecard") is None:
        raise HTTPException(status_code=404, detail="Scorecard not yet available")
    return session["scorecard"]
