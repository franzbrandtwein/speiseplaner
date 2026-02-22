# Kochplaner / Speisenplaner - Projekt-Zusammenfassung

## Übersicht
Eine Web-App zur Rezeptverwaltung und Speiseplanung mit Gruppen-Funktionalität.

**Tech Stack:**
- Frontend: React 19 + Tailwind CSS + Shadcn UI
- Backend: FastAPI + Motor (async MongoDB)
- Datenbank: MongoDB
- Auth: Email/Passwort (Self-Hosting) + Google OAuth (Emergent)

---

## Implementierte Features

### 1. Authentifizierung
- [x] Email/Passwort Registrierung & Login (für Self-Hosting)
- [x] Google OAuth (nur auf Emergent-Plattform)
- [x] Session-basierte Auth mit Cookies

### 2. Rezeptverwaltung
- [x] CRUD für Rezepte (erstellen, lesen, bearbeiten, löschen)
- [x] Vollständige Rezeptdetails:
  - Name, Beschreibung, Zutaten, Zubereitung
  - Portionen, Zubereitungszeit, Kochzeit
  - Schwierigkeit (leicht/mittel/schwer)
  - Kategorien (Frühstück, Hauptgericht, etc.)
  - Bild-URL
  - Nährwerte (Kalorien, Protein, Kohlenhydrate, Fett, Ballaststoffe)
  - Allergene
  - Kosten pro Portion
- [x] "Mit Gruppe teilen" Toggle
- [x] Filter nach Kategorie und Schwierigkeit
- [x] Volltextsuche

### 3. Bewertungssystem
- [x] 1-5 Sterne Bewertung
- [x] Textkommentare
- [x] Durchschnittsbewertung pro Rezept

### 4. Speiseplan
- [x] Wochenansicht (7 Tage)
- [x] 3 Mahlzeiten pro Tag (Frühstück, Mittag, Abend)
- [x] Rezept-Auswahl per Dialog
- [x] Portionen pro Mahlzeit anpassbar
- [x] Wochennavigation (vor/zurück)
- [x] Gemeinsamer Gruppenplan

### 5. Einkaufsliste
- [x] Automatische Generierung aus Speiseplan
- [x] Zutaten aggregiert nach Menge
- [x] Checkbox zum Abhaken
- [x] Fortschrittsanzeige
- [x] Drucken & Teilen

### 6. "Was kann ich kochen?" (Zutatensuche)
- [x] Zutaten eingeben die man hat
- [x] Schnell-Buttons für häufige Zutaten
- [x] Match-Prozent Anzeige
- [x] Fehlende Zutaten werden angezeigt

### 7. Gruppen-System (NEU)
- [x] Gruppe erstellen
- [x] Mitglieder per Email einladen (SMTP)
- [x] Einladungslink als Fallback
- [x] Geteilte Rezepte (Flag "shared_with_group")
- [x] Gemeinsamer Speiseplan pro Gruppe
- [x] Gruppe verlassen
- [x] Ausstehende Einladungen anzeigen

---

## API Endpoints

### Auth
- `POST /api/auth/register` - Registrierung
- `POST /api/auth/login` - Login
- `POST /api/auth/session` - Google OAuth Session Exchange
- `GET /api/auth/me` - Aktueller User
- `POST /api/auth/logout` - Logout

### Rezepte
- `GET /api/recipes` - Alle Rezepte (+ Gruppenrezepte)
- `POST /api/recipes` - Rezept erstellen
- `GET /api/recipes/{id}` - Rezept Details
- `PUT /api/recipes/{id}` - Rezept bearbeiten
- `DELETE /api/recipes/{id}` - Rezept löschen
- `POST /api/recipes/{id}/ratings` - Bewertung abgeben
- `POST /api/recipes/search-by-ingredients` - Zutatensuche

### Speiseplan
- `GET /api/mealplans?week_start=YYYY-MM-DD` - Wochenplan holen
- `POST /api/mealplans` - Wochenplan speichern

### Einkaufsliste
- `GET /api/shopping-list?week_start=YYYY-MM-DD` - Liste generieren

### Gruppen
- `GET /api/groups/my` - Meine Gruppe
- `POST /api/groups` - Gruppe erstellen
- `POST /api/groups/invite` - Einladung senden
- `POST /api/groups/leave` - Gruppe verlassen
- `GET /api/invitations/{token}` - Einladung Details
- `POST /api/invitations/{token}/accept` - Einladung annehmen

### Sonstiges
- `GET /api/categories` - Kategorien, Schwierigkeiten, Allergene

---

## Dateistruktur

```
/app/
├── backend/
│   ├── server.py              # FastAPI Backend
│   ├── requirements.txt       # Prod Dependencies
│   ├── requirements.local.txt # Local Dependencies (ohne Emergent)
│   └── .env                   # Umgebungsvariablen
├── frontend/
│   ├── src/
│   │   ├── App.js             # Router & Auth Context
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── AuthPage.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── RecipesPage.jsx
│   │   │   ├── RecipeDetail.jsx
│   │   │   ├── RecipeForm.jsx
│   │   │   ├── MealPlanner.jsx
│   │   │   ├── ShoppingList.jsx
│   │   │   ├── IngredientSearch.jsx
│   │   │   ├── GroupPage.jsx
│   │   │   └── InvitePage.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   └── ui/            # Shadcn Components
│   │   └── index.css          # Tailwind + Custom Styles
│   └── .env                   # REACT_APP_BACKEND_URL
├── setup_debian.sh            # Setup für Debian/Ubuntu
├── setup_opensuse.sh          # Setup für openSUSE
├── smtp.conf.example          # SMTP Konfigurationsvorlage
└── memory/
    └── PRD.md                 # Product Requirements
```

---

## Self-Hosting Setup

### 1. Repository klonen
```bash
git clone <repository-url>
cd speisenplaner
```

### 2. Setup ausführen
```bash
chmod +x setup_debian.sh
./setup_debian.sh
```

### 3. SMTP konfigurieren (für Email-Einladungen)
```bash
sudo nano /etc/speisenplaner/smtp.conf
```

```ini
[smtp]
server = smtp.example.com
port = 587
username = your-email@example.com
password = your-password
sender_email = noreply@example.com
sender_name = Speisenplaner
```

### 4. Verwaltung
```bash
./status.sh    # Status anzeigen
./start.sh     # Services starten
./stop.sh      # Services stoppen
./restart.sh   # Services neustarten
./logs.sh      # Logs anzeigen
```

---

## Bekannte Einschränkungen

1. **Bilder**: Nur URL-Upload, kein Datei-Upload
2. **NVM + Systemd**: Wrapper-Skript nötig für Frontend-Service
3. **CORS**: Auf `["*"]` gesetzt für Self-Hosting Kompatibilität

---

## Offene Features (Backlog)

### P1 - Nächste Phase
- [ ] Rezept-Bild-Upload (statt nur URL)
- [ ] Drag & Drop im Speiseplan
- [ ] Mitglieder aus Gruppe entfernen (Owner)
- [ ] Ownership übertragen

### P2 - Später
- [ ] Rezept-Import von URL
- [ ] Rezepte teilen (öffentlicher Link)
- [ ] Speiseplan-Templates
- [ ] Nährwert-Ziele tracking
- [ ] Push-Benachrichtigungen

---

## Design

- **Theme**: Hell & Frisch ("Organic & Earthy")
- **Primary Color**: Fresh Basil Green (#10B981)
- **Fonts**: Playfair Display (Headings) + Inter (Body)
- **Responsive**: Mobile-first mit Desktop-Sidebar

---

*Zuletzt aktualisiert: 22. Februar 2026*
