# GitHub Workflow

This repository should use a simple trunk-based workflow with short-lived
branches, pull requests, automated checks, and protected secrets.

## Branches

- `main` is the stable branch.
- Do not commit directly to `main` after the initial project setup.
- Create one short-lived branch per change:
  - `feature/<short-description>`
  - `fix/<short-description>`
  - `docs/<short-description>`
  - `data/<short-description>`
  - `chore/<short-description>`
- Keep branches focused. A UI change, data enrichment, and pipeline refactor
  should normally be separate pull requests.

Examples:

```bash
git switch main
git pull --ff-only
git switch -c feature/analytics-market-lens
```

## Commits

Use small, reviewable commits with imperative messages.

Good examples:

```text
Add configurable analytics market lens
Fix graph drawer overlap on narrow screens
Document source confidence workflow
Update funding events for 2026 AI rounds
```

Avoid vague messages such as:

```text
updates
final changes
stuff
```

## Pull Requests

Every non-trivial change should go through a pull request.

A good pull request should include:

- what changed;
- why it changed;
- screenshots or screen recordings for UI changes;
- data-source notes for dataset changes;
- validation commands run locally;
- known limitations or follow-up work.

Recommended PR checklist:

```markdown
## Summary
- 

## Validation
- [ ] `python3 -m unittest discover -s tests`
- [ ] `cd web && npm run build`
- [ ] Data sources reviewed when changing `data/raw/`

## Notes
- 
```

## Reviews

- Prefer at least one review before merging important changes.
- Review for correctness, source quality, maintainability, and user impact.
- For data changes, reviewers should check that every funding event has a
  public source URL, amount, date/year, investor evidence, and confidence level.
- For UI changes, reviewers should check desktop and narrow viewport behavior.
- Address review comments with follow-up commits instead of force-overwriting
  reviewer context.

## Merging

- Keep `main` releasable.
- Use squash merge for small feature branches unless commit history is
  intentionally meaningful.
- Rebase or merge `main` before merging if the branch is stale.
- Delete remote branches after merge.
- Do not force-push to `main` except for deliberate repository recovery, and
  only after confirming the impact.

## Required Local Checks

Run these before opening or merging a PR:

```bash
python3 -m unittest discover -s tests
cd web
npm run build
```

For data pipeline changes, also run:

```bash
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/build_app_graph.py
```

## CI Expectations

GitHub Actions should eventually enforce:

- Python tests;
- raw data validation;
- React TypeScript build;
- linting/format checks once configured;
- a secret scan or GitHub secret scanning alerts.

No PR should be merged while required checks are failing.

## Secrets

- Never commit API keys, tokens, `.env.local`, or private credentials.
- Store local secrets in `web/.env.local`.
- Keep only safe templates such as `web/.env.example` in Git.
- If a secret is accidentally committed, rotate it immediately and remove it
  from Git history before treating the repository as clean.

Current relevant ignore rules:

```text
web/.env
web/.env.*
!web/.env.example
```

## Data Governance

This project depends on source-backed market data. Dataset changes need stricter
review than normal UI changes.

For each new funding event, verify:

- company is AI-native or AI-infrastructure-related;
- amount is at least USD 100M or equivalent when used in mega-round analysis;
- date/year is present;
- at least one investor is present;
- public source URL is present;
- confidence is assigned consistently.

Do not use private, paywalled, or unsourced data as primary evidence.

## Releases

Use GitHub releases or tags when a stable project milestone is ready.

Suggested tag format:

```text
v0.1.0
v0.2.0
```

Each release should summarize:

- dataset coverage;
- app capabilities;
- known limitations;
- validation commands;
- major screenshots or demo links where relevant.

## Issue Tracking

Use GitHub issues for work that should not be lost.

Recommended labels:

- `data`
- `frontend`
- `graph`
- `pipeline`
- `docs`
- `bug`
- `enhancement`
- `research`

Keep issues concrete and outcome-oriented.

