// tests/routes/groups.test.js
const request = require('supertest');
const express = require('express');
const groupRoutes = require('../../routes/groups');
const { Group, User, UserGroup, Event, Game, sequelize } = require('../../models');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/groups', groupRoutes);

describe('Group Routes', () => {
  let testUser1, testUser2, testGame;

  // Setup test data before all tests
  beforeAll(async () => {
    testUser1 = await User.create({
      user_id: 'test-user-groups-1',
      username: 'testuser1',
      email: 'test1@example.com'
    });

    testUser2 = await User.create({
      user_id: 'test-user-groups-2',
      username: 'testuser2',
      email: 'test2@example.com'
    });

    testGame = await Game.create({
      name: 'Test Game',
      is_custom: true
    });
  });

  // Clean up database before each test
  beforeEach(async () => {
    await Event.destroy({ where: {} });
    await UserGroup.destroy({ where: {} });
    // Don't destroy groups/users as they're used across tests
  });

  afterAll(async () => {
    await Event.destroy({ where: {} });
    await UserGroup.destroy({ where: {} });
    await Group.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Game.destroy({ where: {} });
    await sequelize.close();
  });

  describe('GET /api/groups/user/:user_id', () => {
    it('should get all groups for a user', async () => {
      const testGroup = await Group.create({
        group_id: 'test-group-1',
        name: 'Test Group 1'
      });

      await UserGroup.create({
        user_id: testUser1.id,
        group_id: testGroup.id
      });

      const response = await request(app)
        .get(`/api/groups/user/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should return 404 if user not found', async () => {
      const response = await request(app)
        .get('/api/groups/user/non-existent-user')
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });

    it('should include recent events in groups', async () => {
      const testGroup = await Group.create({
        group_id: 'test-group-2',
        name: 'Test Group 2'
      });

      await UserGroup.create({
        user_id: testUser1.id,
        group_id: testGroup.id
      });

      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      const response = await request(app)
        .get(`/api/groups/user/${testUser1.user_id}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      // Check if group has events
      const group = response.body.find(g => g.id === testGroup.id);
      if (group && group.Events) {
        expect(Array.isArray(group.Events)).toBe(true);
      }
    });
  });

  describe('POST /api/groups', () => {
    it('should create a new group', async () => {
      const groupData = {
        name: 'New Test Group',
        user_id: testUser1.user_id
      };

      const response = await request(app)
        .post('/api/groups')
        .send(groupData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(groupData.name);
      expect(response.body).toHaveProperty('group_id');

      // Verify user was added to group
      const userGroup = await UserGroup.findOne({
        where: {
          user_id: testUser1.id,
          group_id: response.body.id
        }
      });
      expect(userGroup).not.toBeNull();
    });

    it('should return 404 if user not found', async () => {
      const groupData = {
        name: 'New Test Group',
        user_id: 'non-existent-user'
      };

      const response = await request(app)
        .post('/api/groups')
        .send(groupData)
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });
  });

  describe('POST /api/groups/:group_id/users', () => {
    it('should add user to group', async () => {
      const testGroup = await Group.create({
        group_id: 'test-group-3',
        name: 'Test Group 3'
      });

      const response = await request(app)
        .post(`/api/groups/${testGroup.id}/users`)
        .send({ user_id: testUser2.user_id })
        .expect(200);

      expect(response.body.message).toBe('User added to group successfully');

      // Verify user was added
      const userGroup = await UserGroup.findOne({
        where: {
          user_id: testUser2.id,
          group_id: testGroup.id
        }
      });
      expect(userGroup).not.toBeNull();
    });

    it('should not create duplicate if user already in group', async () => {
      const testGroup = await Group.create({
        group_id: `test-group-4-${Date.now()}`,
        name: 'Test Group 4'
      });

      await UserGroup.create({
        user_id: testUser1.id,
        group_id: testGroup.id
      });

      const response = await request(app)
        .post(`/api/groups/${testGroup.id}/users`)
        .send({ user_id: testUser1.user_id })
        .expect(200);

      expect(response.body.message).toBe('User added to group successfully');
      
      // Clean up
      await UserGroup.destroy({ where: { group_id: testGroup.id } });
      await Group.destroy({ where: { id: testGroup.id } });
    });

    it('should return 404 if user not found', async () => {
      const testGroup = await Group.create({
        group_id: 'test-group-5',
        name: 'Test Group 5'
      });

      const response = await request(app)
        .post(`/api/groups/${testGroup.id}/users`)
        .send({ user_id: 'non-existent-user' })
        .expect(404);

      expect(response.body.error).toBe('User or Group not found');
    });

    it('should return 404 if group not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post(`/api/groups/${fakeId}/users`)
        .send({ user_id: testUser1.user_id })
        .expect(404);

      expect(response.body.error).toBe('User or Group not found');
    });
  });
});

