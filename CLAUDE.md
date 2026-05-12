# AI Interview Agent — Hackathon Build

## What this is
AI-powered voice interview agent. Candidate joins a video room,
an AI conducts the interview via voice, scores the candidate,
and a dashboard shows the results.

## Stack
- Frontend: React + Vite (TypeScript)
- Video room: Daily.co SDK
- STT: OpenAI Whisper API
- AI interviewer: Claude API (claude-sonnet-4-6)
- TTS: ElevenLabs
- Scoring: Claude API returns JSON scorecard
- Backend: Python FastAPI (async)
- Storage: JSON files in /data folder
- Hosting: Railway.app

## API endpoints
POST /session/start
POST /session/{id}/audio
POST /session/{id}/end
GET  /session/{id}/scorecard

## Scoring JSON shape
{
  "communication": 7,
  "technical_depth": 8,
  "problem_solving": 6,
  "cultural_fit": 7,
  "summary": "Strong candidate with good communication",
  "strengths": ["clear explanations", "structured thinking"],
  "red_flags": ["limited system design experience"],
  "transcript": [{"q": "...", "a": "...", "score": 7}]
}

## Rules
- Python: async FastAPI, type hints, no sync blocking calls
- React: functional components + hooks only
- Never hardcode API keys — use .env files
- Latency target: under 2 seconds from candidate finishing to AI responding