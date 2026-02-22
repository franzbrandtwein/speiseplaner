#!/bin/bash
echo "Starte Kochplaner Services neu..."
sudo systemctl restart kochplaner-backend
sleep 2
sudo systemctl restart kochplaner-frontend
echo "Services neu gestartet."
