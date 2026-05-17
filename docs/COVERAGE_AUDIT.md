# Coverage Audit

Last reviewed: 2026-05-16

## Summary

The current graph dataset is useful for prototype network analysis, but it is not a complete census of AI mega-round funding from 2024 to 2026.

The strongest currently measured coverage gap is still the US side. TechCrunch's public AI mega-round trackers report 49 US AI startups with USD 100M+ rounds in 2024 and an updated 55 US AI startups with USD 100M+ rounds in 2025, while the current raw table has 31 US events for 2024 and 31 US events for 2025. Similar audits still need to be expanded for Europe, Israel, China, UAE / Gulf, Canada, India, Singapore, and other global AI hubs.

Europe and non-US regions are more manually curated and should be treated as selected evidence sets until region-specific audits are complete. The 2026 data is partial-year data and must not be compared with full-year 2024 or 2025 totals without this caveat.

## Current Raw Dataset Counts

| Year | US | Europe | China | Israel | Canada | UAE / Gulf | Singapore | Other Global |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 31 | 8 | 4 | 1 | 2 | 1 | 0 | 1 |
| 2025 | 31 | 15 | 0 | 4 | 1 | 0 | 0 | 0 |
| 2026 | 30 | 8 | 1 | 1 | 0 | 0 | 1 | 0 |

The raw validator passes for 140 rows. Confidence distribution is 55 high-confidence rows and 85 medium-confidence rows, with no low-confidence rows.

## In-Scope Candidate Gaps

The following companies or rounds appear in public seed sources but are not currently represented in `data/raw/funding_events_raw.csv`. They should be reviewed event by event before import:

- US 2024 candidates from TechCrunch's 2024 tracker still needing review include Roon, Bright Machines, Cradle, Decagon, Darktrace, AlphaSense, and other lower-confidence or borderline rows.
- US 2025 candidates from TechCrunch's updated 2025 tracker still needing review include Decagon, Goodfire, Peregrine, and additional rounds for companies already partly represented in the graph such as Anysphere/Cursor, Lambda, Together AI, Runway, Mercor, Fireworks AI, Fal, and LMArena.
- US 2026 candidates from TechCrunch's 2026 tracker: Simile, Decagon, Goodfire, OpenEvidence, Arena, and Flapping Airplanes.

Some of these names may later be excluded because they are outside the AI-native / AI-infrastructure definition, have unclear headquarters / primary operating identity, or represent total funding rather than a single qualifying round.

## Global Regions To Review

The project scope has been widened to support global AI mega-round coverage. Israeli, Chinese, UAE / Gulf, Canadian, Indian, Singaporean, and other non-US/non-European companies may be imported when they meet the same evidence standard as every other row.

Promising AI-related companies outside the current imported rows should be tracked as global candidates before import. Examples already imported in the global expansion include:

- AI21 Labs, Decart, Hailo, Dream Security, Majestic Labs, and Wonderful from Israel.
- MiniMax, Moonshot AI, Baichuan AI, and Zhipu AI from China.
- Cohere and Tenstorrent from Canada.
- G42 from UAE / Gulf as a strategic AI infrastructure investment.
- Sakana AI from Japan under `Other Global`.
- EPG Singapore as AI infrastructure.

Remaining watchlist / review examples include:

- Wonderful 2025 Series A, because the imported row currently covers the 2026 Series B.
- Amity, Southeast Asia: reported USD100M enterprise AI-adjacent round that needs classification review.
- Sarvam AI, India: watchlist item because current reporting describes a possible USD300M-350M raise rather than a clearly closed round.

Global candidates should continue to be promoted only after event-level verification before they are moved into `funding_events_raw.csv`.

## OpenAI 2026 Note

The current raw table includes an OpenAI 2026 growth round with `amount_usd=110000000000`. The official OpenAI announcement says it is "$110B in new investment" and names SoftBank, NVIDIA, and Amazon. Keep a note in the final report that this is a strategic mega-financing round tied to compute partnerships, so it is not directly comparable to a conventional venture Series B/C round.

## Recommended Next Steps Before Final Claims

1. Import missing in-scope US 2024 and 2025 candidates only after confirming event-specific amount, date, investor, and source URL.
2. Expand the Europe, Israel, China, UAE / Gulf, Canada, India, Singapore, and Other Global audits using regional publications, Reuters, company announcements, and official filings.
3. Promote global candidates into the raw funding table only after confirming amount, date, investor, country, region, and source URL.
4. Replace broad tracker URLs with event-specific sources for the most important US rows.
5. Treat 2026 as partial-year data in all charts, Cypher result exports, and written conclusions.
