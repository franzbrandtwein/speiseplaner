"""Auth endpoints: register, login, session exchange, me, logout"""
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Depends

from core import db, get_current_user, hash_password, verify_password, _is_secure_request
from models import User, UserSession, RegisterRequest, LoginRequest

router = APIRouter(prefix="/api")


@router.post("/auth/register")
async def register(data: RegisterRequest, request: Request, response: Response):
    """Register a new user with email/password"""
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email bereits registriert")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    password_hash = hash_password(data.password)

    user = User(user_id=user_id, email=data.email, name=data.name, picture=None)
    user_doc = user.model_dump()
    user_doc['created_at'] = user_doc['created_at'].isoformat()
    user_doc['password_hash'] = password_hash
    await db.users.insert_one(user_doc)

    session_token = f"token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session = UserSession(user_id=user_id, session_token=session_token, expires_at=expires_at)
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)

    is_secure = _is_secure_request(request)
    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=is_secure,
        samesite="none" if is_secure else "lax", path="/", max_age=7 * 24 * 60 * 60,
    )
    return {"user_id": user_id, "email": data.email, "name": data.name}


@router.post("/auth/login")
async def login(data: LoginRequest, request: Request, response: Response):
    """Login with email/password"""
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user_doc or not user_doc.get('password_hash'):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    if not verify_password(data.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")

    session_token = f"token_{uuid.uuid4().hex}"
    session_days = 90 if data.remember_me else 7
    expires_at = datetime.now(timezone.utc) + timedelta(days=session_days)
    session = UserSession(user_id=user_doc['user_id'], session_token=session_token, expires_at=expires_at)
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)

    is_secure = _is_secure_request(request)
    cookie_max_age = session_days * 24 * 60 * 60 if data.remember_me else None
    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=is_secure,
        samesite="none" if is_secure else "lax", path="/", max_age=cookie_max_age,
    )
    return {
        "user_id": user_doc['user_id'], "email": user_doc['email'],
        "name": user_doc['name'], "picture": user_doc.get('picture'),
    }


@router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id from Emergent Auth for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient() as client_http:
        auth_response = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    auth_data = auth_response.json()

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": auth_data["name"], "picture": auth_data.get("picture")}}
        )
    else:
        new_user = User(
            user_id=user_id, email=auth_data["email"],
            name=auth_data["name"], picture=auth_data.get("picture"),
        )
        user_doc = new_user.model_dump()
        user_doc['created_at'] = user_doc['created_at'].isoformat()
        await db.users.insert_one(user_doc)

    session_token = auth_data.get("session_token", f"token_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session = UserSession(user_id=user_id, session_token=session_token, expires_at=expires_at)
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)

    is_secure = _is_secure_request(request)
    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=is_secure,
        samesite="none" if is_secure else "lax", path="/", max_age=7 * 24 * 60 * 60,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user_doc


@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}
