# Asking about connections across the graph

Ask defaults to **Across the graph**. Name a company or investor in the question; the server searches the published snapshot rather than relying on the current viewport. **Current view only** preserves the selected-entity and visible-neighborhood behavior. View filters do not restrict a broader search.

Example:

> Who backs Nebius, what other companies have those investors backed, and which partnerships might make sense? Separate funding evidence from partnership hypotheses and cite the sources.

The server resolves exact entity labels without case or punctuation sensitivity. If the question names no entity, it checks the last two user messages, then the selected company/investor. A selected funding round resolves to its company. It walks company → funding round ← investor → other funding round ← other company. Investor questions retrieve that investor's funding portfolio directly. Generic location/domain hubs are not treated as investment connections.

Only published server data supplies evidence. Browser-provided amounts, sources and links cannot override it. Both funding rounds and their source URLs accompany the path. Low-confidence rounds are excluded from expansion. The server limits retrieval to six matched entities, eighty paths and 220 retrieved nodes, then admits limited visible context. Required path edges are prioritized. Retrieval is distributed across investors; truncation is disclosed to the model. Large portfolios therefore may remain partial even within this sample.

A shared investor is an observed relationship, not proof of a commercial partnership, an investor introduction or a higher partnership probability. Ask must label potential partnerships as hypotheses, explain the fit using documented domains/products, and identify the commercial evidence needed to validate them. Round totals are not individual investor cheque sizes. Conversation history is not an independent source of graph facts.

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem. Portfolio lists omit investments outside the dataset and source rechecks remain incomplete. An absent connection is not proof that no investment or partnership exists. Canonical investor names may group disclosed affiliates; inspect the original source before treating parent and investment-arm identities as interchangeable. Ask does not browse live websites or establish current partnership status.

## Verified example and checks

The checked-in snapshot resolves Nebius from a different selected company and returns 64 funding paths: 41 via NVIDIA, 22 via Accel and one via Orbis. These are event paths, not 64 distinct companies or 64 partnerships. Orbis has no other portfolio company recorded here; its actual portfolio is not established by that absence.

Regression tests cover named entities outside the viewport, explicit current-view scope, follow-ups, funding-round selection, name boundaries, forged browser evidence, low-confidence exclusion, fair bounded retrieval and complete retained paths. Browser checks cover the scope selector, example prompt, posted scope, and desktop/mobile Ask layout with local stub responses. They do not verify deployed Render inference or partnership predictions.
