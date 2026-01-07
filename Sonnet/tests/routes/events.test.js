// tests/routes/events.test.js
const request = require('supertest');
const express = require('express');
const eventRoutes = require('../../routes/events');
const { Event, Game, User, Group, EventParticipation, UserGroup, sequelize } = require('../../models');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);

describe('Event Routes', () => {
  let testUser1, testUser2, testGroup, testGame;

  // Setup test data before all tests
  beforeAll(async () => {
    testUser1 = await User.create({
      user_id: 'test-user-events-1',
      username: 'testuser1',
      email: 'test1@example.com'
    });

    testUser2 = await User.create({
      user_id: 'test-user-events-2',
      username: 'testuser2',
      email: 'test2@example.com'
    });

    testGroup = await Group.create({
      group_id: 'test-group-events-1',
      name: 'Test Group'
    });

    testGame = await Game.create({
      name: 'Test Game',
      is_custom: true
    });

    // Add user1 to group
    await UserGroup.create({
      user_id: testUser1.id,
      group_id: testGroup.id
    });
  });

  // Note: We don't clean up before each test to allow tests to build on each other
  // Each test creates its own data

  afterAll(async () => {
    await EventParticipation.destroy({ where: {} });
    await Event.destroy({ where: {} });
    await UserGroup.destroy({ where: {} });
    await Group.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Game.destroy({ where: {} });
    await sequelize.close();
  });

  describe('GET /api/events/group/:group_id', () => {
    it('should get all events for a group', async () => {
      // Create event for this test
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      const response = await request(app)
        .get(`/api/events/group/${testGroup.id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Clean up
      await Event.destroy({ where: { id: event.id } });
    });

    it('should return 403 if user_id provided but user not in group', async () => {
      const response = await request(app)
        .get(`/api/events/group/${testGroup.id}?user_id=${testUser2.user_id}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Access denied to this group');
    });

    it('should return events if user_id provided and user is in group', async () => {
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      const response = await request(app)
        .get(`/api/events/group/${testGroup.id}?user_id=${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/events', () => {
    it('should create a new event', async () => {
      const eventData = {
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date().toISOString(),
        duration_minutes: 60
      };

      const response = await request(app)
        .post('/api/events')
        .send(eventData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.group_id).toBe(testGroup.id);
      expect(response.body.game_id).toBe(testGame.id);
      
      // Clean up
      await Event.destroy({ where: { id: response.body.id } });
    });

    it('should create event with participants', async () => {
      const eventData = {
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date().toISOString(),
        participants: [
          {
            user_id: testUser1.id,
            score: 100,
            placement: 1
          }
        ]
      };

      const response = await request(app)
        .post('/api/events')
        .send(eventData)
        .expect(200);

      expect(response.body).toHaveProperty('EventParticipations');
      expect(response.body.EventParticipations.length).toBe(1);
    });

    it('should return 500 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/events/:id', () => {
    it('should update an event', async () => {
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      const updateData = {
        duration_minutes: 120,
        comments: 'Updated comment'
      };

      const response = await request(app)
        .put(`/api/events/${event.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.duration_minutes).toBe(updateData.duration_minutes);
      expect(response.body.comments).toBe(updateData.comments);
    });

    it('should update event participants', async () => {
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      await EventParticipation.create({
        event_id: event.id,
        user_id: testUser1.id,
        score: 50
      });

      const updateData = {
        participants: [
          {
            user_id: testUser1.id,
            score: 100,
            placement: 1
          }
        ]
      };

      const response = await request(app)
        .put(`/api/events/${event.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.EventParticipations.length).toBe(1);
      expect(response.body.EventParticipations[0].score).toBe(100);
    });

    it('should return 404 if event not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .put(`/api/events/${fakeId}`)
        .send({ duration_minutes: 120 })
        .expect(404);

      expect(response.body.error).toBe('Event not found');
    });
  });

  describe('DELETE /api/events/:id', () => {
    it('should delete an event', async () => {
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      const response = await request(app)
        .delete(`/api/events/${event.id}`)
        .expect(200);

      expect(response.body.message).toBe('Event deleted successfully');

      // Verify event is deleted
      const deletedEvent = await Event.findByPk(event.id);
      expect(deletedEvent).toBeNull();
    });

    it('should delete event and its participations', async () => {
      const event = await Event.create({
        group_id: testGroup.id,
        game_id: testGame.id,
        start_date: new Date(),
        status: 'completed'
      });

      await EventParticipation.create({
        event_id: event.id,
        user_id: testUser1.id,
        score: 100
      });

      await request(app)
        .delete(`/api/events/${event.id}`)
        .expect(200);

      // Verify participations are deleted
      const participations = await EventParticipation.findAll({
        where: { event_id: event.id }
      });
      expect(participations.length).toBe(0);
    });

    it('should return 404 if event not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .delete(`/api/events/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Event not found');
    });
  });
});

