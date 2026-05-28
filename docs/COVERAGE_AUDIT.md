# Coverage Audit

Last reviewed: 2026-05-26

## Summary

The current graph dataset is useful for prototype network analysis, but it is not a complete census of worldwide AI startup funding from 2024 to 2026.

The dataset now intentionally targets AI mega-rounds: publicly reported funding events of USD 100M or more. That is a defensible threshold for analysing investor concentration and domain-level capital shifts, but it is too high for a claim that the graph represents the whole AI ecosystem. Smaller startup formation, seed rounds, public-company AI spend, university labs, open-source ecosystems, and sub-USD100M regional companies remain out of scope.

US coverage has been expanded against TechCrunch's public AI mega-round trackers. Europe and non-US regions are still more manually curated and should be treated as selected evidence sets until region-specific audits are complete. The 2026 data is partial-year data as of 2026-05-26 and must not be compared with full-year 2024 or 2025 totals without this caveat.

## Current Raw Dataset Counts

| Year | US | Europe | China | Israel | Canada | UAE / Gulf | India | Singapore | Other Global |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024 | 52 | 8 | 4 | 1 | 2 | 1 | 0 | 0 | 1 |
| 2025 | 63 | 15 | 0 | 5 | 1 | 0 | 1 | 0 | 0 |
| 2026 | 28 | 9 | 1 | 1 | 0 | 0 | 0 | 1 | 0 |

The raw validator passes for 194 funding events. Confidence distribution is 55 high-confidence rows and 139 medium-confidence rows, with no low-confidence rows. The processed graph currently contains 155 startups, 476 investors, and 1,067 investor-round participations.

## In-Scope Candidate Gaps

The following companies or rounds appear in public seed sources but are not currently represented in `data/raw/funding_events_raw.csv`. They should be reviewed event by event before import:

- Higgsfield AI, 2026 US: reported USD100M+ total Series A / extension; needs single-round amount and investor review before import.
- Amity, 2026 Southeast Asia: reported USD100M enterprise AI-adjacent round; needs country/region and AI-native classification review.
- Reliance-Meta AI JV, 2025 India: useful as an AI market event, but likely not a startup funding round for the core graph.
- Sarvam AI, 2026 India: watchlist item because current reporting describes a possible USD300M-350M raise rather than a clearly closed round.

Some of these names may later be excluded because they are outside the AI-native / AI-infrastructure definition, have unclear headquarters / primary operating identity, or represent total funding rather than a single qualifying round.

## Global Regions To Review

The project scope has been widened to support global AI mega-round coverage. Israeli, Chinese, UAE / Gulf, Canadian, Indian, Singaporean, and other non-US/non-European companies may be imported when they meet the same evidence standard as every other row.

Promising AI-related companies outside the current imported rows should be tracked as global candidates before import. Examples already imported in the global expansion include:

- AI21 Labs, Decart, Hailo, Dream Security, Majestic Labs, and Wonderful from Israel.
- MiniMax, Moonshot AI, Baichuan AI, and Zhipu AI from China.
- Cohere and Tenstorrent from Canada.
- G42 from UAE / Gulf as a strategic AI infrastructure investment.
- Krutrim from India.
- Sakana AI from Japan under `Other Global`.
- EPG Singapore as AI infrastructure.
- Axelera AI from the Netherlands under Europe.

Remaining watchlist / review examples include:

- Amity, Southeast Asia: reported USD100M enterprise AI-adjacent round that needs classification review.
- Reliance-Meta AI JV, India: strategic AI joint venture candidate, but not a conventional startup round.
- Sarvam AI, India: watchlist item because current reporting describes a possible USD300M-350M raise rather than a clearly closed round.

Global candidates should continue to be promoted only after event-level verification before they are moved into `funding_events_raw.csv`.

## OpenAI 2026 Note

The current raw table includes an OpenAI 2026 growth round with `amount_usd=110000000000`. The official OpenAI announcement says it is "$110B in new investment" and names SoftBank, NVIDIA, and Amazon. Keep a note in the final report that this is a strategic mega-financing round tied to compute partnerships, so it is not directly comparable to a conventional venture Series B/C round.

## Recommended Next Steps Before Final Claims

1. Expand the Europe, Israel, China, UAE / Gulf, Canada, India, Singapore, and Other Global audits using regional publications, Reuters, company announcements, and official filings.
2. Promote global candidates into the raw funding table only after confirming amount, date, investor, country, region, and source URL.
3. Replace broad tracker URLs with event-specific sources for the most important US rows.
4. Treat 2026 as partial-year data in all charts, Cypher result exports, and written conclusions.
5. Keep final claims scoped to curated public AI mega-rounds, not the complete AI startup ecosystem.
