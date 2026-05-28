#!/bin/sh
# Exit immediately if a command exits with a non-zero status
set -e

# Run database upgrades on startup
echo "Applying database migrations..."
python -m flask db upgrade

# Start Gunicorn server binding to port 8000
echo "Starting Gunicorn server..."
exec gunicorn --bind 0.0.0.0:8000 --workers 4 --access-logfile - --error-logfile - "run:app"
