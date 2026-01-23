#!/bin/bash

# Quick restart without rebuilding (for normal restarts)

echo "🛑 Stopping containers..."
docker compose down

echo "🧹 Cleaning up Chromium lock files (preserving session)..."
find ./services/whatsapp-collector/.wwebjs_auth -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

echo "🚀 Starting services..."
docker compose up

echo "✅ Done!"
