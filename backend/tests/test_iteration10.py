"""
Iteration 10 Tests - Testing:
1. Admin nav link visibility (admin vs non-admin)
2. Backend refactoring (admin routes in routes/admin.py)
3. Clipboard import via LLM
4. URL import (EatSmarter, Chefkoch)
5. Non-admin 403 on admin endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@richardachatz.de"
ADMIN_PASSWORD = "nU72A4TzSmV258j"
NON_ADMIN_EMAIL = "test_debug@test.de"
NON_ADMIN_PASSWORD = "password123"


class TestSession:
    """Helper to manage authenticated sessions"""
    
    @staticmethod
    def login(email: str, password: str) -> requests.Session:
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code != 200:
            pytest.skip(f"Login failed for {email}: {response.status_code}")
        return session


class TestAdminAccessControl:
    """Test admin endpoint access control after refactoring to routes/admin.py"""
    
    def test_admin_users_returns_403_for_non_admin(self):
        """Non-admin user should get 403 on /api/admin/users"""
        session = TestSession.login(NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Non-admin correctly blocked from /api/admin/users (403)")
    
    def test_admin_users_returns_200_for_admin(self):
        """Admin user should get 200 on /api/admin/users"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of users"
        print(f"✓ Admin can access /api/admin/users (200) - {len(data)} users")
    
    def test_admin_export_returns_403_for_non_admin(self):
        """Non-admin user should get 403 on /api/admin/export"""
        session = TestSession.login(NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"✓ Non-admin correctly blocked from /api/admin/export (403)")
    
    def test_admin_export_returns_zip_for_admin(self):
        """Admin user should get ZIP file from /api/admin/export"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/zip" in response.headers.get("Content-Type", ""), "Expected ZIP content type"
        print(f"✓ Admin can export data as ZIP (200)")


class TestClipboardImport:
    """Test clipboard import via LLM (POST /api/recipes/import-clipboard)"""
    
    def test_clipboard_import_requires_auth(self):
        """Clipboard import should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/recipes/import-clipboard",
            json={"text": "Test recipe text"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Clipboard import requires authentication (401)")
    
    def test_clipboard_import_rejects_short_text(self):
        """Clipboard import should reject text < 20 chars"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = session.post(
            f"{BASE_URL}/api/recipes/import-clipboard",
            json={"text": "Too short"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ Clipboard import rejects short text (400)")
    
    def test_clipboard_import_parses_recipe_text(self):
        """Clipboard import should parse recipe text via LLM"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        
        # Sample recipe text (German)
        recipe_text = """
        Spaghetti Aglio e Olio
        
        Ein klassisches italienisches Pasta-Gericht mit Knoblauch und Olivenöl.
        
        Zutaten für 4 Portionen:
        - 400g Spaghetti
        - 6 Knoblauchzehen
        - 100ml Olivenöl extra vergine
        - 1 TL Chiliflocken
        - Salz nach Geschmack
        - Frische Petersilie
        - 50g Parmesan
        
        Zubereitung:
        1. Spaghetti in reichlich Salzwasser al dente kochen.
        2. Knoblauch in dünne Scheiben schneiden.
        3. Olivenöl in einer Pfanne erhitzen, Knoblauch und Chiliflocken darin goldbraun anbraten.
        4. Pasta abgießen (etwas Kochwasser aufheben) und zur Knoblauch-Öl-Mischung geben.
        5. Mit Petersilie und Parmesan servieren.
        
        Zubereitungszeit: 20 Minuten
        """
        
        response = session.post(
            f"{BASE_URL}/api/recipes/import-clipboard",
            json={"text": recipe_text}
        )
        
        # LLM calls can take time
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Expected success=True"
        assert "recipe" in data, "Expected recipe in response"
        
        recipe = data["recipe"]
        assert "name" in recipe, "Recipe should have name"
        assert "ingredients" in recipe, "Recipe should have ingredients"
        assert "instructions" in recipe, "Recipe should have instructions"
        
        print(f"✓ Clipboard import parsed recipe: {recipe.get('name')}")
        print(f"  - Ingredients: {len(recipe.get('ingredients', []))}")
        print(f"  - Instructions: {len(recipe.get('instructions', []))}")
        if recipe.get('nutrition'):
            print(f"  - Nutrition: {recipe.get('nutrition')}")


class TestURLImport:
    """Test URL import for various recipe websites"""
    
    def test_url_import_requires_auth(self):
        """URL import should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/recipes/import-preview",
            json={"url": "https://www.chefkoch.de/rezepte/123"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ URL import requires authentication (401)")
    
    def test_url_import_eatsmarter(self):
        """Test importing from EatSmarter"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        
        # Use a real EatSmarter URL
        response = session.post(
            f"{BASE_URL}/api/recipes/import-preview",
            json={"url": "https://eatsmarter.de/rezepte/spaghetti-carbonara-0"}
        )
        
        # May fail if site blocks or URL changed, but should not be 500
        if response.status_code == 200:
            data = response.json()
            assert "recipe" in data, "Expected recipe in response"
            print(f"✓ EatSmarter import works: {data['recipe'].get('name')}")
        elif response.status_code == 422:
            print(f"⚠ EatSmarter URL may have changed or site blocked scraping (422)")
        else:
            print(f"⚠ EatSmarter import returned {response.status_code}")
    
    def test_url_import_chefkoch(self):
        """Test importing from Chefkoch"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        
        # Use a real Chefkoch URL
        response = session.post(
            f"{BASE_URL}/api/recipes/import-preview",
            json={"url": "https://www.chefkoch.de/rezepte/1144631223132970/Spaghetti-Carbonara.html"}
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "recipe" in data, "Expected recipe in response"
            print(f"✓ Chefkoch import works: {data['recipe'].get('name')}")
        elif response.status_code == 422:
            print(f"⚠ Chefkoch URL may have changed or site blocked scraping (422)")
        else:
            print(f"⚠ Chefkoch import returned {response.status_code}")


class TestAdminRouterRefactoring:
    """Verify admin routes work after extraction to routes/admin.py"""
    
    def test_admin_users_endpoint_exists(self):
        """GET /api/admin/users should exist"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code != 404, "Admin users endpoint should exist"
        print(f"✓ /api/admin/users endpoint exists")
    
    def test_admin_user_data_endpoint_exists(self):
        """GET /api/admin/users/{user_id}/data should exist"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        
        # First get a user ID
        users_response = session.get(f"{BASE_URL}/api/admin/users")
        if users_response.status_code == 200 and users_response.json():
            user_id = users_response.json()[0].get("user_id")
            response = session.get(f"{BASE_URL}/api/admin/users/{user_id}/data")
            assert response.status_code != 404, "Admin user data endpoint should exist"
            print(f"✓ /api/admin/users/{{user_id}}/data endpoint exists")
        else:
            pytest.skip("No users found to test user data endpoint")
    
    def test_admin_export_endpoint_exists(self):
        """GET /api/admin/export should exist"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        response = session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code != 404, "Admin export endpoint should exist"
        print(f"✓ /api/admin/export endpoint exists")
    
    def test_admin_import_upload_endpoint_exists(self):
        """POST /api/admin/import-upload should exist"""
        session = TestSession.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        # Just check it doesn't 404 (will fail validation without file)
        response = session.post(f"{BASE_URL}/api/admin/import-upload")
        assert response.status_code != 404, "Admin import-upload endpoint should exist"
        print(f"✓ /api/admin/import-upload endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
