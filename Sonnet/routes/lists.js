// routes/lists.js
const express = require('express');
const { Event, Game, Group, User, UserGroup, EventParticipation, GameReview } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const router = express.Router();

// Helper function to verify user belongs to group
const verifyUserInGroup = async (user_id, group_id) => {
  const user = await User.findOne({ where: { user_id } });
  if (!user) return false;
  
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: user.user_id, // Use user.user_id (Auth0 string) not user.id (UUID)
      group_id: group_id
    }
  });
  
  return !!userGroup;
};

// 1. Games won by a specific player in a group (by name)
router.get('/player-wins/:group_id/:player_name/:user_id', async (req, res) => {
  try {
    const { group_id, player_name, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player actually won
    const winningEvents = events.filter(event => {
      if (event.Winner && event.EventParticipations) {
        const playerParticipation = event.EventParticipations.find(p => 
          p.User.username === player_name
        );
        return playerParticipation && event.Winner.username === player_name;
      }
      return false;
    });
    
    res.json(winningEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1b. Games won by a specific player in a group (by user_id)
router.get('/player-wins-by-id/:group_id/:player_user_id/:user_id', async (req, res) => {
  try {
    const { group_id, player_user_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] },
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player actually won
    const winningEvents = events.filter(event => {
      if (event.Winner && event.EventParticipations) {
        const playerParticipation = event.EventParticipations.find(p => 
          p.User.user_id === player_user_id
        );
        return playerParticipation && event.Winner.user_id === player_user_id;
      }
      return false;
    });
    
    res.json(winningEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Games organized by most played to least played
router.get('/most-played/:group_id/:user_id', async (req, res) => {
  try {
    const { group_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const games = await Event.findAll({
      where: { group_id },
      include: [{ model: Game, attributes: ['name', 'theme', 'url'] }],
      attributes: [
        'game_id',
        [fn('COUNT', col('Event.id')), 'play_count']
      ],
      group: ['Event.game_id', 'Game.name', 'Game.theme', 'Game.url'],
      order: [[literal('play_count'), 'DESC']]
    });
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Games organized by least played to most played
router.get('/least-played/:group_id/:user_id', async (req, res) => {
  try {
    const { group_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const games = await Event.findAll({
      where: { group_id },
      include: [{ model: Game, attributes: ['name', 'theme', 'url'] }],
      attributes: [
        'game_id',
        [fn('COUNT', col('Event.id')), 'play_count']
      ],
      group: ['Event.game_id', 'Game.name', 'Game.theme', 'Game.url'],
      order: [[literal('play_count'), 'ASC']]
    });
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Games picked by a specific player (by name)
router.get('/player-picks/:group_id/:player_name/:user_id', async (req, res) => {
  try {
    const { group_id, player_name, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player picked the game
    const pickedEvents = events.filter(event => {
      return event.PickedBy && event.PickedBy.username === player_name;
    });
    
    res.json(pickedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4b. Games picked by a specific player (by user_id)
router.get('/player-picks-by-id/:group_id/:player_user_id/:user_id', async (req, res) => {
  try {
    const { group_id, player_user_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'PickedBy', attributes: ['id', 'username'] }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player picked the game
    const pickedEvents = events.filter(event => {
      return event.PickedBy && event.PickedBy.user_id === player_user_id;
    });
    
    res.json(pickedEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Games by theme
router.get('/by-theme/:group_id/:theme/:user_id', async (req, res) => {
  try {
    const { group_id, theme, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { 
          model: Game, 
          attributes: ['name', 'theme', 'url'],
          where: { theme: { [Op.iLike]: `%${theme}%` } }
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unified games list endpoint with sorting
// GET /api/lists/games/:group_id/:user_id?sort=name|play_count|last_played|rating&order=asc|desc
router.get('/games/:group_id/:user_id', async (req, res) => {
  try {
    // Use verified user_id from token
    const verified_user_id = req.user?.user_id;
    if (!verified_user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { group_id, user_id } = req.params;
    
    // Verify that the requested user_id matches the authenticated user
    if (user_id !== verified_user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot access other users\' data' });
    }
    
    const { sort = 'last_played', order = 'desc' } = req.query;
    
    const hasAccess = await verifyUserInGroup(verified_user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    // Validate sort parameter
    const validSorts = ['name', 'play_count', 'last_played', 'rating'];
    const sortField = validSorts.includes(sort) ? sort : 'last_played';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // Get all events for the group with game information
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { 
          model: Game, 
          attributes: ['id', 'name', 'image_url', 'theme', 'year_published', 'min_players', 'max_players', 'playing_time', 'description']
        }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Get all reviews for games in this group to calculate average ratings
    const reviews = await GameReview.findAll({
      where: { 
        group_id,
        rating: { [Op.not]: null } // Only count reviews with ratings
      },
      attributes: [
        'game_id',
        [fn('AVG', col('rating')), 'avg_rating'],
        [fn('COUNT', col('rating')), 'review_count']
      ],
      group: ['game_id'],
      raw: true
    });
    
    // Create a map of game_id to average rating
    const ratingMap = {};
    reviews.forEach(review => {
      const gameId = review.game_id;
      ratingMap[gameId] = {
        avg_rating: review.avg_rating ? parseFloat(review.avg_rating) : null,
        review_count: review.review_count ? parseInt(review.review_count) : 0
      };
    });
    
    // Aggregate unique games with metadata
    const gameMap = new Map();
    
    events.forEach(event => {
      if (!event.Game) return;
      
      const gameId = event.Game.id;
      const eventDate = new Date(event.start_date);
      
      if (!gameMap.has(gameId)) {
        gameMap.set(gameId, {
          id: gameId,
          name: event.Game.name,
          image_url: event.Game.image_url,
          theme: event.Game.theme,
          year_published: event.Game.year_published,
          min_players: event.Game.min_players,
          max_players: event.Game.max_players,
          playing_time: event.Game.playing_time,
          description: event.Game.description,
          play_count: 0,
          last_played: null,
          first_played: null,
          avg_rating: ratingMap[gameId]?.avg_rating || null,
          review_count: ratingMap[gameId]?.review_count || 0
        });
      }
      
      const game = gameMap.get(gameId);
      game.play_count++;
      
      // Update last played
      if (!game.last_played || eventDate > new Date(game.last_played)) {
        game.last_played = eventDate.toISOString();
      }
      
      // Update first played
      if (!game.first_played || eventDate < new Date(game.first_played)) {
        game.first_played = eventDate.toISOString();
      }
    });
    
    // Convert to array
    let games = Array.from(gameMap.values());
    
    // Sort based on sort parameter
    switch (sortField) {
      case 'name':
        games.sort((a, b) => {
          const comparison = a.name.localeCompare(b.name);
          return sortOrder === 'ASC' ? comparison : -comparison;
        });
        break;
        
      case 'play_count':
        games.sort((a, b) => {
          const comparison = a.play_count - b.play_count;
          return sortOrder === 'ASC' ? comparison : -comparison;
        });
        break;
        
      case 'last_played':
        games.sort((a, b) => {
          const dateA = a.last_played ? new Date(a.last_played) : new Date(0);
          const dateB = b.last_played ? new Date(b.last_played) : new Date(0);
          const comparison = dateA - dateB;
          return sortOrder === 'ASC' ? comparison : -comparison;
        });
        break;
        
      case 'rating':
        games.sort((a, b) => {
          // Games with no ratings go to the end
          if (!a.avg_rating && !b.avg_rating) return 0;
          if (!a.avg_rating) return 1;
          if (!b.avg_rating) return -1;
          
          const comparison = a.avg_rating - b.avg_rating;
          return sortOrder === 'ASC' ? comparison : -comparison;
        });
        break;
    }
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. All games sorted alphabetically (kept for backward compatibility)
router.get('/alphabetical/:group_id/:user_id', async (req, res) => {
  try {
    const { group_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    // Use the unified endpoint with alphabetical sort
    const games = await Event.findAll({
      where: { group_id },
      include: [{ model: Game, attributes: ['id', 'name', 'theme', 'url'] }],
      attributes: [
        'game_id',
        [fn('MAX', col('Event.start_date')), 'last_played']
      ],
      group: ['Event.game_id', 'Game.id', 'Game.name', 'Game.theme', 'Game.url'],
      order: [['Game.name', 'ASC']]
    });
    
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. All games played by a specific player (by name)
router.get('/player-games/:group_id/:player_name/:user_id', async (req, res) => {
  try {
    const { group_id, player_name, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'Players', attributes: ['id', 'username'] }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player participated
    const playerEvents = events.filter(event => {
      return event.Players && event.Players.some(p => p.username === player_name);
    });
    
    res.json(playerEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7b. All games played by a specific player (by user_id)
router.get('/player-games-by-id/:group_id/:player_user_id/:user_id', async (req, res) => {
  try {
    const { group_id, player_user_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    const events = await Event.findAll({
      where: { group_id },
      include: [
        { model: Game, attributes: ['name', 'theme', 'url'] },
        { model: User, as: 'Players', attributes: ['id', 'username'] }
      ],
      order: [['start_date', 'DESC']]
    });
    
    // Filter to only include events where this player participated
    const playerEvents = events.filter(event => {
      return event.Players && event.Players.some(p => p.user_id === player_user_id);
    });
    
    res.json(playerEvents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. All players in a group (aggregated from all games)
router.get('/players/:group_id/:user_id', async (req, res) => {
  try {
    const { group_id, user_id } = req.params;
    
    const hasAccess = await verifyUserInGroup(user_id, group_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this group' });
    }
    
    // Get all events for the group with participations
    const events = await Event.findAll({
      where: { group_id },
      include: [
        {
          model: EventParticipation,
          include: [{ model: User, attributes: ['id', 'username', 'user_id'] }]
        },
        { model: User, as: 'Winner', attributes: ['id', 'username', 'user_id'] }
      ]
    });
    
    // Aggregate player statistics
    const playerStats = {};
    
    events.forEach(event => {
      if (event.EventParticipations && Array.isArray(event.EventParticipations)) {
        event.EventParticipations.forEach(participation => {
          const player = participation.User;
          const playerKey = player.user_id;
          
          if (!playerStats[playerKey]) {
            playerStats[playerKey] = {
              user_id: player.user_id,
              name: player.username,
              games_played: 0,
              games_won: 0,
              total_score: 0
            };
          }
          playerStats[playerKey].games_played++;
          
          // Check if this player won
          if (event.Winner && event.Winner.user_id === player.user_id) {
            playerStats[playerKey].games_won++;
          }
          
          // Get score from participation
          if (participation.score !== undefined) {
            playerStats[playerKey].total_score += participation.score;
          }
        });
      }
    });
    
    // Convert to array and calculate averages
    const players = Object.values(playerStats).map(player => ({
      ...player,
      average_score: player.games_played > 0 ? (player.total_score / player.games_played).toFixed(2) : 0,
      win_rate: player.games_played > 0 ? ((player.games_won / player.games_played) * 100).toFixed(1) : 0
    }));
    
    // Sort by player name
    players.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;