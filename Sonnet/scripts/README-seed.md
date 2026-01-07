# Sample Data Seeding Script

This script populates your database with realistic sample data for testing and development.

## What Gets Created

### Users (6)
- Alice, Bob, Charlie, Diana, Eve, Frank

### Groups (3)
- **Weekend Warriors** - 4 members (Alice, Bob, Charlie, Diana)
- **Strategy Squad** - 4 members (Bob, Charlie, Eve, Frank)
- **Casual Gamers** - 3 members (Diana, Eve, Frank)

### Games (8)
- **BGG Games:**
  - Catan (1995)
  - Ticket to Ride (2004)
  - Wingspan (2019)
  - Azul (2017)
  - Codenames (2015)
  - Gloomhaven (2017)
- **Custom Games:**
  - Custom Card Game
  - House Rules Monopoly

### Events (7 game sessions)
- Weekend Warriors: 3 events (Catan, Ticket to Ride, Wingspan)
- Strategy Squad: 2 events (Gloomhaven, Azul)
- Casual Gamers: 2 events (Codenames, Custom Card Game)

### Game Reviews (11)
- Reviews from various users across different groups

## Usage

```bash
# Seed the database with sample data
npm run seed
```

**Note:** The script will:
1. Clear all existing data (optional - you can comment out the clearing section)
2. Create users, groups, games, events, participations, and reviews
3. Establish relationships between all entities

## Customization

To modify the sample data:
1. Edit `scripts/seed-sample-data.js`
2. Modify the arrays at the top (sampleUsers, sampleGroups, sampleGames)
3. Adjust the events, participations, and reviews as needed

## Data Relationships

- Users belong to Groups (via UserGroup)
- Events belong to Groups and reference Games
- EventParticipations link Users to Events
- GameReviews are created by Users for Games within Groups

