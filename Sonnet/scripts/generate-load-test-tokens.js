// scripts/generate-load-test-tokens.js
// Generates 200 unique magic tokens into tests/load/test-tokens.csv
// Usage: node scripts/generate-load-test-tokens.js
// Requires: active AvailabilityPrompt in DB and running DB connection
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const { generateToken } = require('../services/magicTokenService');
const { User, AvailabilityPrompt, sequelize } = require('../models');

const OUTPUT_PATH = path.join(__dirname, '../tests/load/test-tokens.csv');
const TOKEN_COUNT = 200;

async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB connected.');

    // Find an active prompt to use for all tokens
    const prompt = await AvailabilityPrompt.findOne({ where: { status: 'active' } });
    if (!prompt) {
      console.error('ERROR: No active AvailabilityPrompt found. Create one first.');
      console.error('Hint: Create a prompt via POST /api/prompts or via the UI.');
      process.exit(1);
    }
    console.log(`Using prompt ${prompt.id} (group ${prompt.group_id})`);

    const lines = ['token,timezone'];
    const timezones = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'];

    for (let i = 0; i < TOKEN_COUNT; i++) {
      // Each token is for a distinct synthetic user ID to avoid single-use conflicts
      const syntheticUserId = `load-test-user-${i}`;

      // Ensure the synthetic user exists (findOrCreate to avoid duplicate errors)
      await User.findOrCreate({
        where: { user_id: syntheticUserId },
        defaults: {
          email: `loadtest+${i}@example.com`,
          username: `loadtest_${i}`
        }
      });

      const token = await generateToken(
        { user_id: syntheticUserId, username: `loadtest_${i}` },
        { id: prompt.id }
      );
      const tz = timezones[i % timezones.length];
      lines.push(`${token},${tz}`);

      if ((i + 1) % 50 === 0) console.log(`Generated ${i + 1}/${TOKEN_COUNT} tokens...`);
    }

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n');
    console.log(`\nWrote ${TOKEN_COUNT} tokens to ${OUTPUT_PATH}`);
    console.log('Run load test: SEQUELIZE_POOL_MAX=20 LOAD_TEST_TARGET=http://localhost:4000 npx artillery run tests/load/availability-pipeline.yml');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
