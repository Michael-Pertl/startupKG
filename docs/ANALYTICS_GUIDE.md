# Exploring AI mega-round funding

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem. Regional samples are uneven. Export time is not a coverage cutoff.

## Using Analytics

Choose years, regions, countries, AI domains, and evidence confidence. Low-confidence events are excluded from quantitative totals. Reset view restores the default research settings and all supported evidence filters.

Funding over time defaults to the same month/day cutoff in each year and excludes debt, mixed primary/secondary funding, upper bounds, and commitments. Disable those options to inspect the broader reported-event evidence. The largest-round option removes one largest event per year to examine sensitivity. Company counts follow the graph's startup-to-round relationships. Top-five round share and largest-round share describe concentration in reported amounts.

Click a market-concentration bar to select a slice; Clear selection returns to the full filtered view. Company and investor rankings link back to the graph. Show all rankings exposes the full filtered ranking. Investor volume is the sum of associated rounds, not a disclosed investor cheque or an allocation of the round amount.

The evidence list supports search by company, investor, country, domain, date, or round name, sorting by amount or latest date, and fourteen rows per page. Search affects the evidence list and CSV export, while the dashboard totals continue to describe the selected filters. Export CSV includes every matching event, not just the current page, with amount basis, confidence, investors, and source URLs. Formula-like text is escaped for safer spreadsheet use.

## Validation and previews

```bash
python3 -m unittest discover -s tests -q
python3 scripts/refresh_platform.py
cd web
npm test
npm run build
```

The full local refresh validates the inputs, processes complete structured funding evidence, rebuilds the graph and growth metrics, and publishes evidence-health status. `--discover` additionally polls public RSS feeds. Optional source failures produce a degraded discovery report; a required validation/build failure stops the pipeline.

Desktop and mobile browser checks covered graph-linked company counts, evidence pagination, search, sorting, CSV download, full rankings, slice reset, graph-loading retry, and removal of personal details. Mobile was checked at 390 pixels without page overflow. See [desktop preview](screenshots/analytics-desktop.png) and [mobile preview](screenshots/analytics-mobile.png).

The live RSS check on 2026-10-12 succeeded for five of six configured feeds and appended seven unreviewed discovery candidates. VentureBeat returned HTTP429. These candidates are not verified mega-round funding events and do not enter funding totals. The core evidence remains 212 funding events, with unresolved source-recheck and investor-metadata gaps recorded in the health report.
