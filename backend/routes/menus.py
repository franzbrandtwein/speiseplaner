"""Speisekarten-Verwaltung: CRUD, Bild-Upload, LLM-Extraktion von Abholgerichten"""
import base64
import json
import logging
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


# ============ LLM-EXTRAKTION ============

_MENU_PROMPT = """Du bist ein Speisekarten-Parser. Extrahiere alle Gerichte aus dem folgenden Speisekarten-Text und gib sie als JSON-Array zurück.

Jedes Gericht hat folgende Felder:
- "name": Gerichtname (Pflicht)
- "description": Kurzbeschreibung oder Zutaten (optional)
- "price": Preis als Zahl in Euro (optional, z.B. 12.5)

Antworte NUR mit einem JSON-Array, kein anderer Text. Beispiel:
[
  {{"name": "Margherita", "description": "Tomate, Mozzarella", "price": 9.5}},
  {{"name": "Tiramisu", "description": "Klassisches Dessert", "price": 6.0}}
]

Speisekarten-Inhalt:
{content}"""


async def _call_llm_text(content: str) -> list[dict]:
    import openai
    llm_key = __import__("os").environ.get("EMERGENT_LLM_KEY", "")
    if not llm_key:
        raise HTTPException(503, "LLM-Key nicht konfiguriert (EMERGENT_LLM_KEY)")

    client = openai.AsyncOpenAI(api_key=llm_key)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": _MENU_PROMPT.format(content=content[:12000])}],
        temperature=0.2,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw[:-3]
    return json.loads(raw.strip())


async def _call_llm_image(image_data: bytes, content_type: str) -> list[dict]:
    import openai
    llm_key = __import__("os").environ.get("EMERGENT_LLM_KEY", "")
    if not llm_key:
        raise HTTPException(503, "LLM-Key nicht konfiguriert (EMERGENT_LLM_KEY)")

    b64 = base64.b64encode(image_data).decode()
    data_url = f"data:{content_type};base64,{b64}"

    client = openai.AsyncOpenAI(api_key=llm_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": _MENU_PROMPT.format(content="(siehe Bild oben)")},
            ],
        }],
        temperature=0.2,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw[:-3]
    return json.loads(raw.strip())


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
        dishes = await _call_llm_text(text)
    except json.JSONDecodeError:
        raise HTTPException(422, "Gerichte konnten nicht extrahiert werden")
    except Exception as e:
        logger.error(f"Menu text extraction error: {e}")
        raise HTTPException(500, f"KI-Fehler: {str(e)[:200]}")

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

    # Bild auch in der Speisekarte speichern
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

    try:
        dishes = await _call_llm_image(data, file.content_type)
    except json.JSONDecodeError:
        raise HTTPException(422, "Gerichte konnten nicht aus dem Bild extrahiert werden")
    except Exception as e:
        logger.error(f"Menu image extraction error: {e}")
        raise HTTPException(500, f"KI-Fehler: {str(e)[:200]}")

    return await _save_extracted_dishes(menu, dishes, user)


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
