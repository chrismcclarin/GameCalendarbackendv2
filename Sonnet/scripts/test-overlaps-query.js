// scripts/test-overlaps-query.js
// Test script to directly query the database for overlaps calculation
// This helps identify database-side errors without going through the web interface

const { sequelize, Group, User, UserGroup, UserAvailability } = require('../models');
const availabilityService = require('../services/availabilityService');

async function testOverlapsQuery() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established.\n');

    // Test parameters - you can modify these
    const testGroupId = process.argv[2] || 'da83fc83-afc2-4cb6-b2e4-4b2a3d6634c9';
    const startDate = process.argv[3] ? new Date(process.argv[3]) : new Date('2026-01-01');
    const endDate = process.argv[4] ? new Date(process.argv[4]) : new Date('2026-02-01');
    const timezone = process.argv[5] || 'America/Los_Angeles';

    console.log('Test Parameters:');
    console.log(`  Group ID: ${testGroupId}`);
    console.log(`  Start Date: ${startDate.toISOString().split('T')[0]}`);
    console.log(`  End Date: ${endDate.toISOString().split('T')[0]}`);
    console.log(`  Timezone: ${timezone}\n`);

    // Step 1: Test group query
    console.log('Step 1: Fetching group with members...');
    let group;
    try {
      group = await Group.findByPk(testGroupId, {
        include: [{
          model: User,
          through: UserGroup,
          attributes: ['id', 'user_id', 'username', 'email', 'google_calendar_enabled', 'google_calendar_token', 'google_calendar_refresh_token'],
        }],
      });
      console.log(`✅ Group found: ${group ? group.name : 'NOT FOUND'}`);
      if (group) {
        console.log(`   Members: ${group.Users ? group.Users.length : 0}`);
        if (group.Users && group.Users.length > 0) {
          group.Users.forEach((user, idx) => {
            console.log(`   ${idx + 1}. ${user.username || user.user_id} (${user.user_id})`);
          });
        }
      }
    } catch (error) {
      console.error('❌ Error fetching group:', error.message);
      console.error('   Stack:', error.stack);
      throw error;
    }

    if (!group) {
      console.log('❌ Group not found. Exiting.');
      process.exit(1);
    }

    const members = group.Users || [];
    if (members.length === 0) {
      console.log('⚠️  No members in group. Exiting.');
      process.exit(0);
    }

    console.log('');

    // Step 2: Test availability patterns query for each member
    console.log('Step 2: Fetching availability patterns for each member...');
    for (const member of members) {
      try {
        const patterns = await UserAvailability.findAll({
          where: {
            user_id: member.user_id,
          },
          order: [['createdAt', 'ASC']],
        });
        console.log(`✅ User ${member.username || member.user_id}: ${patterns.length} patterns found`);
        patterns.forEach((pattern, idx) => {
          console.log(`   ${idx + 1}. ${pattern.type} - ${pattern.start_date} to ${pattern.end_date || 'ongoing'}`);
        });
      } catch (error) {
        console.error(`❌ Error fetching patterns for ${member.user_id}:`, error.message);
        console.error('   Stack:', error.stack);
      }
    }

    console.log('');

    // Step 3: Test time slot generation
    console.log('Step 3: Generating time slots...');
    try {
      const slots = availabilityService.generateTimeSlots(startDate, endDate, timezone);
      console.log(`✅ Generated ${slots.length} time slots`);
      if (slots.length > 0) {
        console.log(`   First slot: ${slots[0].date} ${slots[0].startTime}`);
        console.log(`   Last slot: ${slots[slots.length - 1].date} ${slots[slots.length - 1].startTime}`);
      }
    } catch (error) {
      console.error('❌ Error generating time slots:', error.message);
      console.error('   Stack:', error.stack);
      throw error;
    }

    console.log('');

    // Step 4: Test availability calculation for each member
    console.log('Step 4: Calculating availability for each member...');
    for (const member of members) {
      try {
        const availability = await availabilityService.calculateUserAvailability(
          member,
          startDate,
          endDate,
          timezone
        );
        const availableCount = availability.filter(s => s.isAvailable).length;
        console.log(`✅ User ${member.username || member.user_id}: ${availableCount}/${availability.length} slots available`);
      } catch (error) {
        console.error(`❌ Error calculating availability for ${member.user_id}:`, error.message);
        console.error('   Stack:', error.stack);
      }
    }

    console.log('');

    // Step 5: Test full overlaps calculation
    console.log('Step 5: Calculating group overlaps...');
    try {
      const overlaps = await availabilityService.calculateGroupOverlaps(
        testGroupId,
        startDate,
        endDate,
        timezone
      );
      console.log(`✅ Calculated ${overlaps.length} overlap slots`);
      
      // Show some statistics
      const slotsWithAllAvailable = overlaps.filter(s => s.availableCount === members.length);
      const slotsWithSomeAvailable = overlaps.filter(s => s.availableCount > 0 && s.availableCount < members.length);
      const slotsWithNoneAvailable = overlaps.filter(s => s.availableCount === 0);
      
      console.log(`   Slots where all members available: ${slotsWithAllAvailable.length}`);
      console.log(`   Slots where some members available: ${slotsWithSomeAvailable.length}`);
      console.log(`   Slots where no members available: ${slotsWithNoneAvailable.length}`);
      
      if (slotsWithAllAvailable.length > 0) {
        console.log(`\n   Example slot where all available:`);
        const example = slotsWithAllAvailable[0];
        console.log(`     ${example.date} ${example.timeSlot} - ${example.endTime}`);
        console.log(`     Available: ${example.availableMembers.map(m => m.username || m.user_id).join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Error calculating group overlaps:', error.message);
      console.error('   Stack:', error.stack);
      console.error('   Full error:', error);
      throw error;
    }

    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error('   Message:', error.message);
    console.error('   Name:', error.name);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    if (error.parent) {
      console.error('   Database error:', error.parent.message);
    }
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('\nDatabase connection closed.');
  }
}

// Run the test
testOverlapsQuery();
