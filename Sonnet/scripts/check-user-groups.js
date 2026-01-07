// scripts/check-user-groups.js
// Helper script to check if a user exists and has groups
const { User, Group, UserGroup, sequelize } = require('../models');

async function checkUserGroups(auth0Sub) {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Find user by Auth0 sub (user_id)
    const user = await User.findOne({
      where: { user_id: auth0Sub },
      include: [{
        model: Group,
        through: { attributes: ['role', 'joined_at'] }
      }]
    });

    if (!user) {
      console.log(`❌ User with user_id="${auth0Sub}" not found in database`);
      console.log('\n📋 All users in database:');
      const allUsers = await User.findAll({
        attributes: ['user_id', 'username', 'email'],
        raw: true
      });
      console.log(JSON.stringify(allUsers, null, 2));
      console.log('\n💡 To fix this:');
      console.log('1. Update seed-sample-data.js with your Auth0 sub value');
      console.log('2. Run: npm run seed');
      return;
    }

    console.log(`✅ Found user: ${user.username} (${user.email})`);
    console.log(`   Auth0 sub: ${user.user_id}`);
    console.log(`   Database ID: ${user.id}\n`);

    if (user.Groups && user.Groups.length > 0) {
      console.log(`✅ User is in ${user.Groups.length} group(s):`);
      user.Groups.forEach((group, index) => {
        const userGroup = group.UserGroup;
        console.log(`   ${index + 1}. ${group.name} (${userGroup.role})`);
        console.log(`      Group ID: ${group.id}`);
        console.log(`      Group ID (string): ${group.group_id}`);
      });
    } else {
      console.log('❌ User is not in any groups');
      console.log('\n💡 To fix this:');
      console.log('1. Make sure the seed script linked this user to groups');
      console.log('2. Run: npm run seed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

// Get Auth0 sub from command line argument
const auth0Sub = process.argv[2];

if (!auth0Sub) {
  console.log('Usage: node scripts/check-user-groups.js <auth0_sub_value>');
  console.log('\nExample:');
  console.log('  node scripts/check-user-groups.js "auth0|6959f749afc6f7d1e7fb1635"');
  console.log('\nTo get your Auth0 sub:');
  console.log('1. Log in to your app at http://localhost:3000');
  console.log('2. Open browser console (F12)');
  console.log('3. Look for: "🔑 Your Auth0 sub value: auth0|..."');
  process.exit(1);
}

checkUserGroups(auth0Sub);





