// tests/routes/lists.test.js
const request = require('supertest');
const express = require('express');
const listRoutes = require('../../routes/lists');
const { Event, Game, Group, User, UserGroup, EventParticipation, sequelize } = require('../../models');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/lists', listRoutes);

describe('List Routes', () => {
  let testUser1, testUser2, testGroup, testGame1, testGame2, testEvent1, testEvent2;

  // Setup test data before all tests
  beforeAll(async () => {
    const timestamp = Date.now();
    testUser1 = await User.create({
      user_id: `test-user-lists-1-${timestamp}`,
      username: `testuser1-${timestamp}`,
      email: `test1-${timestamp}@example.com`
    });

    testUser2 = await User.create({
      user_id: `test-user-lists-2-${timestamp}`,
      username: `testuser2-${timestamp}`,
      email: `test2-${timestamp}@example.com`
    });

    testGroup = await Group.create({
      group_id: `test-group-lists-1-${timestamp}`,
      name: 'Test Group'
    });

    testGame1 = await Game.create({
      name: 'Test Game 1',
      is_custom: true,
      theme: 'Strategy'
    });

    testGame2 = await Game.create({
      name: 'Test Game 2',
      is_custom: true,
      theme: 'Party'
    });

    // Add user1 to group
    await UserGroup.create({
      user_id: testUser1.id,
      group_id: testGroup.id
    });

    // Create events
    testEvent1 = await Event.create({
      group_id: testGroup.id,
      game_id: testGame1.id,
      start_date: new Date('2024-01-01'),
      winner_id: testUser1.id,
      picked_by_id: testUser1.id,
      status: 'completed'
    });

    testEvent2 = await Event.create({
      group_id: testGroup.id,
      game_id: testGame2.id,
      start_date: new Date('2024-01-02'),
      winner_id: testUser2.id,
      picked_by_id: testUser1.id,
      status: 'completed'
    });

    // Create participations
    await EventParticipation.create({
      event_id: testEvent1.id,
      user_id: testUser1.id,
      score: 100,
      placement: 1
    });

    await EventParticipation.create({
      event_id: testEvent2.id,
      user_id: testUser1.id,
      score: 50,
      placement: 2
    });

    await EventParticipation.create({
      event_id: testEvent2.id,
      user_id: testUser2.id,
      score: 100,
      placement: 1
    });
  });

  // Clean up database before each test
  beforeEach(async () => {
    // Keep test data, just ensure clean state
  });

  afterAll(async () => {
    await EventParticipation.destroy({ where: {} });
    await Event.destroy({ where: {} });
    await UserGroup.destroy({ where: {} });
    await Group.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Game.destroy({ where: {} });
    await sequelize.close();
  });

  describe('GET /api/lists/player-wins/:group_id/:player_name/:user_id', () => {
    it('should get games won by a specific player', async () => {
      const response = await request(app)
        .get(`/api/lists/player-wins/${testGroup.id}/testuser1/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 403 if user not in group', async () => {
      const response = await request(app)
        .get(`/api/lists/player-wins/${testGroup.id}/testuser1/${testUser2.user_id}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });
  });

  describe('GET /api/lists/player-wins-by-id/:group_id/:player_user_id/:user_id', () => {
    it('should get games won by a specific player by user_id', async () => {
      const response = await request(app)
        .get(`/api/lists/player-wins-by-id/${testGroup.id}/${testUser1.user_id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/most-played/:group_id/:user_id', () => {
    it('should get games organized by most played', async () => {
      const response = await request(app)
        .get(`/api/lists/most-played/${testGroup.id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 403 if user not in group', async () => {
      const response = await request(app)
        .get(`/api/lists/most-played/${testGroup.id}/${testUser2.user_id}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });
  });

  describe('GET /api/lists/least-played/:group_id/:user_id', () => {
    it('should get games organized by least played', async () => {
      const response = await request(app)
        .get(`/api/lists/least-played/${testGroup.id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/player-picks/:group_id/:player_name/:user_id', () => {
    it('should get games picked by a specific player', async () => {
      const response = await request(app)
        .get(`/api/lists/player-picks/${testGroup.id}/testuser1/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/player-picks-by-id/:group_id/:player_user_id/:user_id', () => {
    it('should get games picked by a specific player by user_id', async () => {
      const response = await request(app)
        .get(`/api/lists/player-picks-by-id/${testGroup.id}/${testUser1.user_id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/by-theme/:group_id/:theme/:user_id', () => {
    it('should get games by theme', async () => {
      const response = await request(app)
        .get(`/api/lists/by-theme/${testGroup.id}/Strategy/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/alphabetical/:group_id/:user_id', () => {
    it('should get all games sorted alphabetically', async () => {
      const response = await request(app)
        .get(`/api/lists/alphabetical/${testGroup.id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/player-games/:group_id/:player_name/:user_id', () => {
    it('should get all games played by a specific player', async () => {
      const response = await request(app)
        .get(`/api/lists/player-games/${testGroup.id}/testuser1/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/player-games-by-id/:group_id/:player_user_id/:user_id', () => {
    it('should get all games played by a specific player by user_id', async () => {
      const response = await request(app)
        .get(`/api/lists/player-games-by-id/${testGroup.id}/${testUser1.user_id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/lists/players/:group_id/:user_id', () => {
    it('should get all players in a group with statistics', async () => {
      const response = await request(app)
        .get(`/api/lists/players/${testGroup.id}/${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('user_id');
        expect(response.body[0]).toHaveProperty('name');
        expect(response.body[0]).toHaveProperty('games_played');
        expect(response.body[0]).toHaveProperty('games_won');
      }
    });

    it('should return 403 if user not in group', async () => {
      const response = await request(app)
        .get(`/api/lists/players/${testGroup.id}/${testUser2.user_id}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });
  });
});

