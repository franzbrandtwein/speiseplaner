"""Push notifications: subscriptions, preferences, scheduler"""
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Depends

from core import (
    db, get_current_user, send_push_to_user,
    VAPID_PUBLIC_KEY, WEEKDAY_MAP, WEEKDAY_LABELS, MEAL_LABELS,
)
from models import User, PushSubscriptionData, NotificationPrefs

logger = logging.getLogger("kochplaner.notifications")
router = APIRouter(prefix="/api")


# ============ ENDPOINTS ============

@router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    return {"public_key": VAPID_PUBLIC_KEY or ""}


@router.post("/notifications/subscribe")
async def subscribe_push(data: PushSubscriptionData, user: User = Depends(get_current_user)):
    existing = await db.push_subscriptions.find_one(
        {"user_id": user.user_id, "endpoint": data.endpoint}, {"_id": 0}
    )
    if existing:
        await db.push_subscriptions.update_one(
            {"subscription_id": existing["subscription_id"]},
            {"$set": {"keys": data.keys, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Subscription aktualisiert", "subscription_id": existing["subscription_id"]}

    sub_id = f"pushsub_{uuid.uuid4().hex[:12]}"
    await db.push_subscriptions.insert_one({
        "subscription_id": sub_id, "user_id": user.user_id,
        "endpoint": data.endpoint, "keys": data.keys,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    prefs = await db.notification_prefs.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prefs:
        await db.notification_prefs.insert_one({
            "user_id": user.user_id,
            "meal_reminder": True, "meal_reminder_time": "08:00",
            "shopping_reminder": True, "shopping_reminder_day": "sonntag", "shopping_reminder_time": "10:00",
            "empty_plan_reminder": True, "empty_plan_reminder_time": "18:00",
            "new_meal_notification": True
        })
    return {"message": "Push-Benachrichtigungen aktiviert", "subscription_id": sub_id}


@router.delete("/notifications/unsubscribe")
async def unsubscribe_push(request: Request, user: User = Depends(get_current_user)):
    body = await request.json()
    endpoint = body.get("endpoint")
    if endpoint:
        await db.push_subscriptions.delete_many({"user_id": user.user_id, "endpoint": endpoint})
    else:
        await db.push_subscriptions.delete_many({"user_id": user.user_id})
    return {"message": "Push-Benachrichtigungen deaktiviert"}


@router.get("/notifications/preferences")
async def get_notification_prefs(user: User = Depends(get_current_user)):
    prefs = await db.notification_prefs.find_one({"user_id": user.user_id}, {"_id": 0})
    if not prefs:
        return {
            "meal_reminder": True, "meal_reminder_time": "08:00",
            "shopping_reminder": True, "shopping_reminder_day": "sonntag", "shopping_reminder_time": "10:00",
            "empty_plan_reminder": True, "empty_plan_reminder_time": "18:00",
            "new_meal_notification": True
        }
    prefs.pop("user_id", None)
    return prefs


@router.put("/notifications/preferences")
async def update_notification_prefs(data: NotificationPrefs, user: User = Depends(get_current_user)):
    prefs_data = data.model_dump()
    prefs_data["user_id"] = user.user_id
    await db.notification_prefs.update_one(
        {"user_id": user.user_id}, {"$set": prefs_data}, upsert=True
    )
    return {"message": "Einstellungen gespeichert"}


@router.post("/notifications/test")
async def send_test_notification(user: User = Depends(get_current_user)):
    sent = await send_push_to_user(user.user_id, "Kochplaner", "Push-Benachrichtigungen funktionieren!", "/meal-planner", "test")
    if sent == 0:
        raise HTTPException(status_code=400, detail="Keine aktiven Push-Subscriptions gefunden")
    return {"message": "Test-Benachrichtigung gesendet", "sent": sent}


@router.get("/notifications/status")
async def get_notification_status(user: User = Depends(get_current_user)):
    count = await db.push_subscriptions.count_documents({"user_id": user.user_id})
    prefs = await db.notification_prefs.find_one({"user_id": user.user_id}, {"_id": 0})
    if prefs:
        prefs.pop("user_id", None)
    return {
        "subscribed": count > 0,
        "subscription_count": count,
        "preferences": prefs or {
            "meal_reminder": True, "meal_reminder_time": "08:00",
            "shopping_reminder": True, "shopping_reminder_day": "sonntag", "shopping_reminder_time": "10:00",
            "empty_plan_reminder": True, "empty_plan_reminder_time": "18:00",
            "new_meal_notification": True
        }
    }


# ============ SCHEDULER ============

def get_week_start_for_date(dt):
    monday = dt - timedelta(days=dt.weekday())
    return monday.strftime("%Y-%m-%d")


async def check_scheduled_notifications():
    berlin_tz = ZoneInfo("Europe/Berlin")
    local_now = datetime.now(berlin_tz)
    current_time = local_now.strftime("%H:%M")
    current_weekday = WEEKDAY_MAP[local_now.weekday()]
    today_str = local_now.strftime("%Y-%m-%d")
    tomorrow = local_now + timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")
    week_start = get_week_start_for_date(local_now)

    active_user_ids = await db.push_subscriptions.distinct("user_id")
    for user_id in active_user_ids:
        prefs = await db.notification_prefs.find_one({"user_id": user_id}, {"_id": 0})
        if not prefs:
            continue

        # Daily meal reminder
        if prefs.get("meal_reminder") and current_time == prefs.get("meal_reminder_time", "08:00"):
            log_key = f"{user_id}:meal_reminder:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
                group_id = user_doc.get("group_id") if user_doc else None
                query = {"group_id": group_id, "week_start": week_start} if group_id else {
                    "user_id": user_id, "group_id": None, "week_start": week_start
                }
                plan = await db.meal_plans.find_one(query, {"_id": 0})
                if plan:
                    day = next((d for d in plan.get("days", []) if d.get("date") == today_str), None)
                    if day:
                        meals = []
                        for mt, label in MEAL_LABELS.items():
                            slot = day.get(mt, [])
                            if isinstance(slot, dict):
                                slot = [slot] if slot.get("recipe_id") else []
                            elif slot is None:
                                slot = []
                            names = [m["recipe_name"] for m in slot if m.get("recipe_name")]
                            if names:
                                meals.append(f"{label}: {', '.join(names)}")
                        if meals:
                            body = "\n".join(meals)
                            await send_push_to_user(
                                user_id, f"Heute auf dem Plan ({WEEKDAY_LABELS[local_now.weekday()]})",
                                body, "/meal-planner", "meal_reminder"
                            )
                await db.notification_log.insert_one({"key": log_key, "sent_at": datetime.now(timezone.utc).isoformat()})

        # Shopping reminder
        if prefs.get("shopping_reminder") and current_weekday == prefs.get("shopping_reminder_day", "sonntag") and current_time == prefs.get("shopping_reminder_time", "10:00"):
            log_key = f"{user_id}:shopping_reminder:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                await send_push_to_user(
                    user_id, "Einkaufsliste",
                    "Vergiss nicht, die Einkaufsliste für diese Woche zu prüfen!",
                    "/shopping-list", "shopping_reminder"
                )
                await db.notification_log.insert_one({"key": log_key, "sent_at": datetime.now(timezone.utc).isoformat()})

        # Empty plan reminder
        if prefs.get("empty_plan_reminder") and current_time == prefs.get("empty_plan_reminder_time", "18:00"):
            log_key = f"{user_id}:empty_plan:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
                group_id = user_doc.get("group_id") if user_doc else None
                tom_week_start = get_week_start_for_date(tomorrow)
                query = {"group_id": group_id, "week_start": tom_week_start} if group_id else {
                    "user_id": user_id, "group_id": None, "week_start": tom_week_start
                }
                plan = await db.meal_plans.find_one(query, {"_id": 0})
                day = None
                if plan:
                    day = next((d for d in plan.get("days", []) if d.get("date") == tomorrow_str), None)
                empty_slots = []
                if not day:
                    empty_slots = list(MEAL_LABELS.values())
                else:
                    for mt, label in MEAL_LABELS.items():
                        slot = day.get(mt, [])
                        if isinstance(slot, dict):
                            slot = [slot] if slot.get("recipe_id") else []
                        elif slot is None:
                            slot = []
                        if not slot:
                            empty_slots.append(label)
                if empty_slots:
                    body = f"Morgen ({WEEKDAY_LABELS[tomorrow.weekday()]}) fehlt noch: {', '.join(empty_slots)}"
                    await send_push_to_user(user_id, "Speiseplan unvollständig", body, "/meal-planner", "empty_plan")
                await db.notification_log.insert_one({"key": log_key, "sent_at": datetime.now(timezone.utc).isoformat()})

    # Cleanup old log entries (older than 3 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    await db.notification_log.delete_many({"sent_at": {"$lt": cutoff}})


async def notification_scheduler_loop():
    while True:
        try:
            await check_scheduled_notifications()
        except Exception as e:
            logger.error(f"Notification scheduler error: {e}")
        await asyncio.sleep(60)
