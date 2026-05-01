#!/bin/bash
echo "🛑 Stopping Speiseplaner services..."
sudo systemctl stop speiseplaner-backend.service speiseplaner-frontend.service
echo "✅ Services stopped"
