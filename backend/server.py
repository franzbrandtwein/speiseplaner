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
from datetime import datetime, timezone, timedelta

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

# ============ AUTH HELPERS ============

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
    """Get all recipes with optional filters"""
    query = {}
    
    if category:
        query["category"] = category
    if difficulty:
        query["difficulty"] = difficulty
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    recipes = await db.recipes.find(query, {"_id": 0}).to_list(1000)
    
    for recipe in recipes:
        if isinstance(recipe.get('created_at'), str):
            recipe['created_at'] = datetime.fromisoformat(recipe['created_at'])
        if isinstance(recipe.get('updated_at'), str):
            recipe['updated_at'] = datetime.fromisoformat(recipe['updated_at'])
        
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
    """Get meal plan for a specific week"""
    plan = await db.meal_plans.find_one({
        "user_id": user.user_id,
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
            "week_start": week_start,
            "days": days
        }
    
    return plan

@api_router.post("/mealplans")
async def save_meal_plan(plan_data: MealPlanUpdate, user: User = Depends(get_current_user)):
    """Create or update meal plan"""
    existing = await db.meal_plans.find_one({
        "user_id": user.user_id,
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
        return {"message": "Meal plan updated", "plan_id": existing["plan_id"]}
    
    plan = MealPlan(
        user_id=user.user_id,
        week_start=plan_data.week_start,
        days=plan_data.days
    )
    plan_doc = plan.model_dump()
    plan_doc['created_at'] = plan_doc['created_at'].isoformat()
    plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
    
    await db.meal_plans.insert_one(plan_doc)
    return {"message": "Meal plan created", "plan_id": plan.plan_id}

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

# ============ ROOT ============

@api_router.get("/")
async def root():
    return {"message": "Rezept & Speiseplan API"}

# Include the router
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
