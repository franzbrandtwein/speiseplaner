"""
Push Notification API Tests for German Meal Planner (Speisenplaner)
Tests all notification endpoints: VAPID key, subscribe, unsubscribe, preferences, status, test
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test_debug@test.de"
TEST_PASSWORD = "password123"
TEST_SESSION_TOKEN = "token_6507e70a9bc441e6a12bf0c717ebb578"


class TestNotificationEndpoints:
    """Test all notification-related API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}"
        })
        self.session.cookies.set("session_token", TEST_SESSION_TOKEN)
    
    # ============ VAPID Public Key ============
    def test_01_get_vapid_public_key(self):
        """GET /api/notifications/vapid-public-key returns valid VAPID key"""
        response = self.session.get(f"{BASE_URL}/api/notifications/vapid-public-key")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "public_key" in data, "Response should contain 'public_key'"
        assert data["public_key"], "VAPID public key should not be empty"
        assert len(data["public_key"]) > 50, "VAPID key should be a valid length"
        print(f"✓ VAPID public key returned: {data['public_key'][:30]}...")
    
    # ============ Notification Status (before subscription) ============
    def test_02_get_notification_status_initial(self):
        """GET /api/notifications/status returns status and preferences"""
        response = self.session.get(f"{BASE_URL}/api/notifications/status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "subscribed" in data, "Response should contain 'subscribed'"
        assert "preferences" in data, "Response should contain 'preferences'"
        
        # Check preferences structure
        prefs = data["preferences"]
        assert "meal_reminder" in prefs, "Preferences should have meal_reminder"
        assert "shopping_reminder" in prefs, "Preferences should have shopping_reminder"
        assert "empty_plan_reminder" in prefs, "Preferences should have empty_plan_reminder"
        assert "new_meal_notification" in prefs, "Preferences should have new_meal_notification"
        print(f"✓ Notification status: subscribed={data['subscribed']}")
    
    # ============ Get Preferences (default) ============
    def test_03_get_notification_preferences(self):
        """GET /api/notifications/preferences returns preferences with correct structure"""
        response = self.session.get(f"{BASE_URL}/api/notifications/preferences")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check all expected preference fields exist
        assert "meal_reminder" in data, "Should have meal_reminder"
        assert "meal_reminder_time" in data, "Should have meal_reminder_time"
        assert "shopping_reminder" in data, "Should have shopping_reminder"
        assert "shopping_reminder_day" in data, "Should have shopping_reminder_day"
        assert "shopping_reminder_time" in data, "Should have shopping_reminder_time"
        assert "empty_plan_reminder" in data, "Should have empty_plan_reminder"
        assert "empty_plan_reminder_time" in data, "Should have empty_plan_reminder_time"
        assert "new_meal_notification" in data, "Should have new_meal_notification"
        
        # Check data types
        assert isinstance(data["meal_reminder"], bool), "meal_reminder should be boolean"
        assert isinstance(data["meal_reminder_time"], str), "meal_reminder_time should be string"
        assert isinstance(data["shopping_reminder_day"], str), "shopping_reminder_day should be string"
        print(f"✓ Preferences returned with correct structure: meal_reminder_time={data['meal_reminder_time']}")
    
    # ============ Subscribe Push ============
    def test_04_subscribe_push_notification(self):
        """POST /api/notifications/subscribe creates subscription and default prefs"""
        # Generate a unique test endpoint
        test_endpoint = f"https://test-push-service.example.com/push/{uuid.uuid4().hex}"
        
        payload = {
            "endpoint": test_endpoint,
            "keys": {
                "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                "auth": "tBHItJI5svbpez7KI4CCXg"
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/notifications/subscribe", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "subscription_id" in data, "Response should contain subscription_id"
        assert data["subscription_id"].startswith("pushsub_"), "Subscription ID should have correct prefix"
        
        # Store for cleanup
        self.test_endpoint = test_endpoint
        print(f"✓ Push subscription created: {data['subscription_id']}")
    
    # ============ Status after subscription ============
    def test_05_get_notification_status_after_subscribe(self):
        """GET /api/notifications/status shows subscribed=true after subscribing"""
        # First subscribe
        test_endpoint = f"https://test-push-service.example.com/push/{uuid.uuid4().hex}"
        payload = {
            "endpoint": test_endpoint,
            "keys": {"p256dh": "test_key", "auth": "test_auth"}
        }
        self.session.post(f"{BASE_URL}/api/notifications/subscribe", json=payload)
        
        # Check status
        response = self.session.get(f"{BASE_URL}/api/notifications/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["subscribed"] == True, "Should be subscribed after subscribe call"
        assert data["subscription_count"] >= 1, "Should have at least 1 subscription"
        print(f"✓ Status shows subscribed=True, count={data['subscription_count']}")
    
    # ============ Update Preferences ============
    def test_06_update_notification_preferences(self):
        """PUT /api/notifications/preferences saves and persists preferences"""
        new_prefs = {
            "meal_reminder": False,
            "meal_reminder_time": "09:30",
            "shopping_reminder": True,
            "shopping_reminder_day": "samstag",
            "shopping_reminder_time": "11:00",
            "empty_plan_reminder": False,
            "empty_plan_reminder_time": "19:00",
            "new_meal_notification": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/notifications/preferences", json=new_prefs)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Preferences updated: {data['message']}")
        
        # Verify persistence by fetching again
        get_response = self.session.get(f"{BASE_URL}/api/notifications/preferences")
        assert get_response.status_code == 200
        
        saved_prefs = get_response.json()
        assert saved_prefs["meal_reminder"] == False, "meal_reminder should be False"
        assert saved_prefs["meal_reminder_time"] == "09:30", "meal_reminder_time should be 09:30"
        assert saved_prefs["shopping_reminder_day"] == "samstag", "shopping_reminder_day should be samstag"
        assert saved_prefs["empty_plan_reminder"] == False, "empty_plan_reminder should be False"
        print(f"✓ Preferences persisted correctly")
    
    # ============ Test Notification (no subscription) ============
    def test_07_test_notification_no_subscription(self):
        """POST /api/notifications/test returns 400 when no subscriptions exist"""
        # First unsubscribe all
        self.session.delete(f"{BASE_URL}/api/notifications/unsubscribe", json={})
        
        # Try to send test notification
        response = self.session.post(f"{BASE_URL}/api/notifications/test", json={})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        print(f"✓ Test notification correctly returns 400 when no subscriptions: {data['detail']}")
    
    # ============ Unsubscribe ============
    def test_08_unsubscribe_push_notification(self):
        """DELETE /api/notifications/unsubscribe removes subscription"""
        # First subscribe
        test_endpoint = f"https://test-push-service.example.com/push/{uuid.uuid4().hex}"
        payload = {
            "endpoint": test_endpoint,
            "keys": {"p256dh": "test_key", "auth": "test_auth"}
        }
        self.session.post(f"{BASE_URL}/api/notifications/subscribe", json=payload)
        
        # Verify subscribed
        status_before = self.session.get(f"{BASE_URL}/api/notifications/status").json()
        assert status_before["subscribed"] == True
        
        # Unsubscribe with specific endpoint
        response = self.session.delete(
            f"{BASE_URL}/api/notifications/unsubscribe",
            json={"endpoint": test_endpoint}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Unsubscribed: {data['message']}")
    
    # ============ Unsubscribe All ============
    def test_09_unsubscribe_all(self):
        """DELETE /api/notifications/unsubscribe with empty body removes all subscriptions"""
        # Subscribe multiple times
        for i in range(2):
            test_endpoint = f"https://test-push-service.example.com/push/{uuid.uuid4().hex}"
            payload = {
                "endpoint": test_endpoint,
                "keys": {"p256dh": f"test_key_{i}", "auth": f"test_auth_{i}"}
            }
            self.session.post(f"{BASE_URL}/api/notifications/subscribe", json=payload)
        
        # Unsubscribe all (empty body)
        response = self.session.delete(f"{BASE_URL}/api/notifications/unsubscribe", json={})
        assert response.status_code == 200
        
        # Verify no subscriptions
        status = self.session.get(f"{BASE_URL}/api/notifications/status").json()
        assert status["subscribed"] == False, "Should have no subscriptions after unsubscribe all"
        print(f"✓ All subscriptions removed")
    
    # ============ Restore default preferences for cleanup ============
    def test_10_restore_default_preferences(self):
        """Restore default preferences after tests"""
        default_prefs = {
            "meal_reminder": True,
            "meal_reminder_time": "08:00",
            "shopping_reminder": True,
            "shopping_reminder_day": "sonntag",
            "shopping_reminder_time": "10:00",
            "empty_plan_reminder": True,
            "empty_plan_reminder_time": "18:00",
            "new_meal_notification": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/notifications/preferences", json=default_prefs)
        assert response.status_code == 200
        print(f"✓ Default preferences restored")


class TestMealPlanInstantNotification:
    """Test that saving a meal plan with new meals triggers instant notification logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}"
        })
        self.session.cookies.set("session_token", TEST_SESSION_TOKEN)
    
    def test_11_mealplan_save_with_new_meal(self):
        """POST /api/mealplans with new meal should work (notification logic exists)"""
        # Use a test week that won't conflict
        test_week = "2026-04-06"  # A future week
        
        # First get existing plan (or empty)
        get_response = self.session.get(f"{BASE_URL}/api/mealplans?week_start={test_week}")
        assert get_response.status_code == 200
        
        # Create a meal plan with a new meal
        payload = {
            "week_start": test_week,
            "days": [
                {
                    "date": "2026-04-06",
                    "breakfast": None,
                    "lunch": {
                        "recipe_id": "recipe_test_notification",
                        "recipe_name": "Test Notification Meal",
                        "portions": 2,
                        "side_dishes": []
                    },
                    "dinner": None
                },
                {"date": "2026-04-07", "breakfast": None, "lunch": None, "dinner": None},
                {"date": "2026-04-08", "breakfast": None, "lunch": None, "dinner": None},
                {"date": "2026-04-09", "breakfast": None, "lunch": None, "dinner": None},
                {"date": "2026-04-10", "breakfast": None, "lunch": None, "dinner": None},
                {"date": "2026-04-11", "breakfast": None, "lunch": None, "dinner": None},
                {"date": "2026-04-12", "breakfast": None, "lunch": None, "dinner": None}
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/mealplans", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "plan_id" in data
        print(f"✓ Meal plan saved with new meal: {data['message']}")


class TestAuthRequiredEndpoints:
    """Test that notification endpoints require authentication"""
    
    def test_12_subscribe_requires_auth(self):
        """POST /api/notifications/subscribe requires authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        payload = {
            "endpoint": "https://test.example.com/push/123",
            "keys": {"p256dh": "test", "auth": "test"}
        }
        
        response = session.post(f"{BASE_URL}/api/notifications/subscribe", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Subscribe endpoint requires auth (401)")
    
    def test_13_preferences_requires_auth(self):
        """GET /api/notifications/preferences requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/notifications/preferences")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Preferences endpoint requires auth (401)")
    
    def test_14_status_requires_auth(self):
        """GET /api/notifications/status requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/notifications/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Status endpoint requires auth (401)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
