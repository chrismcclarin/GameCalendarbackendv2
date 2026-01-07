# Testing Guide

This directory contains tests for the boardgame backend API.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create test environment file:**
   ```bash
   cp env.test.example .env.test
   ```
   Then edit `.env.test` with your database credentials.

3. **Set up test database:**
   Run the automated setup script:
   ```bash
   npm run test:setup
   ```
   
   This will:
   - Create the test database (`boardgame_test_db` by default)
   - Drop and recreate if it already exists
   - Sync all database tables/schema
   
   **Alternative - Manual setup:**
   ```sql
   CREATE DATABASE boardgame_test_db;
   ```
   The schema will be created automatically on first test run.

## Running Tests

- **Run all tests:**
  ```bash
  npm test
  ```

- **Run tests in watch mode (auto-rerun on file changes):**
  ```bash
  npm run test:watch
  ```

- **Run tests with coverage report:**
  ```bash
  npm run test:coverage
  ```

## Test Structure

- `setup.js` - Global test setup and teardown
- `routes/` - API endpoint tests
  - `users.test.js` - User route tests
  - `games.test.js` - Game route tests
  - Add more route tests as needed

## Writing Tests

### Example Test Structure:
```javascript
describe('Route Name', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await Model.destroy({ where: {} });
  });

  describe('GET /endpoint', () => {
    it('should do something', async () => {
      // Test implementation
    });
  });
});
```

## Best Practices

1. **Isolation:** Each test should be independent and not rely on other tests
2. **Cleanup:** Always clean up test data after tests
3. **Test Database:** Use a separate test database to avoid affecting development data
4. **Mocking:** Mock external services (like BGG API) in tests
5. **Coverage:** Aim for good test coverage of critical paths

## Notes

- Tests use Supertest for HTTP endpoint testing
- Jest is used as the test framework
- Database is cleaned between tests to ensure isolation
- Test timeout is set to 10 seconds (adjust in `jest.config.js` if needed)

