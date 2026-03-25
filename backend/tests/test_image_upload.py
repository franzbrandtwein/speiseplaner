"""
Test suite for Recipe Image Upload feature
Tests: POST /api/recipes/{id}/images, GET /api/images/{path}, DELETE /api/recipes/{id}/images
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SESSION_TOKEN = "token_6507e70a9bc441e6a12bf0c717ebb578"

# Test recipe IDs from seed data
RECIPE_WITH_IMAGE = "recipe_ac29cd0b382a"  # Spaghetti Carbonara - has 1 uploaded test image
RECIPE_WITHOUT_IMAGE = "recipe_60cd2e8afad0"  # Grüner Salat

# 1x1 pixel PNG for testing
TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="


@pytest.fixture
def auth_headers():
    """Return headers with session token"""
    return {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def auth_session():
    """Return session with auth headers"""
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {SESSION_TOKEN}"})
    return session


class TestImageUploadEndpoints:
    """Test image upload, serve, and delete endpoints"""

    def test_get_recipe_returns_images_array(self, auth_session):
        """GET /api/recipes/{id} returns images array (backward compat)"""
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITH_IMAGE}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "images" in data, "Response should contain 'images' field"
        assert isinstance(data["images"], list), "images should be a list"
        print(f"Recipe has {len(data['images'])} images: {data['images']}")
        
        # Check backward compat - image_url should also be present
        if data["images"]:
            assert data.get("image_url") is not None, "image_url should be set if images exist"

    def test_get_recipe_without_image_returns_empty_array(self, auth_session):
        """GET /api/recipes/{id} returns empty images array for recipe without images"""
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "images" in data, "Response should contain 'images' field"
        assert isinstance(data["images"], list), "images should be a list"
        print(f"Recipe without image has images array: {data['images']}")

    def test_upload_image_success(self, auth_session):
        """POST /api/recipes/{id}/images uploads an image file and returns updated images array"""
        # Create a test PNG file
        png_data = base64.b64decode(TEST_PNG_BASE64)
        files = {"file": ("test_image.png", png_data, "image/png")}
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        
        response = requests.post(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "image_url" in data, "Response should contain 'image_url'"
        assert "images" in data, "Response should contain 'images'"
        assert isinstance(data["images"], list), "images should be a list"
        assert len(data["images"]) > 0, "images array should not be empty after upload"
        
        # Verify the image_url starts with /api/images/
        assert data["image_url"].startswith("/api/images/"), f"image_url should start with /api/images/, got {data['image_url']}"
        print(f"Uploaded image URL: {data['image_url']}")
        print(f"Images array: {data['images']}")
        
        # Store for cleanup
        self.__class__.uploaded_image_url = data["image_url"]

    def test_serve_uploaded_image(self, auth_session):
        """GET /api/images/{path} serves the uploaded image with correct content-type"""
        # First get the recipe to find an image path
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITH_IMAGE}")
        assert response.status_code == 200
        
        data = response.json()
        if not data.get("images"):
            pytest.skip("No images to test serving")
        
        image_url = data["images"][0]
        # image_url is like /api/images/kochplaner/recipes/...
        # We need to call the full URL
        full_url = f"{BASE_URL}{image_url}"
        
        response = auth_session.get(full_url)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        content_type = response.headers.get("Content-Type", "")
        assert content_type.startswith("image/"), f"Content-Type should be image/*, got {content_type}"
        assert len(response.content) > 0, "Image content should not be empty"
        print(f"Served image with Content-Type: {content_type}, size: {len(response.content)} bytes")

    def test_upload_invalid_file_type_rejected(self, auth_session):
        """Uploading invalid file types is rejected with error (400)"""
        # Try to upload a text file
        files = {"file": ("test.txt", b"This is not an image", "text/plain")}
        headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        
        response = requests.post(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}: {response.text}"
        print(f"Invalid file type correctly rejected: {response.json()}")

    def test_upload_sets_image_url_if_null(self, auth_session):
        """After upload, recipe.image_url is automatically set if it was null"""
        # Get recipe before upload
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200
        
        data = response.json()
        images_before = data.get("images", [])
        
        # Upload a new image
        png_data = base64.b64decode(TEST_PNG_BASE64)
        files = {"file": ("auto_set_test.png", png_data, "image/png")}
        headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        
        response = requests.post(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        
        # Verify image_url was set
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("image_url") is not None, "image_url should be set after upload"
        assert data["image_url"].startswith("/api/images/"), "image_url should point to uploaded image"
        print(f"image_url auto-set to: {data['image_url']}")

    def test_delete_image_success(self, auth_session):
        """DELETE /api/recipes/{id}/images removes an image from the recipe's images array"""
        # First get current images
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200
        
        data = response.json()
        if not data.get("images"):
            pytest.skip("No images to delete")
        
        image_to_delete = data["images"][0]
        images_count_before = len(data["images"])
        
        # Delete the image
        response = auth_session.delete(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            json={"image_url": image_to_delete}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "images" in result, "Response should contain 'images'"
        assert len(result["images"]) == images_count_before - 1, "Images count should decrease by 1"
        assert image_to_delete not in result["images"], "Deleted image should not be in array"
        print(f"Deleted image: {image_to_delete}")
        print(f"Remaining images: {result['images']}")

    def test_delete_current_image_url_falls_back(self, auth_session):
        """After deleting the current image_url, it falls back to next image or null"""
        # Upload two images first
        png_data = base64.b64decode(TEST_PNG_BASE64)
        headers = {"Authorization": f"Bearer {SESSION_TOKEN}"}
        
        # Upload first image
        files = {"file": ("fallback_test1.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        
        # Upload second image
        files = {"file": ("fallback_test2.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        
        # Get current state
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200
        data = response.json()
        
        current_image_url = data.get("image_url")
        images = data.get("images", [])
        
        if len(images) < 2:
            pytest.skip("Need at least 2 images for fallback test")
        
        # Delete the current image_url
        response = auth_session.delete(
            f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
            json={"image_url": current_image_url}
        )
        assert response.status_code == 200
        
        # Verify fallback
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        assert response.status_code == 200
        data = response.json()
        
        if data.get("images"):
            assert data.get("image_url") == data["images"][0], "image_url should fall back to first remaining image"
            print(f"image_url fell back to: {data['image_url']}")
        else:
            assert data.get("image_url") is None, "image_url should be null when no images remain"
            print("image_url correctly set to null when no images remain")


class TestRecipeListImageResolution:
    """Test that recipe list returns images that can be resolved"""

    def test_recipes_list_contains_image_urls(self, auth_session):
        """GET /api/recipes returns recipes with image_url that can be resolved"""
        response = auth_session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        
        recipes = response.json()
        assert isinstance(recipes, list), "Response should be a list"
        
        recipes_with_images = [r for r in recipes if r.get("image_url")]
        print(f"Found {len(recipes_with_images)} recipes with images out of {len(recipes)} total")
        
        # Check that image URLs are properly formatted
        for recipe in recipes_with_images:
            image_url = recipe["image_url"]
            # Should be either external URL or /api/images/ path
            assert image_url.startswith("http") or image_url.startswith("/api/images/"), \
                f"image_url should be external URL or /api/images/ path, got: {image_url}"
            print(f"Recipe '{recipe['name']}' has image: {image_url}")


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_images(self, auth_session):
        """Clean up any remaining test images from RECIPE_WITHOUT_IMAGE"""
        response = auth_session.get(f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}")
        if response.status_code != 200:
            return
        
        data = response.json()
        images = data.get("images", [])
        
        for image_url in images:
            response = auth_session.delete(
                f"{BASE_URL}/api/recipes/{RECIPE_WITHOUT_IMAGE}/images",
                json={"image_url": image_url}
            )
            print(f"Cleaned up image: {image_url}")
        
        print("Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
