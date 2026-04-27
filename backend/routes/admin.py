"""Admin routes - User management, data export/import"""
import os
import io
import json
import zipfile
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile
from starlette.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api")

# These will be set during init
db = None
get_current_user = None
User = None
ADMIN_EMAIL = ""


def init(database, auth_dep, user_model):
    """Initialize admin routes with shared dependencies"""
    global db, get_current_user, User, ADMIN_EMAIL
    db = database
    get_current_user = auth_dep
    User = user_model
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")


async def require_admin(user=Depends(lambda: None)):
    """Dynamically resolved admin dependency"""
    pass


# We need a factory pattern since Depends needs the function at import time
def get_router(database, auth_dep, user_model):
    """Create and return configured admin router"""
    _db = database
    _admin_email = os.environ.get("ADMIN_EMAIL", "")

    async def _require_admin(user=Depends(auth_dep)):
        if not _admin_email or user.email != _admin_email:
            raise HTTPException(status_code=403, detail="Kein Admin-Zugriff")
        return user

    admin_router = APIRouter(prefix="/api")

    @admin_router.get("/admin/users")
    async def admin_list_users(user=Depends(_require_admin)):
        users = await _db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
        result = []
        for u in users:
            uid = u["user_id"]
            recipe_count = await _db.recipes.count_documents({"user_id": uid})
            plan_count = await _db.meal_plans.count_documents({"user_id": uid})
            staple_count = await _db.staple_items.count_documents({"user_id": uid})
            result.append({**u, "recipe_count": recipe_count, "plan_count": plan_count, "staple_count": staple_count})
        return result

    @admin_router.get("/admin/users/{user_id}/data")
    async def admin_user_data(user_id: str, user=Depends(_require_admin)):
        target = await _db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if not target:
            raise HTTPException(status_code=404, detail="User nicht gefunden")
        recipes = await _db.recipes.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        plans = await _db.meal_plans.find({"user_id": user_id}, {"_id": 0}).to_list(200)
        staples = await _db.staple_items.find({"user_id": user_id}, {"_id": 0}).to_list(500)
        templates = await _db.meal_plan_templates.find({"user_id": user_id}, {"_id": 0}).to_list(100)
        subscriptions = await _db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
        return {
            "user": target, "recipes": recipes, "meal_plans": plans,
            "staple_items": staples, "templates": templates, "push_subscriptions": subscriptions,
        }

    @admin_router.get("/admin/export")
    async def admin_export(user=Depends(_require_admin)):
        collections = {
            "users": _db.users, "recipes": _db.recipes, "meal_plans": _db.meal_plans,
            "staple_items": _db.staple_items, "meal_plan_templates": _db.meal_plan_templates,
            "push_subscriptions": _db.push_subscriptions, "notification_settings": _db.notification_settings,
            "sessions": _db.sessions, "groups": _db.groups,
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, coll in collections.items():
                docs = await coll.find({}, {"_id": 0}).to_list(10000)
                if name == "users":
                    for d in docs:
                        d.pop("password_hash", None)
                zf.writestr(f"{name}.json", json.dumps(docs, ensure_ascii=False, indent=2, default=str))
            meta = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "exported_by": user.email,
                "collections": list(collections.keys()),
                "version": "1.0"
            }
            zf.writestr("_metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))
        buf.seek(0)
        filename = f"kochplaner_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        return StreamingResponse(buf, media_type="application/zip",
                                 headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    @admin_router.post("/admin/import")
    async def admin_import(mode: str = "merge", user=Depends(_require_admin)):
        return {"detail": "Bitte verwende den Upload-Endpunkt /api/admin/import-upload"}

    @admin_router.post("/admin/import-upload")
    async def admin_import_upload(file: UploadFile, mode: str = "merge", user=Depends(_require_admin)):
        content = await file.read()
        buf = io.BytesIO(content)
        if not zipfile.is_zipfile(buf):
            raise HTTPException(status_code=400, detail="Keine gültige ZIP-Datei")
        buf.seek(0)

        collection_map = {
            "users": _db.users, "recipes": _db.recipes, "meal_plans": _db.meal_plans,
            "staple_items": _db.staple_items, "meal_plan_templates": _db.meal_plan_templates,
            "push_subscriptions": _db.push_subscriptions, "notification_settings": _db.notification_settings,
            "sessions": _db.sessions, "groups": _db.groups,
        }
        id_fields = {
            "users": "user_id", "recipes": "recipe_id", "meal_plans": "plan_id",
            "staple_items": "item_id", "meal_plan_templates": "template_id",
            "push_subscriptions": "sub_id", "notification_settings": "user_id",
            "sessions": "session_id", "groups": "group_id",
        }
        stats = {}
        with zipfile.ZipFile(buf, "r") as zf:
            for name, coll in collection_map.items():
                fname = f"{name}.json"
                if fname not in zf.namelist():
                    continue
                data = json.loads(zf.read(fname))
                if not isinstance(data, list) or len(data) == 0:
                    stats[name] = {"skipped": True, "reason": "empty"}
                    continue
                if mode == "overwrite":
                    await coll.delete_many({})
                    await coll.insert_many(data)
                    stats[name] = {"imported": len(data), "mode": "overwrite"}
                else:
                    id_field = id_fields.get(name)
                    inserted = skipped = 0
                    for doc in data:
                        if id_field and doc.get(id_field):
                            existing = await coll.find_one({id_field: doc[id_field]})
                            if existing:
                                skipped += 1
                                continue
                        await coll.insert_one(doc)
                        inserted += 1
                    stats[name] = {"inserted": inserted, "skipped": skipped, "mode": "merge"}
        return {"message": "Import abgeschlossen", "stats": stats}

    return admin_router
