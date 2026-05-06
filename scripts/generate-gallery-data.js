#!/usr/bin/env node

/**
 * Gallery Data Generator (Manual Fallback)
 *
 * Scans image folders in assets/images/gallery/ and generates
 * _data/galleries.yml automatically. Use this when you're not
 * using the Lightroom API sync — just drop photos into the
 * appropriate gallery folder and run this script.
 *
 * Usage:
 *   node scripts/generate-gallery-data.js
 */

const fs = require('fs');
const path = require('path');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lightroom-config.json'), 'utf8')
);

const GALLERY_DIR = path.join(__dirname, '..', 'assets', 'images', 'gallery');
const DATA_FILE = path.join(__dirname, '..', '_data', 'galleries.yml');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Read existing galleries.yml if present (to preserve descriptions/covers)
let existingData = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    // Simple YAML parsing for our known structure
    const galleries = content.split(/^- /m).filter(Boolean);
    for (const g of galleries) {
      const nameMatch = g.match(/name:\s*"(.+?)"/);
      const descMatch = g.match(/description:\s*"(.*?)"/);
      const coverMatch = g.match(/cover:\s*"(.*?)"/);
      if (nameMatch) {
        existingData[nameMatch[1]] = {
          description: descMatch ? descMatch[1] : '',
          cover: coverMatch ? coverMatch[1] : '',
        };
      }
    }
  } catch (_) {
    // Ignore parse errors, we'll regenerate
  }
}

console.log('Scanning gallery folders...\n');

let yaml = '';

for (const [albumName, gallerySlug] of Object.entries(config.albums)) {
  const galleryDir = path.join(GALLERY_DIR, gallerySlug);

  const existing = existingData[albumName] || {};
  const description = existing.description || '';

  let photos = [];
  if (fs.existsSync(galleryDir)) {
    const files = fs.readdirSync(galleryDir)
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();

    photos = files.map((filename) => ({
      filename,
      alt: filenameToAlt(filename, albumName),
    }));
  }

  const cover = existing.cover || (photos.length > 0 ? photos[0].filename : '');

  console.log(`${albumName} (${gallerySlug}): ${photos.length} photos`);

  yaml += `- name: "${albumName}"\n`;
  yaml += `  slug: "${gallerySlug}"\n`;
  yaml += `  description: "${description}"\n`;
  yaml += `  cover: "${cover}"\n`;
  if (photos.length === 0) {
    yaml += '  photos: []\n';
  } else {
    yaml += '  photos:\n';
    for (const photo of photos) {
      yaml += `    - filename: "${photo.filename}"\n`;
      yaml += `      alt: "${photo.alt}"\n`;
    }
  }
  yaml += '\n';
}

fs.writeFileSync(DATA_FILE, yaml, 'utf8');
console.log(`\nWrote ${DATA_FILE}`);
console.log('Done!');

/**
 * Convert a filename into a reasonable alt text.
 * E.g. "boundary-waters-sunset.jpg" → "Boundary waters sunset"
 */
function filenameToAlt(filename, fallback) {
  const name = path.basename(filename, path.extname(filename));
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\d+/g, '')
    .trim();

  if (!words) return fallback + ' photograph';

  return words.charAt(0).toUpperCase() + words.slice(1);
}
