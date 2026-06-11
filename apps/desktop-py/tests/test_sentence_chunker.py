"""Tests for SentenceChunker — STTS-01, STTS-02, P-3 corpus gate (Phase 95)."""
import pytest

pytestmark = pytest.mark.xfail(
    reason="sentence_chunker.py not yet implemented (Wave 0 stub)",
    strict=False,
)


def test_feed_emits_sentence():
    """SentenceChunker.feed() emits a sentence when boundary is detected. STTS-01."""
    from jarvis_desktop.sentence_chunker import SentenceChunker
    chunker = SentenceChunker()
    results = []
    for token in ["Olá, ", "mundo. ", "Como vai?"]:
        results.extend(chunker.feed(token))
    assert len(results) >= 1
    assert results[0].strip() == "Olá, mundo."


def test_flush_remaining_emits_leftover():
    """flush_remaining() emits any partial sentence at stream end. STTS-01."""
    from jarvis_desktop.sentence_chunker import SentenceChunker
    chunker = SentenceChunker()
    chunker.feed("Texto sem ponto final")
    remaining = chunker.flush_remaining()
    assert len(remaining) == 1
    assert "Texto sem ponto final" in remaining[0]


def test_hybrid_first_chunk_at_threshold():
    """First chunk emitted at ~70 chars even without sentence boundary. D-05."""
    from jarvis_desktop.sentence_chunker import SentenceChunker
    chunker = SentenceChunker()
    # Feed one long token without a sentence-ending period
    long_token = "A " * 40  # 80 chars, no sentence boundary
    results = chunker.feed(long_token)
    assert len(results) >= 1, "Should flush first chunk at char threshold"
    assert len(results[0]) >= 15, "First chunk should not be tiny"


def test_min_chunk_guard_merges_tiny_fragment():
    """Sub-threshold fragments (<18 chars) are merged with next sentence. D-06."""
    from jarvis_desktop.sentence_chunker import SentenceChunker
    chunker = SentenceChunker()
    # "Sim." is 4 chars — too tiny to emit alone after first_emitted=True
    results = []
    results.extend(chunker.feed("Esta é a primeira frase longa para acionar o primeiro emit. "))
    results.extend(chunker.feed("Sim. "))
    results.extend(chunker.feed("Isso é uma segunda frase completa."))
    results.extend(chunker.flush_remaining())
    # "Sim." should be merged into next sentence, not emitted standalone
    for chunk in results:
        assert chunk.strip() != "Sim.", f"Tiny fragment emitted standalone: {chunk!r}"


def test_pt_br_abbreviations():
    """Dr./Sr./Sra./etc./Exmo. do not produce 1-word chunks. STTS-02."""
    from jarvis_desktop.sentence_chunker import SentenceChunker
    test_cases = [
        ("O Dr. Silva chegou às 10h.", ["O Dr. Silva chegou às 10h."]),
        ("O Sr. Costa ligou.", ["O Sr. Costa ligou."]),
        ("A Sra. Lima respondeu.", ["A Sra. Lima respondeu."]),
        ("Veja etc. aqui.", ["Veja etc. aqui."]),
        ("O Exmo. Presidente assinou.", ["O Exmo. Presidente assinou."]),
    ]
    for text, expected_sentences in test_cases:
        chunker = SentenceChunker()
        results = []
        for token in text:
            results.extend(chunker.feed(token))
        results.extend(chunker.flush_remaining())
        assert len(results) == len(expected_sentences), (
            f"Text {text!r}: expected {len(expected_sentences)} sentence(s), got {len(results)}: {results}"
        )
        # No 1-word results
        for chunk in results:
            assert len(chunk.split()) > 1, f"1-word chunk produced: {chunk!r} from {text!r}"


def test_pt_br_corpus_50():
    """P-3 gate: 50-sentence PT-BR corpus — no false splits on abbreviations or edge cases. STTS-02."""
    from jarvis_desktop.sentence_chunker import SentenceChunker, tokenize_all

    # 50 sentences covering all edge cases from D-03 + common PT-BR patterns
    corpus = [
        # Abbreviations (D-03 required coverage)
        ("O Dr. Carlos chegou cedo.", 1),
        ("Ligue para o Sr. Mendes amanhã.", 1),
        ("A Sra. Ferreira está ausente.", 1),
        ("Traga os documentos, etc. por favor.", 1),
        ("O Exmo. Ministro assinou o decreto.", 1),
        ("Converse com a Exma. Secretária.", 1),
        # Ellipses
        ("Não sei... talvez amanhã.", 1),
        ("Bem... vou pensar nisso.", 1),
        ("Hmm... pode ser que sim.", 1),
        # Quoted dialogue
        ('Ele disse "olá" e saiu.', 1),
        ('A resposta foi "sim, claro".', 1),
        ('Ela gritou "espera!" antes de partir.', 1),
        # Numbered lists (should not split at number boundary)
        ("1. Comprar pão.", 1),
        ("2. Ir ao banco.", 1),
        ("10. Finalizar relatório.", 1),
        # Normal sentences
        ("JARVIS é um assistente inteligente.", 1),
        ("Ele lembra de tudo entre as sessões.", 1),
        ("A conversa é natural e fluida.", 1),
        # Multi-sentence input (2 sentences each)
        ("Bom dia. Como posso ajudar?", 2),
        ("Olá! Tudo bem?", 2),
        ("Entendido. Farei isso agora.", 2),
        ("Certo. Pode continuar.", 2),
        # Titles + sentences
        ("Dr. Souza é especialista em cardiologia.", 1),
        ("A Sra. Alves chefiou a reunião.", 1),
        ("Sr. Presidente, por favor.", 1),
        # Numbers in context
        ("A temperatura é de 36.5 graus.", 1),
        ("O valor total é R$ 1.500,00.", 1),
        ("A versão 3.6 foi lançada.", 1),
        # Abbreviations mid-sentence
        ("Envie para o dep. de TI.", 1),
        ("Consulte o art. 5 da lei.", 1),
        # Capitalized proper nouns after abbreviation
        ("Conforme o Sr. Paulo informou.", 1),
        ("Segundo a Sra. Ana, sim.", 1),
        # End punctuation variety
        ("Você consegue fazer isso?", 1),
        ("Incrível!", 1),
        ("Perfeito.", 1),
        # Longer natural sentences
        ("O JARVIS foi desenvolvido para ser um assistente pessoal inteligente.", 1),
        ("Ele pode abrir aplicativos, mover arquivos e analisar a tela.", 1),
        ("A memória persiste entre todas as sessões de conversa.", 1),
        ("Conecta com modelos locais via LM Studio ou provedores cloud.", 1),
        # Abbreviations at start of sentence
        ("Dr. Silva ligou ontem.", 1),
        ("Sr. Costa chegou cedo.", 1),
        # Complex combinations
        ("O Dr. Silva e a Sra. Costa chegaram.", 1),
        ("Confira os itens etc. na lista.", 1),
        ("O Exmo. Sr. Ministro falou.", 1),
        # Edge: sentence ending with abbreviation followed by new sentence
        ("Consulte o Sr. Paulo. Ele pode ajudar.", 2),
        ("Fale com a Dra. Ana. Ela é especialista.", 2),
        # Common conversational
        ("Sim, com certeza.", 1),
        ("Não, obrigado.", 1),
        ("Tudo bem, pode continuar.", 1),
        ("Claro, farei isso.", 1),
    ]

    errors = []
    for text, expected_count in corpus:
        sentences = tokenize_all(text)
        if len(sentences) != expected_count:
            errors.append(
                f"FAIL: {text!r} → expected {expected_count} sentence(s), got {len(sentences)}: {sentences}"
            )

    if errors:
        pytest.fail(
            f"P-3 corpus gate FAILED ({len(errors)}/{len(corpus)} failures):\n"
            + "\n".join(errors)
        )
