#!/bin/bash

# Clean up any stale Chromium lock files from previous runs
# These can be regular files or symlinks, so we handle both
echo "Cleaning up stale Chromium lock files..."
rm -f /usr/src/app/.wwebjs_auth/session/SingletonLock 2>/dev/null || true
rm -f /usr/src/app/.wwebjs_auth/session/SingletonSocket 2>/dev/null || true
rm -f /usr/src/app/.wwebjs_auth/session/SingletonCookie 2>/dev/null || true

# Also search recursively for any Singleton files (handles nested paths)
find /usr/src/app/.wwebjs_auth -name "Singleton*" -exec rm -f {} \; 2>/dev/null || true

echo "Lock files cleanup complete."

# Start the application
echo "Starting WhatsApp Collector Service..."
exec npm start
