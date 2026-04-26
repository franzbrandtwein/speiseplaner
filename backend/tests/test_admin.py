"""
Admin Dashboard API Tests
Tests for admin endpoints: user list, user data, export, import
"""
import pytest
import requests
import os
import io
import zipfile
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@richardachatz.de"
ADMIN_PASSWORD = "nU72A4TzSmV258j"
NON_ADMIN_EMAIL = "test_debug@test.de"
NON_ADMIN_PASSWORD = "password123"


class TestAdminAuth:
    """Test admin authentication guard"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        return session
    
    @pytest.fixture(scope="class")
    def non_admin_session(self):
        """Get authenticated non-admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NON_ADMIN_EMAIL,
            "password": NON_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Non-admin login failed: {response.status_code} - {response.text}")
        return session
    
    def test_admin_users_returns_403_for_non_admin(self, non_admin_session):
        """Non-admin users should get 403 on admin endpoints"""
        response = non_admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        print(f"Non-admin correctly blocked: {data['detail']}")
    
    def test_admin_users_returns_list_for_admin(self, admin_session):
        """Admin user should get user list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of users"
        assert len(data) > 0, "Expected at least one user"
        print(f"Admin got {len(data)} users")
        return data


class TestAdminUsersList:
    """Test admin users list endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_users_list_includes_counts(self, admin_session):
        """User list should include recipe_count, plan_count, staple_count"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200
        data = response.json()
        
        # Check first user has required count fields
        user = data[0]
        assert "recipe_count" in user, "Missing recipe_count field"
        assert "plan_count" in user, "Missing plan_count field"
        assert "staple_count" in user, "Missing staple_count field"
        
        # Verify counts are integers
        assert isinstance(user["recipe_count"], int), "recipe_count should be int"
        assert isinstance(user["plan_count"], int), "plan_count should be int"
        assert isinstance(user["staple_count"], int), "staple_count should be int"
        
        print(f"User {user.get('email')}: {user['recipe_count']} recipes, {user['plan_count']} plans, {user['staple_count']} staples")
    
    def test_users_list_excludes_password_hash(self, admin_session):
        """User list should not include password_hash"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200
        data = response.json()
        
        for user in data:
            assert "password_hash" not in user, f"password_hash exposed for user {user.get('email')}"
        print("Password hashes correctly excluded from user list")


class TestAdminUserDetail:
    """Test admin user detail endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    @pytest.fixture(scope="class")
    def test_user_id(self, admin_session):
        """Get a user ID to test with"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        if response.status_code != 200:
            pytest.skip("Could not get users list")
        users = response.json()
        if not users:
            pytest.skip("No users found")
        return users[0]["user_id"]
    
    def test_user_data_returns_all_sections(self, admin_session, test_user_id):
        """User detail should return all data sections"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users/{test_user_id}/data")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check all required sections exist
        assert "user" in data, "Missing user section"
        assert "recipes" in data, "Missing recipes section"
        assert "meal_plans" in data, "Missing meal_plans section"
        assert "staple_items" in data, "Missing staple_items section"
        assert "templates" in data, "Missing templates section"
        
        # Verify sections are lists (except user)
        assert isinstance(data["recipes"], list), "recipes should be list"
        assert isinstance(data["meal_plans"], list), "meal_plans should be list"
        assert isinstance(data["staple_items"], list), "staple_items should be list"
        assert isinstance(data["templates"], list), "templates should be list"
        
        print(f"User data: {len(data['recipes'])} recipes, {len(data['meal_plans'])} plans, {len(data['staple_items'])} staples, {len(data['templates'])} templates")
    
    def test_user_data_404_for_invalid_user(self, admin_session):
        """Should return 404 for non-existent user"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users/nonexistent-user-id/data")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returns 404 for invalid user")


class TestAdminExport:
    """Test admin export endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def test_export_returns_zip(self, admin_session):
        """Export should return a valid ZIP file"""
        response = admin_session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "application/zip" in content_type or "application/octet-stream" in content_type, f"Unexpected content type: {content_type}"
        
        # Verify it's a valid ZIP
        buf = io.BytesIO(response.content)
        assert zipfile.is_zipfile(buf), "Response is not a valid ZIP file"
        print(f"Export returned valid ZIP ({len(response.content)} bytes)")
    
    def test_export_contains_collections(self, admin_session):
        """Export ZIP should contain JSON files for each collection"""
        response = admin_session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 200
        
        buf = io.BytesIO(response.content)
        with zipfile.ZipFile(buf, "r") as zf:
            files = zf.namelist()
            
            # Check for expected collection files
            expected_collections = ["users", "recipes", "meal_plans", "staple_items"]
            for coll in expected_collections:
                assert f"{coll}.json" in files, f"Missing {coll}.json in export"
            
            # Check for metadata
            assert "_metadata.json" in files, "Missing _metadata.json in export"
            
            # Verify metadata content
            meta = json.loads(zf.read("_metadata.json"))
            assert "exported_at" in meta, "Missing exported_at in metadata"
            assert "exported_by" in meta, "Missing exported_by in metadata"
            assert meta["exported_by"] == ADMIN_EMAIL, f"Wrong exporter: {meta['exported_by']}"
            
            print(f"Export contains {len(files)} files: {files}")
    
    def test_export_excludes_password_hashes(self, admin_session):
        """Export should not include password hashes"""
        response = admin_session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 200
        
        buf = io.BytesIO(response.content)
        with zipfile.ZipFile(buf, "r") as zf:
            users_data = json.loads(zf.read("users.json"))
            for user in users_data:
                assert "password_hash" not in user, f"password_hash exposed in export for {user.get('email')}"
        print("Password hashes correctly excluded from export")


class TestAdminImport:
    """Test admin import endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get authenticated admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code}")
        return session
    
    def _create_test_zip(self, data_dict):
        """Create a test ZIP file with given data"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in data_dict.items():
                zf.writestr(f"{name}.json", json.dumps(data, ensure_ascii=False))
        buf.seek(0)
        return buf
    
    def test_import_rejects_invalid_file(self, admin_session):
        """Import should reject non-ZIP files"""
        # Send a non-ZIP file
        files = {"file": ("test.txt", b"not a zip file", "text/plain")}
        response = admin_session.post(f"{BASE_URL}/api/admin/import-upload?mode=merge", files=files)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly rejects non-ZIP files")
    
    def test_import_merge_mode(self, admin_session):
        """Import with merge mode should work"""
        # Create a minimal test ZIP with empty data (won't affect existing data)
        test_zip = self._create_test_zip({
            "recipes": [],
            "meal_plans": []
        })
        
        files = {"file": ("test_import.zip", test_zip, "application/zip")}
        response = admin_session.post(f"{BASE_URL}/api/admin/import-upload?mode=merge", files=files)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "stats" in data, "Missing stats in response"
        print(f"Merge import successful: {data}")
    
    def test_import_overwrite_mode_accepted(self, admin_session):
        """Import with overwrite mode should be accepted (but we use empty data to avoid data loss)"""
        # Create a minimal test ZIP - we'll use empty arrays to avoid actual data loss
        # This just tests that the endpoint accepts the mode parameter
        test_zip = self._create_test_zip({
            # Empty collections - won't delete anything meaningful
        })
        
        files = {"file": ("test_import.zip", test_zip, "application/zip")}
        response = admin_session.post(f"{BASE_URL}/api/admin/import-upload?mode=overwrite", files=files)
        # Should succeed (200) even with empty data
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("Overwrite mode accepted")


class TestAdminNonAdminAccess:
    """Test that non-admin users cannot access admin endpoints"""
    
    @pytest.fixture(scope="class")
    def non_admin_session(self):
        """Get authenticated non-admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": NON_ADMIN_EMAIL,
            "password": NON_ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Non-admin login failed: {response.status_code}")
        return session
    
    def test_non_admin_blocked_from_users_list(self, non_admin_session):
        """Non-admin should get 403 on users list"""
        response = non_admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 403
        print("Non-admin blocked from users list")
    
    def test_non_admin_blocked_from_user_data(self, non_admin_session):
        """Non-admin should get 403 on user data"""
        response = non_admin_session.get(f"{BASE_URL}/api/admin/users/some-user-id/data")
        assert response.status_code == 403
        print("Non-admin blocked from user data")
    
    def test_non_admin_blocked_from_export(self, non_admin_session):
        """Non-admin should get 403 on export"""
        response = non_admin_session.get(f"{BASE_URL}/api/admin/export")
        assert response.status_code == 403
        print("Non-admin blocked from export")
    
    def test_non_admin_blocked_from_import(self, non_admin_session):
        """Non-admin should get 403 on import"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("test.json", "[]")
        buf.seek(0)
        
        files = {"file": ("test.zip", buf, "application/zip")}
        response = non_admin_session.post(f"{BASE_URL}/api/admin/import-upload?mode=merge", files=files)
        assert response.status_code == 403
        print("Non-admin blocked from import")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
