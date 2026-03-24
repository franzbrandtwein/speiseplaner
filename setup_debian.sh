#!/bin/bash

# ============================================
# Kochplaner - Setup Script für Debian/Ubuntu
# Mit systemd Service-Installation
# ============================================

set -e

echo "╔════════════════════════════════════════╗"
echo "║   Kochplaner Setup - Debian/Ubuntu     ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funktion für Statusmeldungen
info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Root-Check
if [ "$EUID" -ne 0 ]; then
    warn "Dieses Skript benötigt sudo-Rechte für einige Installationen."
    SUDO="sudo"
else
    SUDO=""
fi

# ============================================
# System-Updates
# ============================================
info "Aktualisiere Paketlisten..."
$SUDO apt-get update -qq

# ============================================
# Grundlegende Abhängigkeiten
# ============================================
info "Installiere grundlegende Abhängigkeiten..."
$SUDO apt-get install -y -qq \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    gnupg \
    ca-certificates

# ============================================
# Node.js 20.x installieren
# ============================================
if ! command -v node &> /dev/null; then
    info "Installiere Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y -qq nodejs
else
    info "Node.js bereits installiert: $(node --version)"
fi

# ============================================
# Yarn installieren
# ============================================
if ! command -v yarn &> /dev/null; then
    info "Installiere Yarn..."
    $SUDO npm install -g yarn
else
    info "Yarn bereits installiert: $(yarn --version)"
fi

# ============================================
# Python 3.11+ installieren
# ============================================
if ! command -v python3 &> /dev/null; then
    info "Installiere Python 3..."
    $SUDO apt-get install -y -qq python3 python3-pip python3-venv python3-full
else
    info "Python bereits installiert: $(python3 --version)"
fi

# python3-venv sicherstellen
$SUDO apt-get install -y -qq python3-venv python3-full

# ============================================
# MongoDB 7.0 installieren
# ============================================
if ! command -v mongod &> /dev/null; then
    info "Installiere MongoDB 7.0..."
    
    # MongoDB GPG Key
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        $SUDO gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    # Repository hinzufügen (für Ubuntu/Debian)
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        $SUDO tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq mongodb-org
    
    # MongoDB starten und aktivieren
    $SUDO systemctl start mongod
    $SUDO systemctl enable mongod
else
    info "MongoDB bereits installiert"
fi

# ============================================
# Projektverzeichnis vorbereiten
# ============================================
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
info "Projektverzeichnis: $PROJECT_DIR"

# Benutzer für den Dienst ermitteln
SERVICE_USER="${SUDO_USER:-$USER}"
info "Service-Benutzer: $SERVICE_USER"

# ============================================
# Backend einrichten
# ============================================
info "Richte Backend ein..."
cd "$PROJECT_DIR/backend"

# Virtual Environment erstellen
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Virtual Environment aktivieren und Abhängigkeiten installieren
source venv/bin/activate
pip install --upgrade pip --quiet

# Lokale requirements verwenden (ohne Emergent-spezifische Pakete)
if [ -f "requirements.local.txt" ]; then
    info "Installiere Backend-Abhängigkeiten aus requirements.local.txt..."
    pip install -r requirements.local.txt --quiet
else
    info "Installiere Backend-Abhängigkeiten aus requirements.txt..."
    pip install -r requirements.txt --quiet 2>/dev/null || \
    pip install fastapi uvicorn python-dotenv pymongo pydantic motor httpx python-multipart pywebpush py-vapid --quiet
fi

# VAPID Keys generieren falls nicht vorhanden
VAPID_KEYS_NEEDED=false
if [ -f ".env" ]; then
    if ! grep -q "VAPID_PRIVATE_KEY" .env; then
        VAPID_KEYS_NEEDED=true
    fi
else
    VAPID_KEYS_NEEDED=true
fi

if [ "$VAPID_KEYS_NEEDED" = true ]; then
    info "Generiere VAPID-Keys für Push-Benachrichtigungen..."
    VAPID_OUTPUT=$(python3 -c "
from py_vapid import Vapid
import base64
v = Vapid()
v.generate_keys()
raw_priv = v.private_key.private_numbers().private_value.to_bytes(32, 'big')
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
raw_pub = v.public_key.public_bytes(encoding=Encoding.X962, format=PublicFormat.UncompressedPoint)
priv_b64 = base64.urlsafe_b64encode(raw_priv).decode().rstrip('=')
pub_b64 = base64.urlsafe_b64encode(raw_pub).decode().rstrip('=')
print(f'{priv_b64}|{pub_b64}')
" 2>/dev/null) || true

    if [ -n "$VAPID_OUTPUT" ]; then
        VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | cut -d'|' -f1)
        VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | cut -d'|' -f2)
        info "VAPID-Keys erfolgreich generiert"
    else
        warn "VAPID-Keys konnten nicht generiert werden - Push-Benachrichtigungen deaktiviert"
        VAPID_PRIVATE=""
        VAPID_PUBLIC=""
    fi
fi

# .env Datei erstellen falls nicht vorhanden
if [ ! -f ".env" ]; then
    info "Erstelle Backend .env Datei..."
    cat > .env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=kochplaner
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_CLAIMS_EMAIL=mailto:admin@kochplaner.app
EOF
elif [ "$VAPID_KEYS_NEEDED" = true ] && [ -n "$VAPID_PRIVATE" ]; then
    info "Füge VAPID-Keys zur bestehenden .env hinzu..."
    echo "" >> .env
    echo "VAPID_PRIVATE_KEY=${VAPID_PRIVATE}" >> .env
    echo "VAPID_PUBLIC_KEY=${VAPID_PUBLIC}" >> .env
    echo "VAPID_CLAIMS_EMAIL=mailto:admin@kochplaner.app" >> .env
fi

deactivate

# ============================================
# Frontend einrichten
# ============================================
info "Richte Frontend ein..."
cd "$PROJECT_DIR/frontend"

# Abhängigkeiten installieren
yarn install --silent

# Server-IP ermitteln
SERVER_IP=$(hostname -I | awk '{print $1}')
info "Erkannte Server-IP: $SERVER_IP"

# .env Datei erstellen/aktualisieren
info "Erstelle Frontend .env Datei..."
cat > .env << EOF
REACT_APP_BACKEND_URL=http://${SERVER_IP}:8001
EOF

# Frontend für Produktion bauen
info "Baue Frontend für Produktion..."
yarn build

# ============================================
# Serve für Frontend installieren
# ============================================
info "Installiere serve für Frontend..."
$SUDO npm install -g serve

# Pfad zu serve ermitteln
SERVE_PATH=$(which serve)
info "Serve installiert unter: $SERVE_PATH"

# ============================================
# Systemd Services erstellen
# ============================================
info "Erstelle systemd Services..."

# Backend Service
$SUDO tee /etc/systemd/system/kochplaner-backend.service > /dev/null << EOF
[Unit]
Description=Kochplaner Backend API
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR/backend
Environment="PATH=$PROJECT_DIR/backend/venv/bin"
ExecStart=$PROJECT_DIR/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Frontend Service
$SUDO tee /etc/systemd/system/kochplaner-frontend.service > /dev/null << EOF
[Unit]
Description=Kochplaner Frontend
After=network.target kochplaner-backend.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR/frontend
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=$SERVE_PATH -s build -l 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Systemd neu laden
$SUDO systemctl daemon-reload

# ============================================
# Services aktivieren und starten
# ============================================
info "Aktiviere und starte Services..."
$SUDO systemctl enable kochplaner-backend
$SUDO systemctl enable kochplaner-frontend
$SUDO systemctl start kochplaner-backend
sleep 3
$SUDO systemctl start kochplaner-frontend

# ============================================
# Verwaltungs-Skripte erstellen
# ============================================
info "Erstelle Verwaltungs-Skripte..."
cd "$PROJECT_DIR"

# Status-Skript
cat > status.sh << 'EOF'
#!/bin/bash
echo "=== MongoDB Status ==="
sudo systemctl status mongod --no-pager -l | head -5
echo ""
echo "=== Backend Status ==="
sudo systemctl status kochplaner-backend --no-pager -l | head -5
echo ""
echo "=== Frontend Status ==="
sudo systemctl status kochplaner-frontend --no-pager -l | head -5
EOF
chmod +x status.sh

# Stop-Skript
cat > stop.sh << 'EOF'
#!/bin/bash
echo "Stoppe Kochplaner Services..."
sudo systemctl stop kochplaner-frontend
sudo systemctl stop kochplaner-backend
echo "Services gestoppt."
EOF
chmod +x stop.sh

# Start-Skript
cat > start.sh << 'EOF'
#!/bin/bash
echo "Starte Kochplaner Services..."
sudo systemctl start kochplaner-backend
sleep 2
sudo systemctl start kochplaner-frontend
echo "Services gestartet."
EOF
chmod +x start.sh

# Restart-Skript
cat > restart.sh << 'EOF'
#!/bin/bash
echo "Starte Kochplaner Services neu..."
sudo systemctl restart kochplaner-backend
sleep 2
sudo systemctl restart kochplaner-frontend
echo "Services neu gestartet."
EOF
chmod +x restart.sh

# Logs-Skript
cat > logs.sh << 'EOF'
#!/bin/bash
case "$1" in
    backend)
        sudo journalctl -u kochplaner-backend -f
        ;;
    frontend)
        sudo journalctl -u kochplaner-frontend -f
        ;;
    *)
        echo "Verwendung: ./logs.sh [backend|frontend]"
        echo ""
        echo "Letzte Backend-Logs:"
        sudo journalctl -u kochplaner-backend --no-pager -n 20
        echo ""
        echo "Letzte Frontend-Logs:"
        sudo journalctl -u kochplaner-frontend --no-pager -n 20
        ;;
esac
EOF
chmod +x logs.sh

# Uninstall-Skript
cat > uninstall.sh << 'EOF'
#!/bin/bash
echo "Deinstalliere Kochplaner Services..."
sudo systemctl stop kochplaner-frontend
sudo systemctl stop kochplaner-backend
sudo systemctl disable kochplaner-frontend
sudo systemctl disable kochplaner-backend
sudo rm /etc/systemd/system/kochplaner-backend.service
sudo rm /etc/systemd/system/kochplaner-frontend.service
sudo systemctl daemon-reload
echo "Services entfernt."
EOF
chmod +x uninstall.sh

# ============================================
# SMTP-Konfiguration vorbereiten
# ============================================
info "Bereite SMTP-Konfiguration vor..."
$SUDO mkdir -p /etc/speisenplaner
if [ ! -f "/etc/speisenplaner/smtp.conf" ]; then
    $SUDO cp "$PROJECT_DIR/smtp.conf.example" /etc/speisenplaner/smtp.conf
    $SUDO chmod 600 /etc/speisenplaner/smtp.conf
    warn "SMTP-Konfiguration erstellt unter /etc/speisenplaner/smtp.conf"
    warn "Bitte bearbeite diese Datei mit deinen SMTP-Zugangsdaten"
fi

# ============================================
# Firewall konfigurieren (falls ufw aktiv)
# ============================================
if command -v ufw &> /dev/null && $SUDO ufw status | grep -q "active"; then
    info "Konfiguriere Firewall..."
    $SUDO ufw allow 3000/tcp
    $SUDO ufw allow 8001/tcp
fi

# ============================================
# Fertig!
# ============================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          ✅ Installation abgeschlossen!                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Die Anwendung läuft jetzt als Systemdienst!"
echo ""
echo "URLs:"
echo "  Frontend: http://${SERVER_IP}:3000"
echo "  Backend:  http://${SERVER_IP}:8001/api"
echo ""
echo "Verwaltungs-Befehle:"
echo "  ./status.sh   - Status aller Services anzeigen"
echo "  ./start.sh    - Services starten"
echo "  ./stop.sh     - Services stoppen"
echo "  ./restart.sh  - Services neu starten"
echo "  ./logs.sh     - Logs anzeigen"
echo "  ./uninstall.sh - Services deinstallieren"
echo ""
echo "Systemd-Befehle:"
echo "  sudo systemctl status kochplaner-backend"
echo "  sudo systemctl status kochplaner-frontend"
echo "  sudo journalctl -u kochplaner-backend -f"
echo ""
