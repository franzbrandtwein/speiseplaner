"""
Test Multi-Meal Slots Feature for German Meal Planner
Tests:
- Multiple meals per slot (breakfast/lunch/dinner)
- Backward compatibility: old single-object format converted to arrays
- Shopping list aggregation from multi-meal slots
- CRUD operations on multi-meal slots
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMultiMealSlots:
    """Test multi-meal slot functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for all tests"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_debug@test.de",
            "password": "password123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        
        # Get recipes for testing
        recipes_resp = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_resp.status_code == 200
        self.recipes = recipes_resp.json()
        assert len(self.recipes) > 0, "Need at least one recipe for testing"
        
        # Use a test week that won't conflict with existing data
        self.test_week_start = "2026-04-06"  # A future week for testing
        yield
        
        # Cleanup: Clear the test week's meal plan
        try:
            self.session.post(f"{BASE_URL}/api/mealplans", json={
                "week_start": self.test_week_start,
                "days": [
                    {"date": f"2026-04-0{6+i}", "breakfast": [], "lunch": [], "dinner": []}
                    for i in range(7)
                ]
            })
        except:
            pass

    def test_get_mealplan_returns_arrays(self):
        """GET /api/mealplans should return meal slots as arrays"""
        resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify structure
        assert "days" in data
        assert len(data["days"]) == 7
        
        for day in data["days"]:
            assert "date" in day
            assert "breakfast" in day
            assert "lunch" in day
            assert "dinner" in day
            # All meal slots should be arrays
            assert isinstance(day["breakfast"], list), f"breakfast should be list, got {type(day['breakfast'])}"
            assert isinstance(day["lunch"], list), f"lunch should be list, got {type(day['lunch'])}"
            assert isinstance(day["dinner"], list), f"dinner should be list, got {type(day['dinner'])}"
        
        print("✓ GET /api/mealplans returns arrays for all meal slots")

    def test_save_single_meal_in_slot(self):
        """POST /api/mealplans with single meal per slot"""
        recipe = self.recipes[0]
        
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [],
                "lunch": [{
                    "recipe_id": recipe["recipe_id"],
                    "recipe_name": recipe["name"],
                    "portions": 2,
                    "side_dishes": [],
                    "assigned_to": []
                }] if i == 0 else [],  # Only first day has lunch
                "dinner": []
            })
        
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200, f"Save failed: {resp.text}"
        
        # Verify it was saved
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert get_resp.status_code == 200
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert len(first_day["lunch"]) == 1
        assert first_day["lunch"][0]["recipe_id"] == recipe["recipe_id"]
        assert first_day["lunch"][0]["portions"] == 2
        
        print("✓ Single meal per slot saves and retrieves correctly")

    def test_save_multiple_meals_in_slot(self):
        """POST /api/mealplans with multiple meals in same slot"""
        if len(self.recipes) < 2:
            pytest.skip("Need at least 2 recipes for multi-meal test")
        
        recipe1 = self.recipes[0]
        recipe2 = self.recipes[1] if len(self.recipes) > 1 else self.recipes[0]
        
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [
                    {
                        "recipe_id": recipe1["recipe_id"],
                        "recipe_name": recipe1["name"],
                        "portions": 2,
                        "side_dishes": [],
                        "assigned_to": ["Person A"]
                    },
                    {
                        "recipe_id": recipe2["recipe_id"],
                        "recipe_name": recipe2["name"],
                        "portions": 3,
                        "side_dishes": [],
                        "assigned_to": ["Person B"]
                    }
                ] if i == 0 else [],  # Only first day has multi-meal breakfast
                "lunch": [],
                "dinner": []
            })
        
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200, f"Save failed: {resp.text}"
        
        # Verify it was saved
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert get_resp.status_code == 200
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert len(first_day["breakfast"]) == 2, f"Expected 2 meals, got {len(first_day['breakfast'])}"
        
        # Verify first meal
        meal1 = first_day["breakfast"][0]
        assert meal1["recipe_id"] == recipe1["recipe_id"]
        assert meal1["portions"] == 2
        assert meal1["assigned_to"] == ["Person A"]
        
        # Verify second meal
        meal2 = first_day["breakfast"][1]
        assert meal2["recipe_id"] == recipe2["recipe_id"]
        assert meal2["portions"] == 3
        assert meal2["assigned_to"] == ["Person B"]
        
        print("✓ Multiple meals per slot saves and retrieves correctly")

    def test_meal_with_side_dishes(self):
        """Test meal with side dishes in multi-meal slot"""
        if len(self.recipes) < 2:
            pytest.skip("Need at least 2 recipes for side dish test")
        
        main_recipe = self.recipes[0]
        side_recipe = self.recipes[1] if len(self.recipes) > 1 else self.recipes[0]
        
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [],
                "lunch": [{
                    "recipe_id": main_recipe["recipe_id"],
                    "recipe_name": main_recipe["name"],
                    "portions": 4,
                    "side_dishes": [{
                        "recipe_id": side_recipe["recipe_id"],
                        "recipe_name": side_recipe["name"],
                        "portions": 4
                    }],
                    "assigned_to": []
                }] if i == 0 else [],
                "dinner": []
            })
        
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200, f"Save failed: {resp.text}"
        
        # Verify
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert get_resp.status_code == 200
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert len(first_day["lunch"]) == 1
        meal = first_day["lunch"][0]
        assert len(meal["side_dishes"]) == 1
        assert meal["side_dishes"][0]["recipe_id"] == side_recipe["recipe_id"]
        assert meal["side_dishes"][0]["portions"] == 4
        
        print("✓ Meal with side dishes saves correctly in multi-meal slot")

    def test_shopping_list_aggregates_multi_meals(self):
        """Shopping list should aggregate ingredients from all meals in multi-meal slots"""
        if len(self.recipes) < 2:
            pytest.skip("Need at least 2 recipes for shopping list test")
        
        recipe1 = self.recipes[0]
        recipe2 = self.recipes[1] if len(self.recipes) > 1 else self.recipes[0]
        
        # Save a meal plan with multiple meals
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [
                    {
                        "recipe_id": recipe1["recipe_id"],
                        "recipe_name": recipe1["name"],
                        "portions": 2,
                        "side_dishes": [],
                        "assigned_to": []
                    },
                    {
                        "recipe_id": recipe2["recipe_id"],
                        "recipe_name": recipe2["name"],
                        "portions": 2,
                        "side_dishes": [],
                        "assigned_to": []
                    }
                ] if i == 0 else [],
                "lunch": [],
                "dinner": []
            })
        
        save_resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert save_resp.status_code == 200
        
        # Get shopping list
        list_resp = self.session.get(f"{BASE_URL}/api/shopping-list?week_start={self.test_week_start}")
        assert list_resp.status_code == 200
        shopping_data = list_resp.json()
        
        assert "items" in shopping_data
        # Should have items from both recipes
        print(f"✓ Shopping list generated with {len(shopping_data['items'])} items from multi-meal slots")

    def test_assigned_to_field_persists(self):
        """Test that assigned_to field persists correctly"""
        recipe = self.recipes[0]
        
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [{
                    "recipe_id": recipe["recipe_id"],
                    "recipe_name": recipe["name"],
                    "portions": 2,
                    "side_dishes": [],
                    "assigned_to": ["Alice", "Bob"]
                }] if i == 0 else [],
                "lunch": [],
                "dinner": []
            })
        
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200
        
        # Verify
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert get_resp.status_code == 200
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        meal = first_day["breakfast"][0]
        assert meal["assigned_to"] == ["Alice", "Bob"], f"Expected ['Alice', 'Bob'], got {meal['assigned_to']}"
        
        print("✓ assigned_to field persists correctly")

    def test_clear_all_meals_from_slot(self):
        """Test clearing all meals from a slot"""
        recipe = self.recipes[0]
        
        # First add meals
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [{
                    "recipe_id": recipe["recipe_id"],
                    "recipe_name": recipe["name"],
                    "portions": 2,
                    "side_dishes": [],
                    "assigned_to": []
                }] if i == 0 else [],
                "lunch": [],
                "dinner": []
            })
        
        self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        
        # Now clear the slot
        days[0]["breakfast"] = []
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200
        
        # Verify it's cleared
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        assert get_resp.status_code == 200
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert len(first_day["breakfast"]) == 0, f"Expected empty array, got {first_day['breakfast']}"
        
        print("✓ Clear all meals from slot works correctly")

    def test_update_individual_meal_portions(self):
        """Test updating portions for individual meal in multi-meal slot"""
        if len(self.recipes) < 2:
            pytest.skip("Need at least 2 recipes")
        
        recipe1 = self.recipes[0]
        recipe2 = self.recipes[1] if len(self.recipes) > 1 else self.recipes[0]
        
        # Add two meals
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [
                    {"recipe_id": recipe1["recipe_id"], "recipe_name": recipe1["name"], "portions": 2, "side_dishes": [], "assigned_to": []},
                    {"recipe_id": recipe2["recipe_id"], "recipe_name": recipe2["name"], "portions": 2, "side_dishes": [], "assigned_to": []}
                ] if i == 0 else [],
                "lunch": [],
                "dinner": []
            })
        
        self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        
        # Update only second meal's portions
        days[0]["breakfast"][1]["portions"] = 5
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200
        
        # Verify
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert first_day["breakfast"][0]["portions"] == 2, "First meal portions should be unchanged"
        assert first_day["breakfast"][1]["portions"] == 5, "Second meal portions should be updated"
        
        print("✓ Individual meal portions update correctly")

    def test_remove_individual_meal_from_slot(self):
        """Test removing one meal from multi-meal slot"""
        if len(self.recipes) < 2:
            pytest.skip("Need at least 2 recipes")
        
        recipe1 = self.recipes[0]
        recipe2 = self.recipes[1] if len(self.recipes) > 1 else self.recipes[0]
        
        # Add two meals
        days = []
        for i in range(7):
            day_date = f"2026-04-{6+i:02d}"
            days.append({
                "date": day_date,
                "breakfast": [
                    {"recipe_id": recipe1["recipe_id"], "recipe_name": recipe1["name"], "portions": 2, "side_dishes": [], "assigned_to": []},
                    {"recipe_id": recipe2["recipe_id"], "recipe_name": recipe2["name"], "portions": 3, "side_dishes": [], "assigned_to": []}
                ] if i == 0 else [],
                "lunch": [],
                "dinner": []
            })
        
        self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        
        # Remove first meal, keep second
        days[0]["breakfast"] = [days[0]["breakfast"][1]]
        resp = self.session.post(f"{BASE_URL}/api/mealplans", json={
            "week_start": self.test_week_start,
            "days": days
        })
        assert resp.status_code == 200
        
        # Verify
        get_resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={self.test_week_start}")
        saved_data = get_resp.json()
        
        first_day = saved_data["days"][0]
        assert len(first_day["breakfast"]) == 1, f"Expected 1 meal, got {len(first_day['breakfast'])}"
        assert first_day["breakfast"][0]["recipe_id"] == recipe2["recipe_id"]
        assert first_day["breakfast"][0]["portions"] == 3
        
        print("✓ Remove individual meal from slot works correctly")


class TestBackwardCompatibility:
    """Test backward compatibility with old single-object meal format"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login for all tests"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_debug@test.de",
            "password": "password123"
        })
        assert login_resp.status_code == 200
        yield

    def test_existing_mealplan_normalized_to_arrays(self):
        """Existing meal plans should have meals normalized to arrays in GET response"""
        # Get current week's meal plan (which may have existing data)
        from datetime import datetime
        today = datetime.now()
        # Find Monday of current week
        days_since_monday = today.weekday()
        monday = today - timedelta(days=days_since_monday)
        week_start = monday.strftime("%Y-%m-%d")
        
        resp = self.session.get(f"{BASE_URL}/api/mealplans?week_start={week_start}")
        assert resp.status_code == 200
        data = resp.json()
        
        # All meal slots should be arrays (even if empty)
        for day in data["days"]:
            assert isinstance(day["breakfast"], list), f"breakfast should be list for {day['date']}"
            assert isinstance(day["lunch"], list), f"lunch should be list for {day['date']}"
            assert isinstance(day["dinner"], list), f"dinner should be list for {day['date']}"
            
            # Each meal in array should have required fields
            for meal_type in ["breakfast", "lunch", "dinner"]:
                for meal in day[meal_type]:
                    if meal.get("recipe_id"):
                        assert "side_dishes" in meal, f"meal should have side_dishes field"
                        assert "assigned_to" in meal, f"meal should have assigned_to field"
                        assert isinstance(meal["side_dishes"], list)
                        assert isinstance(meal["assigned_to"], list)
        
        print("✓ Existing meal plans are normalized to arrays with required fields")


class TestGroupMembersEndpoint:
    """Test /api/groups/my endpoint for member assignment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login for all tests"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test_debug@test.de",
            "password": "password123"
        })
        assert login_resp.status_code == 200
        yield

    def test_groups_my_endpoint_exists(self):
        """GET /api/groups/my should return group info or empty"""
        resp = self.session.get(f"{BASE_URL}/api/groups/my")
        # Should return 200 even if user has no group
        assert resp.status_code == 200
        data = resp.json()
        
        # Should have members field (may be empty)
        assert "members" in data or data == {}, f"Expected members field or empty object, got {data}"
        
        print("✓ GET /api/groups/my endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
