"""All Pydantic models for the application"""
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, EmailStr


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    group_id: Optional[str] = None       # aktive Gruppe
    group_ids: List[str] = []            # alle Mitgliedschaften
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
    ingredient_id: Optional[str] = None  # Link zu IngredientMaster


class NutritionInfo(BaseModel):
    calories: Optional[float] = None    # kcal
    protein: Optional[float] = None     # g
    fat: Optional[float] = None         # g
    saturated_fat: Optional[float] = None  # g
    carbs: Optional[float] = None       # g
    sugar: Optional[float] = None       # g
    fiber: Optional[float] = None       # g
    salt: Optional[float] = None        # g


class Recipe(BaseModel):
    model_config = ConfigDict(extra="ignore")
    recipe_id: str = Field(default_factory=lambda: f"recipe_{uuid.uuid4().hex[:12]}")
    user_id: str
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
    images: List[str] = []
    nutrition: Optional[NutritionInfo] = None
    allergens: List[str] = []
    cost_per_portion: Optional[float] = None
    side_dishes: List[str] = []
    shared_with_group: bool = False
    is_pickup: bool = False
    pickup_source: Optional[str] = None
    pickup_source_id: Optional[str] = None
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
    side_dishes: List[str] = []
    shared_with_group: bool = False
    is_pickup: bool = False
    pickup_source: Optional[str] = None
    pickup_source_id: Optional[str] = None

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
    assigned_to: List[str] = []
    is_external: bool = False  # Außer-Haus-Gericht (Imbiss, Restaurant etc.)


class DayPlan(BaseModel):
    date: str
    breakfast: List[MealSlot] = []
    lunch: List[MealSlot] = []
    dinner: List[MealSlot] = []


class MealPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")
    plan_id: str = Field(default_factory=lambda: f"plan_{uuid.uuid4().hex[:12]}")
    user_id: str
    group_id: Optional[str] = None
    week_start: str
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


# ============ AUTH ============

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


# ============ GROUPS ============

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
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7))


class InvitationCreate(BaseModel):
    email: EmailStr


# ============ RECIPES IMPORT ============

class ImportRequest(BaseModel):
    url: str


class ClipboardImportRequest(BaseModel):
    text: str


# ============ STAPLES ============

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


# ============ TEMPLATES ============

class TemplateCreate(BaseModel):
    name: str
    week_start: str


# ============ PANTRY ============

class PantryItemCreate(BaseModel):
    name: str
    amount: float
    unit: str
    category: str = "Sonstiges"
    expires_at: Optional[str] = None  # ISO date string, e.g. "2026-06-01"


class PantryItemUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expires_at: Optional[str] = None


class PantryBookRequest(BaseModel):
    name: str
    amount: float
    unit: str
    category: str = "Sonstiges"


# ============ NOTIFICATIONS ============

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


# ============ BEZUGSQUELLEN ============

class SourceCreate(BaseModel):
    name: str
    type: str = "supermarket"  # supermarket | restaurant | online | other
    url: Optional[str] = None
    notes: Optional[str] = None


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None


# ============ ZUTATEN-STAMMDATEN ============

class PackSize(BaseModel):
    amount: float
    unit: str
    description: str = ""  # z.B. "Tüte", "Dose", "Flasche"


class IngredientMasterCreate(BaseModel):
    name: str
    category: str = "Sonstiges"
    nutrition_per_100g: Optional[NutritionInfo] = None
    pack_sizes: List[PackSize] = []
    source_ids: List[str] = []
    shared_with_group: bool = False


class IngredientMasterUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    nutrition_per_100g: Optional[NutritionInfo] = None
    pack_sizes: Optional[List[PackSize]] = None
    source_ids: Optional[List[str]] = None
    shared_with_group: Optional[bool] = None
