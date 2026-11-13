"""
Live End-to-End Verification Test for Gnani AI Voice Capabilities:
- Prisma STT (prisma-v3.0)
- Timbre TTS (timbre-v3.0)
- Multilingual Voice Testing (English, Hindi, Telugu)
- Kivo Voice Co-Pilot Pipeline
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import pytest

# Load environment
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

from backend.app.core.config import is_gnani_configured
from backend.app.services.gnani_service import (
    synthesize_speech_timbre,
    transcribe_speech_prisma,
    process_kivo_voice_turn,
)


@pytest.mark.skipif(not is_gnani_configured(), reason="Live GNANI_API_KEY required")
def test_live_timbre_speech_synthesis_english():
    """Verify live speech generation using Gnani Timbre (timbre-v3.0)."""
    text = "Welcome to Kivora. Let us help you connect with verified generative artists."
    audio_wav = synthesize_speech_timbre(
        text=text,
        language_code="en-IN",
        voice="Shivani",
    )
    assert audio_wav is not None
    assert len(audio_wav) > 1000
    assert audio_wav.startswith(b"RIFF")


@pytest.mark.skipif(not is_gnani_configured(), reason="Live GNANI_API_KEY required")
def test_live_prisma_speech_transcription_english():
    """Verify live speech transcription using Gnani Prisma (prisma-v3.0)."""
    # 1. Synthesize known sentence
    phrase = "How do brands post campaign briefs?"
    audio_wav = synthesize_speech_timbre(
        text=phrase,
        language_code="en-IN",
        voice="Shivani",
    )
    assert len(audio_wav) > 1000

    # 2. Transcribe with Prisma v3.0
    stt_res = transcribe_speech_prisma(
        audio_bytes=audio_wav,
        filename="query.wav",
        mime_type="audio/wav",
        language_code="en-IN",
    )
    assert stt_res["success"] is True
    assert "brief" in stt_res["transcript"].lower() or "campaign" in stt_res["transcript"].lower()
    assert stt_res["detected_language_code"] == "en-IN"


@pytest.mark.skipif(not is_gnani_configured(), reason="Live GNANI_API_KEY required")
def test_live_multilingual_hindi():
    """Verify Hindi speech synthesis and recognition."""
    hi_phrase = "नमस्ते, किवोरा में आपका स्वागत है।"
    hi_audio = synthesize_speech_timbre(
        text=hi_phrase,
        language_code="hi-IN",
        voice="Shivani",
    )
    assert len(hi_audio) > 1000
    stt_res = transcribe_speech_prisma(
        audio_bytes=hi_audio,
        filename="hindi.wav",
        mime_type="audio/wav",
        language_code="hi-IN",
    )
    assert stt_res["success"] is True
    assert len(stt_res["transcript"]) > 0
    assert stt_res["detected_language_code"] == "hi-IN"


@pytest.mark.skipif(not is_gnani_configured(), reason="Live GNANI_API_KEY required")
def test_live_multilingual_telugu():
    """Verify Telugu speech synthesis and recognition."""
    te_phrase = "నమస్కారం, కివోరా కు స్వాగతం."
    te_audio = synthesize_speech_timbre(
        text=te_phrase,
        language_code="te-IN",
        voice="Shivani",
    )
    assert len(te_audio) > 1000
    stt_res = transcribe_speech_prisma(
        audio_bytes=te_audio,
        filename="telugu.wav",
        mime_type="audio/wav",
        language_code="te-IN",
    )
    assert stt_res["success"] is True
    assert len(stt_res["transcript"]) > 0
    assert stt_res["detected_language_code"] == "te-IN"


@pytest.mark.skipif(not is_gnani_configured(), reason="Live GNANI_API_KEY required")
def test_live_kivo_voice_pipeline_end_to_end():
    """Verify full voice pipeline: Voice In -> STT -> Gemini Reasoning -> TTS -> Audio Out."""
    # 1. Synthesize user voice question
    user_audio = synthesize_speech_timbre(
        text="How does creator verification work on Kivora?",
        language_code="en-IN",
        voice="Avinash",
    )

    # 2. Process complete turn
    result = process_kivo_voice_turn(
        audio_bytes=user_audio,
        audio_filename="voice_question.wav",
        audio_mime="audio/wav",
        language_code="en-IN",
        user_role="CREATOR",
    )

    assert result["transcript"] is not None
    assert len(result["transcript"]) > 5
    assert result["reply"] is not None
    assert len(result["reply"]) > 20
    assert result["audio_base64"] is not None
    assert result["audio_format"] == "audio/wav"
    assert len(result["suggestions"]) > 0

