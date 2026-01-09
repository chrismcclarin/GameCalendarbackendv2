// scripts/migrate-usergroup-user-id-production.js
// Production migration script to change UserGroup.user_id from UUID to STRING
// and migrate existing data from UUID to Auth0 user_id strings
//
// Usage: 
// 1. Connect to Railway database (see instructions below)
// 2. Run: node scripts/migrate-usergroup-user-id-production.js

const { User, UserGroup, sequelize } = require('../models');
require('dotenv').config();

async function migrateUserGroupUserId() {
  try {
    console.log('Checking database connection...');
    
    // Check for Railway internal hostname (won't work from local machine)
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRIVATE_URL || process.env.POSTGRES_URL;
    if (dbUrl && dbUrl.includes('postgres.railway.internal')) {
      console.log('⚠️  Error: Detected Railway internal hostname (postgres.railway.internal)');
      console.log('   This only works from within Railway infrastructure, not from local machine.\n');
      console.log('   Solutions:');
      console.log('   1. Use Railway Web Interface (Easiest):');
      console.log('      - Go to https://railway.app');
      console.log('      - Select your PostgreSQL service');
      console.log('      - Click "Query" or "Data" tab');
      console.log('      - Run SQL commands from RAILWAY_MIGRATION_INSTRUCTIONS.md\n');
      console.log('   2. Get Public Connection String:');
      console.log('      - Go to Railway dashboard → PostgreSQL service');
      console.log('      - Click "Connect" → "Public Network"');
      console.log('      - Copy the connection string');
      console.log('      - Run: DATABASE_URL="<public-url>" node scripts/migrate-usergroup-user-id-production.js\n');
      console.log('   3. Run from Railway Shell:');
      console.log('      - Run: railway shell (from Railway project)');
      console.log('      - Then: node scripts/migrate-usergroup-user-id-production.js\n');
      process.exit(1);
    }
    
    if (dbUrl) {
      // Check if we have a valid connection string
      // Railway internal: postgres.railway.internal
      // Railway public: usually in DATABASE_URL from Railway dashboard
      if (dbUrl.includes('postgres.railway.internal')) {
        console.log('⚠️  Warning: Detected internal Railway hostname.');
        console.log('   Make sure DATABASE_URL is set to the public connection string.');
        console.log('   You can find this in Railway Dashboard → PostgreSQL → Connect → Public Networking\n');
      }
    }
    
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Step 1: Check current state
    console.log('Step 1: Checking current UserGroup.user_id column type...');
    const [columnInfo] = await sequelize.query(`
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'UserGroups' AND column_name = 'user_id'
    `);
    
    if (columnInfo.length === 0) {
      console.error('❌ UserGroups table or user_id column not found');
      await sequelize.close();
      process.exit(1);
    }

    const currentType = columnInfo[0].data_type;
    console.log(`   Current type: ${currentType}`);
    
    if (currentType === 'character varying' || currentType === 'varchar') {
      console.log('✅ Column is already STRING type. Migration may have already been run.');
      console.log('   Checking if data needs to be migrated...\n');
    } else {
      console.log(`   Column is ${currentType}, needs to be changed to VARCHAR\n`);
    }

    // Step 2: Get all UserGroups
    console.log('Step 2: Fetching all UserGroup records...');
    const userGroups = await sequelize.query(
      'SELECT id, user_id, group_id, role FROM "UserGroups"',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    console.log(`   Found ${userGroups.length} UserGroup records\n`);

    if (userGroups.length === 0) {
      console.log('⚠️  No UserGroup records to migrate');
      await sequelize.close();
      process.exit(0);
    }

    // Step 3: Check which records need migration (UUID vs Auth0 string)
    console.log('Step 3: Analyzing UserGroup records...');
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let needsMigration = 0;
    let alreadyMigrated = 0;

    for (const ug of userGroups) {
      const isUUID = uuidPattern.test(ug.user_id);
      if (isUUID) {
        needsMigration++;
      } else {
        alreadyMigrated++;
      }
    }

    console.log(`   Records needing migration (UUID): ${needsMigration}`);
    console.log(`   Records already migrated (Auth0 string): ${alreadyMigrated}\n`);

    if (needsMigration === 0) {
      console.log('✅ All records are already migrated. No action needed.');
      await sequelize.close();
      process.exit(0);
    }

    // Step 4: Change column type if needed
    if (currentType !== 'character varying' && currentType !== 'varchar') {
      console.log('Step 4: Changing UserGroup.user_id column type from UUID to VARCHAR...');
      
      // Check for foreign key constraints
      const [fks] = await sequelize.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'UserGroups' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%user_id%'
      `);
      
      // Drop foreign key if it exists
      if (fks.length > 0) {
        for (const fk of fks) {
          console.log(`   Dropping foreign key: ${fk.constraint_name}`);
          await sequelize.query(
            `ALTER TABLE "UserGroups" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`
          );
        }
      }
      
      // Change column type
      await sequelize.query(`
        ALTER TABLE "UserGroups" 
        ALTER COLUMN "user_id" TYPE VARCHAR(255) USING "user_id"::text
      `);
      
      console.log('✅ Column type changed to VARCHAR(255)\n');
    } else {
      console.log('Step 4: Column type is already VARCHAR, skipping type change\n');
    }

    // Step 5: Migrate data from UUID to Auth0 user_id
    console.log('Step 5: Migrating UserGroup.user_id values from UUID to Auth0 strings...');
    let updated = 0;
    let errors = 0;

    for (const ug of userGroups) {
      const isUUID = uuidPattern.test(ug.user_id);
      
      if (isUUID) {
        try {
          // Find User by primary key (UUID)
          const user = await User.findByPk(ug.user_id);
          if (user && user.user_id) {
            console.log(`   Updating UserGroup ${ug.id}: ${ug.user_id} → ${user.user_id}`);
            await sequelize.query(
              'UPDATE "UserGroups" SET user_id = :auth0UserId WHERE id = :ugId',
              {
                replacements: { auth0UserId: user.user_id, ugId: ug.id },
                type: sequelize.QueryTypes.UPDATE
              }
            );
            updated++;
          } else {
            console.log(`   ⚠️  Could not find User with id: ${ug.user_id} (skipping)`);
            errors++;
          }
        } catch (error) {
          console.error(`   ❌ Error updating UserGroup ${ug.id}:`, error.message);
          errors++;
        }
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Updated: ${updated} records`);
    if (errors > 0) {
      console.log(`   Errors: ${errors} records`);
    }

    // Step 6: Verify migration
    console.log('\nStep 6: Verifying migration...');
    const [verifyResults] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) as uuid_count,
        COUNT(CASE WHEN user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) as string_count
      FROM "UserGroups"
    `);
    
    console.log(`   Total UserGroups: ${verifyResults[0].total}`);
    console.log(`   UUID values: ${verifyResults[0].uuid_count}`);
    console.log(`   Auth0 string values: ${verifyResults[0].string_count}`);
    
    if (verifyResults[0].uuid_count > 0) {
      console.log(`\n   ⚠️  Warning: ${verifyResults[0].uuid_count} records still have UUID values.`);
      console.log('   These may be orphaned records (User not found).');
    }

    await sequelize.close();
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

// Run migration
migrateUserGroupUserId();
