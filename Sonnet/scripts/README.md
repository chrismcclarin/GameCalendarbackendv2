# Database Setup Scripts

## Setup Test Database

This script creates and sets up a test database for running tests.

### Usage

1. **Create `.env.test` file:**
   ```bash
   cp .env.test.example .env.test
   ```
   Then edit `.env.test` with your database credentials.

2. **Run the setup script:**
   ```bash
   npm run test:setup
   ```

   Or directly:
   ```bash
   node scripts/setup-test-db.js
   ```

### What it does

- Connects to your PostgreSQL server
- Creates a test database (default: `boardgame_test_db`)
- Drops and recreates the database if it already exists
- Syncs all database tables/schema
- Sets up the database ready for testing

### Manual Setup Alternative

If you prefer to set up the database manually:

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create test database
CREATE DATABASE boardgame_test_db;

-- Exit psql
\q
```

Then run your tests - the schema will be created automatically on first test run.

