#!/usr/bin/env bash
set -euo pipefail

# Always run from the project root — no matter where the script is invoked from.
cd "$(dirname "$0")"

echo "────── 1. Building frontend ──────"
cd frontend
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
cd ..

echo "────── 2. Copying frontend build into backend/static_build ──────"
rm -rf backend/static_build
mkdir -p backend/static_build
cp -r frontend/dist/. backend/static_build/
ls -la backend/static_build/ | head -10

echo "────── 3. Installing backend dependencies ──────"
cd backend
pip install -r requirements.txt

echo "────── 4. Collecting Django static files ──────"
python3 manage.py collectstatic --noinput
cd ..

echo "────── Build complete ──────"
echo "  Frontend build: backend/static_build/"
echo "  Django static:  backend/staticfiles/"
