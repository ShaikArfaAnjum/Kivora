# Kivora — Phase 2: Gnani AI Voice Integration Pre-Implementation Inspection Report

## 1. Executive Summary
Before modifying any project code, a complete inspection was conducted across the Kivora repository (`D:\Downloads\Kivora\Kivora`), covering backend APIs, frontend components, Gemini LLM reasoning, knowledge retrieval, database state, automated test suites, and Gnani AI credentials & contracts.

---

## 2. Architecture & Repository Findings

### A. FastAPI Backend Inspection
* **Location:** `backend/`
* **Entry Point:** `backend/app/main.py`
* **Routes Mounted:** `auth`, `creators`, `brands`, `briefs`, `matching`, `ai`, `taxonomy`, `media`, `verification`, `engagements`, `projects`, `notifications`, `messages`, `saved`, `alerts`, `workspaces`.
* **AI Router:** `backend/app/api/ai.py`
  * Endpoints:
    * `POST /api/ai/generate-brief` (AI-assisted brief builder)
    * `POST /api/ai/kivo-chat` (Kivo AI conversational concierge)
* **Configuration:** `backend/app/core/config.py` loads `.env` variables (`GEMINI_API_KEY`, `GNANI_API_KEY`, `DATABASE_URL`, `SECRET_KEY`, OAuth credentials).
* **Database:** SQLite (`kivora.db`), SQLAlchemy ORM with foreign keys enforced.

### B. Kivo AI Knowledge Base & Gemini Reasoning
* **Knowledge Retrieval:** `backend/app/services/kivo_knowledge.py`
  * Knowledge Source: `backend/app/data/kivora_knowledge_base.json` (29 KB structured JSON articles covering Brand Portal, Creator Portal, Admin verification, milestone escrow, chat lock conditions, matching score).
  * Retrieval Mechanism: Token overlap + canonical question regex matching (`CANONICAL_QUESTION_MAP`).
  * Safety Guardrails: In `backend/app/api/ai.py`, sensitive patterns (`password`, `secret`, `token`, `sql inject`, `drop table`, `admin override`) are intercepted deterministically.
* **Reasoning Engine:** Google Gemini (`google.genai` SDK, `gemini-3.8-flash`) grounds prompt responses strictly within the Kivora knowledge context.
* **Deterministic Fallback:** Zero-hallucination grounded knowledge engine (`format_grounded_answer`) activates if Gemini API is unreachable or unconfigured.

### C. Existing Kivo Chatbot Component
* **Location:** `frontend/src/components/FloatingKivoChatbot.jsx`
* **UI Features:**
  * Floating mascot trigger at bottom-right with idle float animation and hover bounce.
  * Floating speech bubble: *"Hii! 👋 How can I help you today?"*
  * Responsive chat panel with avatar header, message history, markdown bolding (`**text**`), Kivo thinking pulse, quick prompt chips, and message input form.
  * Integration: Dispatches requests via `api.kivoChat` (`frontend/src/services/api.js`), carrying message history and user role (`CREATOR`, `BRAND`, `ADMIN`, `GUEST`).
* **Hero / Landing Promotion:** `frontend/src/components/MeetKivoSection.jsx` dispatches custom window event `kivora:open-chat` with pre-filled prompts.

### D. Verified Gnani AI API Contracts & Live Account Verification
Live API testing with the provided `GNANI_API_KEY` (`vach_...`) on the Vachana developer platform (`https://api.vachana.ai`) confirmed:
* **Speech-to-Text (Gnani Prisma STT):**
  * **Endpoint:** `POST https://api.vachana.ai/stt/v3`
  * **Model:** `prisma-v3.0`
  * **Header:** `X-API-Key-ID: <GNANI_API_KEY>`, `User-Agent: Kivora/1.0`
  * **Audio Input:** Multipart form data (`audio_file`) accepting WAV, MP3, WEBM, OGG.
  * **Verified Latency:** ~120ms end-to-end.
  * **Verified Languages:** English (`en-IN`), Hindi (`hi-IN`), Telugu (`te-IN`).
  * **Live Verification Status:** Verified HTTP 200 with accurate transcription.
* **Text-to-Speech (Gnani Timbre TTS):**
  * **Endpoint:** `POST https://api.vachana.ai/api/v1/tts/inference`
  * **Model:** `timbre-v3.0`
  * **Header:** `X-API-Key-ID: <GNANI_API_KEY>`, `Content-Type: application/json`, `User-Agent: Kivora/1.0`
  * **Voices:** 13 expressive voices (Default: `Shivani` - warm, empathetic feminine voice; also `Avinash`, `Lakshmi`, `Shubham`, etc.).
  * **Payload Configuration:** `{"audio_config": {"sample_rate": 24000, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"}}`
  * **Output:** Clean RIFF/WAVE 24kHz audio stream.
  * **Verified Languages:** English (`en-IN`), Hindi (`hi-IN`), Telugu (`te-IN`).
  * **Live Verification Status:** Verified HTTP 200 with clear synthesized speech.

---

## 3. Current Working State

| Component | Status | Notes |
| :--- | :--- | :--- |
| **Backend Core** | Operational | FastAPI routes, SQLite database, CORS configuration valid |
| **Frontend Production Build** | Passing | `vite build` completed in 4.90s with 0 errors |
| **Deterministic AI Brief & Pitch Tests** | Passing | Tested in `backend/tests/test_phase5_ai_assistance.py` |
| **Gnani Prisma STT (v3.0)** | Verified (HTTP 200) | Tested on live API with en-IN, hi-IN, te-IN |
| **Gnani Timbre TTS (v3.0)** | Verified (HTTP 200) | Tested on live API with en-IN, hi-IN, te-IN |
| **Gemini Integration** | Operational | Preserved as sole reasoning engine; zero architectural migration |

---

## 4. Implementation Plan

1. **Backend Gnani Service (`backend/app/services/gnani_service.py`):**
   * Robust STT function: validates audio formats, size, duration, calls Prisma v3.0, handles errors and network timeouts safely.
   * Robust TTS function: calls Timbre v3.0, outputs standard audio bytes / base64, supports language and voice selection, handles failures gracefully.
   * End-to-end voice chat handler reusing existing Kivo knowledge retrieval, security guardrails, and Gemini reasoning.
2. **Backend Voice Router (`backend/app/api/voice.py`):**
   * `POST /api/voice/transcribe` (Audio -> Transcript via Prisma)
   * `POST /api/voice/synthesize` (Text -> Spoken Audio via Timbre)
   * `POST /api/voice/kivo-voice-chat` (Unified voice interaction: Audio in -> Prisma STT -> Gemini/KB reasoning -> Timbre TTS -> Text + Audio out)
   * `GET /api/voice/config` (Returns supported languages and default voices without exposing keys)
3. **Frontend Integration:**
   * **In-Chat Voice Input:** Add microphone button to `FloatingKivoChatbot.jsx` with real-time recording, visual recording pulse, audio playback control for Kivo's replies, and seamless text/voice switching.
   * **Dedicated Full-Screen Kivo Voice Assistant (`frontend/src/components/KivoVoiceAssistantModal.jsx`):**
     * Immersive full-screen overlay with cosmic Kivora styling.
     * Animated voice waveform / audio visualizer.
     * Large interactive microphone button with state transitions (Idle -> Listening -> Transcribing -> Thinking -> Speaking).
     * Language selector (English, Telugu, Hindi).
     * Live recognized transcript and Kivo's text + audio spoken response.
     * Audio replay, stop recording, stop playback, and switch-to-text controls.
   * **Optional Messaging Voice Extension Evaluation:** Add audio recording capability to Creator-Brand messaging if feasible without disruption.
