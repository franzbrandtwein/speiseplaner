"""
Backend tests for P2 features:
1. Meal plan templates (save/apply/delete)
2. Copy week to next week
3. Nutrition tracking API
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test_debug@test.de"
TEST_PASSWORD = "password123"


class TestP2Features:
    """Test P2 features: templates, copy week, nutrition"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        print(f"✓ Logged in as {self.user.get('name', TEST_EMAIL)}")
        yield
        # Cleanup handled in individual tests
    
    # ============ MEAL PLAN TEMPLATES ============
    
    def test_list_templates(self):
        """GET /api/mealplan-templates - List all templates"""
        response = self.session.get(f"{BASE_URL}/api/mealplan-templates")
        assert response.status_code == 200, f"Failed to list templates: {response.text}"
        templates = response.json()
        assert isinstance(templates, list), "Templates should be a list"
        print(f"✓ Listed {len(templates)} templates")
        return templates
    
    def test_save_template_requires_meal_plan(self):
        """POST /api/mealplan-templates - Should fail if no meal plan exists for week"""
        # Use a week far in the future that likely has no data
        future_week = (datetime.now() + timedelta(weeks=100)).strftime("%Y-%m-%d")
        response = self.session.post(
            f"{BASE_URL}/api/mealplan-templates",
            json={"name": "TEST_Empty_Week", "week_start": future_week}
        )
        # Should return 400 because no meal plan exists
        assert response.status_code == 400, f"Expected 400 for empty week, got {response.status_code}"
        print("✓ Save template correctly rejects empty week")
    
    def test_save_template_from_existing_week(self):
        """POST /api/mealplan-templates - Save template from week with data"""
        # First, ensure we have a meal plan for a test week
        test_week = "2026-03-23"  # Known week with data per agent context
        
        # Check if meal plan exists
        plan_response = self.session.get(f"{BASE_URL}/api/mealplans?week_start={test_week}")
        assert plan_response.status_code == 200
        plan = plan_response.json()
        
        # If no meals, create a simple one
        has_meals = any(
            len(day.get("breakfast", [])) > 0 or 
            len(day.get("lunch", [])) > 0 or 
            len(day.get("dinner", [])) > 0
            for day in plan.get("days", [])
        )
        
        if not has_meals:
            # Get a recipe to add
            recipes_response = self.session.get(f"{BASE_URL}/api/recipes")
            if recipes_response.status_code == 200 and len(recipes_response.json()) > 0:
                recipe = recipes_response.json()[0]
                plan["days"][0]["lunch"] = [{
                    "recipe_id": recipe["recipe_id"],
                    "recipe_name": recipe["name"],
                    "portions": 2,
                    "side_dishes": [],
                    "assigned_to": []
                }]
                save_response = self.session.post(
                    f"{BASE_URL}/api/mealplans",
                    json={"week_start": test_week, "days": plan["days"]}
                )
                assert save_response.status_code == 200
                print("✓ Created test meal plan")
        
        # Now save as template
        template_name = f"TEST_Template_{datetime.now().strftime('%H%M%S')}"
        response = self.session.post(
            f"{BASE_URL}/api/mealplan-templates",
            json={"name": template_name, "week_start": test_week}
        )
        assert response.status_code == 200, f"Failed to save template: {response.text}"
        data = response.json()
        assert "template_id" in data, "Response should contain template_id"
        print(f"✓ Saved template: {template_name} (ID: {data['template_id']})")
        
        # Store for cleanup
        self.created_template_id = data["template_id"]
        return data["template_id"]
    
    def test_apply_template(self):
        """POST /api/mealplan-templates/{id}/apply - Apply template to a week"""
        # First create a template
        template_id = self.test_save_template_from_existing_week()
        
        # Apply to a different week
        target_week = "2026-04-13"  # A future week
        response = self.session.post(
            f"{BASE_URL}/api/mealplan-templates/{template_id}/apply?week_start={target_week}"
        )
        assert response.status_code == 200, f"Failed to apply template: {response.text}"
        print(f"✓ Applied template to week {target_week}")
        
        # Verify the meal plan was created
        plan_response = self.session.get(f"{BASE_URL}/api/mealplans?week_start={target_week}")
        assert plan_response.status_code == 200
        plan = plan_response.json()
        assert plan.get("days"), "Applied plan should have days"
        print("✓ Verified meal plan was created from template")
        
        # Cleanup template
        self.session.delete(f"{BASE_URL}/api/mealplan-templates/{template_id}")
    
    def test_delete_template(self):
        """DELETE /api/mealplan-templates/{id} - Delete a template"""
        # First create a template
        template_id = self.test_save_template_from_existing_week()
        
        # Delete it
        response = self.session.delete(f"{BASE_URL}/api/mealplan-templates/{template_id}")
        assert response.status_code == 200, f"Failed to delete template: {response.text}"
        print(f"✓ Deleted template {template_id}")
        
        # Verify it's gone
        templates = self.session.get(f"{BASE_URL}/api/mealplan-templates").json()
        assert not any(t["template_id"] == template_id for t in templates), "Template should be deleted"
        print("✓ Verified template was deleted")
    
    def test_delete_nonexistent_template(self):
        """DELETE /api/mealplan-templates/{id} - Should return 404 for nonexistent"""
        response = self.session.delete(f"{BASE_URL}/api/mealplan-templates/nonexistent_id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent template returns 404")
    
    # ============ COPY WEEK ============
    
    def test_copy_week(self):
        """POST /api/mealplans/copy - Copy week to another week"""
        source_week = "2026-03-23"  # Known week with data
        target_week = "2026-04-20"  # Target week
        
        # Ensure source has data
        plan_response = self.session.get(f"{BASE_URL}/api/mealplans?week_start={source_week}")
        assert plan_response.status_code == 200
        
        # Copy
        response = self.session.post(
            f"{BASE_URL}/api/mealplans/copy?source_week={source_week}&target_week={target_week}"
        )
        assert response.status_code == 200, f"Failed to copy week: {response.text}"
        print(f"✓ Copied week {source_week} to {target_week}")
        
        # Verify target has data
        target_response = self.session.get(f"{BASE_URL}/api/mealplans?week_start={target_week}")
        assert target_response.status_code == 200
        target_plan = target_response.json()
        assert target_plan.get("days"), "Target week should have days"
        
        # Verify dates are updated to target week
        first_day = target_plan["days"][0]
        assert first_day["date"].startswith("2026-04-20"), f"First day should be {target_week}, got {first_day['date']}"
        print("✓ Verified target week has correct dates")
    
    def test_copy_week_empty_source(self):
        """POST /api/mealplans/copy - Should fail for empty source week"""
        empty_week = "2030-01-06"  # Far future, likely empty
        target_week = "2030-01-13"
        
        response = self.session.post(
            f"{BASE_URL}/api/mealplans/copy?source_week={empty_week}&target_week={target_week}"
        )
        assert response.status_code == 400, f"Expected 400 for empty source, got {response.status_code}"
        print("✓ Copy week correctly rejects empty source")
    
    # ============ NUTRITION TRACKING ============
    
    def test_nutrition_daily_endpoint(self):
        """GET /api/nutrition/daily - Get nutrition for a date"""
        test_date = "2026-03-25"  # A date in the known week
        
        response = self.session.get(f"{BASE_URL}/api/nutrition/daily?date={test_date}")
        assert response.status_code == 200, f"Failed to get nutrition: {response.text}"
        
        data = response.json()
        assert "date" in data, "Response should contain date"
        assert "meals" in data, "Response should contain meals"
        assert "totals" in data, "Response should contain totals"
        
        totals = data["totals"]
        assert "calories" in totals, "Totals should have calories"
        assert "protein" in totals, "Totals should have protein"
        assert "carbs" in totals, "Totals should have carbs"
        assert "fat" in totals, "Totals should have fat"
        assert "fiber" in totals, "Totals should have fiber"
        
        print(f"✓ Nutrition for {test_date}: {totals['calories']} kcal, {totals['protein']}g protein")
        return data
    
    def test_nutrition_empty_date(self):
        """GET /api/nutrition/daily - Returns zeros for date with no meals"""
        empty_date = "2030-06-15"  # Far future, no meals
        
        response = self.session.get(f"{BASE_URL}/api/nutrition/daily?date={empty_date}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["totals"]["calories"] == 0, "Empty date should have 0 calories"
        assert data["meals"] == [], "Empty date should have no meals"
        print("✓ Nutrition for empty date returns zeros")
    
    def test_nutrition_structure(self):
        """Verify nutrition response structure"""
        test_date = "2026-03-23"
        
        response = self.session.get(f"{BASE_URL}/api/nutrition/daily?date={test_date}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check structure
        assert isinstance(data["meals"], list), "meals should be a list"
        assert isinstance(data["totals"], dict), "totals should be a dict"
        
        # If there are meals, check their structure
        if data["meals"]:
            meal = data["meals"][0]
            assert "meal_type" in meal, "Meal should have meal_type"
            assert "recipe_name" in meal, "Meal should have recipe_name"
            assert "portions" in meal, "Meal should have portions"
            assert "calories" in meal, "Meal should have calories"
            print(f"✓ Meal structure verified: {meal['recipe_name']} ({meal['meal_type']})")
        else:
            print("✓ Nutrition structure verified (no meals on this date)")


class TestRecipePrintEndpoint:
    """Test recipe endpoint for print view"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
        yield
    
    def test_get_recipe_for_print(self):
        """GET /api/recipes/{id} - Get recipe details (used by print view)"""
        # Get list of recipes
        recipes_response = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_response.status_code == 200
        recipes = recipes_response.json()
        
        if not recipes:
            pytest.skip("No recipes available for testing")
        
        recipe_id = recipes[0]["recipe_id"]
        
        # Get single recipe
        response = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert response.status_code == 200, f"Failed to get recipe: {response.text}"
        
        recipe = response.json()
        assert "name" in recipe, "Recipe should have name"
        assert "ingredients" in recipe, "Recipe should have ingredients"
        assert "instructions" in recipe, "Recipe should have instructions"
        assert "portions" in recipe, "Recipe should have portions"
        
        print(f"✓ Recipe '{recipe['name']}' retrieved for print view")
        print(f"  - {len(recipe.get('ingredients', []))} ingredients")
        print(f"  - {len(recipe.get('instructions', []))} steps")
        
        # Check nutrition if present
        if recipe.get("nutrition"):
            print(f"  - Nutrition: {recipe['nutrition'].get('calories', 'N/A')} kcal")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
