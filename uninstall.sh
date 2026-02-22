#!/bin/bash
echo "Deinstalliere Kochplaner Services..."
sudo systemctl stop kochplaner-frontend
sudo systemctl stop kochplaner-backend
sudo systemctl disable kochplaner-frontend
sudo systemctl disable kochplaner-backend
sudo rm /etc/systemd/system/kochplaner-backend.service
sudo rm /etc/systemd/system/kochplaner-frontend.service
sudo systemctl daemon-reload
echo "Services entfernt."
