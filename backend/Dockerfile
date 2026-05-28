FROM python:3.11-slim

# Prevent python from writing pyc files and buffering output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for psycopg2 and building packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    musl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy application source code
COPY . .

# Expose port 8000 for gunicorn
EXPOSE 8000

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Run migrations and start gunicorn
ENTRYPOINT ["/app/entrypoint.sh"]
