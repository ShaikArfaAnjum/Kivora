"""
Tests for Gnani AI Voice Capabilities (Prisma STT & Timbre TTS)
and Kivo AI Voice Integration Endpoints.
"""

import io
import wave
import json
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.gnani_service import (
    clean_text_for_speech,
    validate_audio_file,
    transcribe_speech_prisma,
    synthesize_speech_timbre,
    process_kivo_voice_turn,
    GnaniServiceException,
    SUPPORTED_LANGUAGES,
)
from backend.app.core.config import is_gnani_configured


def _generate_dummy_wav(duration_seconds: float = 0.5, sample_rate: int = 24000) -> bytes:
    """Generates a small valid WAV byte array with silence."""
    num_samples = int(duration_seconds * sample_rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    buffer.seek(0)
    return buffer.read()


def test_clean_text_for_speech():
    """Verify markdown tags, bold markers, and emojis are stripped cleanly."""
    raw = "**Welcome to Kivora!** Here is a [link](https://kivora.ai) to our *guidelines*.\n# Heading 1\n- Item 1\n`code snippet` ✦ ✨ 👋"
    cleaned = clean_text_for_speech(raw)
    assert "**" not in cleaned
    assert "Heading 1" in cleaned
    assert "link" in cleaned
    assert "https://" not in cleaned
    assert "code snippet" in cleaned
    assert "✦" not in cleaned


def test_validate_audio_file_constraints():
    """Verify empty recordings and unsupported formats are rejected with informative errors."""
    # Empty audio
    with pytest.raises(GnaniServiceException) as exc_empty:
        validate_audio_file(b"")
    assert exc_empty.value.error_type == "EMPTY_AUDIO"

    # Too small (< 100 bytes)
    with pytest.raises(GnaniServiceException) as exc_small:
        validate_audio_file(b"12345")
    assert exc_small.value.error_type == "EMPTY_AUDIO"

    # Unsupported extension
    dummy_wav = _generate_dummy_wav()
    with pytest.raises(GnaniServiceException) as exc_fmt:
        validate_audio_file(dummy_wav, filename="sample.exe")
    assert exc_fmt.value.error_type == "UNSUPPORTED_FORMAT"

    # Valid wav passes
    validate_audio_file(dummy_wav, filename="sample.wav")


def test_voice_config_endpoint(client):
    """Verify /api/voice/config returns supported languages without leaking keys."""
    res = client.get("/api/voice/config")
    assert res.status_code == 200
    data = res.json()
    assert "languages" in data
    lang_codes = [l["code"] for l in data["languages"]]
    assert "en-IN" in lang_codes
    assert "te-IN" in lang_codes
    assert "hi-IN" in lang_codes
    assert "default_language" in data
    assert "default_voice" in data
    assert "voices" in data
    assert "Shivani" in data["voices"]
    # Ensure raw API key is never returned
    assert "vach_" not in json.dumps(data)


@patch("requests.post")
def test_transcribe_speech_prisma_mock(mock_post):
    """Verify Prisma STT sends correct payload, header, and parses response."""
    mock_post.return_value = MagicMock(
        status_code=200,
        json=lambda: {
            "success": True,
            "transcript": "How do I create a brief on Kivora?",
            "detected_language_code": "en-IN",
            "end_to_end_latency": 0.12,
        },
    )

    dummy_wav = _generate_dummy_wav()
    with patch("backend.app.services.gnani_service.get_active_gnani_key", return_value="vach_test_key"):
        result = transcribe_speech_prisma(
            audio_bytes=dummy_wav,
            filename="input.wav",
            mime_type="audio/wav",
            language_code="en-IN",
        )

    assert result["success"] is True
    assert result["transcript"] == "How do I create a brief on Kivora?"
    assert result["detected_language_code"] == "en-IN"

    # Verify requests.post was called with header X-API-Key-ID
    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args[1]
    assert call_kwargs["headers"]["X-API-Key-ID"] == "vach_test_key"
    assert call_kwargs["data"]["model"] == "prisma-v3.0"
    assert call_kwargs["data"]["language_code"] == "en-IN"


@patch("requests.post")
def test_synthesize_speech_timbre_mock(mock_post):
    """Verify Timbre TTS sends payload and returns valid RIFF WAV audio bytes."""
    dummy_wav = _generate_dummy_wav()
    mock_post.return_value = MagicMock(
        status_code=200,
        content=dummy_wav,
    )

    with patch("backend.app.services.gnani_service.get_active_gnani_key", return_value="vach_test_key"):
        audio_out = synthesize_speech_timbre(
            text="Welcome to Kivora. Let's find the best creators.",
            language_code="en-IN",
            voice="Shivani",
        )

    assert audio_out.startswith(b"RIFF")
    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args[1]
    assert call_kwargs["headers"]["X-API-Key-ID"] == "vach_test_key"
    assert call_kwargs["json"]["model"] == "timbre-v3.0"
    assert call_kwargs["json"]["voice"] == "Shivani"
    assert call_kwargs["json"]["language"] == "en-IN"


@patch("backend.app.services.gnani_service.transcribe_speech_prisma")
@patch("backend.app.services.gnani_service.synthesize_speech_timbre")
@patch("backend.app.services.gnani_service.execute_kivo_grounded_reasoning")
def test_kivo_voice_chat_endpoint_full_flow(mock_reasoning, mock_tts, mock_stt, client):
    """Verify end-to-end voice co-pilot chat endpoint returns transcript, reply, and audio."""
    mock_stt.return_value = {
        "success": True,
        "transcript": "How does creator verification work?",
        "detected_language_code": "en-IN",
    }
    dummy_wav = _generate_dummy_wav()
    mock_tts.return_value = dummy_wav
    mock_reasoning.return_value = (
        "Creator verification requires uploading evidence such as portfolio links.",
        ["How do I submit verification?"],
        "GEMINI (gemini-3.8-flash)",
    )

    files = {"audio_file": ("user_voice.wav", dummy_wav, "audio/wav")}
    data = {
        "language_code": "en-IN",
        "user_role": "CREATOR",
    }

    res = client.post("/api/voice/kivo-voice-chat", files=files, data=data)
    assert res.status_code == 200
    res_json = res.json()
    assert res_json["transcript"] == "How does creator verification work?"
    assert "reply" in res_json
    assert "verification" in res_json["reply"].lower()
    assert res_json["audio_base64"] is not None
    assert res_json["audio_format"] == "audio/wav"


@patch("backend.app.services.gnani_service.transcribe_speech_prisma")
@patch("backend.app.services.gnani_service.synthesize_speech_timbre")
@patch("backend.app.services.gnani_service.execute_kivo_grounded_reasoning")
def test_kivo_voice_chat_tts_failure_resilience(mock_reasoning, mock_tts, mock_stt, client):
    """Critical test: if Timbre TTS fails, Kivo MUST still return the text response intact."""
    mock_stt.return_value = {
        "success": True,
        "transcript": "What is Kivora?",
        "detected_language_code": "en-IN",
    }
    mock_reasoning.return_value = (
        "Kivora is an AI creative marketplace connecting verified creators and top brands.",
        ["Find creators", "Explore briefs"],
        "GEMINI (gemini-3.8-flash)",
    )
    # Simulate TTS network failure / timeout
    mock_tts.side_effect = Exception("Timbre TTS service timeout")

    dummy_wav = _generate_dummy_wav()
    files = {"audio_file": ("user_voice.wav", dummy_wav, "audio/wav")}
    data = {"language_code": "en-IN"}

    res = client.post("/api/voice/kivo-voice-chat", files=files, data=data)
    assert res.status_code == 200
    res_json = res.json()
    assert res_json["transcript"] == "What is Kivora?"
    assert res_json["reply"] is not None
    assert "Kivora is an AI creative marketplace" in res_json["reply"]
    # audio_base64 is None due to failure, but response succeeded
    assert res_json["audio_base64"] is None
    assert "tts_error" in res_json
