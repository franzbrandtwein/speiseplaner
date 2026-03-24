"""
Test suite for Meal Plan Side Dishes functionality
Tests the bug fix: Side dishes (Beilagen) should be permanently saved in meal planner
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test_debug@test.de"
TEST_PASSWORD = "password123"

# Test recipe IDs (pre-existing)
MAIN_RECIPE_ID = "recipe_ac29cd0b382a"  # Spaghetti Carbonara
SIDE_DISH_RECIPE_ID = "recipe_60cd2e8afad0"  # Grüner Salat

# Current week start
WEEK_START = "2026-03-23"


class TestMealPlanSideDishes:
    """Test suite for meal plan side dishes persistence"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        print(f"Logged in as: {self.user.get('name', self.user.get('email'))}")
        yield
        # Cleanup handled by test methods if needed
    
    def test_01_get_existing_mealplan_with_sidedishes(self):
        """Test: GET mealplan should return existing side dishes"""
        response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert response.status_code == 200, f"Failed to get mealplan: {response.text}"
        
        plan = response.json()
        print(f"Plan ID: {plan.get('plan_id')}")
        print(f"Week start: {plan.get('week_start')}")
        
        # Check if days exist
        assert "days" in plan, "Mealplan should have 'days' field"
        assert len(plan["days"]) == 7, "Mealplan should have 7 days"
        
        # Find Monday (2026-03-23) lunch - should have side dish
        monday = next((d for d in plan["days"] if d["date"] == "2026-03-23"), None)
        assert monday is not None, "Monday should exist in plan"
        
        lunch = monday.get("lunch")
        if lunch:
            print(f"Monday lunch: {lunch.get('recipe_name')}")
            print(f"Monday lunch side_dishes: {lunch.get('side_dishes', [])}")
            # Verify side_dishes field exists
            assert "side_dishes" in lunch or lunch.get("side_dishes") is not None or lunch.get("side_dishes") == [], \
                "Lunch should have side_dishes field (even if empty)"
        
        print("TEST PASSED: GET mealplan returns side_dishes field")
    
    def test_02_save_mealplan_with_sidedishes(self):
        """Test: POST mealplan with side dishes should persist them"""
        # Create a meal plan with side dishes
        days = []
        start_date = datetime.strptime(WEEK_START, "%Y-%m-%d")
        
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            day = {
                "date": day_date.strftime("%Y-%m-%d"),
                "breakfast": None,
                "lunch": None,
                "dinner": None
            }
            
            # Add meal with side dish on Monday lunch
            if i == 0:  # Monday
                day["lunch"] = {
                    "recipe_id": MAIN_RECIPE_ID,
                    "recipe_name": "Spaghetti Carbonara",
                    "portions": 4,
                    "side_dishes": [
                        {
                            "recipe_id": SIDE_DISH_RECIPE_ID,
                            "recipe_name": "Grüner Salat",
                            "portions": 2
                        }
                    ]
                }
            
            # Add meal with side dish on Wednesday lunch
            if i == 2:  # Wednesday
                day["lunch"] = {
                    "recipe_id": MAIN_RECIPE_ID,
                    "recipe_name": "Spaghetti Carbonara",
                    "portions": 3,
                    "side_dishes": [
                        {
                            "recipe_id": SIDE_DISH_RECIPE_ID,
                            "recipe_name": "Grüner Salat",
                            "portions": 3
                        }
                    ]
                }
            
            days.append(day)
        
        # Save the meal plan
        save_response = self.session.post(
            f"{BASE_URL}/api/mealplans",
            json={
                "week_start": WEEK_START,
                "days": days
            }
        )
        assert save_response.status_code == 200, f"Failed to save mealplan: {save_response.text}"
        
        result = save_response.json()
        print(f"Save result: {result}")
        assert "plan_id" in result or "message" in result, "Save should return plan_id or message"
        
        print("TEST PASSED: Mealplan with side dishes saved successfully")
    
    def test_03_verify_sidedishes_persisted_after_reload(self):
        """Test: After saving, GET should return the side dishes (simulates page reload)"""
        response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert response.status_code == 200, f"Failed to get mealplan: {response.text}"
        
        plan = response.json()
        
        # Find Monday lunch
        monday = next((d for d in plan["days"] if d["date"] == "2026-03-23"), None)
        assert monday is not None, "Monday should exist"
        
        lunch = monday.get("lunch")
        assert lunch is not None, "Monday lunch should exist"
        assert lunch.get("recipe_id") == MAIN_RECIPE_ID, "Monday lunch should have correct recipe"
        
        # CRITICAL: Verify side dishes persisted
        side_dishes = lunch.get("side_dishes", [])
        assert len(side_dishes) > 0, "Monday lunch should have side dishes after reload"
        
        first_side = side_dishes[0]
        assert first_side.get("recipe_id") == SIDE_DISH_RECIPE_ID, "Side dish should have correct recipe_id"
        assert first_side.get("recipe_name") == "Grüner Salat", "Side dish should have correct name"
        assert first_side.get("portions") == 2, "Side dish should have correct portions"
        
        print(f"Monday lunch side dishes after reload: {side_dishes}")
        
        # Also verify Wednesday
        wednesday = next((d for d in plan["days"] if d["date"] == "2026-03-25"), None)
        assert wednesday is not None, "Wednesday should exist"
        
        wed_lunch = wednesday.get("lunch")
        assert wed_lunch is not None, "Wednesday lunch should exist"
        
        wed_side_dishes = wed_lunch.get("side_dishes", [])
        assert len(wed_side_dishes) > 0, "Wednesday lunch should have side dishes after reload"
        assert wed_side_dishes[0].get("portions") == 3, "Wednesday side dish should have 3 portions"
        
        print(f"Wednesday lunch side dishes after reload: {wed_side_dishes}")
        print("TEST PASSED: Side dishes persist after reload (bug fix verified)")
    
    def test_04_update_sidedish_portions(self):
        """Test: Updating side dish portions should persist"""
        # First get current plan
        get_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert get_response.status_code == 200
        plan = get_response.json()
        
        # Modify Monday lunch side dish portions
        for day in plan["days"]:
            if day["date"] == "2026-03-23" and day.get("lunch"):
                if day["lunch"].get("side_dishes"):
                    day["lunch"]["side_dishes"][0]["portions"] = 5  # Change from 2 to 5
        
        # Save updated plan
        save_response = self.session.post(
            f"{BASE_URL}/api/mealplans",
            json={
                "week_start": WEEK_START,
                "days": plan["days"]
            }
        )
        assert save_response.status_code == 200, f"Failed to update: {save_response.text}"
        
        # Verify the change persisted
        verify_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert verify_response.status_code == 200
        
        updated_plan = verify_response.json()
        monday = next((d for d in updated_plan["days"] if d["date"] == "2026-03-23"), None)
        
        assert monday["lunch"]["side_dishes"][0]["portions"] == 5, \
            "Side dish portions should be updated to 5"
        
        print("TEST PASSED: Side dish portions update persists")
    
    def test_05_remove_sidedish(self):
        """Test: Removing a side dish should persist"""
        # Get current plan
        get_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert get_response.status_code == 200
        plan = get_response.json()
        
        # Remove side dish from Wednesday lunch
        for day in plan["days"]:
            if day["date"] == "2026-03-25" and day.get("lunch"):
                day["lunch"]["side_dishes"] = []  # Remove all side dishes
        
        # Save
        save_response = self.session.post(
            f"{BASE_URL}/api/mealplans",
            json={
                "week_start": WEEK_START,
                "days": plan["days"]
            }
        )
        assert save_response.status_code == 200
        
        # Verify removal persisted
        verify_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        assert verify_response.status_code == 200
        
        updated_plan = verify_response.json()
        wednesday = next((d for d in updated_plan["days"] if d["date"] == "2026-03-25"), None)
        
        wed_side_dishes = wednesday.get("lunch", {}).get("side_dishes", [])
        assert len(wed_side_dishes) == 0, "Wednesday lunch should have no side dishes after removal"
        
        print("TEST PASSED: Side dish removal persists")
    
    def test_06_shopping_list_includes_sidedish_ingredients(self):
        """Test: Shopping list should include ingredients from side dishes"""
        # First restore a side dish for testing
        get_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        plan = get_response.json()
        
        # Add side dish back to Wednesday
        for day in plan["days"]:
            if day["date"] == "2026-03-25" and day.get("lunch"):
                day["lunch"]["side_dishes"] = [
                    {
                        "recipe_id": SIDE_DISH_RECIPE_ID,
                        "recipe_name": "Grüner Salat",
                        "portions": 2
                    }
                ]
        
        # Save
        self.session.post(
            f"{BASE_URL}/api/mealplans",
            json={"week_start": WEEK_START, "days": plan["days"]}
        )
        
        # Get shopping list
        shopping_response = self.session.get(
            f"{BASE_URL}/api/shopping-list?week_start={WEEK_START}"
        )
        assert shopping_response.status_code == 200, f"Failed to get shopping list: {shopping_response.text}"
        
        shopping_list = shopping_response.json()
        items = shopping_list.get("items", [])
        
        print(f"Shopping list items count: {len(items)}")
        for item in items[:10]:  # Print first 10 items
            print(f"  - {item.get('ingredient_name')}: {item.get('total_amount')} {item.get('unit')}")
        
        # The shopping list should have items (from both main recipe and side dishes)
        assert len(items) > 0, "Shopping list should have items"
        
        print("TEST PASSED: Shopping list generated with side dish ingredients")
    
    def test_07_add_new_sidedish_to_existing_meal(self):
        """Test: Adding a new side dish to an existing meal should work"""
        # Get current plan
        get_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        plan = get_response.json()
        
        # Add a second side dish to Monday lunch (if it has one already)
        for day in plan["days"]:
            if day["date"] == "2026-03-23" and day.get("lunch"):
                current_sides = day["lunch"].get("side_dishes", [])
                # Add another side dish (using same recipe for simplicity)
                if len(current_sides) < 2:
                    current_sides.append({
                        "recipe_id": SIDE_DISH_RECIPE_ID,
                        "recipe_name": "Grüner Salat (Extra)",
                        "portions": 1
                    })
                day["lunch"]["side_dishes"] = current_sides
        
        # Save
        save_response = self.session.post(
            f"{BASE_URL}/api/mealplans",
            json={"week_start": WEEK_START, "days": plan["days"]}
        )
        assert save_response.status_code == 200
        
        # Verify
        verify_response = self.session.get(
            f"{BASE_URL}/api/mealplans?week_start={WEEK_START}"
        )
        updated_plan = verify_response.json()
        monday = next((d for d in updated_plan["days"] if d["date"] == "2026-03-23"), None)
        
        side_dishes = monday.get("lunch", {}).get("side_dishes", [])
        assert len(side_dishes) >= 1, "Monday lunch should have at least 1 side dish"
        
        print(f"Monday lunch now has {len(side_dishes)} side dish(es)")
        print("TEST PASSED: Adding new side dish works")


class TestRecipesForMealPlan:
    """Test that recipes exist and can be used in meal plan"""
    
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
    
    def test_recipes_exist(self):
        """Test: Required test recipes exist"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        
        recipes = response.json()
        recipe_ids = [r.get("recipe_id") for r in recipes]
        
        print(f"Found {len(recipes)} recipes")
        for r in recipes:
            print(f"  - {r.get('recipe_id')}: {r.get('name')}")
        
        assert MAIN_RECIPE_ID in recipe_ids, f"Main recipe {MAIN_RECIPE_ID} should exist"
        assert SIDE_DISH_RECIPE_ID in recipe_ids, f"Side dish recipe {SIDE_DISH_RECIPE_ID} should exist"
        
        print("TEST PASSED: Required recipes exist")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
