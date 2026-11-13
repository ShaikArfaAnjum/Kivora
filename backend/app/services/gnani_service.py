"""
Kivora Gnani AI Voice Capabilities Service
Modular integration for:
- Gnani Prisma STT (Speech-to-Text: prisma-v3.0)
- Gnani Timbre TTS (Text-to-Speech: timbre-v3.0)

Maintains Gemini as Kivo AI's core reasoning engine and platform knowledge retriever.
Supports multilingual voice interactions: English (en-IN), Telugu (te-IN), and Hindi (hi-IN).
"""

import os
import re
import io
import wave
import base64
import logging
from typing import Optional, Dict, Any, List, Tuple
import requests

from backend.app.core.config import (
    GNANI_API_KEY,
    GNANI_API_BASE_URL,
    GNANI_STT_MODEL,
    GNANI_TTS_MODEL,
    GNANI_DEFAULT_VOICE,
    is_gnani_configured,
)
from backend.app.services.kivo_knowledge import (
    retrieve_relevant_knowledge,
    format_grounded_answer,
    get_context_for_prompt,
    get_tailored_suggestions,
)

logger = logging.getLogger(__name__)

# Constants & Constraints
MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MIN_AUDIO_SIZE_BYTES = 100               # Filter empty recordings
REQUEST_TIMEOUT_SECONDS = 15

SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".webm", ".m4a", ".flac", ".aac"}
SUPPORTED_MIME_TYPES = {
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/webm", "audio/webm;codecs=opus",
    "audio/mp3", "audio/mpeg",
    "audio/ogg", "audio/ogg;codecs=opus",
    "audio/m4a", "audio/x-m4a", "audio/mp4",
    "audio/flac", "audio/aac",
}

SUPPORTED_LANGUAGES = {
    "en-IN": "English (India)",
    "te-IN": "Telugu (తెలుగు)",
    "hi-IN": "Hindi (हिंदी)",
    "indic-auto": "Auto-Detect",
}

AVAILABLE_VOICES = [
    "Shivani", "Lakshmi", "Kalpana", "Chetana",
    "Vasudha", "Riyaa", "Tarika", "Avinash",
    "Shubham", "Prakash", "Devansh", "Yashraj", "Harshad"
]

HTTP_HEADERS_BASE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Kivora/1.0",
}


class GnaniServiceException(Exception):
    """Custom exception for Gnani STT/TTS service failures."""
    def __init__(self, message: str, status_code: int = 400, error_type: str = "GNANI_ERROR"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_type = error_type


def get_active_gnani_key() -> str:
    """Retrieve runtime Gnani API key safely from environment."""
    key = os.getenv("GNANI_API_KEY") or GNANI_API_KEY
    if not key or not key.strip():
        raise GnaniServiceException(
            "Gnani AI credentials are not configured. Please set GNANI_API_KEY in your environment.",
            status_code=503,
            error_type="MISSING_CREDENTIALS",
        )
    return key.strip()


def validate_audio_file(
    audio_bytes: bytes,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
) -> None:
    """
    Validates uploaded audio file constraints (size, empty file, extension).
    """
    if not audio_bytes or len(audio_bytes) < MIN_AUDIO_SIZE_BYTES:
        raise GnaniServiceException(
            "Audio recording is empty or too short. Please speak clearly into your microphone.",
            status_code=400,
            error_type="EMPTY_AUDIO",
        )

    if len(audio_bytes) > MAX_AUDIO_SIZE_BYTES:
        raise GnaniServiceException(
            f"Audio file exceeds maximum size limit of {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)}MB.",
            status_code=400,
            error_type="FILE_TOO_LARGE",
        )

    # Check extension if filename provided
    if filename:
        ext = os.path.splitext(filename.lower())[1]
        if ext and ext not in SUPPORTED_AUDIO_EXTENSIONS:
            raise GnaniServiceException(
                f"Unsupported audio format '{ext}'. Supported formats: {', '.join(sorted(SUPPORTED_AUDIO_EXTENSIONS))}",
                status_code=400,
                error_type="UNSUPPORTED_FORMAT",
            )


def clean_text_for_speech(markdown_text: str) -> str:
    """
    Strips markdown formatting, code blocks, URLs, and excessive symbols
    so that Timbre TTS speaks naturally and smoothly.
    """
    if not markdown_text:
        return ""

    text = markdown_text
    # Remove code blocks
    text = re.sub(r"```[\s\S]*?```", " ", text)
    # Remove inline code
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove markdown links [label](url) -> label
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Remove bold/italic markers
    text = re.sub(r"(\*\*|\*|__|_)", "", text)
    # Remove markdown headers (#, ##, etc.)
    text = re.sub(r"^#+\s*", "", text, flags=re.MULTILINE)
    # Remove bullet markers (- or *)
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.MULTILINE)
    # Remove blockquotes
    text = re.sub(r"^\s*>\s+", "", text, flags=re.MULTILINE)
    # Remove emojis or excessive special characters if desired, but keep punctuation
    text = re.sub(r"[✦✨👋➔✕]", "", text)
    # Normalize whitespaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def transcribe_speech_prisma(
    audio_bytes: bytes,
    filename: str = "recording.wav",
    mime_type: str = "audio/wav",
    language_code: str = "en-IN",
) -> Dict[str, Any]:
    """
    Transcribes audio into text using Gnani Prisma STT (prisma-v3.0).
    Endpoint: POST https://api.vachana.ai/stt/v3
    """
    validate_audio_file(audio_bytes, filename=filename, content_type=mime_type)
    api_key = get_active_gnani_key()

    # Validate language code or fallback
    target_lang = language_code if language_code in SUPPORTED_LANGUAGES else "en-IN"

    stt_endpoint = f"{GNANI_API_BASE_URL}/stt/v3"
    headers = {
        **HTTP_HEADERS_BASE,
        "X-API-Key-ID": api_key,
    }

    # Prepare multipart form
    files = {
        "audio_file": (filename, audio_bytes, mime_type or "audio/wav"),
    }
    data = {
        "model": GNANI_STT_MODEL,
        "language_code": target_lang,
        "format": "transcribe",
    }

    try:
        response = requests.post(
            stt_endpoint,
            headers=headers,
            files=files,
            data=data,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )

        if response.status_code == 401 or response.status_code == 403:
            logger.error("Gnani Prisma STT Authentication failed: HTTP %s", response.status_code)
            raise GnaniServiceException(
                "Invalid or expired Gnani API credentials. Please check your GNANI_API_KEY.",
                status_code=401,
                error_type="INVALID_CREDENTIALS",
            )

        if response.status_code != 200:
            err_msg = response.text
            try:
                err_json = response.json()
                if "error" in err_json:
                    err_msg = err_json["error"].get("message", err_msg)
            except Exception:
                pass
            logger.warning("Gnani Prisma STT returned status %s: %s", response.status_code, err_msg)
            raise GnaniServiceException(
                f"Speech transcription failed: {err_msg}",
                status_code=response.status_code,
                error_type="PRISMA_STT_FAILED",
            )

        res_data = response.json()
        transcript = (res_data.get("transcript") or "").strip()
        detected_lang = res_data.get("detected_language_code") or target_lang

        if not transcript:
            raise GnaniServiceException(
                "No speech detected in audio recording. Please speak clearly and try again.",
                status_code=400,
                error_type="EMPTY_TRANSCRIPT",
            )

        return {
            "success": True,
            "transcript": transcript,
            "detected_language_code": detected_lang,
            "model": GNANI_STT_MODEL,
            "latency": res_data.get("end_to_end_latency") or res_data.get("processing_time"),
        }

    except requests.exceptions.Timeout:
        logger.error("Gnani Prisma STT request timed out after %s seconds", REQUEST_TIMEOUT_SECONDS)
        raise GnaniServiceException(
            "Speech recognition timed out. Please try again.",
            status_code=504,
            error_type="STT_TIMEOUT",
        )
    except requests.exceptions.RequestException as e:
        logger.error("Network failure connecting to Gnani Prisma STT: %s", e)
        raise GnaniServiceException(
            f"Network connection to speech recognition service failed: {str(e)}",
            status_code=502,
            error_type="NETWORK_FAILURE",
        )


def synthesize_speech_timbre(
    text: str,
    language_code: str = "en-IN",
    voice: Optional[str] = None,
    speed: float = 1.0,
) -> bytes:
    """
    Synthesizes text into natural spoken audio using Gnani Timbre TTS (timbre-v3.0).
    Endpoint: POST https://api.vachana.ai/api/v1/tts/inference
    Returns standard RIFF/WAVE binary bytes.
    """
    api_key = get_active_gnani_key()

    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise GnaniServiceException("Text cannot be empty for speech synthesis.", status_code=400)

    # Truncate extremely long responses to prevent excessive latency (up to 2000 chars)
    if len(clean_text) > 2000:
        clean_text = clean_text[:1997] + "..."

    target_lang = language_code if language_code in SUPPORTED_LANGUAGES and language_code != "indic-auto" else "en-IN"
    target_voice = voice if voice in AVAILABLE_VOICES else GNANI_DEFAULT_VOICE

    tts_endpoint = f"{GNANI_API_BASE_URL}/api/v1/tts/inference"
    headers = {
        **HTTP_HEADERS_BASE,
        "X-API-Key-ID": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "text": clean_text,
        "voice": target_voice,
        "model": GNANI_TTS_MODEL,
        "language": target_lang,
        "speed": float(speed or 1.0),
        "audio_config": {
            "sample_rate": 24000,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }

    try:
        response = requests.post(
            tts_endpoint,
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )

        if response.status_code == 401 or response.status_code == 403:
            logger.error("Gnani Timbre TTS Authentication failed: HTTP %s", response.status_code)
            raise GnaniServiceException(
                "Invalid or expired Gnani API credentials for speech synthesis.",
                status_code=401,
                error_type="INVALID_CREDENTIALS",
            )

        if response.status_code != 200:
            logger.warning("Gnani Timbre TTS returned status %s: %s", response.status_code, response.text[:200])
            raise GnaniServiceException(
                f"Speech synthesis failed with status {response.status_code}",
                status_code=response.status_code,
                error_type="TIMBRE_TTS_FAILED",
            )

        raw_audio = response.content
        if not raw_audio:
            raise GnaniServiceException("Received empty audio stream from speech synthesis engine.", status_code=500)

        # Check if already a valid RIFF/WAVE container
        if raw_audio.startswith(b"RIFF"):
            return raw_audio

        # Wrap raw PCM frames in standard WAV container
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(raw_audio)
        wav_buffer.seek(0)
        return wav_buffer.read()

    except requests.exceptions.Timeout:
        logger.error("Gnani Timbre TTS request timed out after %s seconds", REQUEST_TIMEOUT_SECONDS)
        raise GnaniServiceException(
            "Speech synthesis timed out.",
            status_code=504,
            error_type="TTS_TIMEOUT",
        )
    except requests.exceptions.RequestException as e:
        logger.error("Network failure connecting to Gnani Timbre TTS: %s", e)
        raise GnaniServiceException(
            f"Network connection to speech synthesis service failed: {str(e)}",
            status_code=502,
            error_type="NETWORK_FAILURE",
        )


def execute_kivo_grounded_reasoning(
    query: str,
    user_role: Optional[str] = None,
    language_code: str = "en-IN",
) -> Tuple[str, List[str], str]:
    """
    Executes Kivo's core reasoning engine:
    1. Security Guardrails: Blocks disclosure of secrets or admin bypass.
    2. Knowledge Retrieval: Grounds query in kivora_knowledge_base.json.
    3. Gemini LLM Reasoning: Preserved as Kivo's primary reasoning engine.
    4. Deterministic Fallback: Grounded knowledge base engine.

    Returns: (reply_text, suggestions, generation_engine)
    """
    query_lower = query.lower()

    # 1. Security & Authorization Guardrails
    sensitive_patterns = [
        r"\b(password|hash|secret|token|api_key|database|sql\s+inject|admin\s+override)\b",
        r"\b(approve.*without.*audit|bypass.*verification|drop\s+table|delete\s+from)\b",
    ]
    if any(re.search(pat, query_lower) for pat in sensitive_patterns):
        return (
            "I cannot disclose internal credentials, access keys, database secrets, or bypass platform verification protocols. "
            "All creator verification claims and administrative decisions require authenticated human review through the Admin Portal.",
            [
                "How does an administrator review and approve a verification claim?",
                "How do I upload evidence for creator verification?",
                "What can the Brand Portal do?",
            ],
            "SECURITY_GUARDRAIL",
        )

    # 2. Knowledge Base Retrieval
    retrieved_articles = retrieve_relevant_knowledge(
        query=query,
        user_role=user_role,
        top_k=2,
    )
    top_article = retrieved_articles[0] if retrieved_articles else None
    top_article_id = top_article.get("id") if top_article else None
    tailored_suggestions = get_tailored_suggestions(top_article_id)

    # 3. Gemini Grounded Inference
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

            knowledge_context = get_context_for_prompt(retrieved_articles)

            lang_instruction = ""
            if language_code == "te-IN":
                lang_instruction = "Respond naturally in Telugu (తెలుగు script).\n"
            elif language_code == "hi-IN":
                lang_instruction = "Respond naturally in Hindi (हिंदी script).\n"

            system_instruction = (
                "You are Kivo, the friendly, witty, and deeply knowledgeable AI concierge for Kivora.\n"
                "Kivora is an AI-native creative marketplace uniting premier brands with verified generative artists, VFX directors, and 3D animators.\n\n"
                "CRITICAL INSTRUCTIONS:\n"
                "1. Base your answer strictly on the provided KIVORA KNOWLEDGE BASE below.\n"
                "2. Provide clear, step-by-step instructions using the EXACT UI labels, buttons, and navigation tabs from the knowledge base.\n"
                "3. If a user asks about a feature that is not in the knowledge base, honestly state that it is not currently supported rather than fabricating functionality.\n"
                "4. Keep the tone helpful, encouraging, and professional. Use formatting (bullet points, bold text) for readability.\n"
                "5. Never disclose passwords, API tokens, database schemas, or bypass admin authorizations.\n"
                f"{lang_instruction}"
                f"KIVORA KNOWLEDGE BASE CONTEXT:\n{knowledge_context}\n"
            )

            prompt = f"{system_instruction}\nUser Question: {query}\n\nKivo's Grounded Answer:"
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )

            if response and response.text:
                return (
                    response.text.strip(),
                    tailored_suggestions,
                    f"GEMINI ({model_name})",
                )
        except Exception as e:
            logger.warning("Gemini chat execution encountered error, falling back to grounded knowledge engine: %s", e)

    # 4. Deterministic Grounded Knowledge Engine Fallback
    if top_article:
        reply_text = format_grounded_answer(top_article, query)
        engine_label = "GROUNDED_KNOWLEDGE_BASE"
    else:
        reply_text = (
            "I'm here to help you navigate Kivora! You can ask me how to create campaign briefs, "
            "how to find creators that match your budget, why chat is locked after submitting a pitch, "
            "how the creator matching score works, or how to submit evidence for verification."
        )
        engine_label = "GROUNDED_AI_ENGINE"

    return reply_text, tailored_suggestions, engine_label


def process_kivo_voice_turn(
    message: Optional[str] = None,
    audio_bytes: Optional[bytes] = None,
    audio_filename: str = "voice.wav",
    audio_mime: str = "audio/wav",
    language_code: str = "en-IN",
    user_role: Optional[str] = "GUEST",
    voice: Optional[str] = None,
) -> Dict[str, Any]:
    """
    End-to-end voice co-pilot pipeline:
    1. Prisma STT: Transcribes audio into text (if audio provided).
    2. Gemini & Kivora Knowledge: Grounds query, reasons, and synthesizes response.
    3. Timbre TTS: Synthesizes spoken response audio in WAV format.
    4. Base64 Audio Packaging: Prepares audio for instant browser playback.

    Resilience Guarantees:
    - If Timbre TTS fails or is unconfigured, text response is STILL returned intact.
    - If Prisma STT fails, returns clear error response so user can switch to typing.
    """
    user_query = (message or "").strip()
    detected_lang = language_code

    # Step 1: Transcribe incoming audio with Prisma v3.0 if provided
    if audio_bytes:
        stt_result = transcribe_speech_prisma(
            audio_bytes=audio_bytes,
            filename=audio_filename,
            mime_type=audio_mime,
            language_code=language_code,
        )
        user_query = stt_result["transcript"]
        detected_lang = stt_result.get("detected_language_code") or language_code

    if not user_query:
        raise GnaniServiceException("No query text or audio recording provided.", status_code=400)

    # Step 2: Gemini Reasoning & Knowledge Base Retrieval
    reply_text, suggestions, engine = execute_kivo_grounded_reasoning(
        query=user_query,
        user_role=user_role,
        language_code=detected_lang,
    )

    # Step 3: Timbre TTS Speech Synthesis
    audio_b64 = None
    tts_error = None
    if is_gnani_configured():
        try:
            audio_wav = synthesize_speech_timbre(
                text=reply_text,
                language_code=detected_lang,
                voice=voice,
            )
            audio_b64 = base64.b64encode(audio_wav).decode("utf-8")
        except Exception as e:
            logger.warning("Timbre TTS synthesis failed, returning text-only response: %s", e)
            tts_error = str(e)

    return {
        "transcript": user_query,
        "reply": reply_text,
        "audio_base64": audio_b64,
        "audio_format": "audio/wav" if audio_b64 else None,
        "suggestions": suggestions,
        "generation_engine": engine,
        "language_code": detected_lang,
        "tts_error": tts_error,
    }

