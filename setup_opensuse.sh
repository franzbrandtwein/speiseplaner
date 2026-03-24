#!/bin/bash

# ============================================
# Kochplaner - Setup Script für openSUSE
# Mit systemd Service-Installation
# ============================================

set -e

echo "╔════════════════════════════════════════╗"
echo "║     Kochplaner Setup - openSUSE        ║"
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
zypper --quiet refresh || true

# ============================================
# Grundlegende Abhängigkeiten
# ============================================
info "Installiere grundlegende Abhängigkeiten..."
zypper --non-interactive install --no-confirm \
    curl \
    wget \
    git \
    gcc \
    gcc-c++ \
    make \
    ca-certificates 2>/dev/null || true

# ============================================
# Node.js 20.x installieren
# ============================================
if ! command -v node &> /dev/null; then
    info "Installiere Node.js 20.x..."
    zypper --non-interactive install --no-confirm nodejs20 npm20 2>/dev/null || \
    zypper --non-interactive install --no-confirm nodejs npm 2>/dev/null || \
    error "Node.js konnte nicht installiert werden"
else
    info "Node.js bereits installiert: $(node --version)"
fi

# ============================================
# Yarn installieren
# ============================================
if ! command -v yarn &> /dev/null; then
    info "Installiere Yarn..."
    npm install -g yarn
else
    info "Yarn bereits installiert: $(yarn --version)"
fi

# ============================================
# Python 3.11+ installieren
# ============================================
if ! command -v python3 &> /dev/null; then
    info "Installiere Python 3..."
    zypper --non-interactive install --no-confirm python311 python311-pip python311-venv 2>/dev/null || \
    zypper --non-interactive install --no-confirm python3 python3-pip python3-venv 2>/dev/null || \
    error "Python konnte nicht installiert werden"
else
    info "Python bereits installiert: $(python3 --version)"
fi

# ============================================
# MongoDB 7.0 installieren
# ============================================
if ! command -v mongod &> /dev/null; then
    info "Installiere MongoDB 7.0..."
    
    # MongoDB Repository hinzufügen
    zypper addrepo --gpgcheck "https://repo.mongodb.org/zypper/suse/15/mongodb-org/7.0/x86_64/" mongodb 2>/dev/null || true
    
    # GPG Key importieren
    rpm --import https://www.mongodb.org/static/pgp/server-7.0.asc 2>/dev/null || true
    
    # MongoDB installieren
    zypper --quiet refresh || true
    zypper --non-interactive install --no-confirm mongodb-org 2>/dev/null || \
    error "MongoDB konnte nicht installiert werden"
    
    # MongoDB starten und aktivieren
    systemctl start mongod
    systemctl enable mongod
else
    info "MongoDB bereits installiert"
    # Sicherstellen dass MongoDB läuft
    systemctl is-active --quiet mongod || systemctl start mongod
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
yarn install --silent 2>/dev/null || yarn install

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
npm install -g serve 2>/dev/null || true

# Pfad zu serve ermitteln
SERVE_PATH=$(which serve 2>/dev/null || echo "/usr/local/bin/serve")
info "Serve installiert unter: $SERVE_PATH"

# ============================================
# Systemd Services erstellen
# ============================================
info "Erstelle systemd Services..."

# Backend Service
tee /etc/systemd/system/kochplaner-backend.service > /dev/null << EOF
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
tee /etc/systemd/system/kochplaner-frontend.service > /dev/null << EOF
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
systemctl daemon-reload

# ============================================
# Services aktivieren und starten
# ============================================
info "Aktiviere und starte Services..."
systemctl enable kochplaner-backend
systemctl enable kochplaner-frontend
systemctl restart kochplaner-backend
sleep 3
systemctl restart kochplaner-frontend

# ============================================
# Verwaltungs-Skripte erstellen
# ============================================
info "Erstelle Verwaltungs-Skripte..."
cd "$PROJECT_DIR"

# Status-Skript
cat > status.sh << 'SCRIPT'
#!/bin/bash
echo "=== MongoDB Status ==="
sudo systemctl status mongod --no-pager -l | head -5
echo ""
echo "=== Backend Status ==="
sudo systemctl status kochplaner-backend --no-pager -l | head -5
echo ""
echo "=== Frontend Status ==="
sudo systemctl status kochplaner-frontend --no-pager -l | head -5
SCRIPT
chmod +x status.sh

# Stop-Skript
cat > stop.sh << 'SCRIPT'
#!/bin/bash
echo "Stoppe Kochplaner Services..."
sudo systemctl stop kochplaner-frontend
sudo systemctl stop kochplaner-backend
echo "Services gestoppt."
SCRIPT
chmod +x stop.sh

# Start-Skript
cat > start.sh << 'SCRIPT'
#!/bin/bash
echo "Starte Kochplaner Services..."
sudo systemctl start kochplaner-backend
sleep 2
sudo systemctl start kochplaner-frontend
echo "Services gestartet."
SCRIPT
chmod +x start.sh

# Restart-Skript
cat > restart.sh << 'SCRIPT'
#!/bin/bash
echo "Starte Kochplaner Services neu..."
sudo systemctl restart kochplaner-backend
sleep 2
sudo systemctl restart kochplaner-frontend
echo "Services neu gestartet."
SCRIPT
chmod +x restart.sh

# Logs-Skript
cat > logs.sh << 'SCRIPT'
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
SCRIPT
chmod +x logs.sh

# Uninstall-Skript
cat > uninstall.sh << 'SCRIPT'
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
SCRIPT
chmod +x uninstall.sh

# ============================================
# SMTP-Konfiguration vorbereiten
# ============================================
info "Bereite SMTP-Konfiguration vor..."
mkdir -p /etc/speisenplaner
if [ ! -f "/etc/speisenplaner/smtp.conf" ]; then
    if [ -f "$PROJECT_DIR/smtp.conf.example" ]; then
        cp "$PROJECT_DIR/smtp.conf.example" /etc/speisenplaner/smtp.conf
        chmod 600 /etc/speisenplaner/smtp.conf
        warn "SMTP-Konfiguration erstellt unter /etc/speisenplaner/smtp.conf"
        warn "Bitte bearbeite diese Datei mit deinen SMTP-Zugangsdaten"
    else
        warn "smtp.conf.example nicht gefunden - überspringe SMTP-Konfiguration"
    fi
fi

# ============================================
# Firewall-Regeln (falls firewalld aktiv)
# ============================================
if systemctl is-active --quiet firewalld 2>/dev/null; then
    info "Konfiguriere Firewall..."
    firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=8001/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
fi

# ============================================
# Fertig!
# ============================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Installation abgeschlossen!                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Die Anwendung laeuft jetzt als Systemdienst!"
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
