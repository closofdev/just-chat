// Cek konektivitas keluar ke CodeBuddy dari dalam container.
// Pakai: docker exec just-chat node /app/check-net.cjs
const https = require('https');
const req = https.get('https://www.codebuddy.ai/', (res) => {
  console.log('status', res.statusCode);
  process.exit(0);
});
req.on('error', (e) => {
  console.log('ERROR', e.code || e.message);
  process.exit(0);
});
req.setTimeout(10000, () => {
  console.log('TIMEOUT');
  process.exit(0);
});
