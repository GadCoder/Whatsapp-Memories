#!/bin/bash

# Full rebuild and restart (only needed when code changes)

echo "🛑 Stopping containers..."
sudo docker compose down

echo "🧹 Cleaning up Chromium lock files (preserving session)..."
sudo find ./services/whatsapp-collector/.wwebjs_auth -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

echo "🔨 Rebuilding images..."
sudo docker compose build --no-cache whatsapp-collector

echo "🚀 Starting services..."
sudo docker compose up

echo "✅ Done!"
