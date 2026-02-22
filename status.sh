#!/bin/bash
echo "=== MongoDB Status ==="
sudo systemctl status mongod --no-pager -l | head -5
echo ""
echo "=== Backend Status ==="
sudo systemctl status kochplaner-backend --no-pager -l | head -5
echo ""
echo "=== Frontend Status ==="
sudo systemctl status kochplaner-frontend --no-pager -l | head -5
