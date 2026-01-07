// routes/games.js
const express = require('express');
const { Game, Event, EventParticipation, GameReview, User, Group, UserGame } = require('../models');
const { Op } = require('sequelize');
const router = express.Router();


// BGG API integration helper
const bggService = require('../services/bggService');
// BGG CSV service for local game searches (faster, no rate limits)
const bggCsvService = require('../services/bggCsvService');


// Get all games (with optional search)
router.get('/', async (req, res) => {
  try {
    const { search, is_custom, group_id } = req.query;
    const where = {};
    
    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }
    
    if (is_custom !== undefined) {
      where.is_custom = is_custom === 'true';
    }
    
    const games = await Game.findAll({
      where,
      order: [['name', 'ASC']],
      include: group_id ? [{
        model: GameReview,
        where: { group_id },
        required: false,
        include: [{ model: User, attributes: ['username'] }]
      }] : []
    });
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get game by ID
router.get('/:id', async (req, res) => {
  try {
    const game = await Game.findByPk(req.params.id, {
      include: [
        {
          model: Event,
          include: [
            { model: User, as: 'Winner', attributes: ['id', 'username'] },
            { model: EventParticipation, include: [{ model: User, attributes: ['username'] }] }
          ]
        },
        {
          model: GameReview,
          include: [{ model: User, attributes: ['username'] }]
        }
      ]
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Create custom game
router.post('/', async (req, res) => {
  try {
    const gameData = {
      ...req.body,
      is_custom: true,
      bgg_id: null
    };
    
    const game = await Game.create(gameData);
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Import game from BGG
router.post('/import-bgg/:bgg_id', async (req, res) => {
  try {
    const { bgg_id } = req.params;
    
    // Check if game already exists
    const existingGame = await Game.findOne({ where: { bgg_id } });
    if (existingGame) {
      return res.json(existingGame);
    }
    
    // Fetch from BGG API
    const bggData = await bggService.getGameById(bgg_id);
    
    const game = await Game.create({
      bgg_id: parseInt(bgg_id),
      name: bggData.name,
      year_published: bggData.year_published,
      min_players: bggData.min_players,
      max_players: bggData.max_players,
      playing_time: bggData.playing_time,
      description: bggData.description,
      image_url: bggData.image_url,
      thumbnail_url: bggData.thumbnail_url,
      is_custom: false
    });
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Update game
router.put('/:id', async (req, res) => {
  try {
    const game = await Game.findByPk(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    await game.update(req.body);
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete game
router.delete('/:id', async (req, res) => {
  try {
    const game = await Game.findByPk(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    await game.destroy();
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search BGG for games
// Uses local database (from CSV dump) for fast, unlimited searches
// Falls back to API if local search fails
router.get('/bgg/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Try local database search first (fast, no rate limits)
    try {
      const localResults = await bggCsvService.searchGames(query);
      if (localResults && localResults.length > 0) {
        return res.json(localResults);
      }
    } catch (localError) {
      console.warn('Local search failed, falling back to API:', localError.message);
      // Continue to API fallback
    }
    
    // Fallback to API if local search returns no results or fails
    // This should rarely be needed once CSV is imported
    const apiResults = await bggService.searchGames(query);
    res.json(apiResults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get games for event form (group played + user owned)
router.get('/for-event/:group_id/:user_id', async (req, res) => {
  try {
    const { group_id, user_id } = req.params;
    
    // Get user
    const user = await User.findOne({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get games played by this group
    const groupEvents = await Event.findAll({
      where: { group_id },
      include: [{ model: Game }],
      attributes: ['game_id']
    });
    const groupGameIds = [...new Set(groupEvents.map(e => e.game_id).filter(Boolean))];
    
    // Get games owned by user
    const userOwnedGames = await UserGame.findAll({
      where: { user_id: user.id },
      include: [{ model: Game }]
    });
    const ownedGameIds = userOwnedGames.map(ug => ug.game_id);
    
    // Combine and get unique games
    const allGameIds = [...new Set([...groupGameIds, ...ownedGameIds])];
    
    const games = await Game.findAll({
      where: { id: allGameIds },
      order: [['name', 'ASC']]
    });
    
    // Mark which games are owned
    const gamesWithOwnership = games.map(game => ({
      ...game.toJSON(),
      is_owned: ownedGameIds.includes(game.id),
      is_group_game: groupGameIds.includes(game.id)
    }));
    
    res.json(gamesWithOwnership);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;