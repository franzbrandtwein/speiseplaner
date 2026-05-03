"""Recipe endpoints: CRUD, ratings, image upload, URL/clipboard import"""
import os
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
import requests as sync_requests
from fastapi import APIRouter, HTTPException, Request, Response, Depends, File, UploadFile

from core import (
    db, get_current_user, put_object, get_object,
    APP_NAME, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE,
)
from models import User, Recipe, RecipeCreate, Rating, RatingCreate, ImportRequest, ClipboardImportRequest

logger = logging.getLogger("kochplaner.recipes")
router = APIRouter(prefix="/api")


# ============ BASIC CRUD ============

@router.post("/recipes", response_model=dict)
async def create_recipe(recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    recipe = Recipe(user_id=user.user_id, **recipe_data.model_dump())
    recipe_doc = recipe.model_dump()
    recipe_doc['created_at'] = recipe_doc['created_at'].isoformat()
    recipe_doc['updated_at'] = recipe_doc['updated_at'].isoformat()
    await db.recipes.insert_one(recipe_doc)
    return {"recipe_id": recipe.recipe_id, "message": "Recipe created"}


@router.get("/recipes")
async def get_recipes(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if group_id:
        group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
        member_ids = group.get("member_ids", []) if group else []
        base_query = {
            "$or": [
                {"user_id": user.user_id},
                {"user_id": {"$in": member_ids}, "shared_with_group": True}
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
        recipe["is_own"] = recipe["user_id"] == user.user_id

        ratings = await db.ratings.find({"recipe_id": recipe["recipe_id"]}, {"_id": 0}).to_list(1000)
        if ratings:
            recipe["avg_rating"] = sum(r["stars"] for r in ratings) / len(ratings)
            recipe["rating_count"] = len(ratings)
        else:
            recipe["avg_rating"] = 0
            recipe["rating_count"] = 0
    return recipes


@router.post("/recipes/search-by-ingredients")
async def search_by_ingredients(request: Request, user: User = Depends(get_current_user)):
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
        matching = sum(1 for ri in recipe_ingredients
                       if any(ai in ri or ri in ai for ai in available_ingredients))
        total = len(recipe_ingredients)
        match_percentage = (matching / total * 100) if total > 0 else 0
        missing = [ing["name"] for ing in recipe.get("ingredients", [])
                   if not any(ai in ing["name"].lower() or ing["name"].lower() in ai
                              for ai in available_ingredients)]
        if match_percentage >= 50 or matching >= 2:
            ratings = await db.ratings.find({"recipe_id": recipe["recipe_id"]}, {"_id": 0}).to_list(100)
            if ratings:
                recipe["avg_rating"] = sum(r["stars"] for r in ratings) / len(ratings)
                recipe["rating_count"] = len(ratings)
            else:
                recipe["avg_rating"] = 0
                recipe["rating_count"] = 0
            results.append({
                **recipe, "match_percentage": round(match_percentage),
                "matching_count": matching, "total_ingredients": total,
                "missing_ingredients": missing
            })
    results.sort(key=lambda x: (-x["match_percentage"], -x.get("avg_rating", 0)))
    return {
        "recipes": results, "total_found": len(results),
        "searched_ingredients": available_ingredients
    }


# ============ IMPORT HELPERS ============

def parse_iso_duration(duration) -> Optional[int]:
    if not duration:
        return None
    try:
        s = str(duration)
        days = re.search(r'(\d+)D', s)
        hours = re.search(r'(\d+)H', s)
        mins = re.search(r'(\d+)M', s)
        total = 0
        if days:
            total += int(days.group(1)) * 1440
        if hours:
            total += int(hours.group(1)) * 60
        if mins:
            total += int(mins.group(1))
        return total if total > 0 else None
    except Exception:
        return None


def parse_ingredient_string(raw: str) -> dict:
    raw = raw.strip()
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
    blocks = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    )
    for block in blocks:
        try:
            data = json.loads(block.strip())
            if isinstance(data, dict) and data.get('@graph'):
                data = data['@graph']
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and item.get('@type') == 'Recipe':
                    return item
        except Exception:
            continue
    return None


def build_recipe_from_jsonld(jsonld: dict) -> dict:
    raw_ingredients = jsonld.get('recipeIngredient', [])
    ingredients = [parse_ingredient_string(str(i)) for i in raw_ingredients if i]

    raw_instructions = jsonld.get('recipeInstructions', [])
    instructions = []

    def extract_steps(steps):
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
                    result.extend(extract_steps(step.get('itemListElement', [])))
                elif step_type in ('HowToStep', ''):
                    text = (step.get('text') or step.get('name') or '').strip()
                    if text:
                        result.append(text)
                else:
                    text = (step.get('text') or step.get('name') or '').strip()
                    if text:
                        result.append(text)
                    if step.get('itemListElement'):
                        result.extend(extract_steps(step['itemListElement']))
        return result

    if isinstance(raw_instructions, list):
        instructions = extract_steps(raw_instructions)
    elif isinstance(raw_instructions, str) and raw_instructions.strip():
        instructions = [s.strip() for s in re.split(r'\n+', raw_instructions) if s.strip() and len(s.strip()) > 10]

    prep_time = parse_iso_duration(jsonld.get('prepTime'))
    total_time = parse_iso_duration(jsonld.get('totalTime'))
    cook_time_raw = parse_iso_duration(jsonld.get('cookTime'))
    if cook_time_raw is None and total_time and prep_time:
        cook_time_raw = max(0, total_time - prep_time)
    elif cook_time_raw is None and total_time:
        cook_time_raw = total_time

    portions = 4
    yield_val = jsonld.get('recipeYield', jsonld.get('yield'))
    if yield_val:
        s = str(yield_val[0] if isinstance(yield_val, list) else yield_val)
        nums = re.findall(r'\d+', s)
        if nums:
            portions = max(1, int(nums[0]))

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

    image = jsonld.get('image')
    if isinstance(image, list):
        image = image[0]
    if isinstance(image, dict):
        image = image.get('url') or image.get('@id')
    if image and not str(image).startswith('http'):
        image = None

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
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        llm_key = os.environ.get('EMERGENT_LLM_KEY')
        if not llm_key:
            return None
        clean = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<style[^>]*>.*?</style>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<nav[^>]*>.*?</nav>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<header[^>]*>.*?</header>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<footer[^>]*>.*?</footer>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = re.sub(r'&[a-z]+;', ' ', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()
        clean = clean[:6000]

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


# ============ IMPORT ENDPOINTS ============

@router.post("/recipes/import-preview")
async def import_recipe_preview(data: ImportRequest, user: User = Depends(get_current_user)):
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
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client_http:
            resp = await client_http.get(url, headers=fetch_headers)
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
        raise HTTPException(status_code=resp.status_code, detail=f"Fehler beim Laden der Seite: HTTP {resp.status_code}")

    html = resp.text
    jsonld = extract_jsonld_recipe(html)
    if jsonld:
        recipe_data = build_recipe_from_jsonld(jsonld)
        recipe_data['source_url'] = url
        recipe_data['import_method'] = 'json-ld'
        return {"success": True, "recipe": recipe_data, "method": "json-ld"}

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


@router.post("/recipes/import-save")
async def import_recipe_save(recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    recipe = Recipe(user_id=user.user_id, **recipe_data.model_dump())
    recipe_doc = recipe.model_dump()
    recipe_doc['created_at'] = recipe_doc['created_at'].isoformat()
    recipe_doc['updated_at'] = recipe_doc['updated_at'].isoformat()

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


@router.post("/recipes/import-clipboard")
async def import_from_clipboard(data: ClipboardImportRequest, user: User = Depends(get_current_user)):
    text = data.text.strip()
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="Text ist zu kurz. Bitte kopiere den kompletten Rezepttext.")
    if len(text) > 50000:
        raise HTTPException(status_code=400, detail="Text ist zu lang (max 50.000 Zeichen)")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
        prompt = f"""Du bist ein Rezept-Parser. Extrahiere aus dem folgenden Text alle Rezeptinformationen und gib sie als JSON zurück.

Format:
{{
  "name": "Rezeptname",
  "description": "Kurzbeschreibung (optional)",
  "category": "Kategorie (z.B. Hauptgericht, Vorspeise, Dessert, Snack)",
  "portions": 4,
  "prep_time": 15,
  "cook_time": 30,
  "ingredients": [
    {{"name": "Zutat", "amount": "200", "unit": "g"}}
  ],
  "instructions": ["Schritt 1", "Schritt 2"],
  "nutrition": {{
    "calories": 450,
    "protein": 25,
    "carbs": 50,
    "fat": 15,
    "fiber": 5
  }}
}}

Falls Nährwerte nicht angegeben sind, schätze sie basierend auf den Zutaten.
Falls Einheiten fehlen, verwende sinnvolle Standardwerte.
Antworte NUR mit dem JSON, kein anderer Text.

Rezepttext:
{text[:15000]}"""

        llm = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"clipboard_import_{uuid.uuid4().hex[:8]}",
            system_message="Du bist ein Rezept-Parser. Antworte NUR mit validem JSON."
        )
        msg = UserMessage(text=prompt)
        response = await llm.send_message(msg)

        resp_text = response.strip()
        if resp_text.startswith("```"):
            resp_text = resp_text.split("\n", 1)[1] if "\n" in resp_text else resp_text[3:]
        if resp_text.endswith("```"):
            resp_text = resp_text[:-3]
        if resp_text.startswith("json"):
            resp_text = resp_text[4:]

        recipe_data = json.loads(resp_text.strip())
        recipe_data['import_method'] = 'clipboard-llm'
        return {"success": True, "recipe": recipe_data, "method": "clipboard-llm"}
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Rezept konnte nicht aus dem Text extrahiert werden. Bitte versuche es mit einem klareren Textformat.")
    except Exception as e:
        logger.error(f"Clipboard import LLM error: {e}")
        raise HTTPException(status_code=500, detail=f"Fehler bei der KI-Analyse: {str(e)[:200]}")


# ============ SINGLE RECIPE / UPDATE / DELETE ============

@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
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

    if "images" not in recipe:
        recipe["images"] = [recipe["image_url"]] if recipe.get("image_url") else []

    side_dish_ids = recipe.get("side_dishes", [])
    if side_dish_ids:
        side_dish_docs = await db.recipes.find(
            {"recipe_id": {"$in": side_dish_ids}},
            {"_id": 0, "recipe_id": 1, "name": 1, "image_url": 1,
             "category": 1, "difficulty": 1, "prep_time": 1, "cook_time": 1, "portions": 1}
        ).to_list(50)
        id_map = {d["recipe_id"]: d for d in side_dish_docs}
        recipe["side_dishes_detail"] = [id_map[sid] for sid in side_dish_ids if sid in id_map]
    else:
        recipe["side_dishes_detail"] = []
    return recipe


@router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, recipe_data: RecipeCreate, user: User = Depends(get_current_user)):
    existing = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if existing["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = recipe_data.model_dump()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.recipes.update_one({"recipe_id": recipe_id}, {"$set": update_data})
    return {"message": "Recipe updated"}


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    existing = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if existing["user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.recipes.delete_one({"recipe_id": recipe_id})
    await db.ratings.delete_many({"recipe_id": recipe_id})
    return {"message": "Recipe deleted"}


# ============ IMAGE UPLOAD ============

@router.post("/recipes/{recipe_id}/images")
async def upload_recipe_image(recipe_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user)):
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
        logger.exception(f"Image upload error (storage_path={storage_path}): {e}")
        raise HTTPException(status_code=500, detail=f"Fehler beim Hochladen: {type(e).__name__}: {str(e)[:200]}")

    image_url = f"/api/images/{storage_path}"
    images = recipe.get("images", [])
    images.append(image_url)
    update_fields = {"images": images}
    if not recipe.get("image_url"):
        update_fields["image_url"] = image_url
    await db.recipes.update_one({"recipe_id": recipe_id}, {"$set": update_fields})
    return {"image_url": image_url, "images": images}


@router.delete("/recipes/{recipe_id}/images")
async def delete_recipe_image(recipe_id: str, request: Request, user: User = Depends(get_current_user)):
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


@router.get("/images/{path:path}")
async def serve_image(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"Image serve error: {e}")
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")


# ============ RATINGS ============

@router.post("/recipes/{recipe_id}/ratings")
async def add_rating(recipe_id: str, rating_data: RatingCreate, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one({"recipe_id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    existing_rating = await db.ratings.find_one(
        {"recipe_id": recipe_id, "user_id": user.user_id}, {"_id": 0}
    )
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
        recipe_id=recipe_id, user_id=user.user_id, user_name=user.name,
        stars=rating_data.stars, text=rating_data.text
    )
    rating_doc = rating.model_dump()
    rating_doc['created_at'] = rating_doc['created_at'].isoformat()
    await db.ratings.insert_one(rating_doc)
    return {"message": "Rating added"}
