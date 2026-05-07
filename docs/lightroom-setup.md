# Lightroom API Sync — Setup Guide

Complete instructions for connecting Adobe Lightroom CC to your photography website for automated photo syncing.

---

## Prerequisites

- Node.js installed
- A GitHub repository with Actions enabled
- An Adobe Creative Cloud account with Lightroom

---

## Step 1: Create an Adobe Developer Project

1. Go to [https://console.adobe.io](https://console.adobe.io)
2. Click **Create new project**
3. Click **Add API** → select **Lightroom Services**
4. Choose **OAuth Web App** as the credential type
5. Set the **Redirect URI** to:
   ```
   https://localhost:8888/callback
   ```
6. Save your **Client ID** and **Client Secret** — you'll need both

---

## Step 2: Get Your Refresh Token

Open PowerShell in the project root and run:

```powershell
$env:LIGHTROOM_API_KEY = "your_client_id_here"
$env:LIGHTROOM_CLIENT_SECRET = "your_client_secret_here"
node scripts/auth-helper.js
```

This will:
- Generate a self-signed HTTPS certificate (browser will show a warning)
- Open your browser to Adobe's login page
- Start a local server at `https://localhost:8888/callback`

**In the browser:**
1. Sign in with your Adobe account
2. Grant permission to the app
3. You'll see a security warning — click **Advanced** → **Proceed to localhost**
4. You should see "Success!" in the browser

**In the terminal**, you'll see your refresh token printed. Copy it.

---

## Step 3: Add Secrets to GitHub

Go to: `https://github.com/mborden308/mborden308.github.io/settings/secrets/actions`

Add these **3 repository secrets**:

| Secret Name | Value |
|---|---|
| `LIGHTROOM_API_KEY` | Your Client ID from Adobe Console |
| `LIGHTROOM_CLIENT_SECRET` | Your Client Secret from Adobe Console |
| `LIGHTROOM_REFRESH_TOKEN` | The refresh token from Step 2 |

---

## Step 4: Create Albums in Lightroom

In [Lightroom Web](https://lightroom.adobe.com) or the desktop app, create albums with these **exact names** (must match `scripts/lightroom-config.json`):

- `The Great Outdoors`
- `Office Space`
- `Wolf of Wall Street`

Add photos to the albums you want to display on the website.

### Changing Album Names

To change album names or add new ones, edit `scripts/lightroom-config.json`:

```json
{
  "The Great Outdoors": "the-great-outdoors",
  "Office Space": "office-space",
  "Wolf of Wall Street": "wolf-of-wall-street"
}
```

Format: `"Lightroom Album Name": "gallery-slug"`

If you add a new gallery, you also need to:
1. Create a new page file (e.g., `new-gallery.html`) with `layout: gallery` and the matching `gallery_slug`
2. Add a nav link in `_includes/header.html`

---

## Adding a New Gallery (Full Steps)

**Example:** Adding a gallery called "Mountain Views"

### 1. Add the album in Lightroom

Create an album named exactly `Mountain Views` in Lightroom and add your photos.

### 2. Update `scripts/lightroom-config.json`

Add a new entry mapping the album name to a URL slug:

```json
{
  "The Great Outdoors": "the-great-outdoors",
  "Office Space": "office-space",
  "Wolf of Wall Street": "wolf-of-wall-street",
  "Mountain Views": "mountain-views"
}
```

### 3. Create a gallery page

Create a file in the project root (e.g., `mountain-views.html`):

```html
---
layout: gallery
title: Mountain Views
gallery_slug: mountain-views
permalink: /mountain-views/
---
```

### 4. Add a nav link in `_includes/header.html`

Find the gallery dropdown section and add a new link:

```html
<a href="/mountain-views/" class="dropdown-item">Mountain Views</a>
```

### 5. Run the sync

```powershell
$env:LIGHTROOM_API_KEY = "your_client_id"
$env:LIGHTROOM_CLIENT_SECRET = "your_client_secret"
$env:LIGHTROOM_REFRESH_TOKEN = "your_refresh_token"
node scripts/sync-lightroom.js
```

Or trigger the GitHub Action manually (Actions → Sync Lightroom → Run workflow).

### 6. Commit and push

```powershell
git add .
git commit -m "Add Mountain Views gallery"
git push
```

---

## Renaming a Gallery (Full Steps)

**Example:** Renaming "Office Space" to "City Life"

### 1. Rename the album in Lightroom

Rename the album from `Office Space` to `City Life`.

### 2. Update `scripts/lightroom-config.json`

Remove the old entry and add the new one. You can keep the same slug or change it:

```json
{
  "The Great Outdoors": "the-great-outdoors",
  "City Life": "city-life",
  "Wolf of Wall Street": "wolf-of-wall-street"
}
```

### 3. Rename or create the gallery page

If changing the slug, rename the page file and update frontmatter:

```powershell
# Delete old page
Remove-Item office-space.html

# Create new page (city-life.html):
```

```html
---
layout: gallery
title: City Life
gallery_slug: city-life
permalink: /city-life/
---
```

If keeping the same slug, just update the `title` in the existing file.

### 4. Update nav link in `_includes/header.html`

Change the link text and href:

```html
<a href="/city-life/" class="dropdown-item">City Life</a>
```

### 5. Clean up old images (optional)

If you changed the slug, remove the old image folder:

```powershell
Remove-Item -Recurse assets/images/gallery/office-space
```

### 6. Run the sync

```powershell
$env:LIGHTROOM_API_KEY = "your_client_id"
$env:LIGHTROOM_CLIENT_SECRET = "your_client_secret"
$env:LIGHTROOM_REFRESH_TOKEN = "your_refresh_token"
node scripts/sync-lightroom.js
```

### 7. Commit and push

```powershell
git add .
git commit -m "Rename Office Space gallery to City Life"
git push
```

---

## Removing a Gallery

### 1. Delete the album in Lightroom (or just remove from config)

### 2. Remove the entry from `scripts/lightroom-config.json`

### 3. Delete the gallery page file

```powershell
Remove-Item office-space.html
```

### 4. Remove the nav link from `_includes/header.html`

### 5. Delete the image folder

```powershell
Remove-Item -Recurse assets/images/gallery/office-space
```

### 6. Run the sync to update `_data/galleries.yml`

```powershell
node scripts/sync-lightroom.js
```

Or use the manual fallback if you don't want to hit the API:

```powershell
node scripts/generate-gallery-data.js
```

### 7. Commit and push

```powershell
git add .
git commit -m "Remove Office Space gallery"
git push
```

---

## Step 5: Test the Sync

### Option A: Run Locally

```powershell
$env:LIGHTROOM_API_KEY = "your_client_id"
$env:LIGHTROOM_CLIENT_SECRET = "your_client_secret"
$env:LIGHTROOM_REFRESH_TOKEN = "your_refresh_token"
node scripts/sync-lightroom.js
```

This will:
- Refresh your access token
- Fetch albums and photos from Lightroom
- Download 2048px renditions to `assets/images/gallery/{slug}/`
- Update `_data/galleries.yml`
- Remove photos that were deleted from Lightroom

### Option B: Run via GitHub Actions (Manual)

1. Go to your repo on GitHub
2. Click **Actions** tab
3. Select **Sync Lightroom** workflow on the left
4. Click **Run workflow** → **Run workflow**

### Option C: Automatic (Default)

The workflow runs automatically every **Sunday at midnight UTC**. No action needed.

---

## Troubleshooting

### Refresh token expired

Adobe refresh tokens expire after 14 days of inactivity. If the sync fails with an auth error, re-run Step 2 to get a new refresh token, then update the `LIGHTROOM_REFRESH_TOKEN` secret in GitHub.

### "offline_access" error during auth

Make sure the scopes in `scripts/auth-helper.js` include `offline_access`:
```javascript
const SCOPES = 'openid,lr_partner_apis,lr_partner_rendition_apis,offline_access';
```

### OpenSSL not found (Windows)

The auth helper uses PowerShell's `New-SelfSignedCertificate` on Windows. No OpenSSL needed. If PowerShell cert generation fails, make sure you're running a recent version of Windows 10/11.

### Photos not appearing on site

1. Check that album names in Lightroom **exactly** match `scripts/lightroom-config.json`
2. Verify `_data/galleries.yml` was updated after sync
3. Run `bundle exec jekyll serve` locally to preview

### Sync didn't commit changes

The GitHub Action only commits if there are actual file changes. Check the workflow run logs in the Actions tab.

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `LIGHTROOM_API_KEY` | Adobe OAuth Client ID |
| `LIGHTROOM_CLIENT_SECRET` | Adobe OAuth Client Secret |
| `LIGHTROOM_REFRESH_TOKEN` | OAuth refresh token (from auth-helper.js) |

---

## File Reference

| File | Purpose |
|---|---|
| `scripts/auth-helper.js` | One-time OAuth flow to get refresh token |
| `scripts/sync-lightroom.js` | Syncs photos from Lightroom → local gallery |
| `scripts/lightroom-config.json` | Maps album names to gallery slugs |
| `scripts/generate-gallery-data.js` | Manual fallback: generates galleries.yml from local image folders |
| `.github/workflows/sync-lightroom.yml` | GitHub Actions workflow (weekly cron + manual) |
| `_data/galleries.yml` | Generated gallery data consumed by Jekyll templates |
