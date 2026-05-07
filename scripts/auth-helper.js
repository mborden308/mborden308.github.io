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
 *   3. Set the redirect URI to: https://localhost:8888/callback
 *
 * Usage:
 *   LIGHTROOM_API_KEY=your_client_id LIGHTROOM_CLIENT_SECRET=your_secret node scripts/auth-helper.js
 */

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const API_KEY = process.env.LIGHTROOM_API_KEY;
const CLIENT_SECRET = process.env.LIGHTROOM_CLIENT_SECRET;
const REDIRECT_URI = 'https://localhost:8888/callback';
const SCOPES = 'openid,lr_partner_apis,lr_partner_rendition_apis,offline_access';
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
console.log('\nWaiting for callback on https://localhost:' + PORT + '/callback ...\n');

// Try to open the browser automatically
try {
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? 'start' :
        process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${authUrl}"`);
} catch (_) {
    // Ignore — user can open manually
}

// Generate self-signed certificate for localhost HTTPS
// Uses PowerShell on Windows (no OpenSSL needed) or openssl on other platforms
function generateSelfSignedCert() {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmpDir = os.tmpdir();
    const psScriptPath = path.join(tmpDir, 'lr-gen-cert.ps1');

    try {
        if (process.platform === 'win32') {
            // Export as PFX — works with .NET Framework (PowerShell 5.1)
            const pfxPath = path.join(tmpDir, 'lr-auth.pfx');
            const pfxPass = 'lr-temp-' + Date.now();
            const psScript = `
$ErrorActionPreference = "Stop"
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\\CurrentUser\\My" -NotAfter (Get-Date).AddDays(1) -KeyLength 2048 -KeyExportPolicy Exportable
$pwd = ConvertTo-SecureString -String "${pfxPass}" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "${pfxPath.replace(/\\/g, '/')}" -Password $pwd | Out-Null
Remove-Item -Path "Cert:\\CurrentUser\\My\\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
Write-Output "OK"
`;
            fs.writeFileSync(psScriptPath, psScript, 'utf8');
            execSync(
                `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}"`,
                { stdio: 'pipe' }
            );
            fs.unlinkSync(psScriptPath);

            const pfx = fs.readFileSync(pfxPath);
            fs.unlinkSync(pfxPath);

            return { pfx, passphrase: pfxPass };
        } else {
            // macOS/Linux: use openssl to generate key + cert PEM
            const certPemPath = path.join(tmpDir, 'lr-auth-cert.pem');
            const keyPemPath = path.join(tmpDir, 'lr-auth-key.pem');
            const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
            const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
            fs.writeFileSync(keyPemPath, keyPem);
            execSync(
                `openssl req -new -x509 -key "${keyPemPath}" -out "${certPemPath}" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"`,
                { stdio: 'pipe' }
            );
            const certPem = fs.readFileSync(certPemPath, 'utf8');
            try { fs.unlinkSync(certPemPath); } catch (_) { }
            try { fs.unlinkSync(keyPemPath); } catch (_) { }
            return { key: keyPem, cert: certPem };
        }
    } catch (e) {
        console.error('Error generating self-signed cert:', e.message);
        if (process.platform === 'win32') {
            console.error('PowerShell cert generation failed.');
        } else {
            console.error('Make sure OpenSSL is available on your PATH.');
        }
        process.exit(1);
    }
}

const tlsOptions = generateSelfSignedCert();
console.log('Self-signed certificate generated for localhost.\n');
console.log('NOTE: Your browser will show a security warning — this is expected.');
console.log('Click "Advanced" → "Proceed to localhost" to continue.\n');

// Start local HTTPS server to capture the callback
const server = https.createServer(tlsOptions, async (req, res) => {
    const url = new URL(req.url, `https://localhost:${PORT}`);

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
