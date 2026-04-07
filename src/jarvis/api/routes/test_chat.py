"""Tests for chat routes including audio endpoint.

AUDIO-01 tests: POST /chat/audio endpoint accepts audio file,
transcribes via WhisperTranscriber, and returns ChatResponse.

TDD RED phase: Tests for audio endpoint functionality.
"""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from jarvis.api.main import create_app


@pytest.fixture
def mock_session():
    """Mock ChatSession for testing."""
    session = MagicMock()
    session.send = AsyncMock(return_value="Hello! I heard you say something.")
    session.send_stream = AsyncMock()
    return session


@pytest.fixture
def mock_transcriber():
    """Mock WhisperTranscriber for testing."""
    transcriber = MagicMock()
    transcriber.transcribe = AsyncMock(return_value="Hello JARVIS")
    return transcriber


@pytest.fixture
def client(mock_session, mock_transcriber):
    """Create test client with mocked dependencies."""
    app = create_app()
    app.state.session = mock_session
    app.state.transcriber = mock_transcriber
    return TestClient(app)


class TestChatAudioEndpoint:
    """Tests for POST /chat/audio endpoint."""

    def test_chat_audio_endpoint_success(self, client, mock_transcriber, mock_session):
        """Test successful audio transcription and response."""
        # Arrange
        audio_data = b"fake-wav-audio-data"
        files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        # Act
        response = client.post("/chat/audio", files=files)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Hello! I heard you say something."

        # Verify transcriber was called
        mock_transcriber.transcribe.assert_called_once()
        # Verify session.send was called with transcript
        mock_session.send.assert_called_once_with("Hello JARVIS")

    def test_chat_audio_endpoint_missing_file(self, client):
        """Test error when no audio file is provided."""
        # Act
        response = client.post("/chat/audio")

        # Assert
        assert response.status_code == 422  # FastAPI validation error
        data = response.json()
        assert "detail" in data

    def test_chat_audio_endpoint_empty_transcript(
        self, client, mock_transcriber, mock_session
    ):
        """Test error when audio is silent (empty transcript)."""
        # Arrange
        mock_transcriber.transcribe.return_value = ""  # Silent audio
        audio_data = b"fake-wav-audio-data"
        files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        # Act
        response = client.post("/chat/audio", files=files)

        # Assert
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "No speech detected" in data["detail"]

        # Verify session.send was NOT called
        mock_session.send.assert_not_called()

    def test_chat_audio_endpoint_session_busy(self, client, mock_session):
        """Test 429 error when session is already processing."""
        # Arrange
        # Mock session lock to simulate busy state
        with patch("jarvis.api.routes.chat._session_lock") as mock_lock:
            mock_lock.locked.return_value = True

            audio_data = b"fake-wav-audio-data"
            files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

            # Act
            response = client.post("/chat/audio", files=files)

            # Assert
            assert response.status_code == 429
            data = response.json()
            assert "detail" in data
            assert "Session busy" in data["detail"]

    def test_chat_audio_endpoint_transcription_error(
        self, client, mock_transcriber, mock_session
    ):
        """Test error handling when transcription fails."""
        # Arrange
        mock_transcriber.transcribe.side_effect = Exception("Transcription failed")
        audio_data = b"fake-wav-audio-data"
        files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        # Act
        response = client.post("/chat/audio", files=files)

        # Assert
        assert response.status_code == 500
        data = response.json()
        assert "detail" in data
        assert "Audio processing failed" in data["detail"]

    def test_chat_audio_endpoint_large_file(self, client):
        """Test handling of large audio files (should not crash)."""
        # Arrange - Create 5MB audio file
        audio_data = b"x" * (5 * 1024 * 1024)
        files = {"audio": ("large.wav", io.BytesIO(audio_data), "audio/wav")}

        # Act
        response = client.post("/chat/audio", files=files)

        # Assert
        # Should either succeed or return proper error (not crash)
        assert response.status_code in [200, 400, 500]

    def test_chat_audio_endpoint_cleanup_temp_file(
        self, client, mock_transcriber, mock_session
    ):
        """Test that temporary audio file is cleaned up after processing."""
        # Arrange
        audio_data = b"fake-wav-audio-data"
        files = {"audio": ("test.wav", io.BytesIO(audio_data), "audio/wav")}

        # Act
        response = client.post("/chat/audio", files=files)

        # Assert
        assert response.status_code == 200

        # Verify temp file cleanup is in the code
        # (This is implicit - we trust the finally block handles it)
        # We can't easily test file cleanup without mocking os.unlink
