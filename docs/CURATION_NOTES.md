# Dataset Curation Notes

## Current Curation Standard

The dataset is intended as a curated evidence layer for a knowledge graph, not as a complete market census. A row should be included only when it has:

- AI-native or AI-infrastructure relevance;
- documented headquarters / primary company identity and region assignment;
- a 2024, 2025, or 2026 funding event;
- an amount of at least USD 100M or equivalent;
- a public source confirming amount, timing, and at least one investor.

## Source Quality

Preferred source order:

1. Company press release or official announcement.
2. Reuters or comparable business news.
3. TechCrunch, Sifted, CNBC, Tech.eu, EU-Startups.
4. Crunchbase, Dealroom, or aggregated datasets only as seed material.

The current dataset now prioritizes event-specific source URLs for newly added European rounds. Some earlier US rows still use TechCrunch's curated mega-round lists; these are acceptable for prototype analysis but should be upgraded with event-specific sources where possible before final claims.

## Ambiguous Inclusion Choices

- `OpenAI` is included because it is a private AI company and strongly shapes investor concentration, even though it is more mature than most startups.
- `Poolside` is assigned to Europe because the company publicly emphasizes Paris as a headquarters / major base, despite having a US footprint.
- `ElevenLabs` is assigned to Europe because of its London origin and European company identity, despite major US operations.
- `Isomorphic Labs` is included as an AI-first drug design company spun out of Google DeepMind; it is Alphabet-backed but operates as a separate company with external venture funding.
- `Quantexa` is included as an applied AI / decision intelligence company because its product and public funding announcement center on AI/data analytics. It is not a frontier model company.
- `2026` must be labelled as partial-year data in analysis outputs.
- `OpenAI` remains included after its 2026 funding round for consistency with earlier OpenAI rows. If the final report wants a stricter "startup-only" lens, OpenAI should be excluded from all years, not only 2026.
- `Merge Labs` is included as an AI/neurotechnology company because public reporting frames the product as a brain-AI interface and AI operating system. It is a borderline case and should be called out if used in domain-level healthcare analysis.
- `Shield AI` 2026 includes only the USD1.5B Series G equity round. The separate USD500M fixed-return preferred equity financing is excluded to avoid mixing equity venture rounds with structured financing.
- IPOs and public-market offerings, such as Cerebras' 2026 IPO, are excluded because the dataset is about private funding rounds.
- `ClickHouse` is included as AI infrastructure rather than an AI-native model company. The inclusion is justified by its 2025 and 2026 funding announcements, which explicitly position the company around AI/ML infrastructure, agent-facing data workloads, and LLM observability.
- `Databricks`, `Vultr`, `Render`, and `ClickHouse` are included as AI infrastructure / data infrastructure companies rather than AI-native model companies. Their inclusion should be interpreted as part of the AI stack analysis, not as evidence that they are frontier AI labs.
- `Crusoe`, `Baseten`, `Fireworks AI`, `PaleBlueDot AI`, and `Inferact` were added in the AI infrastructure pass because their funding announcements are explicitly tied to AI cloud, inference, compute, or model-serving infrastructure.
- `Black Forest Labs` is included as a European creative / generative media AI company because its USD300M Series B is above the threshold and its FLUX models are directly part of the generative AI landscape.
- `Nebius` is included after review because the dataset already includes comparable AI cloud and infrastructure companies such as CoreWeave, Nscale, Crusoe, and ClickHouse.
- `Glean`, `Perplexity`, and similar enterprise/search AI companies are included under `Search / Knowledge Agents` when a single funding event exceeds USD100M.
- `Abridge` and `Hippocratic AI` are included as healthcare AI because their funding rounds are explicitly tied to clinical AI assistants, documentation, or patient-facing healthcare agents.
- `FieldAI` is left in candidate review rather than imported because available public reporting describes USD405M across two rounds; importing it would require a clean per-round split.
- `Cognition`, `Augment`, `Magic`, and similar companies are grouped under `Coding Agents / Developer Tools` because their products are AI coding agents or coding assistance systems.

## Rows To Review Before Final Analysis

- Earlier rows with `source_type=techcrunch` and source URLs pointing to annual mega-round lists should be checked against event-specific articles or company releases.
- Investor lists for the very largest rounds can be incomplete when public reports mention "more than N investors" without naming all of them.
- `amount_usd` for EUR rounds uses approximate reported conversions or contemporaneous rounded conversions. Do not use these values for fine-grained financial accounting.
- Some rounds intentionally have no `lead_investors` value because the public source names backers or participants but does not clearly disclose a lead or co-lead. As of the current dataset, this applies to xAI 2024 Series B, xAI 2024 strategic round, Safe Superintelligence 2024 seed, Physical Intelligence 2024 Series A, Figure AI 2024 Series B, xAI 2026 Series E, World Labs 2026 funding round, and H Company 2024 seed.
- The repo now includes `docs/COVERAGE_AUDIT.md`, which records likely missing in-scope candidates and global candidates. Treat that audit as a work queue, not as imported evidence.
- The OpenAI 2026 row should be reverified before final quantitative claims because public reporting may mix equity financing, secondary sales, strategic commitments, and infrastructure commitments.
- Israeli, Chinese, UAE / Gulf, and other non-US/non-European companies may be imported now that the research question and region model support global coverage, but only after the same event-level evidence checks used for every imported row.
- Strategic state, corporate, infrastructure, or acquisition-linked AI transactions should be marked clearly in `round_type` and `notes` so they are not interpreted as ordinary venture rounds.

## Recommended Freeze Criteria

Before treating the dataset as final for the portfolio:

- no validation errors;
- no missing investor fields;
- all top recurring investors normalized;
- enough rounds per compared region to support meaningful regional comparison, for example at least 20 for US and Europe and clearly labelled smaller samples for Israel, China, UAE / Gulf, or other regions until coverage improves;
- source URL present for every row;
- confidence distribution dominated by `high` and `medium`, with no `low` rows in final import.
