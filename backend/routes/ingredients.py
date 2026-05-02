"""Zutaten-Stammdaten: CRUD, Namens-Lookup und Nährwert-Berechnung für Rezepte"""
import uuid
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from core import get_current_user, db
from models import IngredientMasterCreate, IngredientMasterUpdate

router = APIRouter()

UNIT_TO_G = {
    "g": 1, "kg": 1000,
    "ml": 1, "l": 1000,
    "mg": 0.001,
    "el": 15, "tl": 5,
    "prise": 0.5, "msp": 0.5,
}


def _scope_query(user) -> dict:
    if user.group_id:
        return {"$or": [{"group_id": user.group_id}, {"user_id": user.user_id, "group_id": None}]}
    return {"user_id": user.user_id, "group_id": None}


def _to_grams(amount_str: str, unit: str) -> Optional[float]:
    """Konvertiert Mengenangabe in Gramm (approximativ für Nährwertrechnung)."""
    try:
        amount = float(amount_str.replace(",", "."))
    except (ValueError, AttributeError):
        return None
    factor = UNIT_TO_G.get(unit.lower().strip(), None)
    if factor is None:
        return None
    return amount * factor


def _scale_nutrition(nutrition: dict, grams: float) -> dict:
    """Skaliert Nährwerte von pro-100g auf gegebene Grammzahl."""
    factor = grams / 100.0
    result = {}
    for key, val in nutrition.items():
        if val is not None:
            result[key] = round(val * factor, 2)
        else:
            result[key] = None
    return result


def _add_nutrition(a: dict, b: dict) -> dict:
    """Addiert zwei Nährwert-Dicts (None-safe)."""
    keys = {"calories", "protein", "fat", "saturated_fat", "carbs", "sugar", "fiber", "salt"}
    result = {}
    for k in keys:
        va, vb = a.get(k), b.get(k)
        if va is not None and vb is not None:
            result[k] = round(va + vb, 2)
        elif va is not None:
            result[k] = va
        elif vb is not None:
            result[k] = vb
        else:
            result[k] = None
    return result


@router.get("/api/ingredients")
async def list_ingredients(
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    query = _scope_query(user)
    if category:
        query["category"] = category
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    items = await db.ingredient_masters.find(query, {"_id": 0}).sort("name", 1).to_list(2000)
    return items


@router.get("/api/ingredients/lookup")
async def lookup_ingredient(name: str = Query(...), user=Depends(get_current_user)):
    """Sucht einen Zutaten-Stammdatensatz per Name (case-insensitiv)."""
    query = {**_scope_query(user), "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    item = await db.ingredient_masters.find_one(query, {"_id": 0})
    return item  # None wenn nicht gefunden → 200 mit null


@router.post("/api/ingredients", status_code=201)
async def create_ingredient(data: IngredientMasterCreate, user=Depends(get_current_user)):
    # Duplikat-Check (gleicher Name im Scope)
    existing = await db.ingredient_masters.find_one(
        {**_scope_query(user), "name": {"$regex": f"^{re.escape(data.name)}$", "$options": "i"}},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(409, f"Zutat '{data.name}' existiert bereits")

    doc = {
        "ingredient_id": f"ingr_{uuid.uuid4().hex[:12]}",
        "user_id": user.user_id,
        "group_id": user.group_id,
        "name": data.name,
        "category": data.category,
        "nutrition_per_100g": data.nutrition_per_100g.model_dump() if data.nutrition_per_100g else None,
        "pack_sizes": [ps.model_dump() for ps in data.pack_sizes],
        "source_ids": data.source_ids,
        "shared_with_group": data.shared_with_group,
    }
    await db.ingredient_masters.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/api/ingredients/{ingredient_id}")
async def update_ingredient(ingredient_id: str, data: IngredientMasterUpdate, user=Depends(get_current_user)):
    query = {"ingredient_id": ingredient_id, **_scope_query(user)}
    existing = await db.ingredient_masters.find_one(query, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Zutat nicht gefunden")

    updates = {}
    if data.name is not None:
        updates["name"] = data.name
    if data.category is not None:
        updates["category"] = data.category
    if data.nutrition_per_100g is not None:
        updates["nutrition_per_100g"] = data.nutrition_per_100g.model_dump()
    if data.pack_sizes is not None:
        updates["pack_sizes"] = [ps.model_dump() for ps in data.pack_sizes]
    if data.source_ids is not None:
        updates["source_ids"] = data.source_ids
    if data.shared_with_group is not None:
        updates["shared_with_group"] = data.shared_with_group

    if updates:
        await db.ingredient_masters.update_one({"ingredient_id": ingredient_id}, {"$set": updates})
    return {**existing, **updates}


@router.delete("/api/ingredients/{ingredient_id}", status_code=204)
async def delete_ingredient(ingredient_id: str, user=Depends(get_current_user)):
    query = {"ingredient_id": ingredient_id, **_scope_query(user)}
    result = await db.ingredient_masters.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(404, "Zutat nicht gefunden")


@router.get("/api/recipes/{recipe_id}/nutrition")
async def get_recipe_nutrition(recipe_id: str, user=Depends(get_current_user)):
    """Berechnet Nährwerte eines Rezepts aus den Stammdaten der Zutaten."""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(404, "Rezept nicht gefunden")

    scope = _scope_query(user)
    total = {k: None for k in ("calories", "protein", "fat", "saturated_fat", "carbs", "sugar", "fiber", "salt")}
    details = []  # pro Zutat: {name, grams, nutrition}
    missing = []  # Zutaten ohne Stammdaten

    for ing in recipe.get("ingredients", []):
        name = ing.get("name", "")
        amount_str = ing.get("amount", "0")
        unit = ing.get("unit", "")
        ing_id = ing.get("ingredient_id")

        # Stammdaten finden: per ID oder per Name-Lookup
        master = None
        if ing_id:
            master = await db.ingredient_masters.find_one({"ingredient_id": ing_id}, {"_id": 0})
        if not master:
            master = await db.ingredient_masters.find_one(
                {**scope, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
                {"_id": 0}
            )

        if not master or not master.get("nutrition_per_100g"):
            missing.append(name)
            continue

        grams = _to_grams(amount_str, unit)
        if grams is None:
            missing.append(f"{name} (Einheit nicht konvertierbar)")
            continue

        scaled = _scale_nutrition(master["nutrition_per_100g"], grams)
        total = _add_nutrition(total, scaled)
        details.append({"name": name, "grams": grams, "nutrition": scaled})

    portions = recipe.get("portions", 1) or 1
    per_portion = {k: (round(v / portions, 2) if v is not None else None) for k, v in total.items()}

    return {
        "recipe_id": recipe_id,
        "portions": portions,
        "total": total,
        "per_portion": per_portion,
        "details": details,
        "missing": missing,
    }
