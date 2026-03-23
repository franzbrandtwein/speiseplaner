from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
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
from emergentintegrations.llm.chat import LlmChat, UserMessage

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
import configparser

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
    allow_origins=["*"],
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
    nutrition: Optional[NutritionInfo] = None
    allergens: List[str] = []
    cost_per_portion: Optional[float] = None
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

class MealSlot(BaseModel):
    recipe_id: Optional[str] = None
    recipe_name: Optional[str] = None
    portions: int = 2

class DayPlan(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    breakfast: Optional[MealSlot] = None
    lunch: Optional[MealSlot] = None
    dinner: Optional[MealSlot] = None

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

# Check if running in Emergent environment
IS_EMERGENT = "emergentagent.com" in os.environ.get('CORS_ORIGINS', '')

@api_router.post("/auth/register")
async def register(data: RegisterRequest, response: Response):
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
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,  # Set True for HTTPS
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {"user_id": user_id, "email": data.email, "name": data.name}

@api_router.post("/auth/login")
async def login(data: LoginRequest, response: Response):
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
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,  # Set True for HTTPS
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
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
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
    """Use LLM to extract recipe data from HTML when JSON-LD is unavailable"""
    try:
        llm_key = os.environ.get('EMERGENT_LLM_KEY')
        if not llm_key:
            return None

        # Clean HTML: remove scripts, styles, nav → plain text
        clean = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<style[^>]*>.*?</style>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<nav[^>]*>.*?</nav>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<header[^>]*>.*?</header>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<footer[^>]*>.*?</footer>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = re.sub(r'&[a-z]+;', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()
        clean = clean[:6000]  # Limit tokens

        chat = LlmChat(
            api_key=llm_key,
            session_id=f"recipe_import_{uuid.uuid4().hex[:8]}",
            system_message="""Du bist ein Rezept-Extraktor. Extrahiere Rezeptdaten aus dem gegebenen Text und gib exakt dieses JSON zurück (kein anderer Text):
{
  "name": "string",
  "description": "string oder null",
  "ingredients": [{"name": "string", "amount": "string", "unit": "string"}],
  "instructions": ["string"],
  "portions": number,
  "prep_time": number_in_minutes_or_null,
  "cook_time": number_in_minutes_or_null,
  "difficulty": "leicht|mittel|schwer",
  "category": "Frühstück|Suppe|Salat|Hauptgericht|Dessert|Snack|Vorspeise|Getränk",
  "nutrition": {"calories": number_or_null, "protein": number_or_null, "carbs": number_or_null, "fat": number_or_null, "fiber": null}
}"""
        ).with_model("openai", "gpt-4.1-mini")

        msg = UserMessage(text=f"Extrahiere das Rezept von dieser URL: {url}\n\nSeitentext:\n{clean}")
        response = await chat.send_message(msg)

        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            data = json.loads(json_match.group())
            data.setdefault('allergens', [])
            data.setdefault('shared_with_group', False)
            return data
    except Exception as e:
        logger.error(f"LLM recipe parse error: {e}")
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
    await db.recipes.insert_one(recipe_doc)
    recipe_doc.pop('_id', None)
    return recipe_doc


@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    """Get a single recipe with ratings"""
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
    # Prüfen ob User in einer Gruppe ist
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    # Suche nach Gruppenplan oder persönlichem Plan
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
                "breakfast": None,
                "lunch": None,
                "dinner": None
            })
        return {
            "plan_id": None,
            "user_id": user.user_id,
            "group_id": group_id,
            "week_start": week_start,
            "days": days,
            "is_group_plan": group_id is not None
        }
    
    plan["is_group_plan"] = plan.get("group_id") is not None
    return plan

@api_router.post("/mealplans")
async def save_meal_plan(plan_data: MealPlanUpdate, user: User = Depends(get_current_user)):
    """Create or update meal plan - persönlich oder Gruppen-Plan"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    
    # Suche bestehenden Plan
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
    
    if existing:
        await db.meal_plans.update_one(
            {"plan_id": existing["plan_id"]},
            {"$set": {
                "days": [d.model_dump() for d in plan_data.days],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Speiseplan aktualisiert", "plan_id": existing["plan_id"]}
    
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
    return {"message": "Speiseplan erstellt", "plan_id": plan.plan_id}

# ============ SHOPPING LIST ENDPOINTS ============

@api_router.get("/shopping-list")
async def get_shopping_list(week_start: str, user: User = Depends(get_current_user)):
    """Generate shopping list from meal plan"""
    plan = await db.meal_plans.find_one({
        "user_id": user.user_id,
        "week_start": week_start
    }, {"_id": 0})
    
    if not plan:
        return {"items": [], "week_start": week_start}
    
    recipe_ids = set()
    recipe_portions = {}
    
    for day in plan.get("days", []):
        for meal_type in ["breakfast", "lunch", "dinner"]:
            meal = day.get(meal_type)
            if meal and meal.get("recipe_id"):
                rid = meal["recipe_id"]
                recipe_ids.add(rid)
                portions = meal.get("portions", 2)
                recipe_portions[rid] = recipe_portions.get(rid, 0) + portions
    
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
    
    return {"items": items, "week_start": week_start}

@api_router.post("/shopping-list/toggle")
async def toggle_shopping_item(request: Request, user: User = Depends(get_current_user)):
    """Toggle a shopping list item"""
    body = await request.json()
    return {"message": "Item toggled"}

# ============ CATEGORIES ============

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

# ============ ROOT ============

@api_router.get("/")
async def root():
    return {"message": "Rezept & Speiseplan API"}

# Include the router
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
