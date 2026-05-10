"""Meal plan endpoints: plans, templates, copy, nutrition tracking"""
import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request, Depends

from core import db, get_current_user, send_push_to_user, WEEKDAY_LABELS, MEAL_LABELS
from models import User, MealPlan, MealPlanUpdate, DayPlan, TemplateCreate, DEFAULT_MEAL_TYPES

logger = logging.getLogger("kochplaner.mealplans")
router = APIRouter(prefix="/api")


async def _get_group_meal_types(group_id: str | None) -> list[dict]:
    """Gibt die konfigurierten Mahlzeiten-Typen einer Gruppe zurück (Fallback: Standard)."""
    if not group_id:
        return DEFAULT_MEAL_TYPES
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0, "meal_types": 1})
    if group and group.get("meal_types"):
        return group["meal_types"]
    return DEFAULT_MEAL_TYPES


@router.get("/mealplans")
async def get_meal_plan(week_start: str, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        plan = await db.meal_plans.find_one({"group_id": group_id, "week_start": week_start}, {"_id": 0})
    else:
        plan = await db.meal_plans.find_one(
            {"user_id": user.user_id, "group_id": None, "week_start": week_start}, {"_id": 0}
        )

    if not plan:
        days = []
        start_date = datetime.fromisoformat(week_start)
        meal_types = await _get_group_meal_types(group_id)
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            day = {"date": day_date.strftime("%Y-%m-%d")}
            for mt in meal_types:
                day[mt["key"]] = []
            days.append(day)
        return {
            "plan_id": None, "user_id": user.user_id, "group_id": group_id,
            "week_start": week_start, "days": days,
            "is_group_plan": group_id is not None
        }

    # Normalize: migrate old single-meal format to multi-meal arrays
    for day in plan.get("days", []):
        for mt in ["breakfast", "lunch", "dinner"]:
            meal = day.get(mt)
            if meal is None:
                day[mt] = []
            elif isinstance(meal, dict):
                if "side_dishes" not in meal:
                    meal["side_dishes"] = []
                if "assigned_to" not in meal:
                    meal["assigned_to"] = []
                day[mt] = [meal] if meal.get("recipe_id") else []
            elif isinstance(meal, list):
                for m in meal:
                    if isinstance(m, dict):
                        if "side_dishes" not in m:
                            m["side_dishes"] = []
                        if "assigned_to" not in m:
                            m["assigned_to"] = []

    plan["is_group_plan"] = plan.get("group_id") is not None
    return plan


@router.post("/mealplans")
async def save_meal_plan(plan_data: MealPlanUpdate, request: Request, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        existing = await db.meal_plans.find_one(
            {"group_id": group_id, "week_start": plan_data.week_start}, {"_id": 0}
        )
    else:
        existing = await db.meal_plans.find_one(
            {"user_id": user.user_id, "group_id": None, "week_start": plan_data.week_start}, {"_id": 0}
        )

    new_meals = []
    old_days = {d["date"]: d for d in (existing or {}).get("days", [])} if existing else {}
    meal_types = await _get_group_meal_types(group_id)
    meal_keys = [mt["key"] for mt in meal_types]
    meal_label_map = {mt["key"]: mt["label"] for mt in meal_types}
    for new_day in plan_data.days:
        new_day_dict = new_day.model_dump()
        old_day = old_days.get(new_day.date, {})
        for mt_key in meal_keys:
            new_meals_list = new_day_dict.get(mt_key, []) or []
            old_meals_raw = old_day.get(mt_key, [])
            if isinstance(old_meals_raw, dict):
                old_meals_raw = [old_meals_raw] if old_meals_raw.get("recipe_id") else []
            elif old_meals_raw is None:
                old_meals_raw = []
            old_rids = {m.get("recipe_id") for m in old_meals_raw if isinstance(m, dict) and m.get("recipe_id")}
            for new_meal in new_meals_list:
                if isinstance(new_meal, dict):
                    rid = new_meal.get("recipe_id")
                    rname = new_meal.get("recipe_name") or "Neues Gericht"
                else:
                    rid = getattr(new_meal, "recipe_id", None)
                    rname = getattr(new_meal, "recipe_name", None) or "Neues Gericht"
                if rid and rid not in old_rids:
                    new_meals.append((new_day.date, mt_key, rname))

    if existing:
        await db.meal_plans.update_one(
            {"plan_id": existing["plan_id"]},
            {"$set": {
                "days": [d.model_dump() for d in plan_data.days],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        plan_id = existing["plan_id"]
    else:
        plan = MealPlan(
            user_id=user.user_id, group_id=group_id,
            week_start=plan_data.week_start, days=plan_data.days,
        )
        plan_doc = plan.model_dump()
        plan_doc['created_at'] = plan_doc['created_at'].isoformat()
        plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
        await db.meal_plans.insert_one(plan_doc)
        plan_id = plan.plan_id

    if new_meals:
        prefs = await db.notification_prefs.find_one({"user_id": user.user_id}, {"_id": 0})
        if prefs and prefs.get("new_meal_notification", True):
            for date_str, meal_type, recipe_name in new_meals:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    day_label = WEEKDAY_LABELS.get(dt.weekday(), date_str)
                except Exception:
                    day_label = date_str
                meal_label = meal_label_map.get(meal_type, MEAL_LABELS.get(meal_type, meal_type))
                body = f"{recipe_name} – {day_label}, {meal_label}"
                await send_push_to_user(user.user_id, "Neues Gericht im Speiseplan", body, "/meal-planner", "new_meal")

            if group_id:
                group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
                if group:
                    for member_id in group.get("member_ids", []):
                        if member_id == user.user_id:
                            continue
                        m_prefs = await db.notification_prefs.find_one({"user_id": member_id}, {"_id": 0})
                        if m_prefs and m_prefs.get("new_meal_notification", True):
                            for date_str, meal_type, recipe_name in new_meals:
                                try:
                                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                                    day_label = WEEKDAY_LABELS.get(dt.weekday(), date_str)
                                except Exception:
                                    day_label = date_str
                                meal_label = meal_label_map.get(meal_type, MEAL_LABELS.get(meal_type, meal_type))
                                body = f"{user.name} hat hinzugefügt: {recipe_name} – {day_label}, {meal_label}"
                                await send_push_to_user(member_id, "Speiseplan aktualisiert", body, "/meal-planner", "new_meal")

    msg = "Speiseplan aktualisiert" if existing else "Speiseplan erstellt"
    return {"message": msg, "plan_id": plan_id}


# ============ TEMPLATES ============

@router.get("/mealplan-templates")
async def list_templates(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    query = {"group_id": group_id} if group_id else {"user_id": user.user_id, "group_id": None}
    templates = await db.meal_plan_templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return templates


@router.post("/mealplan-templates")
async def save_template(data: TemplateCreate, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        plan = await db.meal_plans.find_one({"group_id": group_id, "week_start": data.week_start}, {"_id": 0})
    else:
        plan = await db.meal_plans.find_one(
            {"user_id": user.user_id, "group_id": None, "week_start": data.week_start}, {"_id": 0}
        )

    if not plan or not plan.get("days"):
        raise HTTPException(status_code=400, detail="Kein Speiseplan für diese Woche vorhanden")

    template_days = []
    for i, day in enumerate(plan["days"]):
        template_days.append({
            "day_index": i,
            "breakfast": day.get("breakfast", []),
            "lunch": day.get("lunch", []),
            "dinner": day.get("dinner", [])
        })

    template_id = f"tmpl_{uuid.uuid4().hex[:12]}"
    template = {
        "template_id": template_id, "user_id": user.user_id, "group_id": group_id,
        "name": data.name, "days": template_days,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.meal_plan_templates.insert_one(template)
    return {"template_id": template_id, "message": "Vorlage gespeichert"}


@router.post("/mealplan-templates/{template_id}/apply")
async def apply_template(template_id: str, week_start: str, user: User = Depends(get_current_user)):
    template = await db.meal_plan_templates.find_one({"template_id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    start_date = datetime.fromisoformat(week_start)

    days = []
    for td in template["days"]:
        day_date = start_date + timedelta(days=td["day_index"])
        days.append({
            "date": day_date.strftime("%Y-%m-%d"),
            "breakfast": td.get("breakfast", []),
            "lunch": td.get("lunch", []),
            "dinner": td.get("dinner", [])
        })

    query = {"group_id": group_id, "week_start": week_start} if group_id else {
        "user_id": user.user_id, "group_id": None, "week_start": week_start
    }
    existing = await db.meal_plans.find_one(query, {"_id": 0})

    if existing:
        await db.meal_plans.update_one(
            {"plan_id": existing["plan_id"]},
            {"$set": {"days": days, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        plan = MealPlan(
            user_id=user.user_id, group_id=group_id,
            week_start=week_start, days=[DayPlan(**d) for d in days],
        )
        plan_doc = plan.model_dump()
        plan_doc['created_at'] = plan_doc['created_at'].isoformat()
        plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
        await db.meal_plans.insert_one(plan_doc)

    return {"message": "Vorlage angewendet"}


@router.delete("/mealplan-templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(get_current_user)):
    result = await db.meal_plan_templates.delete_one({"template_id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vorlage nicht gefunden")
    return {"message": "Vorlage gelöscht"}


@router.post("/mealplans/copy")
async def copy_week(source_week: str, target_week: str, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    query = {"group_id": group_id, "week_start": source_week} if group_id else {
        "user_id": user.user_id, "group_id": None, "week_start": source_week
    }
    source = await db.meal_plans.find_one(query, {"_id": 0})
    if not source or not source.get("days"):
        raise HTTPException(status_code=400, detail="Kein Speiseplan in der Quellwoche")

    start_date = datetime.fromisoformat(target_week)
    days = []
    for i, day in enumerate(source["days"]):
        day_date = start_date + timedelta(days=i)
        days.append({
            "date": day_date.strftime("%Y-%m-%d"),
            "breakfast": day.get("breakfast", []),
            "lunch": day.get("lunch", []),
            "dinner": day.get("dinner", [])
        })

    target_query = {"group_id": group_id, "week_start": target_week} if group_id else {
        "user_id": user.user_id, "group_id": None, "week_start": target_week
    }
    existing = await db.meal_plans.find_one(target_query, {"_id": 0})

    if existing:
        await db.meal_plans.update_one(
            {"plan_id": existing["plan_id"]},
            {"$set": {"days": days, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        plan = MealPlan(
            user_id=user.user_id, group_id=group_id,
            week_start=target_week, days=[DayPlan(**d) for d in days],
        )
        plan_doc = plan.model_dump()
        plan_doc['created_at'] = plan_doc['created_at'].isoformat()
        plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
        await db.meal_plans.insert_one(plan_doc)

    return {"message": "Wochenplan kopiert"}


# ============ NUTRITION TRACKING ============

@router.get("/nutrition/daily")
async def get_daily_nutrition(date: str, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    dt = datetime.fromisoformat(date)
    week_start = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")

    query = {"group_id": group_id, "week_start": week_start} if group_id else {
        "user_id": user.user_id, "group_id": None, "week_start": week_start
    }
    plan = await db.meal_plans.find_one(query, {"_id": 0})

    if not plan:
        return {"date": date, "meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0}}

    day = next((d for d in plan.get("days", []) if d.get("date") == date), None)
    if not day:
        return {"date": date, "meals": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0}}

    recipe_ids = set()
    for mt in ["breakfast", "lunch", "dinner"]:
        meals = day.get(mt, [])
        if isinstance(meals, dict):
            meals = [meals] if meals.get("recipe_id") else []
        for m in meals:
            if m.get("recipe_id"):
                recipe_ids.add(m["recipe_id"])
                for sd in m.get("side_dishes", []):
                    if sd.get("recipe_id"):
                        recipe_ids.add(sd["recipe_id"])

    recipes_map = {}
    if recipe_ids:
        recipes = await db.recipes.find({"recipe_id": {"$in": list(recipe_ids)}}, {"_id": 0}).to_list(100)
        recipes_map = {r["recipe_id"]: r for r in recipes}

    totals = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0}
    meal_details = []

    for mt in ["breakfast", "lunch", "dinner"]:
        meals = day.get(mt, [])
        if isinstance(meals, dict):
            meals = [meals] if meals.get("recipe_id") else []
        for m in meals:
            if not m.get("recipe_id"):
                continue
            recipe = recipes_map.get(m["recipe_id"], {})
            nutr = recipe.get("nutrition") or {}
            recipe_portions = recipe.get("portions", 1) or 1
            meal_portions = m.get("portions", 2)
            factor = meal_portions / recipe_portions

            entry = {
                "meal_type": mt,
                "recipe_name": m.get("recipe_name", ""),
                "portions": meal_portions,
                "calories": round((nutr.get("calories") or 0) * factor),
                "protein": round((nutr.get("protein") or 0) * factor, 1),
                "carbs": round((nutr.get("carbs") or 0) * factor, 1),
                "fat": round((nutr.get("fat") or 0) * factor, 1),
                "fiber": round((nutr.get("fiber") or 0) * factor, 1),
            }
            meal_details.append(entry)
            for k in totals:
                totals[k] += entry[k]

            for sd in m.get("side_dishes", []):
                if not sd.get("recipe_id"):
                    continue
                sd_recipe = recipes_map.get(sd["recipe_id"], {})
                sd_nutr = sd_recipe.get("nutrition") or {}
                sd_base = sd_recipe.get("portions", 1) or 1
                sd_factor = sd.get("portions", 2) / sd_base
                sd_entry = {
                    "meal_type": mt,
                    "recipe_name": sd.get("recipe_name", ""),
                    "portions": sd.get("portions", 2),
                    "calories": round((sd_nutr.get("calories") or 0) * sd_factor),
                    "protein": round((sd_nutr.get("protein") or 0) * sd_factor, 1),
                    "carbs": round((sd_nutr.get("carbs") or 0) * sd_factor, 1),
                    "fat": round((sd_nutr.get("fat") or 0) * sd_factor, 1),
                    "fiber": round((sd_nutr.get("fiber") or 0) * sd_factor, 1),
                }
                meal_details.append(sd_entry)
                for k in totals:
                    totals[k] += sd_entry[k]

    totals = {k: round(v, 1) for k, v in totals.items()}
    return {"date": date, "meals": meal_details, "totals": totals}
