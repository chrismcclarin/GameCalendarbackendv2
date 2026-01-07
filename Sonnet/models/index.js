// models/index.js
const User = require('./User');
const Group = require('./Group');
const Game = require('./Game');
const Event = require('./Event');
const EventParticipation = require('./EventParticipation');
const UserGroup = require('./UserGroup');
const GameReview = require('./GameReview');
const UserGame = require('./UserGame');
const sequelize = require('../config/database');


// Define associations
// Users ↔ Groups (Many-to-Many)
User.belongsToMany(Group, { through: UserGroup, foreignKey: 'user_id' });
Group.belongsToMany(User, { through: UserGroup, foreignKey: 'group_id' });


// Groups ↔ Events (One-to-Many)
Group.hasMany(Event, { foreignKey: 'group_id' });
Event.belongsTo(Group, { foreignKey: 'group_id' });


// Games ↔ Events (One-to-Many)
Game.hasMany(Event, { foreignKey: 'game_id' });
Event.belongsTo(Game, { foreignKey: 'game_id' });


// Users ↔ Events (Many-to-Many through EventParticipation)
User.belongsToMany(Event, { through: EventParticipation, foreignKey: 'user_id' });
Event.belongsToMany(User, { through: EventParticipation, foreignKey: 'event_id' });


// Direct associations for easier queries
Event.hasMany(EventParticipation, { foreignKey: 'event_id' });
EventParticipation.belongsTo(Event, { foreignKey: 'event_id' });
User.hasMany(EventParticipation, { foreignKey: 'user_id' });
EventParticipation.belongsTo(User, { foreignKey: 'user_id' });


// Winner and Picker associations
Event.belongsTo(User, { as: 'Winner', foreignKey: 'winner_id' });
Event.belongsTo(User, { as: 'PickedBy', foreignKey: 'picked_by_id' });


// Game Reviews
User.hasMany(GameReview, { foreignKey: 'user_id' });
GameReview.belongsTo(User, { foreignKey: 'user_id' });
Group.hasMany(GameReview, { foreignKey: 'group_id' });
GameReview.belongsTo(Group, { foreignKey: 'group_id' });
Game.hasMany(GameReview, { foreignKey: 'game_id' });
GameReview.belongsTo(Game, { foreignKey: 'game_id' });

// User Owned Games (Many-to-Many)
User.belongsToMany(Game, { through: UserGame, foreignKey: 'user_id', as: 'OwnedGames' });
Game.belongsToMany(User, { through: UserGame, foreignKey: 'game_id', as: 'Owners' });
User.hasMany(UserGame, { foreignKey: 'user_id' });
UserGame.belongsTo(User, { foreignKey: 'user_id' });
Game.hasMany(UserGame, { foreignKey: 'game_id' });
UserGame.belongsTo(Game, { foreignKey: 'game_id' });


module.exports = {
  User,
  Group,
  Game,
  Event,
  EventParticipation,
  UserGroup,
  GameReview,
  UserGame,
  sequelize,
};