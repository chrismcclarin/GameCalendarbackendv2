// models/index.js
const User = require('./User');
const Group = require('./Group');
const Game = require('./Game');
const Event = require('./Event');
const EventParticipation = require('./EventParticipation');
const UserGroup = require('./UserGroup');
const GameReview = require('./GameReview');
const UserGame = require('./UserGame');
const UserAvailability = require('./UserAvailability');
const GroupPromptSettings = require('./GroupPromptSettings');
const AvailabilityPrompt = require('./AvailabilityPrompt');
const AvailabilityResponse = require('./AvailabilityResponse');
const AvailabilitySuggestion = require('./AvailabilitySuggestion');
const MagicToken = require('./MagicToken');
const sequelize = require('../config/database');


// Define associations
// Users ↔ Groups (Many-to-Many)
// Note: UserGroup.user_id is STRING (Auth0 user_id), not UUID (Users.id)
// So we need to specify sourceKey/targetKey to use Users.user_id instead of Users.id
User.belongsToMany(Group, { 
  through: UserGroup, 
  foreignKey: 'user_id', // Column in UserGroup that references User
  sourceKey: 'user_id' // Use Users.user_id (Auth0 string) instead of Users.id (UUID)
});
Group.belongsToMany(User, { 
  through: UserGroup, 
  foreignKey: 'group_id', // Column in UserGroup that references Group
  otherKey: 'user_id', // Column in UserGroup that references User
  targetKey: 'user_id' // Use Users.user_id (Auth0 string) instead of Users.id (UUID)
});


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

// User Availability
User.hasMany(UserAvailability, { foreignKey: 'user_id', sourceKey: 'user_id' });
UserAvailability.belongsTo(User, { foreignKey: 'user_id', targetKey: 'user_id' });

// Group Prompt Settings (One-to-One)
Group.hasOne(GroupPromptSettings, { foreignKey: 'group_id' });
GroupPromptSettings.belongsTo(Group, { foreignKey: 'group_id' });

// Availability Prompts (One-to-Many from Group)
Group.hasMany(AvailabilityPrompt, { foreignKey: 'group_id' });
AvailabilityPrompt.belongsTo(Group, { foreignKey: 'group_id' });

// Availability Prompts (Many-to-One from Game, optional)
Game.hasMany(AvailabilityPrompt, { foreignKey: 'game_id' });
AvailabilityPrompt.belongsTo(Game, { foreignKey: 'game_id' });

// Availability Prompts (Many-to-One from GroupPromptSettings, optional)
GroupPromptSettings.hasMany(AvailabilityPrompt, { foreignKey: 'created_by_settings_id' });
AvailabilityPrompt.belongsTo(GroupPromptSettings, { foreignKey: 'created_by_settings_id' });

// Availability Responses (One-to-Many from Prompt)
AvailabilityPrompt.hasMany(AvailabilityResponse, { foreignKey: 'prompt_id' });
AvailabilityResponse.belongsTo(AvailabilityPrompt, { foreignKey: 'prompt_id' });

// Availability Responses (Many-to-One from User)
// Note: Uses sourceKey/targetKey because user_id is STRING (Auth0 ID), not UUID
User.hasMany(AvailabilityResponse, { foreignKey: 'user_id', sourceKey: 'user_id' });
AvailabilityResponse.belongsTo(User, { foreignKey: 'user_id', targetKey: 'user_id' });

// Availability Suggestions (One-to-Many from Prompt)
AvailabilityPrompt.hasMany(AvailabilitySuggestion, { foreignKey: 'prompt_id' });
AvailabilitySuggestion.belongsTo(AvailabilityPrompt, { foreignKey: 'prompt_id' });

// Availability Suggestions (Many-to-One from Event, optional)
// Note: alias 'ConvertedEvent' to distinguish from other Event associations
Event.hasMany(AvailabilitySuggestion, { as: 'ConvertedSuggestions', foreignKey: 'converted_to_event_id' });
AvailabilitySuggestion.belongsTo(Event, { as: 'ConvertedEvent', foreignKey: 'converted_to_event_id' });

// Magic Tokens (One-to-Many from User)
// Note: Uses sourceKey/targetKey because user_id is STRING (Auth0 ID), not UUID
User.hasMany(MagicToken, { foreignKey: 'user_id', sourceKey: 'user_id' });
MagicToken.belongsTo(User, { foreignKey: 'user_id', targetKey: 'user_id' });

// Magic Tokens (One-to-Many from AvailabilityPrompt)
AvailabilityPrompt.hasMany(MagicToken, { foreignKey: 'prompt_id' });
MagicToken.belongsTo(AvailabilityPrompt, { foreignKey: 'prompt_id' });


module.exports = {
  User,
  Group,
  Game,
  Event,
  EventParticipation,
  UserGroup,
  GameReview,
  UserGame,
  UserAvailability,
  GroupPromptSettings,
  AvailabilityPrompt,
  AvailabilityResponse,
  AvailabilitySuggestion,
  MagicToken,
  sequelize,
};