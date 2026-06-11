"""JARVIS PT-BR sentence boundary chunker for streaming TTS.

Phase 95: SentenceChunker accumulates LLM tokens and emits complete sentences
for the TTS worker thread. Uses NLTK punkt_tab (vendored) as primary tokenizer
with a pure-Python regex fallback (D-02 from 95-CONTEXT.md).

NEVER calls nltk.download() — vendor path only (D-01, privacy-first offline constraint).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import nltk

# ---------------------------------------------------------------------------
# Vendor path setup — MUST run at module load time (not inside a function).
# This ensures nltk.data.path is set before ANY nltk.data.load() call,
# even if another module imported nltk earlier. (Pitfall 4, RESEARCH.md)
# ---------------------------------------------------------------------------
_VENDOR_NLTK = Path(__file__).resolve().parent.parent.parent / "assets" / "nltk_data"
if str(_VENDOR_NLTK) not in nltk.data.path:
    nltk.data.path.insert(0, str(_VENDOR_NLTK))

# Abbreviations injected into punkt_tab after loading (Pitfall 1, RESEARCH.md).
# These are missing from the PT-BR corpus training data.
_ABBREV_EXTRAS: frozenset[str] = frozenset({
    "exmo", "exma",  # Excelentíssimo/a — not in punkt_tab PT-BR corpus
    "etc",           # et cetera — punkt_tab PT-BR corpus does not include it
    "dep",           # deputado/departamento
    "art",           # artigo
    "dra",           # doutora (Dr is present; Dra is not)
})

# ---------------------------------------------------------------------------
# Post-processing abbreviation set — used by _postprocess_sentences() to merge
# splits where the first sentence ends with an abbreviation. This handles cases
# where punkt's orthographic heuristic overrides the abbreviation list when the
# following word starts with an uppercase letter (e.g., "Exma. Secretária.").
# ---------------------------------------------------------------------------
_ABBREV_SENTENCE_END_SET: frozenset[str] = frozenset({
    "dr", "sr", "sra", "dra", "exmo", "exma", "etc", "av", "ltda", "dep",
    "art", "prof", "tel", "fig", "vol", "cap", "ed",
})

# Pattern to detect numbered list prefixes like "1.", "2.", "10." as sentence starts.
_NUM_POINT_RE = re.compile(r"^\d+$")

# ---------------------------------------------------------------------------
# Regex fallback (D-02) — used when punkt_tab load fails
# Covers D-03 required abbreviations: Dr., Sr., Sra., etc., Exmo., Exma.,
# plus common PT-BR abbreviations that must not trigger splits.
# ---------------------------------------------------------------------------

# Set of known abbreviations (lowercase, without trailing dot) that must NOT
# be treated as sentence ends in the regex fallback.
_ABBREV_SET: frozenset[str] = frozenset({
    "dr", "sr", "sra", "dra", "exmo", "exma", "etc", "av", "ltda", "dep",
    "art", "prof", "tel", "pág", "fig", "vol", "cap", "ed", "v.g", "s.a",
})

# Candidate sentence boundary: punctuation (.!?) + optional quote + whitespace
# followed by an uppercase letter. False positives filtered via _ABBREV_SET.
_BOUNDARY_CANDIDATE_RE = re.compile(
    r"([.!?][\"']?)\s+(?=[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ])",
    re.UNICODE,
)


# Singleton tokenizer (lazy-loaded)
_tokenizer: Optional[object] = None


def _load_tokenizer() -> Optional[object]:
    """Load punkt_tab tokenizer from vendor path. Returns None if unavailable (fallback)."""
    global _tokenizer
    if _tokenizer is not None:
        return _tokenizer
    try:
        tok = nltk.data.load("tokenizers/punkt_tab/portuguese.pickle")
        # Inject abbreviations not in the PT-BR corpus (Pitfall 1)
        tok._params.abbrev_types.update(_ABBREV_EXTRAS)
        _tokenizer = tok
    except Exception:
        _tokenizer = None  # Regex fallback (D-02) will be used
    return _tokenizer


def _ends_with_abbrev(sentence: str) -> bool:
    """Return True if the sentence ends with a known PT-BR abbreviation + dot."""
    stripped = sentence.rstrip()
    if not stripped.endswith("."):
        return False
    # Get the last word before the trailing dot
    words = stripped[:-1].split()
    if not words:
        return False
    last_word = words[-1].rstrip(".")
    # Numbered list items like "1.", "2.", "10." should not be treated as sentence ends
    if _NUM_POINT_RE.match(last_word):
        return True
    return last_word.lower() in _ABBREV_SENTENCE_END_SET


def _postprocess_sentences(sentences: list[str]) -> list[str]:
    """Merge falsely-split sentences caused by punkt's orthographic heuristic.

    Handles two cases:
    1. Abbreviation before uppercase word: "Exma. Secretária." → one sentence.
       punkt overrides abbreviation list when the following word is capitalized.
    2. Quoted dialogue: "espera!" antes → next sentence starts lowercase.
    3. Numbered list items: "1. Comprar pão." → merge "1." into next sentence.
    """
    merged: list[str] = []
    i = 0
    while i < len(sentences):
        s = sentences[i]
        # Merge if next sentence starts with lowercase (quoted dialogue context)
        while i + 1 < len(sentences) and sentences[i + 1] and sentences[i + 1][0].islower():
            i += 1
            s = s + " " + sentences[i]
        # Merge if current sentence ends with an abbreviation
        while i + 1 < len(sentences) and _ends_with_abbrev(s):
            i += 1
            s = s + " " + sentences[i]
        merged.append(s)
        i += 1
    return merged


def _is_abbrev_boundary(text: str, boundary_start: int) -> bool:
    """Return True if the word immediately before boundary_start is an abbreviation."""
    i = boundary_start - 1
    while i >= 0 and text[i] not in (" ", "\t", "\n"):
        i -= 1
    word = text[i + 1:boundary_start].rstrip(".")
    return word.lower() in _ABBREV_SET


def _regex_split(text: str) -> list[str]:
    """Pure-Python fallback sentence splitter (D-02). Zero dependencies.

    Splits on sentence boundaries (.!?) not preceded by a known PT-BR abbreviation,
    followed by whitespace and an uppercase letter.
    """
    if not text.strip():
        return []

    sentences: list[str] = []
    last_end = 0

    for match in _BOUNDARY_CANDIDATE_RE.finditer(text):
        boundary_start = match.start(1)
        # Skip if the word before the punctuation is a known abbreviation
        if _is_abbrev_boundary(text, boundary_start):
            continue
        # The sentence ends at the end of the punctuation character
        end = boundary_start + len(match.group(1))
        sentence = text[last_end:end].strip()
        if sentence:
            sentences.append(sentence)
        last_end = match.end()

    # Add remaining text (last sentence or no-boundary case)
    remaining = text[last_end:].strip()
    if remaining:
        sentences.append(remaining)

    return sentences if sentences else [text.strip()]


def _split_text(text: str) -> list[str]:
    """Split text into sentences using punkt_tab (primary) or regex (fallback).

    Applies _postprocess_sentences() to merge false splits caused by punkt's
    orthographic context rules overriding the abbreviation list.
    """
    tok = _load_tokenizer()
    if tok is not None:
        try:
            raw = tok.tokenize(text)
            return _postprocess_sentences(raw)
        except Exception:
            pass
    return _regex_split(text)


def tokenize_all(text: str) -> list[str]:
    """Split complete text into sentences. Used for task:done routing (D-11).

    Unlike SentenceChunker (which is stateful/streaming), this is stateless
    and processes a complete text in one call.
    """
    if not text.strip():
        return []
    return _split_text(text)


class SentenceChunker:
    """Stateful buffer that emits complete sentences as LLM tokens arrive.

    Hybrid first-chunk strategy (D-05 from 95-CONTEXT.md):
      - First chunk: emitted at sentence boundary OR when buffer reaches
        FIRST_CHUNK_MAX_CHARS (~70 chars), whichever comes first.
      - Subsequent chunks: sentence boundaries only (natural prosody).

    Min-chunk guard (D-06):
      - Fragments < MIN_CHUNK_CHARS chars after the first emit are held
        in the buffer and merged with the next sentence.
      - This prevents 1-3 word audio chunks (e.g., isolated "Sim.").
      - Guard does NOT apply to the first emitted chunk (TTFA priority).
    """

    FIRST_CHUNK_MAX_CHARS: int = 70
    MIN_CHUNK_CHARS: int = 18

    def __init__(self) -> None:
        self._buf: str = ""
        self._first_emitted: bool = False

    def feed(self, token: str) -> list[str]:
        """Add token to buffer. Returns list of complete sentences (may be empty)."""
        self._buf += token
        return self._flush_ready()

    def flush_remaining(self) -> list[str]:
        """Force-emit all remaining buffer content. Called at stream end.

        Resets chunker state so the instance can be reused for the next turn.
        """
        remaining = self._buf.strip()
        self._buf = ""
        self._first_emitted = False
        return [remaining] if remaining else []

    def _flush_ready(self) -> list[str]:
        """Internal: drain all complete sentences from buffer, applying guards."""
        results: list[str] = []
        while True:
            sentence = self._detect_next(self._buf)
            if sentence is None:
                break
            # D-06: skip min-chunk merge for the very first emitted chunk
            # (first chunk has TTFA priority — never delay it)
            if self._first_emitted and len(sentence) < self.MIN_CHUNK_CHARS:
                # Merge tiny fragment back into buffer for next boundary
                self._buf = sentence + " " + self._buf
                break
            self._first_emitted = True
            results.append(sentence)
        return results

    def _detect_next(self, buf: str) -> Optional[str]:
        """Try to extract one complete sentence from buf.

        Implements D-05 hybrid first-chunk strategy:
        - If first chunk not yet emitted and buf >= FIRST_CHUNK_MAX_CHARS,
          split at last space before threshold (avoid cutting mid-word).
        - Otherwise: use punkt_tab/regex boundary detection.

        Returns the sentence string if found, None if not enough data yet.
        Also updates self._buf to the remaining content.
        """
        # D-05: hybrid first-chunk — emit at char threshold if no boundary yet
        if not self._first_emitted and len(buf) >= self.FIRST_CHUNK_MAX_CHARS:
            cut = buf.rfind(" ", 0, self.FIRST_CHUNK_MAX_CHARS)
            if cut > 0:
                chunk = buf[:cut].strip()
                self._buf = buf[cut:].lstrip()
                return chunk if chunk else None

        # Standard sentence boundary detection
        sentences = _split_text(buf)
        if len(sentences) >= 2:
            sentence = sentences[0].strip()
            # Guard: require that the remainder has enough context to confirm
            # it's a real sentence start, not just a partial word.
            # A fragment < 4 chars without spaces is likely a partial token
            # (e.g., "S" from "Silva" when streaming char-by-char).
            remainder = buf[len(sentences[0]):].lstrip()
            if len(remainder) < 4 and " " not in remainder:
                return None
            # Reconstruct remaining buffer
            self._buf = remainder
            return sentence if sentence else None

        return None
