"""Tests for pc_control module — PCTRL-01..06.

Wave 0: All tests are xfail (module stubs raise NotImplementedError).
Wave 1: test_launch_app_*, test_close_app_*, test_open_folder_*, test_audit_log_* graduate to passing.
Wave 2: test_read_file_*, test_confirm_destructive_* graduate to passing.
"""
import json
import pytest
from pathlib import Path


# ---------------------------------------------------------------------------
# PCTRL-01: Launch app
# ---------------------------------------------------------------------------

def test_launch_app_via_which(mock_subprocess_popen, monkeypatch):
    """launch_app('chrome') finds executable via shutil.which and calls subprocess.Popen."""
    import shutil
    import jarvis_desktop.pc_control as pc_control

    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/chrome")
    pc_control.launch_app("chrome")
    mock_subprocess_popen.assert_called_once()


def test_launch_app_alias_fallback(mock_subprocess_popen, monkeypatch):
    """launch_app falls back to OS alias dict when shutil.which() returns None.

    Wave 1 expected behavior: 'chrome' resolves via alias dict and calls
    subprocess.Popen (does NOT raise).
    """
    import shutil
    import jarvis_desktop.pc_control as pc_control

    monkeypatch.setattr(shutil, "which", lambda name: None)
    # 'chrome' is in the alias map for all platforms
    # On macOS it calls Popen(["open", "-a", "Google Chrome"])
    # On win32/linux it calls Popen([path])
    # Either way, Popen must be called once
    pc_control.launch_app("chrome")
    mock_subprocess_popen.assert_called_once()


def test_launch_app_not_found(mock_subprocess_popen, monkeypatch):
    """launch_app raises ValueError when app not in PATH or alias dict."""
    import shutil
    import jarvis_desktop.pc_control as pc_control

    monkeypatch.setattr(shutil, "which", lambda name: None)
    with pytest.raises(ValueError, match="App not found"):
        pc_control.launch_app("__nonexistent_app_12345__")


# ---------------------------------------------------------------------------
# PCTRL-02: Close app
# ---------------------------------------------------------------------------

def test_close_app_psutil(mock_psutil, monkeypatch):
    """close_app('notepad') calls psutil.process_iter() and proc.kill()."""
    import jarvis_desktop.pc_control as pc_control

    # mock_psutil.process_iter returns one mock process named "notepad"
    mock_proc = mock_psutil["mock_proc"]
    mock_psutil["module"].process_iter.return_value = [mock_proc]

    pc_control.close_app("notepad")
    mock_proc.kill.assert_called_once()


def test_close_app_not_found(mock_psutil, monkeypatch):
    """close_app raises ValueError when process is not running."""
    import jarvis_desktop.pc_control as pc_control

    mock_psutil["module"].process_iter.return_value = []

    with pytest.raises(ValueError, match="Process not found"):
        pc_control.close_app("unknown_app_xyz")


# ---------------------------------------------------------------------------
# PCTRL-03: Open folder
# ---------------------------------------------------------------------------

def test_open_folder_native(mock_subprocess_popen, monkeypatch):
    """open_folder('~/Downloads') calls subprocess.Popen with OS-specific launcher."""
    import jarvis_desktop.pc_control as pc_control

    pc_control.open_folder("~/Downloads")
    mock_subprocess_popen.assert_called_once()


# ---------------------------------------------------------------------------
# PCTRL-04: Read file
# ---------------------------------------------------------------------------

@pytest.mark.xfail(reason="Wave 2: read_file not yet implemented", strict=True)
def test_read_file_truncation(tmp_audit_log, tmp_path, monkeypatch):
    """read_file truncates files > 50 KB and includes warning with total size."""
    from jarvis_desktop.config import JarvisConfig
    import jarvis_desktop.pc_control as pc_control

    # Create a 60 KB test file inside whitelist (tmp_path acts as home)
    fake_home = tmp_path / "home"
    fake_home.mkdir(exist_ok=True)
    monkeypatch.setenv("HOME", str(fake_home))
    monkeypatch.setenv("USERPROFILE", str(fake_home))

    downloads = fake_home / "Downloads"
    downloads.mkdir()
    large_file = downloads / "large.txt"
    large_file.write_bytes(b"A" * 61440)  # 60 KB

    config = JarvisConfig()
    result = pc_control.read_file(str(large_file), config)
    assert "cortado" in result.lower() or "truncat" in result.lower()
    assert len(result.encode()) <= 55000  # at most 50 KB + warning overhead


@pytest.mark.xfail(reason="Wave 2: whitelist validation not yet implemented", strict=True)
def test_read_file_outside_whitelist(tmp_path, monkeypatch):
    """read_file raises error (does not read) for paths outside whitelist."""
    from jarvis_desktop.config import JarvisConfig
    import jarvis_desktop.pc_control as pc_control

    # /etc/passwd style path — never whitelisted
    config = JarvisConfig()
    with pytest.raises((ValueError, PermissionError)):
        pc_control.read_file("/etc/passwd", config)


# ---------------------------------------------------------------------------
# PCTRL-05: Confirm destructive
# ---------------------------------------------------------------------------

@pytest.mark.xfail(reason="Wave 2: confirm_destructive not yet implemented", strict=True)
def test_confirm_destructive_voice_input(monkeypatch):
    """confirm_destructive returns True when 'sim' arrives in voice queue within timeout."""
    from queue import Queue
    import jarvis_desktop.pc_control as pc_control

    q: Queue = Queue()
    q.put("sim")
    monkeypatch.setattr("jarvis_desktop.pc_control._get_voice_queue", lambda: q)

    # Mock speak so no audio
    monkeypatch.setattr("jarvis_desktop.pc_control._speak_prompt", lambda msg: None, raising=False)

    result = pc_control.confirm_destructive("Confirmar deletar arquivo.txt?", timeout=5)
    assert result is True


@pytest.mark.xfail(reason="Wave 2: confirm_destructive not yet implemented", strict=True)
def test_confirm_destructive_timeout():
    """confirm_destructive returns False after timeout with no response."""
    import jarvis_desktop.pc_control as pc_control

    result = pc_control.confirm_destructive("Confirmar?", timeout=0)
    assert result is False


# ---------------------------------------------------------------------------
# PCTRL-06: Audit log
# ---------------------------------------------------------------------------

def test_audit_log_format(tmp_audit_log, mock_subprocess_popen, monkeypatch):
    """execute_pc_action writes valid JSON Lines entry with all required fields."""
    import shutil
    from jarvis_desktop.config import JarvisConfig
    import jarvis_desktop.pc_control as pc_control

    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/chrome")

    config = JarvisConfig()
    pc_control.execute_pc_action("open_app", {"app_name": "chrome"}, config)

    audit_path = Path.home() / ".jarvis" / "audit.json"
    assert audit_path.exists()
    line = audit_path.read_text().strip().splitlines()[0]
    entry = json.loads(line)
    assert "timestamp" in entry
    assert "action" in entry
    assert "params" in entry
    assert "result" in entry
    assert entry["action"] == "open_app"
    assert entry["result"] in ("ok", "error", "aborted")
