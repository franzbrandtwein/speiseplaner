import requests
import sys
from datetime import datetime, timedelta
import json
import subprocess
import uuid

class RecipeAPITester:
    def __init__(self):
        self.base_url = "https://feast-organizer-1.preview.emergentagent.com/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.recipe_id = None
        self.plan_id = None
        
    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Expected {expected_status}, got {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response text: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def setup_test_user(self):
        """Create test user and session in MongoDB"""
        print("\n📋 Setting up test user and session...")
        
        current_time = int(datetime.now().timestamp())
        self.user_id = f"test-user-{current_time}"
        self.session_token = f"test_session_{current_time}"
        email = f"test.user.{current_time}@example.com"
        
        # Create MongoDB commands
        mongo_commands = f"""
use('test_database');
var userId = '{self.user_id}';
var sessionToken = '{self.session_token}';
var email = '{email}';
var expiresAt = new Date(Date.now() + 7*24*60*60*1000);

// Insert user
db.users.insertOne({{
  user_id: userId,
  email: email,
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
}});

// Insert session
db.user_sessions.insertOne({{
  session_id: 'sess_' + Date.now(),
  user_id: userId,
  session_token: sessionToken,
  expires_at: expiresAt,
  created_at: new Date()
}});

print('✅ Test user created');
print('User ID: ' + userId);
print('Session token: ' + sessionToken);
"""
        
        try:
            result = subprocess.run(
                ["mongosh", "--eval", mongo_commands],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print(f"✅ Test user created successfully")
                print(f"   User ID: {self.user_id}")
                print(f"   Session Token: {self.session_token}")
                return True
            else:
                print(f"❌ Failed to create test user: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ MongoDB setup failed: {str(e)}")
            return False

    def cleanup_test_data(self):
        """Clean up test data from MongoDB"""
        print("\n🧹 Cleaning up test data...")
        
        mongo_commands = """
use('test_database');
db.users.deleteMany({email: /test\\.user\\./});
db.user_sessions.deleteMany({session_token: /test_session/});
db.recipes.deleteMany({user_id: /test-user/});
db.ratings.deleteMany({user_id: /test-user/});
db.meal_plans.deleteMany({user_id: /test-user/});
print('✅ Test data cleaned');
"""
        
        try:
            subprocess.run(["mongosh", "--eval", mongo_commands], timeout=30)
            print("✅ Test data cleaned successfully")
        except Exception as e:
            print(f"⚠️  Cleanup warning: {str(e)}")

    def test_auth(self):
        """Test authentication endpoints"""
        print("\n=== AUTHENTICATION TESTS ===")
        
        # Test /api/ root endpoint (no auth required)
        success, data = self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )
        
        # Test auth/me
        success, data = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        
        if success:
            print(f"   User data: {data.get('name', 'Unknown')} ({data.get('email', 'No email')})")
            
        return success

    def test_categories(self):
        """Test categories endpoint"""
        print("\n=== CATEGORIES TESTS ===")
        
        success, data = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200
        )
        
        if success and data:
            print(f"   Categories: {len(data.get('categories', []))} found")
            print(f"   Difficulties: {data.get('difficulties', [])}")
            print(f"   Allergens: {len(data.get('allergens', []))} found")
            
        return success

    def test_recipes(self):
        """Test recipe CRUD operations"""
        print("\n=== RECIPE TESTS ===")
        
        # Test get recipes (empty initially)
        success, data = self.run_test(
            "Get Recipes (Empty)",
            "GET",
            "recipes",
            200
        )
        
        # Create a test recipe
        recipe_data = {
            "name": "Test Spaghetti Bolognese",
            "description": "A classic Italian pasta dish",
            "ingredients": [
                {"name": "Spaghetti", "amount": "500", "unit": "g"},
                {"name": "Hackfleisch", "amount": "400", "unit": "g"},
                {"name": "Tomaten", "amount": "400", "unit": "g"}
            ],
            "instructions": [
                "Wasser für Nudeln aufkochen",
                "Hackfleisch anbraten",
                "Tomaten hinzufügen",
                "Nudeln kochen"
            ],
            "portions": 4,
            "prep_time": 15,
            "cook_time": 30,
            "difficulty": "mittel",
            "category": "Hauptgericht",
            "allergens": ["Gluten"],
            "cost_per_portion": 3.50
        }
        
        success, data = self.run_test(
            "Create Recipe",
            "POST",
            "recipes",
            200,
            recipe_data
        )
        
        if success and data:
            self.recipe_id = data.get('recipe_id')
            print(f"   Recipe ID: {self.recipe_id}")
            
            # Test get recipes (should have 1 now)
            success, data = self.run_test(
                "Get Recipes (With Data)",
                "GET",
                "recipes",
                200
            )
            
            if success and data:
                print(f"   Found {len(data)} recipe(s)")
                
                # Test get single recipe
                success, recipe_data = self.run_test(
                    "Get Single Recipe",
                    "GET",
                    f"recipes/{self.recipe_id}",
                    200
                )
                
                if success:
                    print(f"   Recipe name: {recipe_data.get('name', 'Unknown')}")
                    print(f"   Ingredients: {len(recipe_data.get('ingredients', []))}")
                    print(f"   Instructions: {len(recipe_data.get('instructions', []))}")
        
        return success

    def test_ratings(self):
        """Test recipe rating system"""
        print("\n=== RATING TESTS ===")
        
        if not self.recipe_id:
            print("⚠️  Skipping ratings test - no recipe ID available")
            return False
            
        # Add a rating
        rating_data = {
            "stars": 4,
            "text": "Sehr lecker! Einfach zu kochen."
        }
        
        success, data = self.run_test(
            "Add Recipe Rating",
            "POST",
            f"recipes/{self.recipe_id}/ratings",
            200,
            rating_data
        )
        
        if success:
            # Get recipe with rating
            success, data = self.run_test(
                "Get Recipe With Rating",
                "GET",
                f"recipes/{self.recipe_id}",
                200
            )
            
            if success:
                avg_rating = data.get('avg_rating', 0)
                rating_count = data.get('rating_count', 0)
                print(f"   Average rating: {avg_rating} ({rating_count} rating(s))")
                
        return success

    def test_meal_plans(self):
        """Test meal planning functionality"""
        print("\n=== MEAL PLAN TESTS ===")
        
        from datetime import datetime
        week_start = datetime.now().strftime("%Y-%m-%d")  # Today as week start
        
        # Get meal plan (should be empty initially)
        success, data = self.run_test(
            "Get Meal Plan (Empty)",
            "GET",
            "mealplans",
            200,
            params={"week_start": week_start}
        )
        
        if success:
            print(f"   Week start: {data.get('week_start', 'Unknown')}")
            print(f"   Days: {len(data.get('days', []))}")
            
            # Create/update meal plan
            if self.recipe_id:
                meal_plan_data = {
                    "week_start": week_start,
                    "days": [
                        {
                            "date": week_start,
                            "breakfast": None,
                            "lunch": {
                                "recipe_id": self.recipe_id,
                                "recipe_name": "Test Spaghetti Bolognese",
                                "portions": 2
                            },
                            "dinner": None
                        }
                    ]
                }
                
                success, data = self.run_test(
                    "Create/Update Meal Plan",
                    "POST",
                    "mealplans",
                    200,
                    meal_plan_data
                )
                
                if success:
                    self.plan_id = data.get('plan_id')
                    print(f"   Plan ID: {self.plan_id}")
                    
                    # Get updated meal plan
                    success, data = self.run_test(
                        "Get Updated Meal Plan",
                        "GET",
                        "mealplans",
                        200,
                        params={"week_start": week_start}
                    )
        
        return success

    def test_shopping_list(self):
        """Test shopping list generation"""
        print("\n=== SHOPPING LIST TESTS ===")
        
        from datetime import datetime
        week_start = datetime.now().strftime("%Y-%m-%d")
        
        success, data = self.run_test(
            "Generate Shopping List",
            "GET",
            "shopping-list",
            200,
            params={"week_start": week_start}
        )
        
        if success:
            items = data.get('items', [])
            print(f"   Shopping items: {len(items)}")
            for i, item in enumerate(items[:3], 1):  # Show first 3 items
                print(f"     {i}. {item['ingredient_name']}: {item['total_amount']} {item['unit']}")
                
            if items:
                # Test toggle item (mock endpoint)
                success, data = self.run_test(
                    "Toggle Shopping Item",
                    "POST",
                    "shopping-list/toggle",
                    200,
                    {"ingredient_name": items[0]["ingredient_name"], "checked": True}
                )
        
        return success

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting Recipe API Test Suite")
        print("=" * 50)
        
        # Setup
        if not self.setup_test_user():
            print("❌ Failed to setup test environment")
            return 1
        
        try:
            # Run tests in order
            auth_success = self.test_auth()
            
            if not auth_success:
                print("\n❌ Authentication failed - stopping tests")
                return 1
                
            categories_success = self.test_categories()
            recipes_success = self.test_recipes()
            ratings_success = self.test_ratings()
            meal_plans_success = self.test_meal_plans()
            shopping_list_success = self.test_shopping_list()
            
            # Results
            print("\n" + "=" * 50)
            print(f"📊 FINAL RESULTS")
            print(f"Tests passed: {self.tests_passed}/{self.tests_run}")
            print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
            
            # Component status
            components = {
                "Authentication": auth_success,
                "Categories": categories_success, 
                "Recipes": recipes_success,
                "Ratings": ratings_success,
                "Meal Plans": meal_plans_success,
                "Shopping List": shopping_list_success
            }
            
            print(f"\nComponent Status:")
            for component, status in components.items():
                status_icon = "✅" if status else "❌"
                print(f"  {status_icon} {component}")
            
            return 0 if self.tests_passed == self.tests_run else 1
            
        finally:
            self.cleanup_test_data()

def main():
    tester = RecipeAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())