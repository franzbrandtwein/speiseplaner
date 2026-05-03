"""Speisekarten-Verwaltung: CRUD, Bild-Upload, Texterkennung von Abholgerichten"""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile

from core import (
    ALLOWED_IMAGE_TYPES, APP_NAME, MAX_IMAGE_SIZE,
    db, get_current_user, get_object, put_object,
)
from models import MenuCreate, MenuUpdate, User, Recipe

logger = logging.getLogger("kochplaner.menus")
router = APIRouter(prefix="/api")


def _scope_query(user: User) -> dict:
    if user.group_id:
        return {"$or": [{"user_id": user.user_id}, {"group_id": user.group_id}]}
    return {"user_id": user.user_id}


# ============ CRUD ============

@router.get("/menus")
async def list_menus(user: User = Depends(get_current_user)):
    query = _scope_query(user)
    menus = await db.menus.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Bezugsquelle-Namen anreichern
    source_ids = list({m["source_id"] for m in menus if m.get("source_id")})
    sources = {}
    if source_ids:
        async for s in db.sources.find({"source_id": {"$in": source_ids}}, {"_id": 0}):
            sources[s["source_id"]] = s
    for m in menus:
        m["source"] = sources.get(m.get("source_id"))
    return menus


@router.post("/menus", status_code=201)
async def create_menu(data: MenuCreate, user: User = Depends(get_current_user)):
    doc = {
        "menu_id": f"menu_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "group_id": user.group_id,
        "name": data.name,
        "source_id": data.source_id,
        "notes": data.notes,
        "images": [],
        "recipe_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.menus.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/menus/{menu_id}")
async def get_menu(menu_id: str, user: User = Depends(get_current_user)):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    if menu.get("source_id"):
        menu["source"] = await db.sources.find_one({"source_id": menu["source_id"]}, {"_id": 0})
    # Verknüpfte Rezepte laden
    recipe_ids = menu.get("recipe_ids", [])
    if recipe_ids:
        menu["recipes"] = await db.recipes.find(
            {"recipe_id": {"$in": recipe_ids}}, {"_id": 0}
        ).to_list(1000)
    else:
        menu["recipes"] = []
    return menu


@router.put("/menus/{menu_id}")
async def update_menu(menu_id: str, data: MenuUpdate, user: User = Depends(get_current_user)):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.menus.update_one({"menu_id": menu_id}, {"$set": updates})
    return {**menu, **updates}


@router.delete("/menus/{menu_id}")
async def delete_menu(
    menu_id: str,
    delete_recipes: bool = False,
    user: User = Depends(get_current_user),
):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")

    if delete_recipes and menu.get("recipe_ids"):
        await db.recipes.delete_many({"recipe_id": {"$in": menu["recipe_ids"]}})

    await db.menus.delete_one({"menu_id": menu_id})
    return {"message": "Speisekarte gelöscht"}


# ============ GERICHT-VERKNÜPFUNG ============

@router.post("/menus/{menu_id}/recipes/{recipe_id}")
async def link_recipe(menu_id: str, recipe_id: str, user: User = Depends(get_current_user)):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    if recipe_id not in menu.get("recipe_ids", []):
        await db.menus.update_one({"menu_id": menu_id}, {"$push": {"recipe_ids": recipe_id}})
    return {"message": "Gericht verknüpft"}


@router.delete("/menus/{menu_id}/recipes/{recipe_id}")
async def unlink_recipe(menu_id: str, recipe_id: str, user: User = Depends(get_current_user)):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    await db.menus.update_one({"menu_id": menu_id}, {"$pull": {"recipe_ids": recipe_id}})
    return {"message": "Verknüpfung entfernt"}


# ============ BILD-UPLOAD ============

@router.post("/menus/{menu_id}/images")
async def upload_menu_image(
    menu_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)
):
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Nur JPEG, PNG, WebP und GIF erlaubt")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "Bild zu groß (max 10 MB)")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    image_id = uuid.uuid4().hex[:12]
    storage_path = f"{APP_NAME}/menus/{menu_id}/{image_id}.{ext}"

    try:
        put_object(storage_path, data, file.content_type)
    except Exception as e:
        logger.exception(f"Menu image upload error: {e}")
        raise HTTPException(500, f"Fehler beim Hochladen: {str(e)[:200]}")

    image_url = f"/api/images/{storage_path}"
    images = menu.get("images", []) + [image_url]
    await db.menus.update_one({"menu_id": menu_id}, {"$set": {"images": images}})
    return {"image_url": image_url, "images": images}


@router.delete("/menus/{menu_id}/images")
async def delete_menu_image(menu_id: str, request: Request, user: User = Depends(get_current_user)):
    body = await request.json()
    image_url = body.get("image_url")
    if not image_url:
        raise HTTPException(400, "image_url required")
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    images = [img for img in menu.get("images", []) if img != image_url]
    await db.menus.update_one({"menu_id": menu_id}, {"$set": {"images": images}})
    return {"message": "Bild entfernt", "images": images}


# ============ TEXTERKENNUNG (heuristisch, kein LLM) ============

# Preis am Zeilenende: optionales €, 1-3 Ziffern, Komma/Punkt, 2 Nachkommastellen
_PRICE_END_RE = re.compile(
    r'(?:[\s\t.]{2,}|^)€?\s*(\d{1,3}[,\.]\d{2})\s*€?\s*$'
)
_PRICE_ONLY_RE = re.compile(r'^\s*€?\s*\d{1,3}[,\.]\d{2}\s*€?\s*$')
_SEPARATOR_RE = re.compile(r'^[\-=\*\.\/\|\\─═\s]+$')
_ALLCAPS_HEADER_RE = re.compile(r'^[A-ZÄÖÜ\d\s\-\/]{4,}$')


def _parse_menu_text(text: str) -> list[dict]:
    """
    Heuristischer Speisekarten-Parser ohne LLM.
    Erkennt Gerichte durch Zeilen-Splitting, Preisextraktion und
    Filterung von Kategorieköpfen/Trennzeichen.
    """
    dishes: list[dict] = []
    seen: set[str] = set()

    for raw in text.splitlines():
        line = raw.strip()

        if not line:
            continue
        if _SEPARATOR_RE.fullmatch(line):
            continue
        if _PRICE_ONLY_RE.fullmatch(line):
            continue
        if len(line) <= 2:
            continue
        # Reine Großbuchstaben → Kategorie-Überschrift
        if _ALLCAPS_HEADER_RE.fullmatch(line) and line == line.upper():
            continue
        # "Vorspeisen:" → Kategorie
        if line.endswith(':') and len(line.split()) <= 4:
            continue

        # Preis aus dem Zeilenende extrahieren
        price: Optional[float] = None
        m = _PRICE_END_RE.search(raw)
        if m:
            try:
                price = float(m.group(1).replace(',', '.'))
            except ValueError:
                pass
            # Preis + Füllzeichen vom Namen entfernen
            line = re.sub(r'[\s\t.]+€?\s*\d{1,3}[,\.]\d{2}\s*€?\s*$', '', line).strip()

        line = re.sub(r'[\.\s]+$', '', line).strip()

        if len(line) < 3:
            continue

        key = line.lower()
        if key in seen:
            continue
        seen.add(key)

        dish: dict = {"name": line}
        if price is not None:
            dish["price"] = price
        dishes.append(dish)

    return dishes


def _dishes_to_recipes(dishes: list[dict], user: User, source_id: Optional[str]) -> list[dict]:
    """Konvertiert extrahierte Gerichte in Recipe-Dokumente."""
    result = []
    for d in dishes:
        name = d.get("name", "").strip()
        if not name:
            continue
        recipe_id = f"recipe_{uuid.uuid4().hex[:12]}"
        doc = {
            "recipe_id": recipe_id,
            "user_id": user.user_id,
            "group_id": user.group_id,
            "name": name,
            "description": d.get("description") or "",
            "category": "Hauptgericht",
            "difficulty": "mittel",
            "portions": 1,
            "prep_time": None,
            "cook_time": None,
            "image_url": None,
            "images": [],
            "cost_per_portion": d.get("price"),
            "ingredients": [],
            "instructions": [],
            "nutrition": None,
            "allergens": [],
            "side_dishes": [],
            "shared_with_group": False,
            "is_pickup": True,
            "pickup_source": None,
            "pickup_source_id": source_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        # Bezugsquellen-Namen nachschlagen (synchron nicht möglich, wird später befüllt)
        result.append(doc)
    return result


# ─── Tokenizer ────────────────────────────────────────────────────────────────

# Zahl mit genau 2 Nachkommastellen (Preis-Muster)
_TOKEN_PRICE_RE = re.compile(r'€?\s*\d{1,3}[,\.]\d{2}\s*€?')
_TOKEN_SKIP_RE = re.compile(r'^[\-=\*\.\/\|\\─═\s]+$')
_TOKEN_CAPS_RE = re.compile(r'^[A-ZÄÖÜ\d\s\-\/\.]{4,}$')


def _tokenize_menu_text(text: str) -> list[dict]:
    """
    Zerlegt Speisekarten-Text in klassifizierte Bausteine.
    Jede Zeile wird nach Preis-Mustern aufgespalten.
    Automatische Klasse: 'gericht' | 'preis' | 'skip'
    """
    tokens: list[dict] = []
    token_id = 0

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # Zeile an Preis-Mustern aufteilen
        segments: list[tuple[str, bool]] = []  # (text, is_price)
        last = 0
        for m in _TOKEN_PRICE_RE.finditer(line):
            before = line[last:m.start()].strip().strip('.')
            if before:
                segments.append((before, False))
            segments.append((m.group().strip(), True))
            last = m.end()
        rest = line[last:].strip().strip('.')
        if rest:
            segments.append((rest, False))
        if not segments:
            segments = [(line, False)]

        for seg_text, is_price in segments:
            seg_text = seg_text.strip()
            if not seg_text:
                continue

            if is_price:
                auto_class = "preis"
            elif _TOKEN_SKIP_RE.fullmatch(seg_text):
                auto_class = "skip"
            elif len(seg_text) <= 2:
                auto_class = "skip"
            elif _TOKEN_CAPS_RE.fullmatch(seg_text) and seg_text == seg_text.upper():
                auto_class = "skip"
            elif seg_text.endswith(':') and len(seg_text.split()) <= 4:
                auto_class = "skip"
            else:
                auto_class = "gericht"

            tokens.append({"id": token_id, "text": seg_text, "class": auto_class})
            token_id += 1

    return tokens


def _classified_tokens_to_dishes(tokens: list[dict]) -> list[dict]:
    """Ordnet 'preis'-Tokens dem jeweils vorherigen 'gericht'-Token zu."""
    dishes: list[dict] = []
    last: Optional[dict] = None

    for token in tokens:
        cls = token.get("class")
        if cls == "gericht":
            if last is not None:
                dishes.append(last)
            last = {"name": token["text"].strip()}
        elif cls == "preis" and last is not None and "price" not in last:
            price_str = re.sub(r'[€\s]', '', token["text"]).replace(',', '.')
            try:
                last["price"] = float(price_str)
            except ValueError:
                pass

    if last is not None:
        dishes.append(last)

    return dishes


def _gemini_menu_to_tokens(data: dict) -> list[dict]:
    """Konvertiert das strukturierte Gemini-JSON in die Wizard-Token-Liste.

    Gemini-Struktur: {restaurant_name, kategorien: [{name, gerichte: [{name, preis, beschreibung}]}]}
    Token-Klassen: 'gericht' | 'preis' | 'skip'
    """
    tokens: list[dict] = []
    tid = 0
    for kat in data.get("kategorien") or []:
        kat_name = (kat.get("name") or "").strip()
        if kat_name:
            tokens.append({"id": tid, "text": kat_name, "class": "skip"})
            tid += 1
        for g in kat.get("gerichte") or []:
            name = (g.get("name") or "").strip()
            if not name:
                continue
            tokens.append({"id": tid, "text": name, "class": "gericht"})
            tid += 1
            preis = (g.get("preis") or "").strip()
            if preis and preis.lower() != "null":
                tokens.append({"id": tid, "text": preis, "class": "preis"})
                tid += 1
            beschreibung = (g.get("beschreibung") or "").strip()
            if beschreibung and beschreibung.lower() != "null":
                tokens.append({"id": tid, "text": beschreibung, "class": "skip"})
                tid += 1
    return tokens


async def _tokenize_with_llm_or_heuristic(text: str) -> list[dict]:
    """Klassifiziert Speisekarten-Text via Gemini (Fallback: Heuristik).
    Gibt Token-Liste zurück: [{"id": int, "text": str, "class": "gericht"|"preis"|"skip"}]
    """
    from llm import call_gemini, extract_json, gemini_available
    if gemini_available():
        prompt = (
            "Du bist ein Speisekarten-Parser. Klassifiziere jeden Eintrag in diesem Speisekarten-Text.\n"
            "Antworte ausschließlich mit einem JSON-Array (kein anderer Text):\n"
            '[{"id": 0, "text": "Bruschetta", "class": "gericht"}, {"id": 1, "text": "4,50", "class": "preis"}, ...]\n\n'
            'Klassen:\n'
            '- "gericht": Name eines Gerichts oder einer Speise\n'
            '- "preis": Preis (z.B. "4,50" oder "€ 12.00")\n'
            '- "skip": Überschriften, Kategorien, Trennzeichen, sonstige Zeilen\n\n'
            f"Speisekarten-Text:\n{text[:4000]}"
        )
        response = await call_gemini(prompt)
        if response:
            data = extract_json(response)
            if isinstance(data, list) and data and "text" in data[0]:
                # IDs normalisieren und fehlende Felder ergänzen
                valid = []
                for i, item in enumerate(data):
                    cls = item.get("class", "skip")
                    if cls not in ("gericht", "preis", "skip"):
                        cls = "skip"
                    valid.append({"id": i, "text": str(item.get("text", "")), "class": cls})
                return valid
        logger.warning("Gemini Tokenisierung fehlgeschlagen, nutze Heuristik")

    return _tokenize_menu_text(text)


@router.post("/menus/{menu_id}/tokenize-text")
async def tokenize_menu_text(menu_id: str, request: Request, user: User = Depends(get_current_user)):
    """Gibt erkannte Textbausteine mit Auto-Klassifizierung zurück (kein Speichern).
    Nutzt Gemini wenn verfügbar, sonst heuristischen Tokenizer als Fallback.
    """
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")

    body = await request.json()
    text = (body.get("text") or "").strip()
    if len(text) < 5:
        raise HTTPException(400, "Text ist zu kurz")

    tokens = await _tokenize_with_llm_or_heuristic(text)
    return {"tokens": tokens, "count": len(tokens)}


@router.post("/menus/{menu_id}/save-classified")
async def save_classified_tokens(menu_id: str, request: Request, user: User = Depends(get_current_user)):
    """Speichert vom Benutzer klassifizierte Textbausteine als Abholgerichte."""
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")

    body = await request.json()
    tokens = body.get("tokens") or []
    if not tokens:
        raise HTTPException(400, "Keine Tokens übergeben")

    dishes = _classified_tokens_to_dishes(tokens)
    if not dishes:
        raise HTTPException(422, "Keine Gerichte in den klassifizierten Tokens gefunden")

    return await _save_extracted_dishes(menu, dishes, user)


    """Extrahiert Gerichte aus Text und erstellt verknüpfte Abholgerichte."""
    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")

    body = await request.json()
    text = (body.get("text") or "").strip()
    if len(text) < 10:
        raise HTTPException(400, "Text ist zu kurz")

    try:
        dishes = _parse_menu_text(text)
    except Exception as e:
        logger.error(f"Menu text parse error: {e}")
        raise HTTPException(500, f"Fehler beim Parsen: {str(e)[:200]}")

    return await _save_extracted_dishes(menu, dishes, user)


@router.post("/menus/{menu_id}/extract-image")
async def extract_from_image(
    menu_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)
):
    """Extrahiert Speisekarten-Daten aus einem Bild via Gemini Vision.
    Liefert klassifizierte Tokens für den Wizard zurück.
    Fallback: Tesseract OCR + heuristischer Tokenizer.
    """
    from llm import call_gemini_with_image, extract_json, gemini_available, _MENU_IMAGE_PROMPT

    menu = await db.menus.find_one({"menu_id": menu_id, **_scope_query(user)}, {"_id": 0})
    if not menu:
        raise HTTPException(404, "Speisekarte nicht gefunden")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Nur JPEG, PNG, WebP erlaubt")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "Bild zu groß (max 10 MB)")

    # Bild in Speisekarte speichern
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    image_id = uuid.uuid4().hex[:12]
    storage_path = f"{APP_NAME}/menus/{menu_id}/{image_id}.{ext}"
    image_url = None
    try:
        put_object(storage_path, data, file.content_type)
        image_url = f"/api/images/{storage_path}"
        images = menu.get("images", []) + [image_url]
        await db.menus.update_one({"menu_id": menu_id}, {"$set": {"images": images}})
    except Exception as e:
        logger.warning(f"Could not save menu image: {e}")

    # Primär: Gemini Vision
    if gemini_available():
        response = await call_gemini_with_image(data, file.content_type, _MENU_IMAGE_PROMPT)
        if response:
            menu_data = extract_json(response)
            if isinstance(menu_data, dict) and menu_data.get("kategorien"):
                tokens = _gemini_menu_to_tokens(menu_data)
                return {
                    "tokens": tokens,
                    "count": len(tokens),
                    "image_url": image_url,
                    "restaurant_name": menu_data.get("restaurant_name"),
                }
        logger.warning("Gemini Vision fehlgeschlagen, Fallback auf Tesseract")

    # Fallback: Tesseract OCR
    try:
        import io
        import pytesseract
        from PIL import Image as PILImage
        pil_img = PILImage.open(io.BytesIO(data))
        ocr_text = pytesseract.image_to_string(pil_img, lang="deu+eng")
    except Exception as e:
        logger.error(f"OCR error: {e}")
        raise HTTPException(500, f"Texterkennung fehlgeschlagen: {str(e)[:200]}")

    if not ocr_text.strip():
        raise HTTPException(422, "Kein Text im Bild erkannt. Bitte ein schärferes Foto verwenden.")

    tokens = await _tokenize_with_llm_or_heuristic(ocr_text)
    return {"tokens": tokens, "count": len(tokens), "image_url": image_url, "restaurant_name": None}


async def _save_extracted_dishes(menu: dict, dishes: list[dict], user: User) -> dict:
    """Speichert extrahierte Gerichte als Abholgerichte und verknüpft sie mit der Speisekarte."""
    source_id = menu.get("source_id")

    # Bezugsquellen-Namen laden wenn vorhanden
    source_name = None
    if source_id:
        src = await db.sources.find_one({"source_id": source_id}, {"_id": 0})
        source_name = src.get("name") if src else None

    recipe_docs = _dishes_to_recipes(dishes, user, source_id)
    for doc in recipe_docs:
        doc["pickup_source"] = source_name

    if recipe_docs:
        await db.recipes.insert_many(recipe_docs)

    new_ids = [d["recipe_id"] for d in recipe_docs]
    all_ids = list(dict.fromkeys(menu.get("recipe_ids", []) + new_ids))
    await db.menus.update_one(
        {"menu_id": menu["menu_id"]},
        {"$set": {"recipe_ids": all_ids, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # _id aus Rückgabe entfernen
    for doc in recipe_docs:
        doc.pop("_id", None)

    return {
        "extracted": len(recipe_docs),
        "recipes": recipe_docs,
        "menu_recipe_ids": all_ids,
    }
