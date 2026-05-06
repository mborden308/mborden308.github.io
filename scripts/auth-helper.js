#!/usr/bin/env node

/**
 * Adobe Lightroom OAuth Helper
 *
 * Run this script once to obtain your initial refresh token.
 * It opens your browser to Adobe's login page, captures the
 * authorization code via a local callback server, and exchanges
 * it for access + refresh tokens.
 *
 * Prerequisites:
 *   1. Register a project at https://console.adobe.io
 *   2. Add the Lightroom Services API
 *   3. Set the redirect URI to: http://localhost:8888/callback
 *
 * Usage:
 *   LIGHTROOM_API_KEY=your_client_id LIGHTROOM_CLIENT_SECRET=your_secret node scripts/auth-helper.js
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_KEY = process.env.LIGHTROOM_API_KEY;
const CLIENT_SECRET = process.env.LIGHTROOM_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8888/callback';
const SCOPES = 'openid,lr_partner_apis,lr_partner_rendition_apis';
const PORT = 8888;

if (!API_KEY || !CLIENT_SECRET) {
  console.error('Error: Set LIGHTROOM_API_KEY and LIGHTROOM_CLIENT_SECRET environment variables.');
  process.exit(1);
}

// Build authorization URL
const authUrl = `https://ims-na1.adobelogin.com/ims/authorize/v2?` +
  `client_id=${encodeURIComponent(API_KEY)}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('\n=== Adobe Lightroom OAuth Setup ===\n');
console.log('Open this URL in your browser to sign in:\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:' + PORT + '/callback ...\n');

// Try to open the browser automatically
try {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? 'start' :
              process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${authUrl}"`);
} catch (_) {
  // Ignore — user can open manually
}

// Start local server to capture the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received.');
    return;
  }

  console.log('Authorization code received. Exchanging for tokens...');

  try {
    const tokens = await exchangeCode(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h1>Success!</h1>
        <p>You can close this window and return to your terminal.</p>
      </body></html>
    `);

    console.log('\n=== Tokens Retrieved Successfully ===\n');
    console.log('Access Token (expires in ~24h):');
    console.log(tokens.access_token.substring(0, 40) + '...\n');
    console.log('Refresh Token (save this — you need it for the sync script):');
    console.log(tokens.refresh_token);
    console.log('\n=== Next Steps ===');
    console.log('1. Go to your GitHub repo → Settings → Secrets and variables → Actions');
    console.log('2. Add these repository secrets:');
    console.log(`   LIGHTROOM_API_KEY = ${API_KEY}`);
    console.log(`   LIGHTROOM_CLIENT_SECRET = ${CLIENT_SECRET}`);
    console.log(`   LIGHTROOM_REFRESH_TOKEN = ${tokens.refresh_token}`);
    console.log('\nDone!\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed. Check your terminal.');
    console.error('Token exchange error:', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);

function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: API_KEY,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const req = https.request('https://ims-na1.adobelogin.com/ims/token/v3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
