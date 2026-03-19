// migrations/20260318000001-add-game-weight.js
// Adds weight column (BGG complexity rating) to Games table
const sequelize = require('../config/database');

async function up() {
  await sequelize.query(`
    ALTER TABLE "Games" ADD COLUMN IF NOT EXISTS "weight" DECIMAL(4,2)
  `);
  console.log('Added weight column to Games table (or already exists).');
}

async function down() {
  await sequelize.query(`
    ALTER TABLE "Games" DROP COLUMN IF EXISTS "weight"
  `);
  console.log('Dropped weight column from Games table.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
