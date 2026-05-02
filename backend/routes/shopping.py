"""Shopping list, staple items, categories"""
import uuid
from datetime import datetime, timezone, date as date_type, timedelta

from fastapi import APIRouter, HTTPException, Request, Depends

from core import db, get_current_user
from models import User, StapleItemCreate, StapleItemUpdate

router = APIRouter(prefix="/api")

STAPLE_CATEGORIES = ["Getränke", "Gewürze", "Haushalt", "Hygiene", "Backzutaten", "Sonstiges"]


@router.get("/shopping-list")
async def get_shopping_list(date_from: str, date_to: str, user: User = Depends(get_current_user)):
    """Einkaufsliste für einen Zeitraum (date_from bis date_to, je YYYY-MM-DD)."""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    # Alle Wochenpläne laden, die den Zeitraum überschneiden.
    # Ein Plan mit week_start W deckt W bis W+6 ab.
    # Überschneidung wenn: week_start <= date_to UND week_start >= date_from - 6 Tage
    from_dt = date_type.fromisoformat(date_from)
    to_dt = date_type.fromisoformat(date_to)
    earliest_week_start = (from_dt - timedelta(days=6)).isoformat()

    if group_id:
        plans = await db.meal_plans.find(
            {"group_id": group_id, "week_start": {"$gte": earliest_week_start, "$lte": date_to}},
            {"_id": 0}
        ).to_list(20)
    else:
        plans = await db.meal_plans.find(
            {"user_id": user.user_id, "group_id": None,
             "week_start": {"$gte": earliest_week_start, "$lte": date_to}},
            {"_id": 0}
        ).to_list(20)

    # Zutaten aus allen Tagen im Zeitraum aggregieren
    recipe_ids = set()
    recipe_portions = {}

    for plan in plans:
        for day in plan.get("days", []):
            day_date = day.get("date", "")
            if not (date_from <= day_date <= date_to):
                continue
            for meal_type in ["breakfast", "lunch", "dinner"]:
                meals = day.get(meal_type, [])
                if isinstance(meals, dict):
                    meals = [meals] if meals.get("recipe_id") else []
                elif meals is None:
                    meals = []
                for meal in meals:
                    if meal and meal.get("recipe_id"):
                        rid = meal["recipe_id"]
                        recipe_ids.add(rid)
                        portions = meal.get("portions", 2)
                        recipe_portions[rid] = recipe_portions.get(rid, 0) + portions
                        for sd in meal.get("side_dishes", []):
                            if sd.get("recipe_id"):
                                sd_id = sd["recipe_id"]
                                sd_portions = sd.get("portions", 2)
                                recipe_ids.add(sd_id)
                                recipe_portions[sd_id] = recipe_portions.get(sd_id, 0) + sd_portions

    # Zutaten berechnen
    ingredients_map = {}
    for recipe_id in recipe_ids:
        recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
        if recipe:
            base_portions = recipe.get("portions", 4)
            multiplier = recipe_portions[recipe_id] / base_portions
            for ing in recipe.get("ingredients", []):
                key = f"{ing['name'].lower()}_{ing['unit'].lower()}"
                try:
                    amount = float(ing["amount"]) * multiplier
                    if key in ingredients_map:
                        ingredients_map[key]["total_amount"] += amount
                    else:
                        ingredients_map[key] = {
                            "ingredient_name": ing["name"],
                            "total_amount": amount,
                            "unit": ing["unit"],
                            "checked": False
                        }
                except ValueError:
                    if key not in ingredients_map:
                        ingredients_map[key] = {
                            "ingredient_name": ing["name"],
                            "total_amount": ing["amount"],
                            "unit": ing["unit"],
                            "checked": False
                        }

    items = []
    for item in ingredients_map.values():
        if isinstance(item["total_amount"], float):
            item["total_amount"] = str(round(item["total_amount"], 2))
        items.append(item)

    # Speisekammer-Bestände abziehen
    pantry_query = {"group_id": group_id} if group_id else {"user_id": user.user_id, "group_id": None}
    pantry_items = await db.pantry.find(pantry_query, {"_id": 0}).to_list(1000)
    pantry_stock = {}
    for pi in pantry_items:
        key = f"{pi['name'].lower()}_{pi['unit'].lower()}"
        pantry_stock[key] = pantry_stock.get(key, 0) + pi["amount"]

    filtered_items = []
    for item in items:
        key = f"{item['ingredient_name'].lower()}_{item['unit'].lower()}"
        if key in pantry_stock:
            try:
                needed = float(item["total_amount"])
                remaining = needed - pantry_stock[key]
                if remaining <= 0:
                    continue  # Bereits genug vorhanden
                item["total_amount"] = str(round(remaining, 2))
                item["from_pantry"] = str(round(min(pantry_stock[key], needed), 2))
            except ValueError:
                pass
        filtered_items.append(item)
    items = filtered_items

    # Sonstige Artikel laden
    user_doc_fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id_fresh = user_doc_fresh.get("group_id") if user_doc_fresh else group_id
    staple_query = {"group_id": group_id_fresh, "active": True} if group_id_fresh else {
        "user_id": user.user_id, "group_id": None, "active": True
    }
    staple_items = await db.staple_items.find(staple_query, {"_id": 0}).to_list(500)
    staple_list = []
    for si in staple_items:
        staple_list.append({
            "item_id": si["item_id"],
            "ingredient_name": si["name"],
            "total_amount": str(si["amount"]),
            "unit": si["unit"],
            "category": si.get("category", "Sonstiges"),
            "checked": False,
            "is_staple": True
        })

    return {"items": items, "staple_items": staple_list, "date_from": date_from, "date_to": date_to}


@router.post("/shopping-list/toggle")
async def toggle_shopping_item(request: Request, user: User = Depends(get_current_user)):
    body = await request.json()
    return {"message": "Item toggled"}


# ============ STAPLE ITEMS ============

@router.get("/staple-items")
async def get_staple_items(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    query = {"group_id": group_id} if group_id else {"user_id": user.user_id, "group_id": None}
    items = await db.staple_items.find(query, {"_id": 0}).to_list(500)
    return {"items": items, "categories": STAPLE_CATEGORIES}


@router.post("/staple-items")
async def create_staple_item(data: StapleItemCreate, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    item_id = f"staple_{uuid.uuid4().hex[:12]}"
    doc = {
        "item_id": item_id, "user_id": user.user_id, "group_id": group_id,
        "name": data.name, "amount": data.amount, "unit": data.unit,
        "category": data.category, "active": data.active,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.staple_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/staple-items/{item_id}")
async def update_staple_item(item_id: str, data: StapleItemUpdate, user: User = Depends(get_current_user)):
    existing = await db.staple_items.find_one({"item_id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.staple_items.update_one({"item_id": item_id}, {"$set": updates})
    updated = await db.staple_items.find_one({"item_id": item_id}, {"_id": 0})
    return updated


@router.delete("/staple-items/{item_id}")
async def delete_staple_item(item_id: str, user: User = Depends(get_current_user)):
    result = await db.staple_items.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    return {"message": "Artikel gelöscht"}


# ============ CATEGORIES ============

@router.get("/categories")
async def get_categories(user: User = Depends(get_current_user)):
    return {
        "categories": [
            "Frühstück", "Hauptgericht", "Vorspeise", "Beilage",
            "Dessert", "Snack", "Suppe", "Salat", "Getränk"
        ],
        "difficulties": ["leicht", "mittel", "schwer"],
        "allergens": [
            "Gluten", "Milch", "Eier", "Nüsse", "Soja",
            "Fisch", "Sellerie", "Senf"
        ]
    }
