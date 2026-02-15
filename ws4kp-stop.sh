#!/bin/bash
# Stop ws4kp kiosk: watchdog first, then browser and server

echo "Stopping watchdog..."
pkill -f ws4kp-watchdog.sh

echo "Stopping Chromium kiosk..."
pkill -f 'chromium.*--kiosk'

echo "Stopping ws4kp service..."
systemctl --user stop ws4kp.service

echo "All stopped."
