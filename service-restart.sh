#!/bin/bash
echo "🔄 Restarting Speiseplaner services..."
sudo systemctl restart speiseplaner-backend.service
sudo systemctl restart speiseplaner-frontend.service
sleep 3
echo "✅ Services restarted"
./service-status.sh
