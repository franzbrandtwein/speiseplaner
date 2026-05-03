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


@router.post("/menus/{menu_id}/extract-text")
async def extract_from_text(menu_id: str, request: Request, user: User = Depends(get_current_user)):
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
    """Extrahiert Gerichte aus einem Bild (OCR via LLM) und erstellt Abholgerichte."""
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
    try:
        put_object(storage_path, data, file.content_type)
        image_url = f"/api/images/{storage_path}"
        images = menu.get("images", []) + [image_url]
        await db.menus.update_one({"menu_id": menu_id}, {"$set": {"images": images}})
    except Exception as e:
        logger.warning(f"Could not save menu image: {e}")

    raise HTTPException(501, "Automatische Texterkennung aus Bildern ist nicht verfügbar. Bitte Text manuell eingeben.")


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
