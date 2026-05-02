"""Bezugsquellen-Verwaltung: CRUD für Einkaufsquellen (Supermarkt, Restaurant, Online …)"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from core import get_current_user, db
from models import SourceCreate, SourceUpdate

router = APIRouter()


def _scope_query(user) -> dict:
    if user.group_id:
        return {"$or": [{"group_id": user.group_id}, {"user_id": user.user_id, "group_id": None}]}
    return {"user_id": user.user_id, "group_id": None}


@router.get("/api/sources")
async def list_sources(user=Depends(get_current_user)):
    query = _scope_query(user)
    sources = await db.sources.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    return sources


@router.post("/api/sources", status_code=201)
async def create_source(data: SourceCreate, user=Depends(get_current_user)):
    doc = {
        "source_id": f"source_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "group_id": user.group_id,
        **data.model_dump(),
    }
    await db.sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/api/sources/{source_id}")
async def update_source(source_id: str, data: SourceUpdate, user=Depends(get_current_user)):
    query = {"source_id": source_id, **_scope_query(user)}
    existing = await db.sources.find_one(query, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Bezugsquelle nicht gefunden")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.sources.update_one({"source_id": source_id}, {"$set": updates})
    return {**existing, **updates}


@router.delete("/api/sources/{source_id}", status_code=204)
async def delete_source(source_id: str, user=Depends(get_current_user)):
    query = {"source_id": source_id, **_scope_query(user)}
    result = await db.sources.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(404, "Bezugsquelle nicht gefunden")
    # Referenzen aus Zutaten-Stammdaten entfernen
    await db.ingredient_masters.update_many(
        {"source_ids": source_id},
        {"$pull": {"source_ids": source_id}}
    )
