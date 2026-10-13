# Exploring AI mega-round funding

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem. Regional samples are uneven. Export time is not a coverage cutoff.

## Using Analytics

- **Funding:** reported funding by region or sector, plus a compact yearly comparison. Select a bar or year to see its rounds.
- **Investors:** the top eight companies and investors. Select a participant to open its graph connections. Investor rankings show linked round totals, not cheque sizes.
- **Rounds:** source-linked records with search, date/amount sorting, fourteen-row pagination and CSV export. A selected slice has one Clear control. Totals follow the displayed records; exports include all matches, not just the current page.

Year and Region filters are always visible. Reset appears only after a filter changes. The default methodology compares the same month/day cutoff across years and excludes low-confidence events, debt, mixed funding, upper bounds and commitments. Region/sector bars use proportional lengths. Detailed coverage and methodology are available in the footer.

The interface removes instructional banners, the large question navigation cards, country/confidence controls, research toggles, expanded rankings, duplicate slice totals and extra graph buttons. Funding records and ranking rows remain the path to the graph and original evidence. No dataset changes are made by this redesign.

## Validation and previews

```bash
python3 -m unittest discover -s tests -q
python3 scripts/refresh_platform.py
cd web
npm test
npm run build
```

The full local refresh validates the inputs, processes complete structured funding evidence, rebuilds the graph and growth metrics, and publishes evidence-health status. `--discover` additionally polls public RSS feeds. Optional source failures produce a degraded discovery report; a required validation/build failure stops the pipeline.

Browser checks cover three tabs, two filters, region/sector and year slices, source search and sorting, full CSV export, pagination, participant graph links, filter reset, light/dark themes and overflow at 1440px desktop and 390px mobile. See [desktop preview](screenshots/analytics-desktop.png), [mobile preview](screenshots/analytics-mobile.png), and [dark preview](screenshots/analytics-dark.png).

The live RSS check on 2026-10-12 succeeded for five of six configured feeds and appended seven unreviewed discovery candidates. VentureBeat returned HTTP429. These candidates are not verified mega-round funding events and do not enter funding totals. After the source-verified Apptronik backfill, the core evidence contains 214 funding events, with unresolved source-recheck and investor-metadata gaps recorded in the health report.
