// migrations/migrate-boardgames-to-events.js
const { BoardGame, Game, Event, EventParticipation, User } = require('../models');


async function migrateBoardGamesToEvents() {
  try {
    const boardGames = await BoardGame.findAll();
    
    for (const boardGame of boardGames) {
      // Create or find game
      let game = await Game.findOne({ where: { name: boardGame.name } });
      if (!game) {
        game = await Game.create({
          name: boardGame.name,
          theme: boardGame.theme,
          url: boardGame.url,
          is_custom: true
        });
      }
      
      // Create event
      const event = await Event.create({
        group_id: boardGame.group_id,
        game_id: game.id,
        start_date: boardGame.startDate || boardGame.createdAt,
        duration_minutes: boardGame.length,
        winner_id: boardGame.winner?.user_id ? 
          (await User.findOne({ where: { user_id: boardGame.winner.user_id } }))?.id : null,
        picked_by_id: boardGame.picked?.user_id ? 
          (await User.findOne({ where: { user_id: boardGame.picked.user_id } }))?.id : null,
        is_group_win: boardGame.groupwin || false,
        comments: boardGame.gameComments,
        status: 'completed'
      });
      
      // Create participations
      if (boardGame.playerDetails && boardGame.playerDetails.length > 0) {
        const participations = [];
        for (const player of boardGame.playerDetails) {
          const user = await User.findOne({ where: { user_id: player.user_id } });
          if (user) {
            participations.push({
              event_id: event.id,
              user_id: user.id,
              score: player.score,
              faction: player.faction,
              is_new_player: boardGame.new?.includes(player.user_id) || false
            });
          }
        }
        
        if (participations.length > 0) {
          await EventParticipation.bulkCreate(participations);
        }
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}


module.exports = migrateBoardGamesToEvents;