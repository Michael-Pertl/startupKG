# Exploring AI mega-round funding

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem. Regional samples are uneven. Export time is not a coverage cutoff.

## Using Analytics

Analytics is organized around four questions, with shared totals and filters:

1. **Where does funding go?** Compare regions, countries and AI sectors. The short answer identifies the leading group and its share of this sample. Select a bar, then view its funding evidence or explore the corresponding graph node.
2. **Who is involved?** Rank companies and investors, with a toggle between the top eight and all participants. Select a participant to open its graph connections. Investor volume is the sum of associated rounds, not a disclosed investor cheque or an allocation of the round amount.
3. **How is funding changing?** Compare annual reported funding, round counts, companies, median round sizes and top-five shares. A summary compares the latest two selected years when the earlier year has funding. Select a year bar to inspect its evidence.
4. **What supports the numbers?** Search source-linked funding records by company, investor, country, domain, date or round name. Sort by amount or date, paginate fourteen records at a time, and export all matching records with amount basis, confidence, investors and source URLs. Search affects records and export; the totals continue to describe the evidence scope. Clear selection removes a region, sector or year slice.

Open **Refine this view** to choose years, regions, countries, sectors and confidence. The default compares the same month/day cutoff in each year and excludes debt, mixed primary/secondary funding, upper bounds and commitments. These controls apply to all four question views. Excluding the largest round per year reveals its influence. Reset view restores the default filters and research settings. Low-confidence events are always excluded from quantitative totals.

The coverage cutoff remains visible at the top. **Understand the scope and evidence quality** opens the coverage report, source recheck status and regional limitations. Dates reflect available funding evidence, not a claim of complete real-time coverage. The design uses the graph's shared light/dark theme tokens and adapts to narrow screens.

## Validation and previews

```bash
python3 -m unittest discover -s tests -q
python3 scripts/refresh_platform.py
cd web
npm test
npm run build
```

The full local refresh validates the inputs, processes complete structured funding evidence, rebuilds the graph and growth metrics, and publishes evidence-health status. `--discover` additionally polls public RSS feeds. Optional source failures produce a degraded discovery report; a required validation/build failure stops the pipeline.

Browser checks for the redesigned page covered all four question views, sector and year slices, evidence search, CSV download, pagination, full rankings, research controls, graph navigation, and light/dark themes. Desktop was checked at 1440 pixels and mobile at 390 pixels without analytics overflow. See [desktop preview](screenshots/analytics-desktop.png), [mobile preview](screenshots/analytics-mobile.png), and [dark preview](screenshots/analytics-dark.png).

The live RSS check on 2026-10-12 succeeded for five of six configured feeds and appended seven unreviewed discovery candidates. VentureBeat returned HTTP429. These candidates are not verified mega-round funding events and do not enter funding totals. After the source-verified Apptronik backfill, the core evidence contains 214 funding events, with unresolved source-recheck and investor-metadata gaps recorded in the health report.
