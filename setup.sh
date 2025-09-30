#!/bin/bash
# Lead Qualification AI - One-Command Setup Script
# Usage: ./setup.sh

set -e  # Exit on error

echo "================================================"
echo "Lead Qualification AI - Setup"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking dependencies..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL command-line tools not found${NC}"
    echo "Please ensure PostgreSQL is installed and running"
    echo "Visit: https://www.postgresql.org/download/"
fi

# Check Python3
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 is required for Spanish NLP${NC}"
    echo "Please install Python 3.8+ from https://python.org"
    exit 1
fi
echo -e "${GREEN}✓ Python3 found: $(python3 --version)${NC}"

echo ""
echo "Installing dependencies..."

# Install npm packages
echo "Installing npm packages..."
npm install

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install spacy

# Download spaCy Spanish model
echo "Downloading spaCy Spanish model (es_core_news_lg)..."
python3 -m spacy download es_core_news_lg

echo ""
echo "Configuring environment..."

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo -e "${YELLOW}⚠ Please edit .env with your credentials before running${NC}"
else
    echo -e "${YELLOW}⚠ .env file already exists, skipping${NC}"
fi

echo ""
echo "Setting up database..."

# Check if DATABASE_URL is set
if grep -q "DATABASE_URL=postgresql://" .env 2>/dev/null; then
    echo "Running database migrations..."
    npm run db:migrate || echo -e "${YELLOW}⚠ Migration failed - you may need to set DATABASE_URL in .env first${NC}"

    echo "Seeding question bank..."
    npm run db:seed || echo -e "${YELLOW}⚠ Seeding failed - this is optional${NC}"
else
    echo -e "${YELLOW}⚠ DATABASE_URL not configured in .env${NC}"
    echo "Skipping database setup"
fi

echo ""
echo "Making Python script executable..."
chmod +x server/python/spanish_nlp.py

echo ""
echo "================================================"
echo -e "${GREEN}✓ Setup complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys and credentials"
echo "2. Ensure PostgreSQL is running"
echo "3. Run 'npm run db:migrate' to set up database"
echo "4. Run 'npm run dev' to start the development server"
echo ""
echo "For production deployment, see docs/deployment/"
echo ""