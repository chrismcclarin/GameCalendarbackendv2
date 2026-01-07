// scripts/setup-bgg-csv.js
// Initial setup script to download and import BGG CSV dump

const bggCsvService = require('../services/bggCsvService');
const sequelize = require('../config/database');

async function setup() {
  try {
    console.log('🚀 Starting BGG CSV setup...');
    console.log('');
    
    // Sync database to ensure tables exist
    console.log('📊 Syncing database...');
    await sequelize.sync();
    console.log('✅ Database synced');
    console.log('');
    
    // Download CSV
    console.log('📥 Downloading BGG CSV dump...');
    console.log('   (This may take a few minutes - the file is large)');
    await bggCsvService.downloadCSV();
    console.log('✅ CSV downloaded');
    console.log('');
    
    // Import to database
    console.log('💾 Importing games to database...');
    console.log('   (This may take 10-30 minutes for ~200,000 games)');
    const count = await bggCsvService.importCSVToDatabase();
    console.log(`✅ Imported ${count} games`);
    console.log('');
    
    console.log('🎉 BGG CSV setup complete!');
    console.log('');
    console.log('Your game search will now use the local database instead of API calls.');
    console.log('This eliminates rate limiting and provides much faster searches.');
    console.log('');
    console.log('The CSV will automatically update every 7 days.');
    console.log('To manually update, run: node scripts/update-bgg-csv.js');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Make sure you have the BGG_CSV_DOWNLOAD_URL set in .env');
    console.error('2. If you have a BGG Application Token, set BGG_APPLICATION_TOKEN in .env');
    console.error('3. Check that you can access the CSV URL while logged into BGG');
    console.error('4. Ensure you have enough disk space (~100MB for CSV)');
    process.exit(1);
  }
}

setup();


