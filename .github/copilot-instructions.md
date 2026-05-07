# Project Guidelines

## Overview
This is a landscape photography portfolio website for Michael Borden Photography (michaelbordenphotography.com). Built with Jekyll and deployed on GitHub Pages.

## Architecture
- **Framework:** Jekyll static site generator with GitHub Pages
- **Styling:** SCSS partials in `_sass/`, compiled from `assets/css/main.scss`
- **JavaScript:** Vanilla JS only — no frameworks, no jQuery, no build tools
- **Galleries:** Data-driven via `_data/galleries.yml` — templates loop over this file
- **Lightroom Sync:** Node.js scripts in `scripts/` fetch photos from Adobe Lightroom CC API
- **GitHub Actions:** `.github/workflows/sync-lightroom.yml` auto-syncs Lightroom albums weekly

## Design Principles
- **Dark/moody theme** — near-black backgrounds (#0d0d0d), light text (#f0f0f0)
- **Accent color:** Dark blue (#4a7fb5) — used for hover states, links, highlights
- **Photos are the hero** — minimal UI, generous whitespace, no competing colors
- **Mobile-first** — styles default to mobile, scale up via min-width media queries
- **Breakpoints:** 576px, 768px, 1024px, 1200px (defined in `_sass/_variables.scss`)

## Typography
- **Headings:** Playfair Display (serif) via Google Fonts
- **Body:** Lato (sans-serif) via Google Fonts
- **Never** add additional font imports without explicit request

## Code Style
- SCSS uses BEM-lite naming (`.gallery-item`, `.gallery-caption`)
- CSS variables defined in `_sass/_variables.scss` — always use variables for colors, spacing, fonts
- JavaScript uses IIFEs to avoid polluting global scope (except `window.openLightbox`)
- No inline styles unless needed for dynamic "Coming Soon" placeholders
- Use `loading="lazy"` on all gallery/below-fold images
- Use semantic HTML with ARIA labels for interactive elements

## Build and Test
```
bundle exec jekyll serve        # Local dev server at localhost:4000
node scripts/generate-gallery-data.js  # Regenerate galleries.yml from image folders
```

## Conventions
- Gallery photos live in `assets/images/gallery/{slug}/`
- Adding a gallery: create album entry in `_data/galleries.yml`, create a page with `layout: gallery` frontmatter, add nav links in `_includes/header.html`
- The `scripts/lightroom-config.json` maps Lightroom album names → gallery slugs
- CNAME must stay as `michaelbordenphotography.com`
- Never remove or modify the `Photos/` directory (legacy backup, excluded from build)
