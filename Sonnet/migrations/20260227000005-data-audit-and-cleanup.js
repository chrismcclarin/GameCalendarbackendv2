// migrations/20260227000005-data-audit-and-cleanup.js
// Data audit and cleanup migration: removes orphaned records, duplicates, and ghost users.
// All operations are idempotent -- safe to re-run on clean data (reports 0 for each check).
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

async function up() {
  const transaction = await sequelize.transaction();

  try {
    console.log('=== Data Audit and Cleanup ===\n');

    let duplicatesRemoved = 0;
    let orphanedUserGroupsRemoved = 0;
    let orphanedEventParticipationsRemoved = 0;
    let ghostUsersRemoved = 0;
    let badGameRefEvents = 0;

    // 1. Duplicate UserGroup records
    console.log('1. Checking for duplicate UserGroup records...');
    const duplicateGroups = await sequelize.query(`
      SELECT user_id, group_id, COUNT(*) as cnt
      FROM "UserGroups"
      GROUP BY user_id, group_id
      HAVING COUNT(*) > 1
    `, { type: QueryTypes.SELECT, transaction });

    for (const dup of duplicateGroups) {
      // Keep the oldest record (lowest createdAt), delete the rest
      const dupsToDelete = await sequelize.query(`
        DELETE FROM "UserGroups"
        WHERE id IN (
          SELECT id FROM "UserGroups"
          WHERE user_id = :user_id AND group_id = :group_id
          ORDER BY "createdAt" ASC
          OFFSET 1
        )
      `, {
        replacements: { user_id: dup.user_id, group_id: dup.group_id },
        type: QueryTypes.DELETE,
        transaction,
      });
      duplicatesRemoved += (dupsToDelete[1] || 0);
    }
    console.log(`   Duplicate UserGroup records removed: ${duplicatesRemoved}`);

    // 2. Orphaned UserGroup records (user_id not in Users)
    console.log('2. Checking for orphaned UserGroup records...');
    const orphanedUGs = await sequelize.query(`
      DELETE FROM "UserGroups"
      WHERE user_id NOT IN (SELECT user_id FROM "Users")
      RETURNING id
    `, { type: QueryTypes.SELECT, transaction });
    orphanedUserGroupsRemoved = orphanedUGs.length;
    console.log(`   Orphaned UserGroup records removed: ${orphanedUserGroupsRemoved}`);

    // 3. Orphaned EventParticipation records
    console.log('3. Checking for orphaned EventParticipation records...');
    // Check if Events and Users tables exist before querying
    const tables = await sequelize.getQueryInterface().showAllTables();

    if (tables.includes('EventParticipations') && tables.includes('Events') && tables.includes('Users')) {
      const orphanedEPs = await sequelize.query(`
        DELETE FROM "EventParticipations"
        WHERE event_id NOT IN (SELECT id FROM "Events")
           OR user_id NOT IN (SELECT id FROM "Users")
        RETURNING id
      `, { type: QueryTypes.SELECT, transaction });
      orphanedEventParticipationsRemoved = orphanedEPs.length;
    }
    console.log(`   Orphaned EventParticipation records removed: ${orphanedEventParticipationsRemoved}`);

    // 4. Ghost user identification and cleanup
    console.log('4. Checking for ghost users...');
    // Ghost users: user_id does NOT start with 'auth0|' AND does NOT start with 'google-oauth2|'
    // These are likely placeholder records from bad email invites
    const ghostUsers = await sequelize.query(`
      SELECT u.id, u.email, u.user_id
      FROM "Users" u
      WHERE u.user_id NOT LIKE 'auth0|%'
        AND u.user_id NOT LIKE 'google-oauth2|%'
    `, { type: QueryTypes.SELECT, transaction });

    if (ghostUsers.length > 0) {
      console.log(`   Found ${ghostUsers.length} users with non-Auth0 user_id:`);
      for (const ghost of ghostUsers) {
        console.log(`     - id=${ghost.id}, email=${ghost.email}, user_id=${ghost.user_id}`);
      }

      const ghostIds = ghostUsers.map(g => g.id);
      const ghostUserIds = ghostUsers.map(g => g.user_id);

      // Delete associated UserGroup rows first (FK constraint)
      await sequelize.query(`
        DELETE FROM "UserGroups" WHERE user_id IN (:userIds)
      `, { replacements: { userIds: ghostUserIds }, type: QueryTypes.DELETE, transaction });

      // Delete associated EventParticipation rows
      if (tables.includes('EventParticipations')) {
        await sequelize.query(`
          DELETE FROM "EventParticipations" WHERE user_id IN (:ids)
        `, { replacements: { ids: ghostIds }, type: QueryTypes.DELETE, transaction });
      }

      // Delete associated AvailabilityResponse rows
      if (tables.includes('AvailabilityResponses')) {
        await sequelize.query(`
          DELETE FROM "AvailabilityResponses" WHERE user_id IN (:userIds)
        `, { replacements: { userIds: ghostUserIds }, type: QueryTypes.DELETE, transaction });
      }

      // Delete the ghost users
      await sequelize.query(`
        DELETE FROM "Users" WHERE id IN (:ids)
      `, { replacements: { ids: ghostIds }, type: QueryTypes.DELETE, transaction });

      ghostUsersRemoved = ghostUsers.length;
    }

    // Also check for completely inactive users (no groups, no events, no responses)
    // Only flag these if they have valid Auth0 IDs -- don't delete active accounts
    const inactiveUsers = await sequelize.query(`
      SELECT u.id, u.email, u.user_id
      FROM "Users" u
      WHERE NOT EXISTS (SELECT 1 FROM "UserGroups" ug WHERE ug.user_id = u.user_id)
        AND NOT EXISTS (SELECT 1 FROM "EventParticipations" ep WHERE ep.user_id = u.id)
        ${tables.includes('AvailabilityResponses') ? 'AND NOT EXISTS (SELECT 1 FROM "AvailabilityResponses" ar WHERE ar.user_id = u.user_id)' : ''}
        AND (u.user_id NOT LIKE 'auth0|%' AND u.user_id NOT LIKE 'google-oauth2|%')
    `, { type: QueryTypes.SELECT, transaction });

    if (inactiveUsers.length > 0) {
      console.log(`   Found ${inactiveUsers.length} completely inactive non-Auth0 users (already cleaned above or new):`);
      // These should have been caught by the ghost user check above
      // Log but don't double-delete
      for (const inactive of inactiveUsers) {
        console.log(`     - id=${inactive.id}, email=${inactive.email}, user_id=${inactive.user_id}`);
      }
    }

    console.log(`   Ghost users cleaned: ${ghostUsersRemoved}`);

    // 5. Events with bad game references (log only, do not modify)
    console.log('5. Checking for events with bad game references...');
    if (tables.includes('Events') && tables.includes('Games')) {
      const badGameRefs = await sequelize.query(`
        SELECT e.id, e.game_id, e.group_id
        FROM "Events" e
        WHERE e.game_id IS NOT NULL
          AND e.game_id NOT IN (SELECT id FROM "Games")
      `, { type: QueryTypes.SELECT, transaction });

      badGameRefEvents = badGameRefs.length;
      if (badGameRefs.length > 0) {
        console.log(`   WARNING: Found ${badGameRefs.length} events with invalid game_id references:`);
        for (const bad of badGameRefs) {
          console.log(`     - event_id=${bad.id}, game_id=${bad.game_id}, group_id=${bad.group_id}`);
        }
        console.log('   These events were NOT modified. Review and decide whether to null out game_id.');
      } else {
        console.log('   No events with bad game references found.');
      }
    }

    await transaction.commit();

    // Summary
    console.log('\n=== Audit Summary ===');
    console.log(`Duplicate UserGroup records removed: ${duplicatesRemoved}`);
    console.log(`Orphaned UserGroup records removed: ${orphanedUserGroupsRemoved}`);
    console.log(`Orphaned EventParticipation records removed: ${orphanedEventParticipationsRemoved}`);
    console.log(`Ghost users cleaned: ${ghostUsersRemoved}`);
    console.log(`Events with bad game refs (logged only): ${badGameRefEvents}`);
    console.log('=== Audit Complete ===');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function down() {
  // Data audit cleanup cannot be reversed -- deleted data cannot be restored.
  console.log('Data audit cleanup cannot be reversed. Deleted records are not recoverable.');
  console.log('No-op down migration.');
}

if (require.main === module) {
  up().then(() => sequelize.close()).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { up, down };
