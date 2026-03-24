# Kochplaner - Rezept & Speiseplan App

## Original Problem Statement
"Bau mir eine Web App mit Django, mit der sich Rezepte erfassen und Speisepläne planen lassen"
- User wählte FastAPI + React statt Django
- Später: PWA-Konvertierung, Rezept-Import, Beilagen-Feature, Gruppen-Funktion

## User Personas
1. **Hobby-Koch**: Sammelt Rezepte, plant Mahlzeiten für die Woche
2. **Familie**: Plant Familienmahlzeiten, erstellt Einkaufslisten, teilt Rezepte in Gruppen
3. **Fitness-Enthusiast**: Trackt Nährwerte, plant gesunde Mahlzeiten

## Core Requirements
- Vollständige Rezepterfassung (Name, Zutaten, Zubereitung, Portionen, Zeit, Schwierigkeit, Kategorien, Bilder, Nährwerte, Allergene, Kosten)
- Bewertungssystem (1-5 Sterne + Text)
- Speiseplan (7 Tage mit Frühstück/Mittag/Abendessen) mit Beilagen-Support
- Automatische Einkaufsliste aus Speiseplan (inkl. Beilagen)
- Multi-User mit Google Auth + Email/Password Auth
- PWA mit Offline-Support
- Rezept-Import von externen URLs
- Gruppen-Funktion mit Einladungen

## What's Been Implemented

### Backend (FastAPI + MongoDB)
- User Authentication (Emergent Google OAuth + Email/Password)
- Recipe CRUD (create, read, update, delete)
- Rating System (1-5 stars + text comments)
- Meal Plan Management (weekly, 3 meals/day, with side dishes)
- Shopping List Generation (inkl. Beilagen-Zutaten)
- Categories & Allergens API
- Recipe Import (JSON-LD + LLM Fallback)
- Groups & Invitations (SMTP Email)
- Side Dishes (Beilagen) in Recipes and Meal Plans

### Frontend (React + Tailwind + Shadcn)
- Landing Page with Google Login + Email/Password Auth
- Dashboard with Bento Grid Layout
- Recipes Page with Filter & Search
- Recipe Detail with Ratings & Side Dishes
- Recipe Form (Create/Edit) with Side Dish Linking
- Meal Planner with SlotConfigDialog (Hauptgericht + Beilagen mit separaten Portionen)
- Shopping List with Checkboxes
- Ingredient Search ("Was kann ich kochen?")
- Recipe Import Dialog
- PWA Install Prompt
- Group Management (Create, Invite, Join)
- Responsive Design (Mobile & Desktop)

### PWA
- Service Worker mit Offline-Fallback
- Web App Manifest mit Icons
- "App installieren" Button (immer sichtbar)

### Design
- Light & Fresh Theme ("Organic & Earthy")
- Playfair Display + Inter Fonts
- Fresh Basil Green Primary Color (#10B981)
- German Language UI

## Bug Fixes (Mar 2026)
- [x] Beilagen im Speiseplan werden dauerhaft gespeichert (VERIFIZIERT - Backend + Frontend Tests bestanden)
- [x] Einkaufsliste berücksichtigt Beilagen korrekt
- [x] Chefkoch-Import: Zubereitungstext korrekt erfasst
- [x] PWA Install-Button immer sichtbar

## Prioritized Backlog

### P1 (Next)
- [ ] Import von weiteren Rezept-Websites testen
- [ ] Alternative Import-Methode für blockierende Seiten (z.B. REWE) über Clipboard
- [ ] Recipe image upload (currently URL only)
- [ ] Drag & Drop for meal planner

### P2 (Future)
- [ ] Background Sync für Offline-Aktionen
- [ ] Push-Benachrichtigungen für den Speiseplan
- [ ] Meal plan templates
- [ ] Nutritional goals tracking
- [ ] Print-friendly recipe view

## Tech Stack
- Frontend: React 19, Tailwind CSS, Shadcn UI, date-fns
- Backend: FastAPI, Motor (async MongoDB), Pydantic
- Database: MongoDB
- Auth: Emergent Google OAuth + Email/Password
- LLM: emergentintegrations (Gemini/OpenAI) für Rezept-Import Fallback
- PWA: Service Worker, Web App Manifest

## Key API Endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/session, /api/auth/logout
- GET /api/auth/me
- GET/POST /api/recipes, GET/PUT/DELETE /api/recipes/:id
- POST /api/recipes/:id/ratings
- POST /api/recipes/import-preview, /api/recipes/import-save
- POST /api/recipes/search-by-ingredients
- GET/POST /api/mealplans (inkl. side_dishes)
- GET /api/shopping-list (inkl. Beilagen-Zutaten)
- GET /api/categories
- POST /api/groups, GET /api/groups/my, POST /api/groups/invite, POST /api/groups/leave
- GET/POST /api/invitations/:token, POST /api/invitations/:token/accept

## Key Data Models
- **recipes**: { recipe_id, name, ingredients[], instructions[], portions, side_dishes: [recipe_id] }
- **meal_plans**: { plan_id, week_start, days: [{ date, breakfast/lunch/dinner: MealSlot }] }
- **MealSlot**: { recipe_id, recipe_name, portions, side_dishes: [{ recipe_id, recipe_name, portions }] }

## Test Credentials
- test_debug@test.de / password123
