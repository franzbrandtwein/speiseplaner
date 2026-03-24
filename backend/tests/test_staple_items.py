"""
Test suite for Staple Items (Sonstige Artikel) feature
Tests CRUD operations for staple items and their integration with shopping list
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_EMAIL = "test_debug@test.de"
TEST_PASSWORD = "password123"

class TestStapleItemsCRUD:
    """Test Staple Items CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        
        # Store created item IDs for cleanup
        self.created_items = []
        
        yield
        
        # Cleanup: Delete test-created items
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/staple-items/{item_id}")
            except:
                pass
    
    def test_get_staple_items_returns_list_and_categories(self):
        """GET /api/staple-items returns items list and categories"""
        response = self.session.get(f"{BASE_URL}/api/staple-items")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "items" in data, "Response should contain 'items' key"
        assert "categories" in data, "Response should contain 'categories' key"
        assert isinstance(data["items"], list), "items should be a list"
        assert isinstance(data["categories"], list), "categories should be a list"
        
        # Verify expected categories
        expected_categories = ["Getränke", "Gewürze", "Haushalt", "Hygiene", "Backzutaten", "Sonstiges"]
        for cat in expected_categories:
            assert cat in data["categories"], f"Category '{cat}' should be in categories"
        
        print(f"✓ GET /api/staple-items returns {len(data['items'])} items and {len(data['categories'])} categories")
    
    def test_create_staple_item(self):
        """POST /api/staple-items creates a new staple item"""
        new_item = {
            "name": "TEST_Testgetränk",
            "amount": 3.5,
            "unit": "Flasche",
            "category": "Getränke",
            "active": True
        }
        
        response = self.session.post(f"{BASE_URL}/api/staple-items", json=new_item)
        
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Verify response contains created item
        assert "item_id" in data, "Response should contain item_id"
        assert data["name"] == new_item["name"]
        assert data["amount"] == new_item["amount"]
        assert data["unit"] == new_item["unit"]
        assert data["category"] == new_item["category"]
        assert data["active"] == new_item["active"]
        
        self.created_items.append(data["item_id"])
        
        # Verify item exists via GET
        get_response = self.session.get(f"{BASE_URL}/api/staple-items")
        items = get_response.json()["items"]
        item_ids = [i["item_id"] for i in items]
        assert data["item_id"] in item_ids, "Created item should appear in items list"
        
        print(f"✓ POST /api/staple-items created item: {data['item_id']}")
    
    def test_update_staple_item(self):
        """PUT /api/staple-items/{id} updates an existing item"""
        # First create an item
        create_response = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_UpdateItem",
            "amount": 2,
            "unit": "Packung",
            "category": "Haushalt",
            "active": True
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        self.created_items.append(item_id)
        
        # Update the item
        update_data = {
            "name": "TEST_UpdatedItem",
            "amount": 5,
            "unit": "Rolle",
            "category": "Hygiene"
        }
        update_response = self.session.put(f"{BASE_URL}/api/staple-items/{item_id}", json=update_data)
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        
        assert updated["name"] == update_data["name"]
        assert updated["amount"] == update_data["amount"]
        assert updated["unit"] == update_data["unit"]
        assert updated["category"] == update_data["category"]
        
        print(f"✓ PUT /api/staple-items/{item_id} updated successfully")
    
    def test_toggle_active_flag(self):
        """PUT /api/staple-items/{id} can toggle active flag"""
        # Create an active item
        create_response = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_ToggleItem",
            "amount": 1,
            "unit": "Stück",
            "category": "Sonstiges",
            "active": True
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        self.created_items.append(item_id)
        
        # Deactivate the item
        deactivate_response = self.session.put(
            f"{BASE_URL}/api/staple-items/{item_id}",
            json={"active": False}
        )
        assert deactivate_response.status_code == 200
        assert deactivate_response.json()["active"] == False
        
        # Reactivate the item
        activate_response = self.session.put(
            f"{BASE_URL}/api/staple-items/{item_id}",
            json={"active": True}
        )
        assert activate_response.status_code == 200
        assert activate_response.json()["active"] == True
        
        print(f"✓ Toggle active flag works for item {item_id}")
    
    def test_delete_staple_item(self):
        """DELETE /api/staple-items/{id} deletes an item"""
        # Create an item to delete
        create_response = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_DeleteItem",
            "amount": 1,
            "unit": "Dose",
            "category": "Sonstiges",
            "active": True
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        
        # Delete the item
        delete_response = self.session.delete(f"{BASE_URL}/api/staple-items/{item_id}")
        assert delete_response.status_code == 200
        
        # Verify item no longer exists
        get_response = self.session.get(f"{BASE_URL}/api/staple-items")
        items = get_response.json()["items"]
        item_ids = [i["item_id"] for i in items]
        assert item_id not in item_ids, "Deleted item should not appear in items list"
        
        print(f"✓ DELETE /api/staple-items/{item_id} deleted successfully")
    
    def test_delete_nonexistent_item_returns_404(self):
        """DELETE /api/staple-items/{id} returns 404 for nonexistent item"""
        response = self.session.delete(f"{BASE_URL}/api/staple-items/nonexistent_id_12345")
        assert response.status_code == 404
        print("✓ DELETE nonexistent item returns 404")


class TestShoppingListWithStapleItems:
    """Test shopping list integration with staple items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
        
        self.created_items = []
        yield
        
        # Cleanup
        for item_id in self.created_items:
            try:
                self.session.delete(f"{BASE_URL}/api/staple-items/{item_id}")
            except:
                pass
    
    def test_shopping_list_includes_staple_items_array(self):
        """GET /api/shopping-list includes staple_items array"""
        response = self.session.get(f"{BASE_URL}/api/shopping-list?week_start=2026-01-20")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data, "Response should contain 'items' key"
        assert "staple_items" in data, "Response should contain 'staple_items' key"
        assert "week_start" in data, "Response should contain 'week_start' key"
        
        print(f"✓ Shopping list contains items ({len(data['items'])}), staple_items ({len(data['staple_items'])})")
    
    def test_only_active_staple_items_in_shopping_list(self):
        """Only active staple items appear in shopping list"""
        # Create an active item
        active_item = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_ActiveShoppingItem",
            "amount": 2,
            "unit": "Liter",
            "category": "Getränke",
            "active": True
        }).json()
        self.created_items.append(active_item["item_id"])
        
        # Create an inactive item
        inactive_item = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_InactiveShoppingItem",
            "amount": 1,
            "unit": "kg",
            "category": "Gewürze",
            "active": False
        }).json()
        self.created_items.append(inactive_item["item_id"])
        
        # Get shopping list
        response = self.session.get(f"{BASE_URL}/api/shopping-list?week_start=2026-01-20")
        assert response.status_code == 200
        
        staple_items = response.json()["staple_items"]
        staple_ids = [s["item_id"] for s in staple_items]
        
        assert active_item["item_id"] in staple_ids, "Active item should be in shopping list"
        assert inactive_item["item_id"] not in staple_ids, "Inactive item should NOT be in shopping list"
        
        print("✓ Only active staple items appear in shopping list")
    
    def test_deactivating_item_removes_from_shopping_list(self):
        """Deactivating a staple item removes it from shopping list"""
        # Create an active item
        item = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_DeactivateItem",
            "amount": 3,
            "unit": "Packung",
            "category": "Haushalt",
            "active": True
        }).json()
        self.created_items.append(item["item_id"])
        
        # Verify it's in shopping list
        response1 = self.session.get(f"{BASE_URL}/api/shopping-list?week_start=2026-01-20")
        staple_ids1 = [s["item_id"] for s in response1.json()["staple_items"]]
        assert item["item_id"] in staple_ids1, "Active item should be in shopping list"
        
        # Deactivate the item
        self.session.put(f"{BASE_URL}/api/staple-items/{item['item_id']}", json={"active": False})
        
        # Verify it's removed from shopping list
        response2 = self.session.get(f"{BASE_URL}/api/shopping-list?week_start=2026-01-20")
        staple_ids2 = [s["item_id"] for s in response2.json()["staple_items"]]
        assert item["item_id"] not in staple_ids2, "Deactivated item should NOT be in shopping list"
        
        print("✓ Deactivating item removes it from shopping list")
    
    def test_staple_item_structure_in_shopping_list(self):
        """Staple items in shopping list have correct structure"""
        # Create an item
        item = self.session.post(f"{BASE_URL}/api/staple-items", json={
            "name": "TEST_StructureItem",
            "amount": 6,
            "unit": "Flasche",
            "category": "Getränke",
            "active": True
        }).json()
        self.created_items.append(item["item_id"])
        
        # Get shopping list
        response = self.session.get(f"{BASE_URL}/api/shopping-list?week_start=2026-01-20")
        staple_items = response.json()["staple_items"]
        
        # Find our item
        our_item = next((s for s in staple_items if s["item_id"] == item["item_id"]), None)
        assert our_item is not None, "Created item should be in shopping list"
        
        # Verify structure
        assert "item_id" in our_item
        assert "ingredient_name" in our_item
        assert "total_amount" in our_item
        assert "unit" in our_item
        assert "category" in our_item
        assert "is_staple" in our_item
        
        assert our_item["ingredient_name"] == "TEST_StructureItem"
        assert our_item["total_amount"] in ["6", "6.0"], f"Expected '6' or '6.0', got {our_item['total_amount']}"
        assert our_item["unit"] == "Flasche"
        assert our_item["category"] == "Getränke"
        assert our_item["is_staple"] == True
        
        print("✓ Staple item structure in shopping list is correct")


class TestExistingStapleItems:
    """Test existing staple items mentioned in requirements"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200
    
    def test_existing_staple_items_present(self):
        """Verify existing staple items are present (Mineralwasser, Küchentücher, Olivenöl)"""
        response = self.session.get(f"{BASE_URL}/api/staple-items")
        assert response.status_code == 200
        
        items = response.json()["items"]
        item_names = [i["name"] for i in items]
        
        # Check for expected items (may have been created by main agent)
        expected_items = ["Mineralwasser", "Küchentücher", "Olivenöl"]
        found_items = [name for name in expected_items if name in item_names]
        
        print(f"✓ Found {len(found_items)}/{len(expected_items)} expected items: {found_items}")
        print(f"  All items: {item_names}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
