"""Kochplaner FastAPI app entrypoint - thin orchestration layer"""
import asyncio
import os
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core import client, logger
from routes.auth import router as auth_router
from routes.recipes import router as recipes_router
from routes.mealplans import router as mealplans_router
from routes.shopping import router as shopping_router
from routes.pantry import router as pantry_router
from routes.sources import router as sources_router
from routes.ingredients import router as ingredients_router
from routes.groups import router as groups_router
from routes.notifications import router as notifications_router, notification_scheduler_loop
from routes.admin import get_router as get_admin_router
from routes.menus import router as menus_router
from routes.logs import router as logs_router
from core import db, get_current_user
from models import User

app = FastAPI()

# CORS: allow_origins=["*"] + allow_credentials=True is rejected by browsers.
# Use explicit origins from FRONTEND_URL env var plus common dev origins.
_frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_extra_origins = [o.strip() for o in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",") if o.strip()]
_cors_origins = list({
    _frontend_url,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *_extra_origins,
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount feature routers
app.include_router(auth_router)
app.include_router(recipes_router)
app.include_router(mealplans_router)
app.include_router(shopping_router)
app.include_router(pantry_router)
app.include_router(sources_router)
app.include_router(ingredients_router)
app.include_router(groups_router)
app.include_router(notifications_router)
app.include_router(menus_router)
app.include_router(logs_router)
app.include_router(get_admin_router(db, get_current_user, User))

# Root endpoint
root_router = APIRouter(prefix="/api")


@root_router.get("/")
async def root():
    return {"message": "Rezept & Speiseplan API"}


app.include_router(root_router)


@app.on_event("startup")
async def start_notification_scheduler():
    asyncio.create_task(notification_scheduler_loop())
    logger.info("Kochplaner backend started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
