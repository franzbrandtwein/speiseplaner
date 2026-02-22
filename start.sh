#!/bin/bash
echo "Starte Kochplaner Services..."
sudo systemctl start kochplaner-backend
sleep 2
sudo systemctl start kochplaner-frontend
echo "Services gestartet."
