// scripts/test-overlaps-endpoint.js
// Test script to make HTTP request to the overlaps endpoint
// This tests the full HTTP layer, not just the database

const http = require('http');

// Test parameters
const groupId = process.argv[2] || 'da83fc83-afc2-4cb6-b2e4-4b2a3d6634c9';
const startDate = process.argv[3] || '2026-01-01';
const endDate = process.argv[4] || '2026-02-01';
const timezone = process.argv[5] || 'America/Los_Angeles';
const authToken = process.argv[6] || null; // Optional: pass Auth0 token as 6th argument

const path = `/api/availability/group/${groupId}/overlaps?timezone=${encodeURIComponent(timezone)}&start_date=${startDate}&end_date=${endDate}`;

console.log('Testing Backend HTTP Endpoint');
console.log('==============================');
console.log(`URL: http://localhost:4000${path}`);
console.log(`Group ID: ${groupId}`);
console.log(`Start Date: ${startDate}`);
console.log(`End Date: ${endDate}`);
console.log(`Timezone: ${timezone}`);
console.log(`Auth Token: ${authToken ? 'Provided' : 'Not provided (will get 401)'}`);
console.log('');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: path,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
};

if (authToken) {
  options.headers['Authorization'] = `Bearer ${authToken}`;
}

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Status Message: ${res.statusMessage}`);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
      
      if (Array.isArray(json)) {
        console.log(`\n✅ Success! Received ${json.length} overlap slots`);
        if (json.length > 0) {
          console.log(`\nFirst slot example:`);
          console.log(JSON.stringify(json[0], null, 2));
        }
      } else if (json.error) {
        console.log(`\n❌ Error: ${json.error}`);
      }
    } catch (e) {
      console.log(data);
      if (data.includes('<!DOCTYPE') || data.includes('<html')) {
        console.log('\n⚠️  Received HTML instead of JSON - might be hitting wrong endpoint');
      }
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:');
  console.error(`   Message: ${error.message}`);
  console.error(`   Code: ${error.code}`);
  if (error.code === 'ECONNREFUSED') {
    console.error('\n   The backend server is not running on port 4000.');
    console.error('   Start it with: cd periodictabletopbackend_v2/Sonnet && npm start');
  }
});

req.end();

console.log('Sending request...\n');
