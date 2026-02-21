#!/bin/bash

# ============================================
# Kochplaner - Setup Script für openSUSE
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
$SUDO zypper refresh -q

# ============================================
# Grundlegende Abhängigkeiten
# ============================================
info "Installiere grundlegende Abhängigkeiten..."
$SUDO zypper install -y -q \
    curl \
    wget \
    git \
    gcc \
    gcc-c++ \
    make \
    ca-certificates

# ============================================
# Node.js 20.x installieren
# ============================================
if ! command -v node &> /dev/null; then
    info "Installiere Node.js 20.x..."
    $SUDO zypper install -y -q nodejs20 npm20
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
    $SUDO zypper install -y -q python311 python311-pip python311-venv
else
    info "Python bereits installiert: $(python3 --version)"
fi

# ============================================
# MongoDB 7.0 installieren
# ============================================
if ! command -v mongod &> /dev/null; then
    info "Installiere MongoDB 7.0..."
    
    # MongoDB Repository hinzufügen
    $SUDO zypper addrepo --gpgcheck "https://repo.mongodb.org/zypper/suse/15/mongodb-org/7.0/x86_64/" mongodb
    
    # GPG Key importieren
    $SUDO rpm --import https://www.mongodb.org/static/pgp/server-7.0.asc
    
    # MongoDB installieren
    $SUDO zypper refresh -q
    $SUDO zypper install -y -q mongodb-org
    
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
pip install -r requirements.txt --quiet

# .env Datei erstellen falls nicht vorhanden
if [ ! -f ".env" ]; then
    info "Erstelle Backend .env Datei..."
    cat > .env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="kochplaner"
CORS_ORIGINS="http://localhost:3000"
EOF
fi

deactivate

# ============================================
# Frontend einrichten
# ============================================
info "Richte Frontend ein..."
cd "$PROJECT_DIR/frontend"

# Abhängigkeiten installieren
yarn install --silent

# .env Datei erstellen falls nicht vorhanden
if [ ! -f ".env" ]; then
    info "Erstelle Frontend .env Datei..."
    cat > .env << EOF
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
fi

# ============================================
# Start-Skripte erstellen
# ============================================
info "Erstelle Start-Skripte..."
cd "$PROJECT_DIR"

# Backend Start-Skript
cat > start_backend.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/backend"
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
EOF
chmod +x start_backend.sh

# Frontend Start-Skript
cat > start_frontend.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/frontend"
yarn start
EOF
chmod +x start_frontend.sh

# Beide starten
cat > start_all.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

echo "Starte MongoDB..."
sudo systemctl start mongod

echo "Starte Backend..."
./start_backend.sh &
BACKEND_PID=$!

sleep 3

echo "Starte Frontend..."
./start_frontend.sh &
FRONTEND_PID=$!

echo ""
echo "════════════════════════════════════════"
echo "  Kochplaner läuft!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8001"
echo "════════════════════════════════════════"
echo ""
echo "Drücke Ctrl+C zum Beenden..."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
EOF
chmod +x start_all.sh

# ============================================
# Firewall-Regeln (falls firewalld aktiv)
# ============================================
if systemctl is-active --quiet firewalld; then
    info "Konfiguriere Firewall..."
    $SUDO firewall-cmd --permanent --add-port=3000/tcp
    $SUDO firewall-cmd --permanent --add-port=8001/tcp
    $SUDO firewall-cmd --reload
fi

# ============================================
# Fertig!
# ============================================
echo ""
echo "╔════════════════════════════════════════╗"
echo "║   ✅ Installation abgeschlossen!       ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Starte die Anwendung mit:"
echo "  ./start_all.sh     - Backend + Frontend starten"
echo ""
echo "Oder einzeln:"
echo "  ./start_backend.sh - Nur Backend starten"
echo "  ./start_frontend.sh - Nur Frontend starten"
echo ""
echo "URLs:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8001/api"
echo ""
