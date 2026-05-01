#!/bin/bash
# Use systemd services instead
sudo systemctl start speiseplaner-backend.service speiseplaner-frontend.service
echo "✅ Services started via systemd"
