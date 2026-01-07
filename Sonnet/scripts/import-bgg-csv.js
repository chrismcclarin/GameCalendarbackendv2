// scripts/import-bgg-csv.js
// Import the BGG CSV file into the database

const bggCsvService = require('../services/bggCsvService');
const sequelize = require('../config/database');

async function importCSV() {
  try {
    console.log('💾 Importing BGG CSV to database...');
    console.log('   (This may take 10-30 minutes for ~200,000 games)');
    console.log('');
    
    // Sync database to ensure tables exist
    await sequelize.sync();
    
    // Import CSV
    const count = await bggCsvService.importCSVToDatabase();
    console.log('');
    console.log(`✅ Successfully imported ${count} games from BGG CSV!`);
    console.log('');
    console.log('Your game search will now use the local database instead of API calls.');
    console.log('This eliminates rate limiting and provides much faster searches.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Make sure the CSV file exists at: data/bgg-games.csv');
    console.error('2. Check that the CSV file is not corrupted');
    console.error('3. Ensure you have enough database space');
    process.exit(1);
  }
}

importCSV();


