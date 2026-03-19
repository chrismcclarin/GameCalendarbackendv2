#!/usr/bin/env node
// scripts/backfill-game-weight.js
// Backfills the weight (complexity) column for existing games from BGG API.
// Usage: node scripts/backfill-game-weight.js
//
// Rate-limited: 2.5 second delay between API calls to respect BGG rate limits.
// Safe to re-run: only updates games where weight IS NULL and bgg_id IS NOT NULL.

const Game = require('../models/Game');
const bggService = require('../services/bggService');
const sequelize = require('../config/database');

const DELAY_MS = 2500; // 2.5 seconds between BGG API calls

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfill() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const games = await Game.findAll({
      where: {
        bgg_id: { [require('sequelize').Op.ne]: null },
        weight: null,
      },
      order: [['name', 'ASC']],
    });

    console.log(`Found ${games.length} games to backfill weight data.\n`);

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      try {
        const bggData = await bggService.getGameById(game.bgg_id);

        if (bggData.weight != null) {
          await game.update({ weight: bggData.weight });
          console.log(`[${i + 1}/${games.length}] Updated "${game.name}" (BGG #${game.bgg_id}) weight: ${bggData.weight}`);
          updated++;
        } else {
          console.log(`[${i + 1}/${games.length}] No weight data for "${game.name}" (BGG #${game.bgg_id})`);
        }
      } catch (err) {
        console.error(`[${i + 1}/${games.length}] Error fetching "${game.name}" (BGG #${game.bgg_id}): ${err.message}`);
        failed++;
      }

      // Rate limit delay (skip after last game)
      if (i < games.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    console.log(`\nBackfill complete: ${updated} updated, ${failed} failed, ${games.length - updated - failed} skipped (no weight data).`);
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

backfill();
