// routes/gameReviews.js
const express = require('express');
const { GameReview, User, Group, Game, UserGroup } = require('../models');
const router = express.Router();
const { validateReviewCreate, validateUUID } = require('../middleware/validators');


// Helper function to verify user belongs to group
const verifyUserInGroup = async (user_id, group_id) => {
  const user = await User.findOne({ where: { user_id } });
  if (!user) return false;
  
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: user.id,
      group_id: group_id
    }
  });
  
  return !!userGroup;
};


// Get reviews for a game in a specific group
router.get('/game/:game_id/group/:group_id', async (req, res) => {
  try {
    const { game_id, group_id } = req.params;
    const { user_id } = req.query;
    
    if (user_id) {
      const hasAccess = await verifyUserInGroup(user_id, group_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this group' });
      }
    }
    
    const reviews = await GameReview.findAll({
      where: { game_id, group_id },
      include: [
        { model: User, attributes: ['id', 'username'] },
        { model: Game, attributes: ['name'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get all reviews by a user in a group
router.get('/user/:user_id/group/:group_id', async (req, res) => {
  try {
    const { user_id: target_user_id, group_id } = req.params;
    const { user_id } = req.query;
    
    if (user_id) {
      const hasAccess = await verifyUserInGroup(user_id, group_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this group' });
      }
    }
    
    const targetUser = await User.findOne({ where: { user_id: target_user_id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const reviews = await GameReview.findAll({
      where: { user_id: targetUser.id, group_id },
      include: [
        { model: User, attributes: ['id', 'username'] },
        { model: Game, attributes: ['name', 'image_url'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Create or update a review
router.post('/', validateReviewCreate, async (req, res) => {
  try {
    // Use verified user_id from token
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, game_id, rating, review_text, is_recommended } = req.body;
    
    // Verify user belongs to group
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const user = await User.findOne({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if review already exists
    const existingReview = await GameReview.findOne({
      where: { user_id: user.id, group_id, game_id }
    });
    
    // Validate and convert rating (0-5, increments of 0.5)
    let ratingValue = null;
    if (rating !== null && rating !== undefined && rating !== '') {
      ratingValue = parseFloat(rating);
      if (isNaN(ratingValue)) {
        return res.status(400).json({ error: 'Rating must be a valid number' });
      }
      if (ratingValue < 0 || ratingValue > 5) {
        return res.status(400).json({ error: 'Rating must be between 0 and 5' });
      }
      // Round to nearest 0.5 increment
      ratingValue = Math.round(ratingValue * 2) / 2;
    }
    
    let review;
    if (existingReview) {
      // Update existing review
      await existingReview.update({ 
        rating: ratingValue, 
        review_text: review_text || null, 
        is_recommended: is_recommended !== undefined ? is_recommended : null 
      });
      review = existingReview;
    } else {
      // Create new review
      review = await GameReview.create({
        user_id: user.id,
        group_id,
        game_id,
        rating: ratingValue,
        review_text: review_text || null,
        is_recommended: is_recommended !== undefined ? is_recommended : null
      });
    }
    
    // Fetch complete review data
    const completeReview = await GameReview.findByPk(review.id, {
      include: [
        { model: User, attributes: ['id', 'username'] },
        { model: Game, attributes: ['name', 'image_url'] }
      ]
    });
    
    res.json(completeReview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete a review
router.delete('/:id', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    const review = await GameReview.findByPk(req.params.id, {
      include: [{ model: User }]
    });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Verify user owns the review or has admin access
    if (review.User.user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await review.destroy();
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;