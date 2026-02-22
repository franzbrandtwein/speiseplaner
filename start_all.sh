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
