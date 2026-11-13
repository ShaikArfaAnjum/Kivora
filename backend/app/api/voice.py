"""
Kivora Voice API Router
Exposes Gnani AI voice endpoints:
- Speech-to-Text transcription via Prisma (prisma-v3.0)
- Text-to-Speech audio synthesis via Timbre (timbre-v3.0)
- Unified Kivo voice co-pilot conversational endpoint
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Response
from fastapi.responses import JSONResponse

from backend.app.schemas.schemas import (
    VoiceConfigResponse,
    VoiceLanguageItem,
    SpeechTranscriptionResponse,
    TextToSpeechRequest,
    KivoVoiceChatResponse,
)
from backend.app.core.config import is_gnani_configured, GNANI_DEFAULT_VOICE
from backend.app.services.gnani_service import (
    transcribe_speech_prisma,
    synthesize_speech_timbre,
    process_kivo_voice_turn,
    GnaniServiceException,
    SUPPORTED_LANGUAGES,
    AVAILABLE_VOICES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["Voice Services"])


@router.get("/config", response_model=VoiceConfigResponse)
def get_voice_configuration():
    """
    Returns supported voice languages and voices for Kivo AI.
    Never exposes internal API keys or secret credentials.
    """
    lang_items = [
        VoiceLanguageItem(code=code, name=label)
        for code, label in SUPPORTED_LANGUAGES.items()
        if code != "indic-auto"
    ]
    # Add auto-detect option
    lang_items.append(VoiceLanguageItem(code="indic-auto", name="Auto-Detect (Indic)"))

    return VoiceConfigResponse(
        languages=lang_items,
        default_language="en-IN",
        default_voice=GNANI_DEFAULT_VOICE or "Shivani",
        voices=AVAILABLE_VOICES,
        is_configured=is_gnani_configured(),
    )


@router.post("/transcribe", response_model=SpeechTranscriptionResponse)
async def transcribe_audio_endpoint(
    audio_file: UploadFile = File(...),
    language_code: Optional[str] = Form("en-IN"),
):
    """
    Transcribes spoken voice audio to text using Gnani Prisma STT (prisma-v3.0).
    Supports WAV, WebM, MP3, OGG, and M4A audio streams.
    """
    try:
        audio_bytes = await audio_file.read()
        res = transcribe_speech_prisma(
            audio_bytes=audio_bytes,
            filename=audio_file.filename or "recording.wav",
            mime_type=audio_file.content_type or "audio/wav",
            language_code=language_code or "en-IN",
        )
        return SpeechTranscriptionResponse(
            success=True,
            transcript=res["transcript"],
            detected_language_code=res.get("detected_language_code", language_code or "en-IN"),
            model=res.get("model", "prisma-v3.0"),
            latency=res.get("latency"),
        )
    except GnaniServiceException as ge:
        raise HTTPException(status_code=ge.status_code, detail=ge.message)
    except Exception as e:
        logger.error("Unhandled error during speech transcription: %s", e)
        raise HTTPException(status_code=500, detail=f"Speech transcription failed: {str(e)}")


@router.post("/synthesize")
def synthesize_speech_endpoint(payload: TextToSpeechRequest):
    """
    Synthesizes text into spoken audio using Gnani Timbre TTS (timbre-v3.0).
    Returns binary RIFF/WAVE audio bytes.
    """
    try:
        audio_wav = synthesize_speech_timbre(
            text=payload.text,
            language_code=payload.language_code or "en-IN",
            voice=payload.voice or GNANI_DEFAULT_VOICE,
            speed=payload.speed or 1.0,
        )
        return Response(
            content=audio_wav,
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'inline; filename="kivo_speech.wav"',
                "Cache-Control": "public, max-age=3600",
            },
        )
    except GnaniServiceException as ge:
        raise HTTPException(status_code=ge.status_code, detail=ge.message)
    except Exception as e:
        logger.error("Unhandled error during speech synthesis: %s", e)
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.post("/kivo-voice-chat", response_model=KivoVoiceChatResponse)
async def kivo_voice_chat_endpoint(
    audio_file: Optional[UploadFile] = File(None),
    message: Optional[str] = Form(None),
    language_code: Optional[str] = Form("en-IN"),
    user_role: Optional[str] = Form("GUEST"),
    voice: Optional[str] = Form(None),
):
    """
    Unified multimodal voice co-pilot endpoint:
    - Audio Speech Input -> Prisma STT (prisma-v3.0) -> Recognized Query
    - Kivora Knowledge & Gemini 3.8 Flash Reasoning -> Grounded Response
    - Timbre TTS (timbre-v3.0) -> Spoken Audio (Base64) + Formatted Text

    Resilience Guarantees:
    - Text response is guaranteed even if speech synthesis encounters an issue.
    - User can seamlessly toggle between typing and speaking.
    """
    try:
        audio_bytes = None
        audio_filename = "voice.wav"
        audio_mime = "audio/wav"

        if audio_file is not None:
            audio_bytes = await audio_file.read()
            audio_filename = audio_file.filename or "voice.wav"
            audio_mime = audio_file.content_type or "audio/wav"

        if not audio_bytes and not (message and message.strip()):
            raise HTTPException(
                status_code=400,
                detail="Either voice recording (audio_file) or text message must be provided.",
            )

        result = process_kivo_voice_turn(
            message=message,
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            audio_mime=audio_mime,
            language_code=language_code or "en-IN",
            user_role=user_role or "GUEST",
            voice=voice,
        )

        return KivoVoiceChatResponse(
            transcript=result["transcript"],
            reply=result["reply"],
            audio_base64=result.get("audio_base64"),
            audio_format=result.get("audio_format"),
            suggestions=result.get("suggestions", []),
            generation_engine=result.get("generation_engine", "GEMINI"),
            language_code=result.get("language_code", language_code or "en-IN"),
            tts_error=result.get("tts_error"),
        )
    except GnaniServiceException as ge:
        raise HTTPException(status_code=ge.status_code, detail=ge.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unhandled error in Kivo voice chat pipeline: %s", e)
        raise HTTPException(status_code=500, detail=f"Voice interaction failed: {str(e)}")

