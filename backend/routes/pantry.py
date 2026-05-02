"""Speisekammer (Pantry): Vorratsverwaltung mit automatischer Einbuchung aus der Einkaufsliste"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user
from models import User, PantryItemCreate, PantryItemUpdate, PantryBookRequest

router = APIRouter(prefix="/api")


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
