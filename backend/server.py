from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, File, UploadFile, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
import httpx
import hashlib
import secrets
import json
import re
from datetime import datetime, timezone, timedelta
from pywebpush import webpush, WebPushException
from zoneinfo import ZoneInfo
import asyncio
import requests as sync_requests

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
import configparser

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============ LOCAL FILE STORAGE ============
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", ROOT_DIR / "uploads"))
UPLOAD_DIR.mkdir(exist_ok=True, parents=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Store file locally"""
    file_path = UPLOAD_DIR / path
    file_path.parent.mkdir(exist_ok=True, parents=True)
    file_path.write_bytes(data)
    return {"path": f"/api/uploads/{path}", "size": len(data)}

def get_object(path: str):
    """Retrieve file from local storage"""
    file_path = UPLOAD_DIR / path
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    data = file_path.read_bytes()
    # Determine content type from extension
    ext = file_path.suffix.lower()
    content_type_map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.webp': 'image/webp',
        '.gif': 'image/gif'
    }
    content_type = content_type_map.get(ext, 'application/octet-stream')
    return data, content_type

# SMTP Config laden
SMTP_CONFIG_PATH = Path("/etc/speisenplaner/smtp.conf")
smtp_config = {}
if SMTP_CONFIG_PATH.exists():
    config = configparser.ConfigParser()
    config.read(SMTP_CONFIG_PATH)
    if 'smtp' in config:
        smtp_config = dict(config['smtp'])

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# CORS - muss direkt nach App-Erstellung kommen
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.178.24:3000",
        os.environ.get("FRONTEND_URL", "http://localhost:3000")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============ MODELS ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    group_id: Optional[str] = None  # Gruppen-Zugehörigkeit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str = Field(default_factory=lambda: f"sess_{uuid.uuid4().hex[:16]}")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Ingredient(BaseModel):
    name: str
    amount: str
    unit: str

class NutritionInfo(BaseModel):
    calories: Optional[int] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None

class Recipe(BaseModel):
    model_config = ConfigDict(extra="ignore")
    recipe_id: str = Field(default_factory=lambda: f"recipe_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    description: Optional[str] = None
    ingredients: List[Ingredient] = []
    instructions: List[str] = []
    portions: int = 4
    prep_time: Optional[int] = None  # in minutes
    cook_time: Optional[int] = None  # in minutes
    difficulty: str = "mittel"  # leicht, mittel, schwer
    category: str = "Hauptgericht"
    image_url: Optional[str] = None
    images: List[str] = []  # storage paths for gallery
    nutrition: Optional[NutritionInfo] = None
    allergens: List[str] = []
    cost_per_portion: Optional[float] = None
    side_dishes: List[str] = []  # list of recipe_ids
    shared_with_group: bool = False  # Mit Gruppe teilen
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    ingredients: List[Ingredient] = []
    instructions: List[str] = []
    portions: int = 4
    prep_time: Optional[int] = None
    cook_time: Optional[int] = None
    difficulty: str = "mittel"
    category: str = "Hauptgericht"
    image_url: Optional[str] = None
    nutrition: Optional[NutritionInfo] = None
    allergens: List[str] = []
    cost_per_portion: Optional[float] = None
    side_dishes: List[str] = []  # list of recipe_ids
    shared_with_group: bool = False

class Rating(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rating_id: str = Field(default_factory=lambda: f"rating_{uuid.uuid4().hex[:12]}")
    recipe_id: str
    user_id: str
    user_name: str
    stars: int = Field(ge=1, le=5)
    text: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RatingCreate(BaseModel):
    stars: int = Field(ge=1, le=5)
    text: Optional[str] = None

class SideDishEntry(BaseModel):
    recipe_id: str
    recipe_name: str
    portions: int = 2

class MealSlot(BaseModel):
    recipe_id: Optional[str] = None
    recipe_name: Optional[str] = None
    portions: int = 2
    side_dishes: List[SideDishEntry] = []
    assigned_to: List[str] = []  # Optional: member names

class DayPlan(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    breakfast: List[MealSlot] = []
    lunch: List[MealSlot] = []
    dinner: List[MealSlot] = []

class MealPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    plan_id: str = Field(default_factory=lambda: f"plan_{uuid.uuid4().hex[:12]}")
    user_id: str
    group_id: Optional[str] = None  # Für geteilten Gruppenplan
    week_start: str  # ISO date YYYY-MM-DD (Monday)
    days: List[DayPlan] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MealPlanUpdate(BaseModel):
    week_start: str
    days: List[DayPlan]

class ShoppingListItem(BaseModel):
    ingredient_name: str
    total_amount: str
    unit: str
    checked: bool = False

class ShoppingList(BaseModel):
    model_config = ConfigDict(extra="ignore")
    list_id: str = Field(default_factory=lambda: f"list_{uuid.uuid4().hex[:12]}")
    user_id: str
    week_start: str
    items: List[ShoppingListItem] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============ GRUPPEN MODELS ============

class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    group_id: str = Field(default_factory=lambda: f"group_{uuid.uuid4().hex[:12]}")
    name: str
    owner_id: str
    member_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GroupCreate(BaseModel):
    name: str

class Invitation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    invitation_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    group_id: str
    inviter_id: str
    invitee_email: str
    token: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    status: str = "pending"  # pending, accepted, declined, expired
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7))

class InvitationCreate(BaseModel):
    email: EmailStr

# ============ EMAIL SERVICE ============

def send_invitation_email(recipient_email: str, inviter_name: str, group_name: str, invitation_token: str, base_url: str) -> bool:
    """Send invitation email via SMTP"""
    if not smtp_config:
        logger.warning("SMTP nicht konfiguriert - Einladung kann nicht per Email gesendet werden")
        return False
    
    try:
        # Email erstellen
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{smtp_config.get('sender_name', 'Speisenplaner')} <{smtp_config.get('sender_email', smtp_config.get('username'))}>"
        msg["To"] = recipient_email
        msg["Subject"] = f"Einladung zur Gruppe '{group_name}' im Speisenplaner"
        
        invitation_url = f"{base_url}/invite/{invitation_token}"
        
        text_content = f"""
Hallo,

{inviter_name} hat dich eingeladen, der Gruppe "{group_name}" im Speisenplaner beizutreten.

Klicke auf den folgenden Link, um die Einladung anzunehmen:
{invitation_url}

Die Einladung ist 7 Tage gültig.

Viele Grüße,
Dein Speisenplaner Team
        """
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; }}
        .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
        h1 {{ color: #10B981; font-family: 'Playfair Display', serif; margin-bottom: 20px; }}
        p {{ color: #4B5563; line-height: 1.6; }}
        .button {{ display: inline-block; background: #10B981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: 600; margin: 20px 0; }}
        .button:hover {{ background: #059669; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9CA3AF; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🍳 Du wurdest eingeladen!</h1>
        <p><strong>{inviter_name}</strong> hat dich eingeladen, der Gruppe <strong>"{group_name}"</strong> im Speisenplaner beizutreten.</p>
        <p>Als Gruppenmitglied könnt ihr gemeinsam:</p>
        <ul style="color: #4B5563;">
            <li>Rezepte teilen</li>
            <li>Einen gemeinsamen Speiseplan führen</li>
            <li>Einkaufslisten zusammen verwalten</li>
        </ul>
        <a href="{invitation_url}" class="button">Einladung annehmen</a>
        <div class="footer">
            <p>Die Einladung ist 7 Tage gültig.</p>
            <p>Falls du diese Einladung nicht erwartet hast, kannst du diese Email ignorieren.</p>
        </div>
    </div>
</body>
</html>
        """
        
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))
        
        # SMTP-Verbindung
        server = smtplib.SMTP(smtp_config.get('server'), int(smtp_config.get('port', 587)))
        server.starttls()
        server.login(smtp_config.get('username'), smtp_config.get('password'))
        server.sendmail(smtp_config.get('username'), recipient_email, msg.as_string())
        server.quit()
        
        logger.info(f"Einladungs-Email an {recipient_email} gesendet")
        return True
        
    except Exception as e:
        logger.error(f"Fehler beim Senden der Email: {str(e)}")
        return False

# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    """Hash password with salt"""
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hashed.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash"""
    try:
        salt, hashed = stored_hash.split(':')
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return new_hash.hex() == hashed
    except:
        return False

# Auth Models
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

async def get_current_user(request: Request) -> User:
    """Extract and validate user from session token"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user_doc)

# ============ AUTH ENDPOINTS ============

# Local self-hosted mode only
IS_EMERGENT = False

def _is_secure_request(request: Request) -> bool:
    """Detect if request came via HTTPS (direct or behind reverse proxy)"""
    if request.url.scheme == "https":
        return True
    if request.headers.get("x-forwarded-proto") == "https":
        return True
    return False

@api_router.post("/auth/register")
async def register(data: RegisterRequest, request: Request, response: Response):
    """Register a new user with email/password"""
    # Check if user exists
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email bereits registriert")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    password_hash = hash_password(data.password)
    
    user = User(
        user_id=user_id,
        email=data.email,
        name=data.name,
        picture=None
    )
    user_doc = user.model_dump()
    user_doc['created_at'] = user_doc['created_at'].isoformat()
    user_doc['password_hash'] = password_hash
    await db.users.insert_one(user_doc)
    
    # Create session
    session_token = f"token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session = UserSession(
        user_id=user_id,
        session_token=session_token,
        expires_at=expires_at
    )
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie - allow for local network without HTTPS
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"user_id": user_id, "email": data.email, "name": data.name}

@api_router.post("/auth/login")
async def login(data: LoginRequest, request: Request, response: Response):
    """Login with email/password"""
    user_doc = await db.users.find_one({"email": data.email}, {"_id": 0})
    
    if not user_doc or not user_doc.get('password_hash'):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    
    if not verify_password(data.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    
    # Create session
    session_token = f"token_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session = UserSession(
        user_id=user_doc['user_id'],
        session_token=session_token,
        expires_at=expires_at
    )
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie - allow for local network without HTTPS
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {
        "user_id": user_doc['user_id'],
        "email": user_doc['email'],
        "name": user_doc['name'],
        "picture": user_doc.get('picture')
    }

@api_router.post("/auth/session")
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
            {"$set": {
                "name": auth_data["name"],
                "picture": auth_data.get("picture"),
            }}
        )
    else:
        new_user = User(
            user_id=user_id,
            email=auth_data["email"],
            name=auth_data["name"],
            picture=auth_data.get("picture")
        )
        user_doc = new_user.model_dump()
        user_doc['created_at'] = user_doc['created_at'].isoformat()
        await db.users.insert_one(user_doc)
    
    session_token = auth_data.get("session_token", f"token_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session = UserSession(
        user_id=user_id,
        session_token=session_token,
        expires_at=expires_at
    )
    session_doc = session.model_dump()
    session_doc['expires_at'] = session_doc['expires_at'].isoformat()
    session_doc['created_at'] = session_doc['created_at'].isoformat()
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie - allow for local network without HTTPS
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user_doc

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ============ RECIPE ENDPOINTS ============

@api_router.post("/recipes", response_model=dict)
async def create_recipe(recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    """Create a new recipe"""
    recipe = Recipe(
        user_id=user.user_id,
        **recipe_data.model_dump()
    )
    recipe_doc = recipe.model_dump()
    recipe_doc['created_at'] = recipe_doc['created_at'].isoformat()
    recipe_doc['updated_at'] = recipe_doc['updated_at'].isoformat()
    
    await db.recipes.insert_one(recipe_doc)
    return {"recipe_id": recipe.recipe_id, "message": "Recipe created"}

@api_router.get("/recipes")
async def get_recipes(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all recipes with optional filters - eigene + geteilte aus Gruppe"""
    # User-Doc für group_id holen
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    # Query für eigene Rezepte ODER geteilte Gruppenrezepte
    if group_id:
        # Hole alle Gruppen-Mitglieder
        group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
        member_ids = group.get("member_ids", []) if group else []
        
        base_query = {
            "$or": [
                {"user_id": user.user_id},  # Eigene Rezepte
                {"user_id": {"$in": member_ids}, "shared_with_group": True}  # Geteilte Gruppenrezepte
            ]
        }
    else:
        base_query = {"user_id": user.user_id}
    
    if category:
        base_query["category"] = category
    if difficulty:
        base_query["difficulty"] = difficulty
    if search:
        base_query["name"] = {"$regex": search, "$options": "i"}
    
    recipes = await db.recipes.find(base_query, {"_id": 0}).to_list(1000)
    
    for recipe in recipes:
        if isinstance(recipe.get('created_at'), str):
            recipe['created_at'] = datetime.fromisoformat(recipe['created_at'])
        if isinstance(recipe.get('updated_at'), str):
            recipe['updated_at'] = datetime.fromisoformat(recipe['updated_at'])
        
        # Markiere ob eigenes Rezept
        recipe["is_own"] = recipe["user_id"] == user.user_id
        
        ratings = await db.ratings.find({"recipe_id": recipe["recipe_id"]}, {"_id": 0}).to_list(1000)
        if ratings:
            recipe["avg_rating"] = sum(r["stars"] for r in ratings) / len(ratings)
            recipe["rating_count"] = len(ratings)
        else:
            recipe["avg_rating"] = 0
            recipe["rating_count"] = 0
    
    return recipes

@api_router.post("/recipes/search-by-ingredients")
async def search_by_ingredients(request: Request, user: User = Depends(get_current_user)):
    """Find recipes that can be made with given ingredients"""
    body = await request.json()
    available_ingredients = [ing.lower().strip() for ing in body.get("ingredients", [])]
    
    if not available_ingredients:
        return {"recipes": [], "message": "Keine Zutaten angegeben"}
    
    all_recipes = await db.recipes.find({}, {"_id": 0}).to_list(1000)
    
    results = []
    for recipe in all_recipes:
        recipe_ingredients = [ing["name"].lower() for ing in recipe.get("ingredients", [])]
        
        if not recipe_ingredients:
            continue
        
        # Count matching ingredients
        matching = sum(1 for ri in recipe_ingredients 
                      if any(ai in ri or ri in ai for ai in available_ingredients))
        
        total = len(recipe_ingredients)
        match_percentage = (matching / total * 100) if total > 0 else 0
        missing = [ing["name"] for ing in recipe.get("ingredients", []) 
                   if not any(ai in ing["name"].lower() or ing["name"].lower() in ai 
                             for ai in available_ingredients)]
        
        # Include if at least 50% match or at least 2 ingredients match
        if match_percentage >= 50 or matching >= 2:
            # Get ratings
            ratings = await db.ratings.find({"recipe_id": recipe["recipe_id"]}, {"_id": 0}).to_list(100)
            if ratings:
                recipe["avg_rating"] = sum(r["stars"] for r in ratings) / len(ratings)
                recipe["rating_count"] = len(ratings)
            else:
                recipe["avg_rating"] = 0
                recipe["rating_count"] = 0
            
            results.append({
                **recipe,
                "match_percentage": round(match_percentage),
                "matching_count": matching,
                "total_ingredients": total,
                "missing_ingredients": missing
            })
    
    # Sort by match percentage (highest first)
    results.sort(key=lambda x: (-x["match_percentage"], -x.get("avg_rating", 0)))
    
    return {
        "recipes": results,
        "total_found": len(results),
        "searched_ingredients": available_ingredients
    }



# ============================================================
# RECIPE IMPORT FROM URL (REWE & other sites)
# ============================================================

class ImportRequest(BaseModel):
    url: str

def parse_iso_duration(duration) -> Optional[int]:
    """Convert ISO 8601 duration (PT30M, PT1H30M, P0DT0H50M) to minutes"""
    if not duration:
        return None
    try:
        s = str(duration)
        days  = re.search(r'(\d+)D', s)
        hours = re.search(r'(\d+)H', s)
        mins  = re.search(r'(\d+)M', s)
        total = 0
        if days:
            total += int(days.group(1)) * 1440
        if hours:
            total += int(hours.group(1)) * 60
        if mins:
            total += int(mins.group(1))
        return total if total > 0 else None
    except:
        return None

def parse_ingredient_string(raw: str) -> dict:
    """Parse '200 g Spaghetti' or '2 Eier' -> {name, amount, unit}"""
    raw = raw.strip()
    # Pattern: optional number + optional unit + rest
    pattern = r'^([\d,./½¼¾⅓⅔]+)\s*([a-zA-ZäöüÄÖÜ]+\.?)?\s+(.+)$'
    m = re.match(pattern, raw)
    if m:
        amount = m.group(1).replace(',', '.')
        unit_raw = (m.group(2) or '').strip()
        name = m.group(3).strip()
        unit_map = {
            'g': 'g', 'kg': 'kg', 'ml': 'ml', 'l': 'l', 'L': 'l',
            'EL': 'EL', 'TL': 'TL', 'Stück': 'Stück', 'Stk': 'Stück',
            'Stk.': 'Stück', 'Prise': 'Prise', 'Prisen': 'Prise',
            'Bund': 'Bund', 'Zehe': 'Zehe', 'Zehen': 'Zehe',
            'Scheibe': 'Scheibe', 'Scheiben': 'Scheibe',
            'Dose': 'Dose', 'Glas': 'Glas', 'Pck': 'Pck.',
            'Pck.': 'Pck.', 'Pkg': 'Pck.', 'Becher': 'Becher',
        }
        unit = unit_map.get(unit_raw, unit_raw or 'Stück')
        return {"name": name, "amount": amount, "unit": unit}
    else:
        # No amount/unit found - try just number at start
        m2 = re.match(r'^([\d,./]+)\s+(.+)$', raw)
        if m2:
            return {"name": m2.group(2).strip(), "amount": m2.group(1), "unit": "Stück"}
        return {"name": raw, "amount": "1", "unit": "Stück"}

def map_category(keywords) -> str:
    kw_lower = ' '.join([k.lower() for k in (keywords or [])])
    if any(x in kw_lower for x in ['frühstück', 'breakfast', 'müsli', 'porridge', 'brunch']):
        return 'Frühstück'
    if any(x in kw_lower for x in ['suppe', 'soup', 'eintopf', 'brühe']):
        return 'Suppe'
    if any(x in kw_lower for x in ['salat', 'salad']):
        return 'Salat'
    if any(x in kw_lower for x in ['dessert', 'kuchen', 'torte', 'süß', 'eis', 'gebäck', 'muffin', 'keks', 'backrezept']):
        return 'Dessert'
    if any(x in kw_lower for x in ['snack', 'fingerfood', 'dip', 'aufstrich']):
        return 'Snack'
    if any(x in kw_lower for x in ['vorspeise', 'starter', 'appetizer']):
        return 'Vorspeise'
    if any(x in kw_lower for x in ['getränk', 'drink', 'smoothie', 'saft', 'cocktail']):
        return 'Getränk'
    return 'Hauptgericht'

def map_difficulty(level) -> str:
    if not level:
        return 'mittel'
    level = str(level).lower()
    if any(x in level for x in ['easy', 'einfach', 'simpel', 'leicht', 'anfänger']):
        return 'leicht'
    if any(x in level for x in ['hard', 'schwer', 'aufwändig', 'komplex', 'fortgeschritten']):
        return 'schwer'
    return 'mittel'

def extract_jsonld_recipe(html: str) -> Optional[dict]:
    """Extract Schema.org Recipe from JSON-LD blocks in HTML"""
    blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    )
    for block in blocks:
        try:
            data = json.loads(block.strip())
            # Handle @graph wrapper
            if isinstance(data, dict) and data.get('@graph'):
                data = data['@graph']
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and item.get('@type') == 'Recipe':
                    return item
        except:
            continue
    return None

def build_recipe_from_jsonld(jsonld: dict) -> dict:
    """Convert Schema.org Recipe JSON-LD to our recipe format"""
    # Ingredients
    raw_ingredients = jsonld.get('recipeIngredient', [])
    ingredients = [parse_ingredient_string(str(i)) for i in raw_ingredients if i]

    # Instructions – handle flat list, HowToStep, and Chefkoch-style HowToSection
    raw_instructions = jsonld.get('recipeInstructions', [])
    instructions = []

    def extract_steps(steps):
        """Recursively extract text from HowToStep / HowToSection / plain strings."""
        result = []
        if not steps:
            return result
        items = steps if isinstance(steps, list) else [steps]
        for step in items:
            if isinstance(step, str) and step.strip():
                result.append(step.strip())
            elif isinstance(step, dict):
                step_type = step.get('@type', '')
                if step_type == 'HowToSection':
                    # Chefkoch: nested section with itemListElement
                    result.extend(extract_steps(step.get('itemListElement', [])))
                elif step_type in ('HowToStep', ''):
                    text = (step.get('text') or step.get('name') or '').strip()
                    if text:
                        result.append(text)
                else:
                    # Unknown type – try text/name anyway
                    text = (step.get('text') or step.get('name') or '').strip()
                    if text:
                        result.append(text)
                    # Also check nested itemListElement
                    if step.get('itemListElement'):
                        result.extend(extract_steps(step['itemListElement']))
        return result

    if isinstance(raw_instructions, list):
        instructions = extract_steps(raw_instructions)
    elif isinstance(raw_instructions, str) and raw_instructions.strip():
        instructions = [s.strip() for s in re.split(r'\n+', raw_instructions) if s.strip() and len(s.strip()) > 10]

    # Times
    prep_time = parse_iso_duration(jsonld.get('prepTime'))
    total_time = parse_iso_duration(jsonld.get('totalTime'))
    cook_time_raw = parse_iso_duration(jsonld.get('cookTime'))
    if cook_time_raw is None and total_time and prep_time:
        cook_time_raw = max(0, total_time - prep_time)
    elif cook_time_raw is None and total_time:
        cook_time_raw = total_time

    # Servings
    portions = 4
    yield_val = jsonld.get('recipeYield', jsonld.get('yield'))
    if yield_val:
        s = str(yield_val[0] if isinstance(yield_val, list) else yield_val)
        nums = re.findall(r'\d+', s)
        if nums:
            portions = max(1, int(nums[0]))

    # Nutrition
    nutrition = None
    nutr = jsonld.get('nutrition', {})
    if nutr and isinstance(nutr, dict):
        def pn(val):
            if not val:
                return None
            nums = re.findall(r'[\d.]+', str(val))
            return float(nums[0]) if nums else None
        cal = pn(nutr.get('calories'))
        nutrition = {
            "calories": int(cal) if cal else None,
            "protein": pn(nutr.get('proteinContent')),
            "carbs": pn(nutr.get('carbohydrateContent')),
            "fat": pn(nutr.get('fatContent')),
            "fiber": pn(nutr.get('fiberContent')),
        }
        if not any(nutrition.values()):
            nutrition = None

    # Image
    image = jsonld.get('image')
    if isinstance(image, list):
        image = image[0]
    if isinstance(image, dict):
        image = image.get('url') or image.get('@id')
    if image and not str(image).startswith('http'):
        image = None

    # Category
    keywords = []
    kw = jsonld.get('keywords', '')
    if isinstance(kw, str):
        keywords = [k.strip() for k in kw.split(',') if k.strip()]
    elif isinstance(kw, list):
        keywords = kw
    cat_raw = jsonld.get('recipeCategory', '')
    if isinstance(cat_raw, list):
        cat_raw = cat_raw[0] if cat_raw else ''
    category = map_category(keywords + ([str(cat_raw)] if cat_raw else []))

    # Difficulty
    difficulty_raw = jsonld.get('difficulty') or jsonld.get('recipeDifficulty')
    difficulty = map_difficulty(difficulty_raw)

    return {
        "name": (jsonld.get('name') or 'Importiertes Rezept').strip(),
        "description": (jsonld.get('description') or '').strip() or None,
        "ingredients": ingredients,
        "instructions": instructions,
        "portions": portions,
        "prep_time": prep_time,
        "cook_time": cook_time_raw,
        "difficulty": difficulty,
        "category": category,
        "image_url": str(image) if image else None,
        "nutrition": nutrition,
        "allergens": [],
        "shared_with_group": False,
    }

async def parse_with_llm(html: str, url: str) -> Optional[dict]:
    """LLM parsing disabled in self-hosted mode - requires OpenAI API key"""
    logger.info("LLM parsing not available in self-hosted mode")
    return None

@api_router.post("/recipes/import-preview")
async def import_recipe_preview(data: ImportRequest, user: User = Depends(get_current_user)):
    """
    Fetch and parse a recipe from a URL.
    Returns a preview for user review before saving.
    """
    url = data.url.strip()
    if not url.startswith(('http://', 'https://')):
        raise HTTPException(status_code=400, detail="Ungültige URL – muss mit http:// oder https:// beginnen")

    fetch_headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            resp = await client.get(url, headers=fetch_headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Zeitüberschreitung beim Laden der Seite (>20s)")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"URL konnte nicht geladen werden: {str(e)[:200]}")

    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail="Diese Website blockiert den automatischen Zugriff (403). "
                   "Tipp: Öffne die Seite im Browser, kopiere die Rezeptdaten und füge sie manuell ein."
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Fehler beim Laden der Seite: HTTP {resp.status_code}"
        )

    html = resp.text

    # 1. Try JSON-LD (most reliable, works for REWE, KitchenStories, etc.)
    jsonld = extract_jsonld_recipe(html)
    if jsonld:
        recipe_data = build_recipe_from_jsonld(jsonld)
        recipe_data['source_url'] = url
        recipe_data['import_method'] = 'json-ld'
        return {"success": True, "recipe": recipe_data, "method": "json-ld"}

    # 2. LLM fallback
    logger.info(f"No JSON-LD found for {url}, trying LLM parser")
    llm_result = await parse_with_llm(html, url)
    if llm_result:
        llm_result['source_url'] = url
        llm_result['import_method'] = 'llm'
        return {"success": True, "recipe": llm_result, "method": "llm"}

    raise HTTPException(
        status_code=422,
        detail="Kein Rezept auf dieser Seite gefunden. "
               "Bitte stelle sicher, dass die URL direkt auf eine Rezeptseite zeigt "
               "(z.B. https://www.rewe.de/rezepte/spaghetti-carbonara/)."
    )


@api_router.post("/recipes/import-save")
async def import_recipe_save(recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    """Save an imported (and optionally user-edited) recipe"""
    recipe = Recipe(
        user_id=user.user_id,
        **recipe_data.model_dump()
    )
    recipe_doc = recipe.model_dump()
    recipe_doc['created_at'] = recipe_doc['created_at'].isoformat()
    recipe_doc['updated_at'] = recipe_doc['updated_at'].isoformat()
    
    # Download and store external image if present
    ext_image = recipe_doc.get("image_url")
    if ext_image and ext_image.startswith("http"):
        try:
            img_resp = sync_requests.get(ext_image, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
            if img_resp.status_code == 200 and img_resp.headers.get("Content-Type", "").startswith("image/"):
                ct = img_resp.headers["Content-Type"]
                ext = ct.split("/")[-1].split(";")[0]
                if ext not in ("jpeg", "png", "webp", "gif"):
                    ext = "jpg"
                image_id = uuid.uuid4().hex[:12]
                storage_path = f"{APP_NAME}/recipes/{recipe_doc['recipe_id']}/{image_id}.{ext}"
                put_object(storage_path, img_resp.content, ct)
                local_url = f"/api/images/{storage_path}"
                recipe_doc["image_url"] = local_url
                recipe_doc["images"] = [local_url]
        except Exception as e:
            logger.warning(f"Could not download import image: {e}")
    
    await db.recipes.insert_one(recipe_doc)
    recipe_doc.pop('_id', None)
    return recipe_doc


@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    """Get a single recipe with ratings and populated side dishes"""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ratings = await db.ratings.find({"recipe_id": recipe_id}, {"_id": 0}).to_list(1000)
    for rating in ratings:
        if isinstance(rating.get('created_at'), str):
            rating['created_at'] = datetime.fromisoformat(rating['created_at'])

    recipe["ratings"] = ratings
    if ratings:
        recipe["avg_rating"] = sum(r["stars"] for r in ratings) / len(ratings)
        recipe["rating_count"] = len(ratings)
    else:
        recipe["avg_rating"] = 0
        recipe["rating_count"] = 0
    
    # Ensure images field exists (backward compat)
    if "images" not in recipe:
        recipe["images"] = [recipe["image_url"]] if recipe.get("image_url") else []

    # Populate side dish details
    side_dish_ids = recipe.get("side_dishes", [])
    if side_dish_ids:
        side_dish_docs = await db.recipes.find(
            {"recipe_id": {"$in": side_dish_ids}},
            {"_id": 0, "recipe_id": 1, "name": 1, "image_url": 1,
             "category": 1, "difficulty": 1, "prep_time": 1, "cook_time": 1, "portions": 1}
        ).to_list(50)
        # preserve the order from side_dish_ids
        id_map = {d["recipe_id"]: d for d in side_dish_docs}
        recipe["side_dishes_detail"] = [id_map[sid] for sid in side_dish_ids if sid in id_map]
    else:
        recipe["side_dishes_detail"] = []

    return recipe

@api_router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    """Update a recipe"""
    existing = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    if existing["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = recipe_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.recipes.update_one(
        {"recipe_id": recipe_id},
        {"$set": update_data}
    )
    return {"message": "Recipe updated"}

@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    """Delete a recipe"""
    existing = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    if existing["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.recipes.delete_one({"recipe_id": recipe_id})
    await db.ratings.delete_many({"recipe_id": recipe_id})
    return {"message": "Recipe deleted"}

# ============ IMAGE UPLOAD ENDPOINTS ============

@api_router.post("/recipes/{recipe_id}/images")
async def upload_recipe_image(recipe_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload an image for a recipe"""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Rezept nicht gefunden")
    
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Nur JPEG, PNG, WebP und GIF erlaubt")
    
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Bild zu groß (max 10 MB)")
    
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    image_id = uuid.uuid4().hex[:12]
    storage_path = f"{APP_NAME}/recipes/{recipe_id}/{image_id}.{ext}"
    
    try:
        put_object(storage_path, data, file.content_type)
    except Exception as e:
        logger.error(f"Image upload error: {e}")
        raise HTTPException(status_code=500, detail="Fehler beim Hochladen")
    
    image_url = f"/api/images/{storage_path}"
    images = recipe.get("images", [])
    images.append(image_url)
    update_fields = {"images": images}
    if not recipe.get("image_url"):
        update_fields["image_url"] = image_url
    await db.recipes.update_one({"recipe_id": recipe_id}, {"$set": update_fields})
    
    return {"image_url": image_url, "images": images}

@api_router.delete("/recipes/{recipe_id}/images")
async def delete_recipe_image(recipe_id: str, request: Request, user: User = Depends(get_current_user)):
    """Remove an image from a recipe"""
    body = await request.json()
    image_url = body.get("image_url")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url required")
    
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Rezept nicht gefunden")
    
    images = [img for img in recipe.get("images", []) if img != image_url]
    update_fields = {"images": images}
    if recipe.get("image_url") == image_url:
        update_fields["image_url"] = images[0] if images else None
    await db.recipes.update_one({"recipe_id": recipe_id}, {"$set": update_fields})
    
    return {"message": "Bild entfernt", "images": images}

@api_router.get("/images/{path:path}")
async def serve_image(path: str):
    """Serve an image from object storage"""
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"Image serve error: {e}")
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")

# ============ RATING ENDPOINTS ============

@api_router.post("/recipes/{recipe_id}/ratings")
async def add_rating(recipe_id: str, rating_data: RatingCreate, user: User = Depends(get_current_user)):
    """Add a rating to a recipe"""
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    existing_rating = await db.ratings.find_one({
        "recipe_id": recipe_id,
        "user_id": user.user_id
    }, {"_id": 0})
    
    if existing_rating:
        await db.ratings.update_one(
            {"rating_id": existing_rating["rating_id"]},
            {"$set": {
                "stars": rating_data.stars,
                "text": rating_data.text,
                "created_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Rating updated"}
    
    rating = Rating(
        recipe_id=recipe_id,
        user_id=user.user_id,
        user_name=user.name,
        stars=rating_data.stars,
        text=rating_data.text
    )
    rating_doc = rating.model_dump()
    rating_doc['created_at'] = rating_doc['created_at'].isoformat()
    
    await db.ratings.insert_one(rating_doc)
    return {"message": "Rating added"}

# ============ MEAL PLAN ENDPOINTS ============

@api_router.get("/mealplans")
async def get_meal_plan(week_start: str, user: User = Depends(get_current_user)):
    """Get meal plan for a specific week - persönlich oder Gruppen-Plan"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        plan = await db.meal_plans.find_one({
            "group_id": group_id,
            "week_start": week_start
        }, {"_id": 0})
    else:
        plan = await db.meal_plans.find_one({
            "user_id": user.user_id,
            "group_id": None,
            "week_start": week_start
        }, {"_id": 0})

    if not plan:
        days = []
        start_date = datetime.fromisoformat(week_start)
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            days.append({
                "date": day_date.strftime("%Y-%m-%d"),
                "breakfast": [],
                "lunch": [],
                "dinner": []
            })
        return {
            "plan_id": None,
            "user_id": user.user_id,
            "group_id": group_id,
            "week_start": week_start,
            "days": days,
            "is_group_plan": group_id is not None
        }

    # Normalize: migrate old single-meal format to multi-meal arrays
    for day in plan.get("days", []):
        for mt in ["breakfast", "lunch", "dinner"]:
            meal = day.get(mt)
            if meal is None:
                day[mt] = []
            elif isinstance(meal, dict):
                # Old format: single object → wrap in array
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

@api_router.post("/mealplans")
async def save_meal_plan(plan_data: MealPlanUpdate, request: Request, user: User = Depends(get_current_user)):
    """Create or update meal plan - persönlich oder Gruppen-Plan + push notification"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    # Bestehenden Plan laden für Vergleich (Instant-Notification)
    if group_id:
        existing = await db.meal_plans.find_one({
            "group_id": group_id,
            "week_start": plan_data.week_start
        }, {"_id": 0})
    else:
        existing = await db.meal_plans.find_one({
            "user_id": user.user_id,
            "group_id": None,
            "week_start": plan_data.week_start
        }, {"_id": 0})
    
    # Detect new meals for instant notification
    new_meals = []
    old_days = {d["date"]: d for d in (existing or {}).get("days", [])} if existing else {}
    for new_day in plan_data.days:
        old_day = old_days.get(new_day.date, {})
        for mt in ["breakfast", "lunch", "dinner"]:
            new_meals_list = getattr(new_day, mt, []) or []
            old_meals_raw = old_day.get(mt, [])
            # Backward compat: old single-object format
            if isinstance(old_meals_raw, dict):
                old_meals_raw = [old_meals_raw] if old_meals_raw.get("recipe_id") else []
            elif old_meals_raw is None:
                old_meals_raw = []
            old_rids = {m.get("recipe_id") for m in old_meals_raw if isinstance(m, dict) and m.get("recipe_id")}
            for new_meal in new_meals_list:
                if new_meal.recipe_id and new_meal.recipe_id not in old_rids:
                    new_meals.append((new_day.date, mt, new_meal.recipe_name or "Neues Gericht"))
    
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
            user_id=user.user_id,
            group_id=group_id,
            week_start=plan_data.week_start,
            days=plan_data.days
        )
        plan_doc = plan.model_dump()
        plan_doc['created_at'] = plan_doc['created_at'].isoformat()
        plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
        await db.meal_plans.insert_one(plan_doc)
        plan_id = plan.plan_id
    
    # Send instant push notifications for new meals
    if new_meals:
        prefs = await db.notification_prefs.find_one({"user_id": user.user_id}, {"_id": 0})
        if prefs and prefs.get("new_meal_notification", True):
            berlin_tz = ZoneInfo("Europe/Berlin")
            for date_str, meal_type, recipe_name in new_meals:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    day_label = WEEKDAY_LABELS.get(dt.weekday(), date_str)
                except:
                    day_label = date_str
                meal_label = MEAL_LABELS.get(meal_type, meal_type)
                body = f"{recipe_name} – {day_label}, {meal_label}"
                await send_push_to_user(user.user_id, "Neues Gericht im Speiseplan", body, "/meal-planner", "new_meal")
            
            # Notify group members too
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
                                except:
                                    day_label = date_str
                                meal_label = MEAL_LABELS.get(meal_type, meal_type)
                                body = f"{user.name} hat hinzugefügt: {recipe_name} – {day_label}, {meal_label}"
                                await send_push_to_user(member_id, "Speiseplan aktualisiert", body, "/meal-planner", "new_meal")
    
    msg = "Speiseplan aktualisiert" if existing else "Speiseplan erstellt"
    return {"message": msg, "plan_id": plan_id}

# ============ SHOPPING LIST ENDPOINTS ============

@api_router.get("/shopping-list")
async def get_shopping_list(week_start: str, user: User = Depends(get_current_user)):
    """Generate shopping list from meal plan (personal or group)"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        plan = await db.meal_plans.find_one(
            {"group_id": group_id, "week_start": week_start}, {"_id": 0}
        )
    else:
        plan = await db.meal_plans.find_one(
            {"user_id": user.user_id, "week_start": week_start}, {"_id": 0}
        )

    if not plan:
        # Still include staple items even without a meal plan
        user_doc_fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        group_id_fresh = user_doc_fresh.get("group_id") if user_doc_fresh else group_id
        staple_query = {"group_id": group_id_fresh, "active": True} if group_id_fresh else {"user_id": user.user_id, "group_id": None, "active": True}
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
        return {"items": [], "staple_items": staple_list, "week_start": week_start}
    
    recipe_ids = set()
    recipe_portions = {}
    recipe_sources = {}  # recipe_id -> list of (day, meal_type, role)

    for day in plan.get("days", []):
        for meal_type in ["breakfast", "lunch", "dinner"]:
            meals = day.get(meal_type, [])
            # Backward compat: old single-object format
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

                    # Side dishes
                    for sd in meal.get("side_dishes", []):
                        if sd.get("recipe_id"):
                            sd_id = sd["recipe_id"]
                            sd_portions = sd.get("portions", 2)
                            recipe_ids.add(sd_id)
                            recipe_portions[sd_id] = recipe_portions.get(sd_id, 0) + sd_portions
    
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
    
    # Add active staple items
    user_doc_fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id_fresh = user_doc_fresh.get("group_id") if user_doc_fresh else group_id
    staple_query = {"group_id": group_id_fresh, "active": True} if group_id_fresh else {"user_id": user.user_id, "group_id": None, "active": True}
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

    return {"items": items, "staple_items": staple_list, "week_start": week_start}

@api_router.post("/shopping-list/toggle")
async def toggle_shopping_item(request: Request, user: User = Depends(get_current_user)):
    """Toggle a shopping list item"""
    body = await request.json()
    return {"message": "Item toggled"}

# ============ CATEGORIES ============

STAPLE_CATEGORIES = ["Getränke", "Gewürze", "Haushalt", "Hygiene", "Backzutaten", "Sonstiges"]

class StapleItemCreate(BaseModel):
    name: str
    amount: float
    unit: str
    category: str = "Sonstiges"
    active: bool = True

class StapleItemUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = None

# ── Staple Items CRUD ──

@api_router.get("/staple-items")
async def get_staple_items(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    query = {"group_id": group_id} if group_id else {"user_id": user.user_id, "group_id": None}
    items = await db.staple_items.find(query, {"_id": 0}).to_list(500)
    return {"items": items, "categories": STAPLE_CATEGORIES}

@api_router.post("/staple-items")
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

@api_router.put("/staple-items/{item_id}")
async def update_staple_item(item_id: str, data: StapleItemUpdate, user: User = Depends(get_current_user)):
    existing = await db.staple_items.find_one({"item_id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.staple_items.update_one({"item_id": item_id}, {"$set": updates})
    updated = await db.staple_items.find_one({"item_id": item_id}, {"_id": 0})
    return updated

@api_router.delete("/staple-items/{item_id}")
async def delete_staple_item(item_id: str, user: User = Depends(get_current_user)):
    result = await db.staple_items.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    return {"message": "Artikel gelöscht"}

@api_router.get("/categories")
async def get_categories(user: User = Depends(get_current_user)):
    """Get all available categories"""
    return {
        "categories": [
            "Frühstück",
            "Hauptgericht",
            "Vorspeise",
            "Beilage",
            "Dessert",
            "Snack",
            "Suppe",
            "Salat",
            "Getränk"
        ],
        "difficulties": ["leicht", "mittel", "schwer"],
        "allergens": [
            "Gluten",
            "Milch",
            "Eier",
            "Nüsse",
            "Soja",
            "Fisch",
            "Sellerie",
            "Senf"
        ]
    }

# ============ GRUPPEN ENDPOINTS ============

@api_router.post("/groups")
async def create_group(data: GroupCreate, user: User = Depends(get_current_user)):
    """Erstellt eine neue Gruppe"""
    group = Group(
        name=data.name,
        owner_id=user.user_id,
        member_ids=[user.user_id]
    )
    group_doc = group.model_dump()
    group_doc['created_at'] = group_doc['created_at'].isoformat()
    await db.groups.insert_one(group_doc)
    
    # User der Gruppe zuweisen
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"group_id": group.group_id}}
    )
    
    return {"group_id": group.group_id, "name": group.name, "message": "Gruppe erstellt"}

@api_router.get("/groups/my")
async def get_my_group(user: User = Depends(get_current_user)):
    """Gibt die Gruppe des Users zurück"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    if not group_id:
        return {"group": None, "members": [], "invitations": []}
    
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        return {"group": None, "members": [], "invitations": []}
    
    # Mitglieder laden
    members = await db.users.find(
        {"user_id": {"$in": group.get("member_ids", [])}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    # Ausstehende Einladungen (nur für Owner)
    invitations = []
    if group.get("owner_id") == user.user_id:
        invitations = await db.invitations.find(
            {"group_id": group_id, "status": "pending"},
            {"_id": 0}
        ).to_list(100)
    
    return {
        "group": group,
        "members": members,
        "invitations": invitations,
        "is_owner": group.get("owner_id") == user.user_id
    }

@api_router.post("/groups/invite")
async def invite_to_group(data: InvitationCreate, request: Request, user: User = Depends(get_current_user)):
    """Lädt jemanden per Email zur Gruppe ein"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    if not group_id:
        raise HTTPException(status_code=400, detail="Du bist in keiner Gruppe")
    
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")
    
    # Prüfen ob Email schon eingeladen oder Mitglied
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user and existing_user.get("group_id") == group_id:
        raise HTTPException(status_code=400, detail="Diese Person ist bereits Mitglied")
    
    existing_invite = await db.invitations.find_one({
        "group_id": group_id,
        "invitee_email": data.email,
        "status": "pending"
    }, {"_id": 0})
    if existing_invite:
        raise HTTPException(status_code=400, detail="Einladung wurde bereits gesendet")
    
    # Einladung erstellen
    invitation = Invitation(
        group_id=group_id,
        inviter_id=user.user_id,
        invitee_email=data.email
    )
    inv_doc = invitation.model_dump()
    inv_doc['created_at'] = inv_doc['created_at'].isoformat()
    inv_doc['expires_at'] = inv_doc['expires_at'].isoformat()
    await db.invitations.insert_one(inv_doc)
    
    # Email senden
    base_url = str(request.base_url).rstrip('/')
    # Frontend-URL aus Referer oder Standard
    referer = request.headers.get("referer", "")
    if referer:
        from urllib.parse import urlparse
        parsed = urlparse(referer)
        frontend_url = f"{parsed.scheme}://{parsed.netloc}"
    else:
        frontend_url = base_url.replace(":8001", ":3000")
    
    email_sent = send_invitation_email(
        recipient_email=data.email,
        inviter_name=user.name,
        group_name=group["name"],
        invitation_token=invitation.token,
        base_url=frontend_url
    )
    
    return {
        "message": "Einladung erstellt",
        "email_sent": email_sent,
        "invitation_token": invitation.token,
        "invitation_link": f"{frontend_url}/invite/{invitation.token}"
    }

@api_router.get("/invitations/{token}")
async def get_invitation(token: str):
    """Gibt Einladungs-Details zurück (öffentlich)"""
    invitation = await db.invitations.find_one({"token": token}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden")
    
    if invitation["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Einladung wurde bereits {invitation['status']}")
    
    # Prüfen ob abgelaufen
    expires_at = invitation["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.invitations.update_one({"token": token}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Einladung ist abgelaufen")
    
    group = await db.groups.find_one({"group_id": invitation["group_id"]}, {"_id": 0})
    inviter = await db.users.find_one({"user_id": invitation["inviter_id"]}, {"_id": 0, "password_hash": 0})
    
    return {
        "invitation": invitation,
        "group_name": group["name"] if group else "Unbekannt",
        "inviter_name": inviter["name"] if inviter else "Unbekannt"
    }

@api_router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, user: User = Depends(get_current_user)):
    """Nimmt eine Einladung an"""
    invitation = await db.invitations.find_one({"token": token, "status": "pending"}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden oder bereits verwendet")
    
    group_id = invitation["group_id"]
    
    # User zur Gruppe hinzufügen
    await db.groups.update_one(
        {"group_id": group_id},
        {"$addToSet": {"member_ids": user.user_id}}
    )
    
    # User group_id setzen
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"group_id": group_id}}
    )
    
    # Einladung als akzeptiert markieren
    await db.invitations.update_one(
        {"token": token},
        {"$set": {"status": "accepted"}}
    )
    
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    return {"message": "Einladung angenommen", "group_name": group["name"]}

@api_router.post("/groups/leave")
async def leave_group(user: User = Depends(get_current_user)):
    """Verlässt die aktuelle Gruppe"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    if not group_id:
        raise HTTPException(status_code=400, detail="Du bist in keiner Gruppe")
    
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    
    # Owner kann nicht einfach verlassen
    if group and group.get("owner_id") == user.user_id:
        # Wenn andere Mitglieder, muss Ownership übertragen werden
        other_members = [m for m in group.get("member_ids", []) if m != user.user_id]
        if other_members:
            raise HTTPException(status_code=400, detail="Als Owner musst du erst einen neuen Owner bestimmen oder alle Mitglieder entfernen")
        else:
            # Gruppe löschen wenn keine anderen Mitglieder
            await db.groups.delete_one({"group_id": group_id})
    else:
        # User aus Gruppe entfernen
        await db.groups.update_one(
            {"group_id": group_id},
            {"$pull": {"member_ids": user.user_id}}
        )
    
    # User group_id entfernen
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$unset": {"group_id": ""}}
    )
    
    return {"message": "Gruppe verlassen"}

# ============ PUSH NOTIFICATIONS ============

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'mailto:admin@kochplaner.app')

class PushSubscriptionData(BaseModel):
    endpoint: str
    keys: dict

class NotificationPrefs(BaseModel):
    meal_reminder: bool = True
    meal_reminder_time: str = "08:00"
    shopping_reminder: bool = True
    shopping_reminder_day: str = "sonntag"
    shopping_reminder_time: str = "10:00"
    empty_plan_reminder: bool = True
    empty_plan_reminder_time: str = "18:00"
    new_meal_notification: bool = True

WEEKDAY_MAP = {0: "montag", 1: "dienstag", 2: "mittwoch", 3: "donnerstag",
               4: "freitag", 5: "samstag", 6: "sonntag"}
WEEKDAY_LABELS = {0: "Montag", 1: "Dienstag", 2: "Mittwoch", 3: "Donnerstag",
                  4: "Freitag", 5: "Samstag", 6: "Sonntag"}
MEAL_LABELS = {"breakfast": "Frühstück", "lunch": "Mittagessen", "dinner": "Abendessen"}

async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/meal-planner", tag: str = "general"):
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=json.dumps({"title": title, "body": body, "url": url, "tag": tag}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
            )
            sent += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                await db.push_subscriptions.delete_one({"subscription_id": sub["subscription_id"]})
            else:
                logger.error(f"Push error: {e}")
        except Exception as e:
            logger.error(f"Push error: {e}")
    return sent

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

        # --- Daily meal reminder ---
        if prefs.get("meal_reminder") and current_time == prefs.get("meal_reminder_time", "08:00"):
            log_key = f"{user_id}:meal_reminder:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
                group_id = user_doc.get("group_id") if user_doc else None
                query = {"group_id": group_id, "week_start": week_start} if group_id else {"user_id": user_id, "group_id": None, "week_start": week_start}
                plan = await db.meal_plans.find_one(query, {"_id": 0})
                if plan:
                    day = next((d for d in plan.get("days", []) if d.get("date") == today_str), None)
                    if day:
                        meals = []
                        for mt, label in MEAL_LABELS.items():
                            slot = day.get(mt, [])
                            # Backward compat
                            if isinstance(slot, dict):
                                slot = [slot] if slot.get("recipe_id") else []
                            elif slot is None:
                                slot = []
                            names = [m["recipe_name"] for m in slot if m.get("recipe_name")]
                            if names:
                                meals.append(f"{label}: {', '.join(names)}")
                        if meals:
                            body = "\n".join(meals)
                            await send_push_to_user(user_id, f"Heute auf dem Plan ({WEEKDAY_LABELS[local_now.weekday()]})", body, "/meal-planner", "meal_reminder")
                await db.notification_log.insert_one({"key": log_key, "sent_at": datetime.now(timezone.utc).isoformat()})

        # --- Shopping reminder ---
        if prefs.get("shopping_reminder") and current_weekday == prefs.get("shopping_reminder_day", "sonntag") and current_time == prefs.get("shopping_reminder_time", "10:00"):
            log_key = f"{user_id}:shopping_reminder:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                await send_push_to_user(user_id, "Einkaufsliste", "Vergiss nicht, die Einkaufsliste für diese Woche zu prüfen!", "/shopping-list", "shopping_reminder")
                await db.notification_log.insert_one({"key": log_key, "sent_at": datetime.now(timezone.utc).isoformat()})

        # --- Empty plan reminder ---
        if prefs.get("empty_plan_reminder") and current_time == prefs.get("empty_plan_reminder_time", "18:00"):
            log_key = f"{user_id}:empty_plan:{today_str}"
            already = await db.notification_log.find_one({"key": log_key})
            if not already:
                user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
                group_id = user_doc.get("group_id") if user_doc else None
                tom_week_start = get_week_start_for_date(tomorrow)
                query = {"group_id": group_id, "week_start": tom_week_start} if group_id else {"user_id": user_id, "group_id": None, "week_start": tom_week_start}
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

# ── Notification Endpoints ──

@api_router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    return {"public_key": VAPID_PUBLIC_KEY or ""}

@api_router.post("/notifications/subscribe")
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

@api_router.delete("/notifications/unsubscribe")
async def unsubscribe_push(request: Request, user: User = Depends(get_current_user)):
    body = await request.json()
    endpoint = body.get("endpoint")
    if endpoint:
        await db.push_subscriptions.delete_many({"user_id": user.user_id, "endpoint": endpoint})
    else:
        await db.push_subscriptions.delete_many({"user_id": user.user_id})
    return {"message": "Push-Benachrichtigungen deaktiviert"}

@api_router.get("/notifications/preferences")
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

@api_router.put("/notifications/preferences")
async def update_notification_prefs(data: NotificationPrefs, user: User = Depends(get_current_user)):
    prefs_data = data.model_dump()
    prefs_data["user_id"] = user.user_id
    await db.notification_prefs.update_one(
        {"user_id": user.user_id}, {"$set": prefs_data}, upsert=True
    )
    return {"message": "Einstellungen gespeichert"}

@api_router.post("/notifications/test")
async def send_test_notification(user: User = Depends(get_current_user)):
    sent = await send_push_to_user(user.user_id, "Kochplaner", "Push-Benachrichtigungen funktionieren!", "/meal-planner", "test")
    if sent == 0:
        raise HTTPException(status_code=400, detail="Keine aktiven Push-Subscriptions gefunden")
    return {"message": f"Test-Benachrichtigung gesendet", "sent": sent}

@api_router.get("/notifications/status")
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

# ============ ROOT ============

@api_router.get("/")
async def root():
    return {"message": "Rezept & Speiseplan API"}

# Include the router
app.include_router(api_router)

# Static file serving for uploads
from fastapi.responses import FileResponse

@app.get("/api/uploads/{file_path:path}")
async def serve_upload(file_path: str):
    """Serve uploaded files"""
    try:
        data, content_type = get_object(file_path)
        return Response(content=data, media_type=content_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

@app.on_event("startup")
async def start_notification_scheduler():
    asyncio.create_task(notification_scheduler_loop())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
