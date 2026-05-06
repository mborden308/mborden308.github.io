#!/usr/bin/env node

/**
 * Adobe Lightroom → Jekyll Gallery Sync Script
 *
 * Fetches albums from Adobe Lightroom CC via the API,
 * downloads photo renditions, and generates _data/galleries.yml
 * for the Jekyll site.
 *
 * Environment variables required:
 *   LIGHTROOM_API_KEY       - Adobe Developer Console Client ID
 *   LIGHTROOM_CLIENT_SECRET - Adobe Developer Console Client Secret
 *   LIGHTROOM_REFRESH_TOKEN - OAuth refresh token (from auth-helper.js)
 *
 * Usage:
 *   node scripts/sync-lightroom.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ======================
// Configuration
// ======================
const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lightroom-config.json'), 'utf8')
);

const API_KEY = process.env.LIGHTROOM_API_KEY;
const CLIENT_SECRET = process.env.LIGHTROOM_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.LIGHTROOM_REFRESH_TOKEN;
const LR_BASE = 'https://lr.adobe.io/v2';
const IMS_BASE = 'https://ims-na1.adobelogin.com';

const GALLERY_DIR = path.join(__dirname, '..', 'assets', 'images', 'gallery');
const DATA_DIR = path.join(__dirname, '..', '_data');

// ======================
// Helpers
// ======================

/** Strip Adobe's while(1){} prefix from JSON responses */
function parseAdobeJson(text) {
  const cleaned = text.replace(/^while\s*\(\s*1\s*\)\s*\{\s*\}\s*/, '');
  return JSON.parse(cleaned);
}

/** Make an HTTPS request, return a Promise<{statusCode, body}> */
function request(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ statusCode: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/** Make an authenticated GET to the Lightroom API */
async function lrGet(endpoint, accessToken) {
  const url = new URL(endpoint, LR_BASE);
  const res = await request(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Lightroom API ${endpoint} returned ${res.statusCode}: ${res.body.toString()}`);
  }

  return parseAdobeJson(res.body.toString('utf8'));
}

/** Download a binary rendition and save to disk */
async function downloadRendition(endpoint, accessToken, destPath) {
  const url = new URL(endpoint, LR_BASE);
  const res = await request(url.toString(), {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (res.statusCode !== 200) {
    console.warn(`  Warning: Could not download rendition (${res.statusCode}), skipping.`);
    return false;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, res.body);
  return true;
}

// ======================
// OAuth Token Refresh
// ======================
async function refreshAccessToken() {
  const postData = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: API_KEY,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
  }).toString();

  const res = await request(`${IMS_BASE}/ims/token/v3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  }, postData);

  if (res.statusCode !== 200) {
    throw new Error(`Token refresh failed (${res.statusCode}): ${res.body.toString()}`);
  }

  const data = JSON.parse(res.body.toString('utf8'));
  console.log('Access token refreshed successfully.');

  // If a new refresh token is returned, log it (user should update GitHub secret)
  if (data.refresh_token && data.refresh_token !== REFRESH_TOKEN) {
    console.log('NOTE: A new refresh token was issued. Update your LIGHTROOM_REFRESH_TOKEN secret.');
    console.log(`New refresh token: ${data.refresh_token}`);
  }

  return data.access_token;
}

// ======================
// Main Sync Logic
// ======================
async function main() {
  // Validate environment
  if (!API_KEY || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('Error: Missing required environment variables.');
    console.error('Set LIGHTROOM_API_KEY, LIGHTROOM_CLIENT_SECRET, and LIGHTROOM_REFRESH_TOKEN.');
    process.exit(1);
  }

  console.log('Starting Lightroom sync...');

  // 1. Get access token
  const accessToken = await refreshAccessToken();

  // 2. Get catalog ID
  const catalog = await lrGet('/v2/catalog', accessToken);
  const catalogId = catalog.id;
  console.log(`Catalog ID: ${catalogId}`);

  // 3. Fetch all albums
  const albumsRes = await lrGet(`/v2/catalogs/${catalogId}/albums`, accessToken);
  const albums = albumsRes.resources || [];
  console.log(`Found ${albums.length} albums in Lightroom.`);

  // 4. Build album name → ID map
  const albumMap = {};
  for (const album of albums) {
    const name = album.payload && album.payload.name;
    if (name) {
      albumMap[name] = album.id;
    }
  }

  // 5. Process each configured album
  const galleriesData = [];

  for (const [albumName, gallerySlug] of Object.entries(config.albums)) {
    console.log(`\nProcessing gallery: "${albumName}" → ${gallerySlug}`);

    const albumId = albumMap[albumName];
    if (!albumId) {
      console.log(`  Album "${albumName}" not found in Lightroom. Creating empty gallery.`);
      galleriesData.push({
        name: albumName,
        slug: gallerySlug,
        description: '',
        cover: '',
        photos: [],
      });
      continue;
    }

    // Fetch album assets
    const assetsRes = await lrGet(
      `/v2/catalogs/${catalogId}/albums/${albumId}/assets`,
      accessToken
    );
    const assets = assetsRes.resources || [];
    console.log(`  Found ${assets.length} assets in album.`);

    const galleryDir = path.join(GALLERY_DIR, gallerySlug);
    fs.mkdirSync(galleryDir, { recursive: true });

    // Track which files should exist (for cleanup)
    const expectedFiles = new Set();
    const photos = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const assetId = asset.asset && asset.asset.id || asset.id;

      // Build filename from import source or asset ID
      let filename;
      if (asset.asset && asset.asset.payload && asset.asset.payload.importSource) {
        filename = asset.asset.payload.importSource.fileName || `${assetId}.jpg`;
      } else {
        filename = `${assetId}.jpg`;
      }

      // Sanitize filename
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      expectedFiles.add(filename);

      const destPath = path.join(galleryDir, filename);

      // Extract caption/alt text
      let alt = '';
      if (asset.asset && asset.asset.payload && asset.asset.payload.xmp) {
        alt = asset.asset.payload.xmp['dc:title'] || '';
      }
      if (!alt) {
        alt = albumName + ' photograph';
      }

      // Download rendition if not already present
      if (!fs.existsSync(destPath)) {
        console.log(`  Downloading: ${filename}`);
        const renditionEndpoint = `/v2/catalogs/${catalogId}/assets/${assetId}/renditions/${config.renditionSize}`;
        await downloadRendition(renditionEndpoint, accessToken, destPath);
      } else {
        console.log(`  Exists: ${filename}`);
      }

      photos.push({ filename, alt });
    }

    // Remove photos no longer in the album
    if (fs.existsSync(galleryDir)) {
      const existingFiles = fs.readdirSync(galleryDir);
      for (const file of existingFiles) {
        if (!expectedFiles.has(file)) {
          console.log(`  Removing: ${file} (no longer in album)`);
          fs.unlinkSync(path.join(galleryDir, file));
        }
      }
    }

    galleriesData.push({
      name: albumName,
      slug: gallerySlug,
      description: '',
      cover: photos.length > 0 ? photos[0].filename : '',
      photos,
    });
  }

  // 6. Write _data/galleries.yml
  let yaml = '';
  for (const gallery of galleriesData) {
    yaml += `- name: "${gallery.name}"\n`;
    yaml += `  slug: "${gallery.slug}"\n`;
    yaml += `  description: "${gallery.description}"\n`;
    yaml += `  cover: "${gallery.cover}"\n`;
    if (gallery.photos.length === 0) {
      yaml += '  photos: []\n';
    } else {
      yaml += '  photos:\n';
      for (const photo of gallery.photos) {
        yaml += `    - filename: "${photo.filename}"\n`;
        yaml += `      alt: "${photo.alt}"\n`;
      }
    }
    yaml += '\n';
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'galleries.yml'), yaml, 'utf8');
  console.log('\n_data/galleries.yml updated successfully.');
  console.log('Sync complete!');
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
