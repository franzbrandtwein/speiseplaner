# Kochplaner - Rezept & Speiseplan App

## Original Problem Statement
"Bau mir eine Web App mit Django, mit der sich Rezepte erfassen und Speisepläne planen lassen"
- User wählte FastAPI + React statt Django

## User Personas
1. **Hobby-Koch**: Sammelt Rezepte, plant Mahlzeiten für die Woche
2. **Familie**: Plant Familienmahlzeiten, erstellt Einkaufslisten
3. **Fitness-Enthusiast**: Trackt Nährwerte, plant gesunde Mahlzeiten

## Core Requirements (Static)
- Vollständige Rezepterfassung (Name, Zutaten, Zubereitung, Portionen, Zeit, Schwierigkeit, Kategorien, Bilder, Nährwerte, Allergene, Kosten)
- Bewertungssystem (1-5 Sterne + Text)
- Speiseplan (7 Tage mit Frühstück/Mittag/Abendessen)
- Automatische Einkaufsliste aus Speiseplan
- Multi-User mit Google Auth

## What's Been Implemented (Jan 2026)

### Backend (FastAPI + MongoDB)
- ✅ User Authentication (Emergent Google OAuth)
- ✅ Recipe CRUD (create, read, update, delete)
- ✅ Rating System (1-5 stars + text comments)
- ✅ Meal Plan Management (weekly, 3 meals/day)
- ✅ Shopping List Generation from meal plan
- ✅ Categories & Allergens API

### Frontend (React + Tailwind + Shadcn)
- ✅ Landing Page with Google Login
- ✅ Dashboard with Bento Grid Layout
- ✅ Recipes Page with Filter & Search
- ✅ Recipe Detail with Ratings
- ✅ Recipe Form (Create/Edit)
- ✅ Meal Planner (Weekly Calendar)
- ✅ Shopping List with Checkboxes
- ✅ Responsive Design (Mobile & Desktop)

### Design
- ✅ Light & Fresh Theme ("Organic & Earthy")
- ✅ Playfair Display + Inter Fonts
- ✅ Fresh Basil Green Primary Color (#10B981)
- ✅ German Language UI

## Prioritized Backlog

### P0 (MVP Complete)
- ✅ All core features implemented

### P1 (Next Phase)
- [ ] Recipe image upload (currently URL only)
- [ ] Drag & Drop for meal planner
- [ ] Recipe categories management
- [ ] Print-friendly recipe view

### P2 (Future)
- [ ] Recipe import from URL
- [ ] Share recipes with others
- [ ] Meal plan templates
- [ ] Nutritional goals tracking
- [ ] Recipe suggestions based on ingredients

## Tech Stack
- Frontend: React 19, Tailwind CSS, Shadcn UI, date-fns
- Backend: FastAPI, Motor (async MongoDB), Pydantic
- Database: MongoDB
- Auth: Emergent Google OAuth

## API Endpoints
- POST /api/auth/session - Exchange session_id for token
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout
- GET/POST /api/recipes - List/Create recipes
- GET/PUT/DELETE /api/recipes/:id - Recipe CRUD
- POST /api/recipes/:id/ratings - Add rating
- GET/POST /api/mealplans - Get/Save meal plan
- GET /api/shopping-list - Generate shopping list
- GET /api/categories - Get categories/difficulties/allergens
