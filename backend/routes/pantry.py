"""Speisekammer (Pantry): Vorratsverwaltung mit automatischer Einbuchung aus der Einkaufsliste"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core import db, get_current_user
from models import User, PantryItemCreate, PantryItemUpdate, PantryBookRequest

router = APIRouter(prefix="/api")


class ConsumeEntry(BaseModel):
    recipe_id: Optional[str] = None
    portions: int = 2


class ConsumeRequest(BaseModel):
    meals: List[ConsumeEntry]


async def _get_scope(user: User):
    """Gibt (user_id, group_id) zurück – für group-scoped Abfragen."""
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return user.user_id, doc.get("group_id") if doc else None


def _scope_query(user_id: str, group_id):
    if group_id:
        return {"group_id": group_id}
    return {"user_id": user_id, "group_id": None}


@router.get("/pantry")
async def list_pantry(user: User = Depends(get_current_user)):
    user_id, group_id = await _get_scope(user)
    items = await db.pantry.find(_scope_query(user_id, group_id), {"_id": 0}).to_list(1000)
    return {"items": items}


@router.post("/pantry")
async def create_pantry_item(data: PantryItemCreate, user: User = Depends(get_current_user)):
    user_id, group_id = await _get_scope(user)
    item_id = f"pantry_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "item_id": item_id,
        "user_id": user_id,
        "group_id": group_id,
        "name": data.name,
        "amount": data.amount,
        "unit": data.unit,
        "category": data.category,
        "expires_at": data.expires_at,
        "added_at": now,
        "updated_at": now,
    }
    await db.pantry.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/pantry/{item_id}")
async def update_pantry_item(item_id: str, data: PantryItemUpdate, user: User = Depends(get_current_user)):
    existing = await db.pantry.find_one({"item_id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.pantry.update_one({"item_id": item_id}, {"$set": updates})
    updated = await db.pantry.find_one({"item_id": item_id}, {"_id": 0})
    return updated


@router.delete("/pantry/{item_id}")
async def delete_pantry_item(item_id: str, user: User = Depends(get_current_user)):
    result = await db.pantry.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    return {"message": "Artikel gelöscht"}


@router.post("/pantry/book")
async def book_into_pantry(data: PantryBookRequest, user: User = Depends(get_current_user)):
    """Bucht einen Artikel aus der Einkaufsliste in die Speisekammer ein.
    Existiert bereits ein Artikel mit gleichem Namen+Einheit, wird die Menge addiert.
    """
    user_id, group_id = await _get_scope(user)
    query = {**_scope_query(user_id, group_id), "name": {"$regex": f"^{data.name}$", "$options": "i"}, "unit": data.unit}
    existing = await db.pantry.find_one(query, {"_id": 0})

    if existing:
        new_amount = round(existing["amount"] + data.amount, 3)
        await db.pantry.update_one(
            {"item_id": existing["item_id"]},
            {"$set": {"amount": new_amount, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        updated = await db.pantry.find_one({"item_id": existing["item_id"]}, {"_id": 0})
        return updated
    else:
        item_id = f"pantry_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "item_id": item_id,
            "user_id": user_id,
            "group_id": group_id,
            "name": data.name,
            "amount": data.amount,
            "unit": data.unit,
            "category": data.category,
            "expires_at": None,
            "added_at": now,
            "updated_at": now,
        }
        await db.pantry.insert_one(doc)
        doc.pop("_id", None)
        return doc


@router.post("/pantry/consume")
async def consume_from_pantry(data: ConsumeRequest, user: User = Depends(get_current_user)):
    """Zieht die Zutaten der angegebenen Rezepte (mit Portionszahl) aus der Speisekammer ab."""
    user_id, group_id = await _get_scope(user)
    pantry_query = _scope_query(user_id, group_id)

    # Zutaten aller Rezepte berechnen
    ingredients_to_consume: dict[str, float] = {}
    units: dict[str, str] = {}

    for entry in data.meals:
        if not entry.recipe_id:
            continue  # Externes Gericht – keine Zutaten
        recipe = await db.recipes.find_one({"recipe_id": entry.recipe_id}, {"_id": 0})
        if not recipe:
            continue
        base_portions = recipe.get("portions", 4) or 4
        multiplier = entry.portions / base_portions
        for ing in recipe.get("ingredients", []):
            key = f"{ing['name'].lower()}_{ing['unit'].lower()}"
            try:
                amount = float(ing["amount"]) * multiplier
                ingredients_to_consume[key] = ingredients_to_consume.get(key, 0) + amount
                units[key] = ing["unit"]
            except (ValueError, TypeError):
                pass

    now = datetime.now(timezone.utc).isoformat()
    consumed = []
    not_available = []

    for key, amount_needed in ingredients_to_consume.items():
        name_part = key.rsplit("_", 1)[0]
        unit = units[key]
        # Case-insensitive Suche nach Pantry-Eintrag
        query = {**pantry_query, "name": {"$regex": f"^{name_part}$", "$options": "i"}, "unit": unit}
        existing = await db.pantry.find_one(query, {"_id": 0})
        if existing:
            new_amount = round(existing["amount"] - amount_needed, 3)
            if new_amount <= 0:
                await db.pantry.delete_one({"item_id": existing["item_id"]})
            else:
                await db.pantry.update_one(
                    {"item_id": existing["item_id"]},
                    {"$set": {"amount": new_amount, "updated_at": now}}
                )
            consumed.append({"name": existing["name"], "unit": unit, "amount": round(amount_needed, 3)})
        else:
            not_available.append({"name": name_part, "unit": unit})

    return {"consumed": consumed, "not_available": not_available}
