// tests/routes/users.test.js
const request = require('supertest');
const express = require('express');
const userRoutes = require('../../routes/users');
const { User, Group, UserGroup, sequelize } = require('../../models');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

describe('User Routes', () => {
  // Clean up database before each test
  beforeEach(async () => {
    await UserGroup.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Group.destroy({ where: {} });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/users', () => {
    it('should create a new user', async () => {
      const userData = {
        user_id: 'test-user-1',
        username: 'testuser',
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.username).toBe(userData.username);
      expect(response.body.email).toBe(userData.email);
      expect(response.body.user_id).toBe(userData.user_id);
    });

    it('should update existing user if user_id already exists', async () => {
      // Create user first
      const existingUser = await User.create({
        user_id: 'test-user-2',
        username: 'oldusername',
        email: 'old@example.com'
      });

      const updatedData = {
        user_id: 'test-user-2',
        username: 'newusername',
        email: 'new@example.com'
      };

      const response = await request(app)
        .post('/api/users')
        .send(updatedData)
        .expect(200);

      expect(response.body.username).toBe(updatedData.username);
      expect(response.body.email).toBe(updatedData.email);
    });

    it('should return 500 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/users/:user_id', () => {
    it('should get user by user_id', async () => {
      // Create test user
      const testUser = await User.create({
        user_id: 'test-user-3',
        username: 'testuser3',
        email: 'test3@example.com'
      });

      const response = await request(app)
        .get(`/api/users/${testUser.user_id}`)
        .expect(200);

      expect(response.body.user_id).toBe(testUser.user_id);
      expect(response.body.username).toBe(testUser.username);
    });

    it('should return 404 if user not found', async () => {
      const response = await request(app)
        .get('/api/users/non-existent-user')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('User not found');
    });

    it('should include groups when user has groups', async () => {
      // Create user and group
      const testUser = await User.create({
        user_id: 'test-user-4',
        username: 'testuser4',
        email: 'test4@example.com'
      });

      const testGroup = await Group.create({
        group_id: 'test-group-4',
        name: 'Test Group'
      });

      await UserGroup.create({
        user_id: testUser.id,
        group_id: testGroup.id
      });

      const response = await request(app)
        .get(`/api/users/${testUser.user_id}`)
        .expect(200);

      expect(response.body).toHaveProperty('Groups');
      expect(Array.isArray(response.body.Groups)).toBe(true);
    });
  });
});

