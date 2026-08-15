# BetterBaguio.org

An independent, volunteer-built civic information portal for Baguio City, Philippines. The project organizes public services, elected officials, city statistics, legislation, transparency resources, and emergency contacts around what residents need to find.

BetterBaguio.org is **not an official City Government of Baguio website**. Official portals remain the source of truth for transactions and records.

## Current status

Version `0.1.0` is a research-backed launch foundation adapted from the open-source [Better Solano](https://github.com/BetterSolano/bettersolano) project.

The public build includes:

- Home and civic overview
- Official-service link directory
- 2025–2028 elected leadership
- 2024 population, barangay, land-area, and classification data
- Official City Council links for live legislative records
- Budget, procurement, audit, and open-data entry points
- Verified emergency and City Government contacts

Solano-specific fees, processing times, barangays, schools, projects, budgets, ordinances, and resolutions were intentionally excluded from the Better Baguio launch. See [RESEARCH.md](RESEARCH.md) for the source map and research backlog.

## Run locally

```bash
npm run dev
```

Open [http://localhost:8000](http://localhost:8000).

## Production build

```bash
npm install
npm run build -- --no-bump
npm run serve:dist
```

The deployable site is written to `dist/`. The build excludes retained Better Solano reference pages that have not yet been researched for Baguio.

## Content rules

1. Prefer primary sources: PSA, City Government of Baguio, Baguio City Council, COA, DBM, DPWH, PhilGEPS, and official legal repositories.
2. Record the source URL and verification date for every changing fact.
3. Do not copy another LGU’s fees, requirements, processing times, projects, or legislative records.
4. Link to live official databases when republishing would create a stale parallel archive.
5. Label BetterBaguio.org clearly as independent and volunteer-run.

## Attribution and license

The initial information architecture and source template came from [BetterSolano/bettersolano](https://github.com/BetterSolano/bettersolano), licensed under MIT. Better Baguio’s code is also released under the MIT License. Government records are cited to their respective public sources.

Cost to the people of Baguio: **₱0**.
