# Notes for working on this repo

- Static site on GitHub Pages; no build step for the app.
- **After every change, update `version.json`** (any new string, e.g. a UTC timestamp). `index.html` reads it uncached and loads every script, the stylesheet and the data files with `?v=<version>`, so phones never get stale copies. Open pages also show an "Update now" bar when it changes.
- New JS modules must be added to the `mods` list in `index.html` so they get versioned too.
- Card and campaign data: `node scripts/build-cards.mjs ../arkhamdb-json-data`.
- Chaos bags: `node scripts/build-bags.mjs ../arkham-cards-data` (clone of github.com/zzorba/arkham-cards-data).
