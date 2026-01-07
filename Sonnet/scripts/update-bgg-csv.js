// scripts/update-bgg-csv.js
// Script to update BGG CSV dump and refresh database

const bggCsvService = require('../services/bggCsvService');

async function update() {
  try {
    console.log('🔄 Updating BGG CSV dump...');
    console.log('');
    
    // Download latest CSV
    console.log('📥 Downloading latest CSV...');
    await bggCsvService.downloadCSV();
    console.log('✅ CSV downloaded');
    console.log('');
    
    // Import updates to database
    console.log('💾 Updating database...');
    const count = await bggCsvService.importCSVToDatabase();
    console.log(`✅ Updated ${count} games in database`);
    console.log('');
    
    console.log('🎉 BGG CSV update complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  }
}

update();


