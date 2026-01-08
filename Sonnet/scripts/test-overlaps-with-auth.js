// scripts/test-overlaps-with-auth.js
// Test script to make HTTP request with authentication
// Gets token from frontend token endpoint first

const http = require('http');

// Test parameters
const groupId = process.argv[2] || 'da83fc83-afc2-4cb6-b2e4-4b2a3d6634c9';
const startDate = process.argv[3] || '2026-01-01';
const endDate = process.argv[4] || '2026-02-01';
const timezone = process.argv[5] || 'America/Los_Angeles';

console.log('Testing Backend HTTP Endpoint with Authentication');
console.log('==================================================');
console.log(`Group ID: ${groupId}`);
console.log(`Start Date: ${startDate}`);
console.log(`End Date: ${endDate}`);
console.log(`Timezone: ${timezone}`);
console.log('');

// First, try to get a token from the frontend
// Note: This requires you to be logged in to the frontend
console.log('Step 1: Attempting to get Auth0 token from frontend...');
console.log('(This requires you to be logged in at http://localhost:3000)');
console.log('');

const tokenOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/token',
  method: 'GET',
  headers: {
    'Cookie': process.argv[6] || '', // You can pass cookies as 6th argument if needed
  }
};

// Try to get token, but if it fails, we'll test without it
const getToken = () => {
  return new Promise((resolve) => {
    const req = http.request(tokenOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.accessToken) {
            console.log('✅ Got access token from frontend');
            resolve(json.accessToken);
          } else {
            console.log('⚠️  No token available (you may need to be logged in)');
            console.log('   Response:', data);
            resolve(null);
          }
        } catch (e) {
          console.log('⚠️  Could not parse token response');
          resolve(null);
        }
      });
    });
    
    req.on('error', () => {
      console.log('⚠️  Could not connect to frontend token endpoint');
      resolve(null);
    });
    
    req.end();
  });
};

// Test the overlaps endpoint
const testOverlaps = (token) => {
  return new Promise((resolve, reject) => {
    const path = `/api/availability/group/${groupId}/overlaps?timezone=${encodeURIComponent(timezone)}&start_date=${startDate}&end_date=${endDate}`;
    
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
      console.log('Step 2: Testing overlaps endpoint with authentication...');
    } else {
      console.log('Step 2: Testing overlaps endpoint without authentication (will get 401)...');
    }

    const req = http.request(options, (res) => {
      console.log(`\nStatus Code: ${res.statusCode}`);
      console.log(`Status Message: ${res.statusMessage}`);
      
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('\nResponse:');
          console.log(JSON.stringify(json, null, 2));
          
          if (res.statusCode === 200 && Array.isArray(json)) {
            console.log(`\n✅ SUCCESS! Received ${json.length} overlap slots`);
            if (json.length > 0) {
              console.log(`\nFirst slot example:`);
              console.log(JSON.stringify(json[0], null, 2));
              console.log(`\nLast slot example:`);
              console.log(JSON.stringify(json[json.length - 1], null, 2));
            }
            resolve(json);
          } else if (json.error) {
            console.log(`\n❌ Error: ${json.error}`);
            if (res.statusCode === 401) {
              console.log('\n💡 Tip: You need to be logged in to the frontend to get a valid token.');
              console.log('   Or pass a token as an argument to the script.');
            }
            reject(new Error(json.error));
          } else {
            console.log('\n⚠️  Unexpected response format');
            reject(new Error('Unexpected response'));
          }
        } catch (e) {
          console.log('\nRaw response:');
          console.log(data);
          if (data.includes('<!DOCTYPE') || data.includes('<html')) {
            console.log('\n⚠️  Received HTML instead of JSON - might be hitting wrong endpoint');
          }
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error('\n❌ Request Error:');
      console.error(`   Message: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      if (error.code === 'ECONNREFUSED') {
        console.error('\n   The backend server is not running on port 4000.');
        console.error('   Start it with: cd periodictabletopbackend_v2/Sonnet && npm start');
      }
      reject(error);
    });

    req.end();
  });
};

// Run the test
(async () => {
  try {
    const token = await getToken();
    await testOverlaps(token);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
})();
