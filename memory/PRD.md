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
- [x] E-Mail-Authentifizierung bei Self-Hosted-Instanzen mit eigener Domain (VERIFIZIERT - 25.03.2026)
  - Ursache: AuthPage.jsx nutzte eigene API-URL aus process.env statt der dynamischen URL aus App.js
  - Fix: Import von API aus App.js statt lokaler Konstante
  - HTTPS-Fix: Dynamische Protokoll-Auflösung in App.js + auto-detect secure cookies im Backend via X-Forwarded-Proto

## Features (Mar 2026)
- [x] Push-Benachrichtigungen für den Speiseplan (VERIFIZIERT - 14/14 Backend Tests, Frontend 100%)
  - Tägliche Mahlzeit-Erinnerung (konfigurierbare Uhrzeit, Standard 08:00)
  - Einkaufslisten-Erinnerung (konfigurierbarer Tag + Uhrzeit, Standard Sonntag 10:00)
  - Leerer Speiseplan-Erinnerung (konfigurierbare Uhrzeit, Standard 18:00)
  - Sofort-Benachrichtigung bei neuem Gericht im Speiseplan
  - Einstellungs-Seite unter /notifications
  - Service Worker Push-Handler + Click-Navigation
- [x] Drag & Drop im Speiseplan (VERIFIZIERT - Frontend + Backend 100%)
  - Desktop: HTML5 Drag & Drop per Maus
  - Mobile: Tap-to-Move (Griff-Icon antippen → Ziel antippen)
  - Move-Banner mit Abbrechen-Button
  - Leere Slots zeigen "Hierher" als Zielindikator
  - Tauschen zwischen gefüllten Slots
  - Beilagen werden korrekt mit verschoben
- [x] Sonstige Artikel / Wochenbedarf (VERIFIZIERT - 11/11 Backend, Frontend 100%)
  - CRUD für Artikel (Name, Menge, Einheit, Kategorie)
  - Kategorien: Getränke, Gewürze, Haushalt, Hygiene, Backzutaten, Sonstiges
  - Aktivieren/Deaktivieren per Toggle
  - Aktive Artikel automatisch in der Einkaufsliste
  - Eigene Verwaltungs-Seite /staple-items
  - Einkaufsliste zeigt Rezept-Zutaten und Sonstige Artikel getrennt
- [x] Recipe Image Upload (VERIFIZIERT - 10/10 Backend, Frontend 100%)
  - Mehrere Bilder pro Rezept (Galerie)
  - Upload im Rezeptformular (Drag & Drop + URL Fallback) und auf Rezept-Detailseite
  - Automatischer Bild-Import von externen URLs beim Rezept-Import
  - Galerie-Navigation mit Thumbnails, Delete-Button
  - Object Storage via Emergent Integration
- [x] Auto-Fokus auf neues Zutaten-Feld beim Klick auf "Zutat hinzufügen"

## Prioritized Backlog

### P1 (Next)
- [ ] Import von weiteren Rezept-Websites testen
- [ ] Alternative Import-Methode für blockierende Seiten (z.B. REWE) über Clipboard

### P2 (Future)
- [ ] Background Sync für Offline-Aktionen
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
- GET/POST /api/mealplans (inkl. side_dishes + instant push notification)
- GET /api/shopping-list (inkl. Beilagen-Zutaten)
- GET /api/categories
- POST /api/groups, GET /api/groups/my, POST /api/groups/invite, POST /api/groups/leave
- GET/POST /api/invitations/:token, POST /api/invitations/:token/accept
- GET /api/notifications/vapid-public-key
- POST /api/notifications/subscribe, DELETE /api/notifications/unsubscribe
- GET/PUT /api/notifications/preferences
- GET /api/notifications/status
- POST /api/notifications/test

## Key Data Models
- **recipes**: { recipe_id, name, ingredients[], instructions[], portions, side_dishes: [recipe_id] }
- **meal_plans**: { plan_id, week_start, days: [{ date, breakfast/lunch/dinner: MealSlot }] }
- **MealSlot**: { recipe_id, recipe_name, portions, side_dishes: [{ recipe_id, recipe_name, portions }] }
- **push_subscriptions**: { subscription_id, user_id, endpoint, keys: {p256dh, auth} }
- **notification_prefs**: { user_id, meal_reminder, meal_reminder_time, shopping_reminder, shopping_reminder_day, shopping_reminder_time, empty_plan_reminder, empty_plan_reminder_time, new_meal_notification }
- **notification_log**: { key, sent_at } (zur Vermeidung von Duplikaten)
- **staple_items**: { item_id, user_id, group_id, name, amount, unit, category, active, created_at }

## Test Credentials
- test_debug@test.de / password123
