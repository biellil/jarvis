"""ScreenAnalyzer — vision routing and OCR/cloud fallback chain.

Implements D-04 fallback chain:
  1. Native vision: if model has caps.vision, return image_b64 directly to LLM
  2. OCR fallback: if pytesseract installed, extract text via OCR
  3. Cloud fallback: if cloud API keys configured, route to cloud vision model
  4. Error: no vision path available

Per ARCH-02: This module is synchronous. Callers in async context must use
asyncio.to_thread() if calling blocking operations.

Usage:
    from jarvis.core.screen import ScreenAnalyzer

    analyzer = ScreenAnalyzer()
    strategy, data, context = analyzer.resolve(image_b64, caps, settings)

    if strategy == "image":
        # send image_b64 directly to local vision LLM
    elif strategy == "ocr":
        # send context (extracted text) to LLM
    elif strategy == "cloud":
        # route image_b64 to cloud provider named in context
    elif strategy == "error":
        # return context (error message) to user
"""

from loguru import logger


class ScreenAnalyzer:
    """Handles vision routing and OCR/cloud fallback per D-04.

    Determines the best available strategy for analyzing a screenshot,
    given the current model's capabilities and available tools.
    """

    def resolve(
        self,
        image_b64: str,
        caps,
        settings=None,
    ) -> tuple:
        """Determine best path for image analysis.

        Args:
            image_b64: Base64-encoded PNG image string.
            caps: ModelCapabilities-like object with a `vision: bool` field.
            settings: Optional Settings object. If None, reads from jarvis.config.

        Returns:
            Tuple of (strategy, image_b64_or_none, context_or_provider):
            - ("image", image_b64, None): model has native vision, send image directly
            - ("ocr", None, extracted_text): OCR succeeded, send text to LLM
            - ("cloud", image_b64, provider_name): route to cloud vision model
            - ("error", None, error_message): no vision path available
        """
        # Step 1: Native vision — model supports images directly
        if caps.vision:
            return ("image", image_b64, None)

        # Step 2: OCR fallback — try pytesseract
        try:
            import pytesseract
            from PIL import Image
            from io import BytesIO
            import base64 as b64mod

            img_bytes = b64mod.b64decode(image_b64)
            img = Image.open(BytesIO(img_bytes))
            text = pytesseract.image_to_string(img, lang="por+eng")
            if text.strip():
                return ("ocr", None, text.strip())
            # OCR returned empty — fall through to cloud
        except ImportError:
            pass  # pytesseract not installed
        except Exception as e:
            logger.warning(f"OCR failed: {e}")

        # Step 3: Cloud fallback — check for configured cloud API keys
        if settings is None:
            from jarvis.config import settings as default_settings
            settings = default_settings

        if settings.anthropic_api_key:
            return ("cloud", image_b64, "anthropic")
        if settings.openai_api_key:
            return ("cloud", image_b64, "openai")

        # Step 4: No path available
        return (
            "error",
            None,
            (
                "Nenhum modelo com visao disponivel. Configure um modelo com vision, "
                "instale pytesseract, ou adicione uma API key de cloud "
                "(ANTHROPIC_API_KEY ou OPENAI_API_KEY)."
            ),
        )
