#!/bin/bash
# Use systemd services
sudo systemctl start speiseplaner-backend.service speiseplaner-frontend.service
echo "✅ All services started"
sleep 2
./service-status.sh
