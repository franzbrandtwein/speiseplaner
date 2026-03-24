#!/usr/bin/env python3
"""
Test script for meal plan save/load cycle specifically for side_dishes persistence.
This test follows the exact requirements from the review request.
"""

import requests
import json
from datetime import datetime, timedelta
import pymongo
from pymongo import MongoClient

class SideDishesTest:
    def __init__(self):
        self.base_url = "https://meal-saver-13.preview.emergentagent.com/api"
        self.session_token = None
        self.user_id = None
        self.mongo_client = None
        self.db = None
        
    def setup_mongodb_connection(self):
        """Connect to MongoDB for direct database verification"""
        try:
            self.mongo_client = MongoClient("mongodb://localhost:27017")
            self.db = self.mongo_client["test_database"]
            print("✅ MongoDB connection established")
            return True
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            return False
    
    def login(self):
        """Step 1: Login with specified credentials"""
        print("\n🔐 Step 1: Login")
        
        login_data = {
            "email": "import_test@test.de",
            "password": "Test1234!"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=login_data,
                headers={'Content-Type': 'application/json'}
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.user_id = data.get('user_id')
                # Extract session token from cookies
                if 'Set-Cookie' in response.headers:
                    cookie_header = response.headers['Set-Cookie']
                    if 'session_token=' in cookie_header:
                        token_start = cookie_header.find('session_token=') + len('session_token=')
                        token_end = cookie_header.find(';', token_start)
                        if token_end == -1:
                            token_end = len(cookie_header)
                        self.session_token = cookie_header[token_start:token_end]
                
                print(f"✅ Login successful")
                print(f"   User ID: {self.user_id}")
                print(f"   Session Token: {self.session_token[:20]}..." if self.session_token else "   No session token found")
                return True
            else:
                print(f"❌ Login failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Login error: {e}")
            return False
    
    def get_recipes(self):
        """Step 2: Get recipes"""
        print("\n📋 Step 2: Get recipes")
        
        headers = {'Content-Type': 'application/json'}
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        try:
            response = requests.get(f"{self.base_url}/recipes", headers=headers)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                recipes = response.json()
                print(f"✅ Found {len(recipes)} recipes")
                
                if len(recipes) >= 2:
                    r1 = recipes[0]  # Main recipe
                    r2 = recipes[1]  # Side dish recipe
                    
                    print(f"   Main recipe (r1): {r1['name']} (ID: {r1['recipe_id']})")
                    print(f"   Side dish (r2): {r2['name']} (ID: {r2['recipe_id']})")
                    
                    return r1, r2
                else:
                    print(f"❌ Need at least 2 recipes, found {len(recipes)}")
                    return None, None
            else:
                print(f"❌ Failed to get recipes: {response.text}")
                return None, None
                
        except Exception as e:
            print(f"❌ Get recipes error: {e}")
            return None, None
    
    def get_current_week_start(self):
        """Step 4: Get current week start (Monday of current week)"""
        print("\n📅 Step 4: Get current week start")
        
        today = datetime.now()
        # Get Monday of current week (0=Monday, 6=Sunday)
        days_since_monday = today.weekday()
        monday = today - timedelta(days=days_since_monday)
        week_start = monday.strftime("%Y-%m-%d")
        
        print(f"   Current week start (Monday): {week_start}")
        return week_start
    
    def save_meal_plan_with_side_dishes(self, r1, r2, week_start):
        """Step 5: Save a meal plan WITH side_dishes"""
        print("\n💾 Step 5: Save meal plan with side_dishes")
        
        headers = {'Content-Type': 'application/json'}
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        # Create meal plan data with side_dishes
        meal_plan_data = {
            "week_start": week_start,
            "days": [
                {
                    "date": week_start,
                    "breakfast": None,
                    "lunch": {
                        "recipe_id": r1["recipe_id"],
                        "recipe_name": r1["name"],
                        "portions": 4,
                        "side_dishes": [
                            {
                                "recipe_id": r2["recipe_id"],
                                "recipe_name": r2["name"],
                                "portions": 3
                            }
                        ]
                    },
                    "dinner": None
                }
            ]
        }
        
        # Add 6 more days with null slots
        start_date = datetime.strptime(week_start, "%Y-%m-%d")
        for i in range(1, 7):
            day_date = start_date + timedelta(days=i)
            meal_plan_data["days"].append({
                "date": day_date.strftime("%Y-%m-%d"),
                "breakfast": None,
                "lunch": None,
                "dinner": None
            })
        
        print(f"   Saving meal plan for week: {week_start}")
        print(f"   Main recipe: {r1['name']} (4 portions)")
        print(f"   Side dish: {r2['name']} (3 portions)")
        
        try:
            response = requests.post(
                f"{self.base_url}/mealplans",
                json=meal_plan_data,
                headers=headers
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                plan_id = data.get('plan_id')
                print(f"✅ Meal plan saved successfully")
                print(f"   Plan ID: {plan_id}")
                return True
            else:
                print(f"❌ Failed to save meal plan: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Save meal plan error: {e}")
            return False
    
    def load_meal_plan(self, week_start):
        """Step 6: Load meal plan back"""
        print("\n📖 Step 6: Load meal plan back")
        
        headers = {'Content-Type': 'application/json'}
        if self.session_token:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        try:
            response = requests.get(
                f"{self.base_url}/mealplans",
                params={"week_start": week_start},
                headers=headers
            )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                plan = response.json()
                print(f"✅ Meal plan loaded successfully")
                
                # Find the lunch slot from the first day
                if plan.get("days") and len(plan["days"]) > 0:
                    first_day = plan["days"][0]
                    lunch = first_day.get("lunch")
                    
                    if lunch:
                        print(f"\n📋 LUNCH SLOT DETAILS:")
                        print(f"   Recipe: {lunch.get('recipe_name')} (ID: {lunch.get('recipe_id')})")
                        print(f"   Portions: {lunch.get('portions')}")
                        
                        side_dishes = lunch.get("side_dishes", [])
                        print(f"   Side dishes count: {len(side_dishes)}")
                        
                        if side_dishes:
                            for i, sd in enumerate(side_dishes, 1):
                                print(f"     {i}. {sd.get('recipe_name')} (ID: {sd.get('recipe_id')}, Portions: {sd.get('portions')})")
                        
                        # Step 7: CHECK - does the lunch slot have side_dishes with the r2 entry?
                        print(f"\n🔍 Step 7: CHECK - Side dishes verification")
                        if len(side_dishes) == 1:
                            print(f"✅ PASS - side_dishes has 1 entry as expected")
                            return True, lunch
                        elif len(side_dishes) == 0:
                            print(f"❌ FAIL - side_dishes is empty")
                            return False, lunch
                        else:
                            print(f"⚠️  UNEXPECTED - side_dishes has {len(side_dishes)} entries (expected 1)")
                            return False, lunch
                    else:
                        print(f"❌ No lunch slot found in first day")
                        return False, None
                else:
                    print(f"❌ No days found in meal plan")
                    return False, None
            else:
                print(f"❌ Failed to load meal plan: {response.text}")
                return False, None
                
        except Exception as e:
            print(f"❌ Load meal plan error: {e}")
            return False, None
    
    def check_mongodb_directly(self, week_start):
        """Step 8: Check via MongoDB directly"""
        print("\n🗄️  Step 8: Check via MongoDB directly")
        
        if self.db is None:
            print("❌ MongoDB connection not available")
            return False
        
        try:
            # Find the meal plan document
            meal_plan = self.db.meal_plans.find_one({
                "week_start": week_start,
                "user_id": self.user_id
            })
            
            if meal_plan:
                print(f"✅ Found meal plan document in MongoDB")
                print(f"   Plan ID: {meal_plan.get('plan_id')}")
                
                # Get the lunch slot from first day
                days = meal_plan.get("days", [])
                if days and len(days) > 0:
                    first_day = days[0]
                    lunch = first_day.get("lunch")
                    
                    if lunch:
                        side_dishes = lunch.get("side_dishes", [])
                        print(f"\n📋 RAW MONGODB DATA - lunch.side_dishes:")
                        print(f"   Type: {type(side_dishes)}")
                        print(f"   Length: {len(side_dishes)}")
                        print(f"   Content: {json.dumps(side_dishes, indent=2)}")
                        
                        # Final verification
                        if len(side_dishes) > 0:
                            print(f"✅ MONGODB VERIFICATION: side_dishes is being saved to MongoDB")
                            return True
                        else:
                            print(f"❌ MONGODB VERIFICATION: side_dishes is empty in MongoDB")
                            return False
                    else:
                        print(f"❌ No lunch slot found in MongoDB document")
                        return False
                else:
                    print(f"❌ No days found in MongoDB document")
                    return False
            else:
                print(f"❌ Meal plan document not found in MongoDB")
                return False
                
        except Exception as e:
            print(f"❌ MongoDB check error: {e}")
            return False
    
    def run_test(self):
        """Run the complete side_dishes persistence test"""
        print("🚀 Starting Side Dishes Persistence Test")
        print("=" * 60)
        
        # Setup MongoDB connection
        if not self.setup_mongodb_connection():
            return False
        
        try:
            # Step 1: Login
            if not self.login():
                return False
            
            # Step 2 & 3: Get recipes and pick first two
            r1, r2 = self.get_recipes()
            if not r1 or not r2:
                return False
            
            # Step 4: Get current week start
            week_start = self.get_current_week_start()
            
            # Step 5: Save meal plan with side_dishes
            if not self.save_meal_plan_with_side_dishes(r1, r2, week_start):
                return False
            
            # Step 6 & 7: Load and check meal plan
            api_success, lunch_data = self.load_meal_plan(week_start)
            
            # Step 8: Check MongoDB directly
            mongodb_success = self.check_mongodb_directly(week_start)
            
            # Final report
            print("\n" + "=" * 60)
            print("📊 FINAL REPORT")
            print("=" * 60)
            
            print(f"API Response Test: {'✅ PASS' if api_success else '❌ FAIL'}")
            print(f"MongoDB Direct Test: {'✅ PASS' if mongodb_success else '❌ FAIL'}")
            
            if api_success and mongodb_success:
                print(f"\n🎉 OVERALL RESULT: ✅ PASS")
                print(f"   ✅ side_dishes are being saved to MongoDB")
                print(f"   ✅ side_dishes are returned by the API")
                return True
            else:
                print(f"\n💥 OVERALL RESULT: ❌ FAIL")
                if not api_success:
                    print(f"   ❌ API is not returning side_dishes correctly")
                if not mongodb_success:
                    print(f"   ❌ side_dishes are not being saved to MongoDB")
                return False
                
        finally:
            if self.mongo_client:
                self.mongo_client.close()

def main():
    tester = SideDishesTest()
    success = tester.run_test()
    return 0 if success else 1

if __name__ == "__main__":
    import sys
    sys.exit(main())