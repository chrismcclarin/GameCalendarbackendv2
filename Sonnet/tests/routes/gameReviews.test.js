// tests/routes/gameReviews.test.js
const request = require('supertest');
const express = require('express');
const gameReviewRoutes = require('../../routes/gameReviews');
const { GameReview, User, Group, Game, UserGroup, sequelize } = require('../../models');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/game-reviews', gameReviewRoutes);

describe('GameReview Routes', () => {
  let testUser1, testUser2, testGroup, testGame;

  // Setup test data before all tests
  beforeAll(async () => {
    const timestamp = Date.now();
    testUser1 = await User.create({
      user_id: `test-user-reviews-1-${timestamp}`,
      username: `testuser1-${timestamp}`,
      email: `test1-${timestamp}@example.com`
    });

    testUser2 = await User.create({
      user_id: `test-user-reviews-2-${timestamp}`,
      username: `testuser2-${timestamp}`,
      email: `test2-${timestamp}@example.com`
    });

    testGroup = await Group.create({
      group_id: `test-group-reviews-1-${timestamp}`,
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

  // Clean up database before each test
  beforeEach(async () => {
    await GameReview.destroy({ where: {} });
  });

  afterAll(async () => {
    await GameReview.destroy({ where: {} });
    await UserGroup.destroy({ where: {} });
    await Group.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Game.destroy({ where: {} });
    await sequelize.close();
  });

  describe('GET /api/game-reviews/game/:game_id/group/:group_id', () => {
    it('should get reviews for a game in a group', async () => {
      await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8,
        review_text: 'Great game!'
      });

      const response = await request(app)
        .get(`/api/game-reviews/game/${testGame.id}/group/${testGroup.id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('rating');
      expect(response.body[0]).toHaveProperty('User');
      expect(response.body[0]).toHaveProperty('Game');
    });

    it('should return empty array if no reviews exist', async () => {
      const newGame = await Game.create({
        name: 'New Game',
        is_custom: true
      });

      const response = await request(app)
        .get(`/api/game-reviews/game/${newGame.id}/group/${testGroup.id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);

      await Game.destroy({ where: { id: newGame.id } });
    });

    it('should return 403 if user_id provided but user not in group', async () => {
      const response = await request(app)
        .get(`/api/game-reviews/game/${testGame.id}/group/${testGroup.id}?user_id=${testUser2.user_id}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });

    it('should allow access if user_id provided and user is in group', async () => {
      await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 9
      });

      const response = await request(app)
        .get(`/api/game-reviews/game/${testGame.id}/group/${testGroup.id}?user_id=${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      // Test with invalid UUID format
      const response = await request(app)
        .get(`/api/game-reviews/game/invalid-id/group/${testGroup.id}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/game-reviews/user/:user_id/group/:group_id', () => {
    it('should get all reviews by a user in a group', async () => {
      await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 9,
        review_text: 'Amazing game!'
      });

      const response = await request(app)
        .get(`/api/game-reviews/user/${testUser1.user_id}/group/${testGroup.id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('rating');
      expect(response.body[0]).toHaveProperty('User');
      expect(response.body[0]).toHaveProperty('Game');
    });

    it('should return empty array if user has no reviews', async () => {
      const newUser = await User.create({
        user_id: `test-user-reviews-new-${Date.now()}`,
        username: `newuser-${Date.now()}`,
        email: `newuser-${Date.now()}@example.com`
      });

      await UserGroup.create({
        user_id: newUser.id,
        group_id: testGroup.id
      });

      const response = await request(app)
        .get(`/api/game-reviews/user/${newUser.user_id}/group/${testGroup.id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);

      await UserGroup.destroy({ where: { user_id: newUser.id } });
      await User.destroy({ where: { id: newUser.id } });
    });

    it('should return 403 if user_id provided but user not in group', async () => {
      const response = await request(app)
        .get(`/api/game-reviews/user/${testUser1.user_id}/group/${testGroup.id}?user_id=${testUser2.user_id}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });

    it('should return 404 if user not found', async () => {
      const response = await request(app)
        .get(`/api/game-reviews/user/non-existent-user/group/${testGroup.id}`)
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });

    it('should allow access if user_id provided and user is in group', async () => {
      const response = await request(app)
        .get(`/api/game-reviews/user/${testUser1.user_id}/group/${testGroup.id}?user_id=${testUser1.user_id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle database errors when fetching reviews', async () => {
      // Test error handling path
      const response = await request(app)
        .get(`/api/game-reviews/user/${testUser1.user_id}/group/invalid-uuid`)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/game-reviews', () => {
    it('should create a new review', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8,
        review_text: 'Excellent game!',
        is_recommended: true
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.rating).toBe(reviewData.rating);
      expect(response.body.review_text).toBe(reviewData.review_text);
    });

    it('should update existing review if one already exists', async () => {
      const existingReview = await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 7
      });

      const updateData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 9,
        review_text: 'Updated review'
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(updateData)
        .expect(200);

      expect(response.body.rating).toBe(9);
      expect(response.body.review_text).toBe('Updated review');
    });

    it('should return 403 if user not in group', async () => {
      const reviewData = {
        user_id: testUser2.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });

    it('should return 403 if user not found (access check happens first)', async () => {
      const reviewData = {
        user_id: 'non-existent-user',
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      };

      // The verifyUserInGroup check happens first, which returns false for non-existent user
      // This triggers 403 before the user lookup
      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(403);

      expect(response.body.error).toBe('Access denied to this group');
    });

    it('should create review with only rating', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 7
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.rating).toBe(7);
      expect(response.body.review_text).toBeNull();
    });

    it('should create review with only review_text', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        review_text: 'Great game without rating'
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.review_text).toBe(reviewData.review_text);
    });

    it('should create review with is_recommended flag', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 9,
        is_recommended: true
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(200);

      expect(response.body.is_recommended).toBe(true);
    });

    it('should handle validation errors for rating out of range', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 11 // Invalid: should be 1-10
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing required fields', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        // Missing group_id and game_id
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should include User and Game in response', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(200);

      expect(response.body).toHaveProperty('User');
      expect(response.body).toHaveProperty('Game');
      expect(response.body.User).toHaveProperty('username');
      expect(response.body.Game).toHaveProperty('name');
    });

    it('should handle database errors when creating review', async () => {
      const reviewData = {
        user_id: testUser1.user_id,
        group_id: 'invalid-uuid',
        game_id: testGame.id,
        rating: 8
      };

      const response = await request(app)
        .post('/api/game-reviews')
        .send(reviewData)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/game-reviews/:id', () => {
    it('should delete a review', async () => {
      const review = await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      });

      const response = await request(app)
        .delete(`/api/game-reviews/${review.id}`)
        .send({ user_id: testUser1.user_id })
        .expect(200);

      expect(response.body.message).toBe('Review deleted successfully');

      // Verify review is deleted
      const deletedReview = await GameReview.findByPk(review.id);
      expect(deletedReview).toBeNull();
    });

    it('should return 403 if user does not own the review', async () => {
      const review = await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      });

      const response = await request(app)
        .delete(`/api/game-reviews/${review.id}`)
        .send({ user_id: testUser2.user_id })
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });

    it('should return 404 if review not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .delete(`/api/game-reviews/${fakeId}`)
        .send({ user_id: testUser1.user_id })
        .expect(404);

      expect(response.body.error).toBe('Review not found');
    });

    it('should return 403 if user_id is missing in request body', async () => {
      const review = await GameReview.create({
        user_id: testUser1.id,
        group_id: testGroup.id,
        game_id: testGame.id,
        rating: 8
      });

      // When user_id is undefined, the check review.User.user_id !== user_id evaluates to true
      // because undefined !== testUser1.user_id, so it returns 403
      const response = await request(app)
        .delete(`/api/game-reviews/${review.id}`)
        .send({})
        .expect(403);

      expect(response.body.error).toBe('Access denied');

      // Clean up
      await GameReview.destroy({ where: { id: review.id } });
    });

    it('should handle invalid UUID format gracefully', async () => {
      const response = await request(app)
        .delete('/api/game-reviews/invalid-uuid')
        .send({ user_id: testUser1.user_id })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle database errors when deleting review', async () => {
      // Test with invalid UUID format to trigger database error
      // Invalid UUID format will cause a database query error
      const response = await request(app)
        .delete('/api/game-reviews/not-a-valid-uuid-format')
        .send({ user_id: testUser1.user_id })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});

