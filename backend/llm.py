"""Zentraler Gemini-LLM-Helper für den Kochplaner.

Stellt eine async-kompatible Funktion bereit, die Google Gemini aufruft.
Wenn GEMINI_API_KEY nicht gesetzt ist, geben alle Funktionen None zurück.
Nutzt das aktuelle google-genai SDK (google.genai).
"""
import asyncio
import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger("kochplaner.llm")

GEMINI_MODEL = "gemini-2.0-flash"

GEMINI_MODELS = [
    {
        "id": "gemini-2.5-pro",
        "label": "Gemini 2.5 Pro",
        "limits": {"rpm": 5, "rpd": 25, "tpm": 1_000_000},
    },
    {
        "id": "gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "limits": {"rpm": 10, "rpd": 500, "tpm": 1_000_000},
    },
    {
        "id": "gemini-2.5-flash-lite",
        "label": "Gemini 2.5 Flash Lite",
        "limits": {"rpm": 30, "rpd": 1500, "tpm": 1_000_000},
    },
    {
        "id": "gemini-2.0-flash",
        "label": "Gemini 2.0 Flash",
        "limits": {"rpm": 15, "rpd": 1500, "tpm": 1_000_000},
    },
    {
        "id": "gemini-2.0-flash-lite",
        "label": "Gemini 2.0 Flash Lite",
        "limits": {"rpm": 30, "rpd": 1500, "tpm": 1_000_000},
    },
    {
        "id": "gemini-flash-latest",
        "label": "Gemini Flash Latest (Alias)",
        "limits": {"rpm": 15, "rpd": 1500, "tpm": 1_000_000},
    },
]

_MENU_IMAGE_PROMPT = """Du bist ein Experte für die Digitalisierung von Gastronomie-Daten. 
Extrahiere die Informationen aus dem angehängten Bild der Speisekarte.

Antworte ausschließlich im JSON-Format mit dieser Struktur:
{
  "restaurant_name": "String",
  "kategorien": [
    {
      "name": "z.B. Vorspeisen",
      "gerichte": [
        { "name": "String", "preis": "String", "beschreibung": "String" }
      ]
    }
  ]
}

- Wenn ein Preis nicht lesbar ist, schreibe "null".
- Wenn die Währung fehlt, nehme "EUR" an.
- Korrigiere offensichtliche Tippfehler im Text."""

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        _client = genai.Client(api_key=api_key)
        logger.info(f"Gemini-Client initialisiert (Modell: {GEMINI_MODEL})")
    except Exception as e:
        logger.warning(f"Gemini konnte nicht initialisiert werden: {e}")
        return None
    return _client


def gemini_available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


async def call_gemini_with_image(image_bytes: bytes, mime_type: str, prompt: str) -> Optional[str]:
    """Ruft Gemini mit einem Bild auf (Vision-Modus) und gibt den Antwort-Text zurück."""
    client = _get_client()
    if not client:
        return None
    try:
        from google.genai import types
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(model=GEMINI_MODEL, contents=contents),
        )
        return response.text
    except Exception as e:
        logger.error(f"Gemini Vision Fehler: {e}")
        return None


async def call_gemini(prompt: str, model: str = GEMINI_MODEL) -> Optional[str]:
    """Ruft Gemini auf und gibt den Antwort-Text zurück.
    Wirft eine Exception wenn die API antwortet aber fehlschlägt (z.B. 429).
    Gibt None zurück wenn kein Client konfiguriert ist.
    """
    client = _get_client()
    if not client:
        return None
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(model=model, contents=prompt),
    )
    return response.text


def extract_json(text: str) -> Optional[dict | list]:
    """Extrahiert JSON aus einem Gemini-Antworttext (ignoriert Markdown-Code-Blöcke)."""
    if not text:
        return None
    # Markdown-Codeblock entfernen
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("```").strip()
    # Ersten JSON-Block suchen
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None
