#!/bin/bash
echo "Stoppe Kochplaner Services..."
sudo systemctl stop kochplaner-frontend
sudo systemctl stop kochplaner-backend
echo "Services gestoppt."
