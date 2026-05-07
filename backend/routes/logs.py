"""Anwendungsprotokoll – lesen und schreiben von App-Log-Einträgen.

Endpunkte:
  GET  /api/logs              – neueste Einträge (gefiltert nach source/level)
  DELETE /api/logs            – alle eigenen Einträge löschen (Admin-only)

Interne Hilfsfunktion write_log() wird von anderen Modulen importiert.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from core import db, get_current_user
from models import AppLog, User

router = APIRouter(prefix="/api")


async def write_log(
    source: str,
    message: str,
    level: str = "info",
    details: Optional[dict] = None,
    user_id: Optional[str] = None,
) -> None:
    """Schreibt einen Eintrag in die app_logs-Collection. Wirft keine Exceptions."""
    try:
        entry = AppLog(
            source=source,
            level=level,
            message=message,
            details=details or {},
            user_id=user_id,
        )
        await db.app_logs.insert_one(entry.model_dump())
    except Exception:
        pass  # Logging darf den Hauptfluss nie blockieren


@router.get("/logs")
async def get_logs(
    source: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    user: User = Depends(get_current_user),
):
    """Gibt die neuesten Log-Einträge zurück, optional gefiltert."""
    query: dict = {}
    if source:
        query["source"] = source
    if level:
        query["level"] = level

    entries = (
        await db.app_logs.find(query, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(limit)
    )
    return entries


@router.delete("/logs")
async def clear_logs(
    source: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
):
    """Löscht Log-Einträge (optional nach source gefiltert)."""
    query: dict = {}
    if source:
        query["source"] = source
    result = await db.app_logs.delete_many(query)
    return {"deleted": result.deleted_count}
