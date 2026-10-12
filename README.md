# Destiny Rising Tools

Artifact browser and four-slot build calculator for Destiny Rising, served by a small Express API.

## Purpose

Destiny Rising lets a player equip four artifacts, one per slot. This tool turns a tier-list page into structured data and lets you browse the 80 artifacts and test combinations: combined stats, synergies and a heuristic build score.

## How it works

- `artifact_scraper.js` parses a locally saved copy of Game8's artifact tier-list page with cheerio and writes `data/artifacts.json`: 80 artifacts (20 per slot) with effect text, parsed numeric stats, categories, mechanics, the Game8 tier as a reference field, and a heuristic power score computed from the parsed values.
- `server.js` is an Express API over that file:
  - `GET /api/artifacts`: filter by slot, category or search text, sort, limit
  - `GET /api/artifacts/:id`
  - `POST /api/builds/calculate`: up to 4 artifact ids → combined stats, synergies, build score, recommendations
  - `GET /api/categories`, `GET /api/stats`
- `public/` is a vanilla JS front end: search, slot and category filters, sorting, artifact details, four build slots.
- `vercel.json` deploys `server.js` as a single Vercel Node function.

## Run

```bash
npm install
npm start          # http://localhost:3001
```

## Refresh the data

Save Game8's "Best Artifacts Tier List" page for Destiny Rising as HTML into `game8/` (git-ignored), keeping the file name the scraper expects (`artifact_scraper.js`, `htmlPath`), then:

```bash
npm run scrape     # rewrites data/artifacts.json
```

## Status and limitations

- Personal tool; the bundled data was scraped on 2025-09-02 and has not been refreshed.
- The power and build scores are heuristics defined in `artifact_scraper.js` and `server.js`, not game formulas.
- The scraper depends on Game8's page markup and breaks if it changes.
- No tests.

## Data and license

Artifact names, effects and tiers come from Game8's tier list (game8.co); the saved page itself is not part of the repository. The code is MIT-licensed, see [LICENSE](LICENSE).
