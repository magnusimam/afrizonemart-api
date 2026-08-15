# Afrizonemart — Algorithm Systems Development Tracker

> Living document. Tick each checkbox as we design + implement. Under every
> item we'll log **what we actually built, when, where the code lives, and
> what data/model it depends on** — same discipline as
> `afrizonemart-v2/ARCHITECTURE_TRACKER.md`, scoped to the algorithmic /
> ML-ish systems catalogued in the source doc below.
>
> Source: `Afrizonemart_Algorithm_Systems.docx` (Magnus, 2026-08-11) —
> "Core Algorithm Systems for the Platform," an engineering reference of the
> algorithmic capabilities required to run a competitive Made-in-Africa
> marketplace: discovery, delivery, pricing, inventory, trust, growth, and
> platform intelligence.
>
> **Workflow**: this file is stubbed with every system from the source doc,
> ungated. Magnus is sending a detailed spec per algorithm as we get to it —
> when one lands, expand that system's entry with the spec's design (data
> inputs, model/heuristic approach, success metric, rollout plan), link the
> PR(s) once shipped, and flip the status. Don't build ahead of a spec unless
> explicitly told to — several of these (pricing, fraud, credit scoring) have
> real business-rule and compliance surface that needs Magnus's sign-off
> before code, not just an engineering guess.
>
> Status legend: `[ ]` not started · `[~]` in progress / partially shipped ·
> `[x]` shipped and live
>
> Phase legend (from the source doc's Recommended Build Sequence — not every
> system was explicitly sequenced; unsequenced ones are marked `TBD`, to be
> slotted in as specs arrive): **P1** launch · **P2** scale · **P3** data-rich

---

## Why this ordering (per the source doc)

We do not need every system at launch. Priority follows **revenue/cost
impact** first, and **data availability** second (the data flywheel — some
systems are literally impossible before we have transaction volume).

| Phase | Priority systems | Why first |
|---|---|---|
| **P1 — Launch** | Search relevance; basic recommendations (strong cold-start); fraud detection; demand forecasting; delivery routing | Highest immediate impact on revenue and cost; makes the catalogue usable and the delivery promise deliverable |
| **P2 — Scale** | Dynamic & multi-currency pricing; price-matching; inventory allocation; supplier scoring; segmentation & churn; A/B testing | Protects margin and retention once volume grows across hubs and markets |
| **P3 — Data-rich** | Thin-file credit scoring; advanced personalization; loyalty optimization; origin verification; auto-tagging & moderation | Requires accumulated transaction data; unlocks financing and deeper defensibility (the moat) |

The financing/credit-scoring and advanced-personalization systems land last
by necessity (need data volume) — but per Magnus's doc, they're also where
the strongest, hardest-to-copy defensibility comes from. Don't deprioritize
them out of the plan entirely once P1/P2 are stable.

---

## 1. Discovery & Recommendations

Drives product findability and basket size — the core levers of e-commerce
revenue.

- [~] **Product recommendation engine** (P1, cold-start variant) — hybrid
      collaborative-filtering + content-based model powering "customers also
      bought" and "you may like." **System 2 of the algorithm roadmap** —
      full design in
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx`
      (Magnus, 2026-08-15). Also covers Related/similar products and
      Trending & popularity ranking (below) — same spec, same build,
      Phase 0 covers both.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): Phase 0 — `afrizonemart-api` #82 (backend) ·
      `afrizonemart-v2` #142 (web frontend) · `afrizonemart-mobile` #83
      (mobile frontend). Phase 1 — `afrizonemart-api` #83 (backend) ·
      frontend PRs pending ·
      Notes: Phase 0 shipped — "similar products" (content-based
      weighted score: category/brand/origin/price-band + quality
      tie-breaker, since there's no embedding space to reuse yet — see
      the deliberate-substitution note in the sub-checklist) and
      "trending near you" (existing view-count trending + hard
      deliverability filter, wrapped in the new module). Phase 1
      shipped (backend) — co-purchase ("customers also bought",
      "frequently bought together") and co-view ("viewed also viewed"),
      all three with graceful degradation to the Phase 0 content-based
      retriever when interaction data is thin. See sub-checklist.

      **Sub-checklist** (from the spec's Implementation Roadmap,
      Section 18 — phase timelines are relative effort, not dates):

      _Phase 0 — Foundation_
      - [x] Candidate generation — content-similarity retriever
            (weighted score, `modules/recommendations/repository.ts:
            similarProducts`) + popularity retriever (wraps the
            existing `views/service.ts:getTrendingProductIds`,
            `modules/recommendations/repository.ts:trendingNearYou`).
            *(Substitutes the spec's embedding-similarity retriever —
            see deliberate-substitution note below.)*
      - [x] Business & diversity layer, Phase-0 slice — hard
            deliverability filter (`sellableCountries`/`origin` vs.
            viewer country, same predicate Search's `shipsToMe` uses
            but always-on here per spec Section 9, not opt-in) +
            in-stock-only + seed self-exclusion. Category diversity
            injection, exploration budget, and bounded
            verified-origin/private-label boosts are not built — Phase
            1+/3 per the module table.
      - [x] Recommendations API — `GET /api/recommendations/similar`,
            `GET /api/recommendations/trending`,
            `POST /api/recommendations/click`. One contract, same
            shape as `/api/search`'s response envelope.
      - [x] Impression logging — new `RecommendationImpression` model
            (module/surface/seedProductId/productIds/country/
            clickedProductId), same append-only + first-click-wins
            pattern as `SearchQueryLog`. Migration
            `20260815120000_recommendations_phase0`, dry-run-validated
            against prod (rolled back transaction) before merge.
      - [x] **Web frontend** (`afrizonemart-v2` #142) — PDP "You May
            Also Like" (`RelatedProducts`/`getRelatedProducts`) and the
            cart page's cross-sell section both switched from the old
            same-category-sorted-by-newest naive query to the real
            `GET /api/recommendations/similar`. New home page section
            "Trending Near You" (`TrendingNearYouSection`, server
            component, `no-store`) — this surface didn't exist on web
            before. No viewer-country resolution exists yet on the web
            frontend (no geo/shipping-country cookie), so these calls
            don't pass `country` — degrades to unfiltered-by-
            deliverability until that context-resolution piece is
            built.
      - [x] **Mobile frontend** (`afrizonemart-mobile` #83) — PDP
            "You may also like" rail (`PdpRelatedRail`) switched from
            same-category `sort=trending` to the real
            `GET /api/recommendations/similar`; the same-origin "More
            from `<Country>`" rail deliberately kept on its original
            query (distinct browse-by-origin concept, not part of the
            Phase 0 similarity module). Home's `ForYouFeed` (bottom-of-
            Home "For You" section — despite the name, it was always
            generic trending, never personalized) switched from raw
            `/api/products?sort=trending` to
            `GET /api/recommendations/trending`; dropped its "Load
            more" pagination since a recommendation module serves a
            bounded ranked batch, not a paginated catalog crawl.
      - [ ] p95 < 150ms verified under real load — not yet measured
            (no production traffic on the new endpoints yet).
      - [ ] Catalogue coverage (> 80% target) — not yet measured.

      _Phase 1 — Co-visitation (Weeks 4–8 per spec)_
      - [x] Co-purchase / co-view — live-queried at request time
            (`modules/recommendations/repository.ts:coPurchase` self-
            joins `OrderItem` on `orderId`; `viewedAlsoViewed`
            self-joins `ProductView` on session/user within a 90-day
            window), not a precomputed batch table. Substitution note:
            spec Section 5.2 calls for nightly/periodic batch jobs
            precomputing co-visitation tables — deferred until real
            data volume makes the live self-join too expensive; the
            current catalogue/order volume doesn't need it yet. Revisit
            if `also-bought`/`frequently-bought-together`/
            `viewed-also-viewed` query latency becomes a problem.
      - [x] "Customers also bought" (product page) —
            `GET /api/recommendations/also-bought`.
      - [x] "Frequently bought together" (cart/checkout) —
            `GET /api/recommendations/frequently-bought-together`,
            seeded by every product already in the cart (not just the
            last item added). Cart page's cross-sell section switched
            from the Phase 0 "similar" placeholder to this.
      - [x] "Viewed also viewed" (co-view, distinct from content
            similarity) — `GET /api/recommendations/viewed-also-viewed`.
      - [x] Graceful degradation (spec Section 3.1) — all three pad
            with the Phase 0 content-based `similarProducts` retriever
            when co-purchase/co-view data is thin. Confirmed necessary,
            not theoretical: tested against real prod order data and
            found most products have zero co-purchase signal today
            (multi-item orders are still rare this early) — without the
            pad, "Customers also bought" would render empty on most
            PDPs.

      _Phase 2 — Personalization (Weeks 9–14 per spec)_
      - [ ] User profile (affinities: category/brand/origin/price-band,
            recency, purchase cadence) — not started.
      - [ ] Real "For You" home feed (ranked by *this* user's profile,
            not just broad trending) — not started. Mobile's
            `ForYouFeed` keeps its name/position for this future swap
            per its own in-code note, but is trending-only today.
      - [ ] "Recently viewed / continue" — not started (there is a
            `ProductView` log to build it from once prioritized).
      - [ ] Personalized ranking layer on top of candidate generation —
            not started.

      _Phase 3 — Advanced (Weeks 15–20 per spec)_
      - [ ] Collaborative filtering / sequence models — not started.
      - [ ] Reorder / replenishment recommender (purchase-cycle
            prediction) — not started. Flagged in the spec as
            unusually valuable for Afrizonemart's FMCG/fast-delivery
            model.
      - [ ] Bandit-based exploration + guaranteed new-item exposure
            caps — not started (ties to "Cold-start recommendations"
            below — Phase 0's content-bootstrap already gives new
            products a fair shot via the similarity/trending
            retrievers since neither requires interaction history, but
            there's no explicit exploration budget or exposure
            guarantee yet).

      _Phase 4 — Cross-channel (ongoing per spec)_
      - [ ] Email/push recommendations — not started.
      - [ ] Diversity & coverage optimization as an ongoing tuning loop
            — not started (coverage isn't measured yet at all, see
            Phase 0 exit criteria above).

      _Cross-cutting / not phase-specific_
      - [ ] Offline evaluation (Recall@k, hit-rate, NDCG per module) —
            not started.
      - [ ] Online A/B testing (CTR, attach rate, AOV lift,
            rec-attributed revenue) — not started.
      - [ ] Attribution windows (click-through vs. view-through)
            defined — not started; `queryLogId`-style
            `impressionId`/`clickedProductId` plumbing exists to
            support it once windows are defined.

      **Deliberate substitution** (same call as Search Phase 0): the
      spec's Component 1 (Section 7) specifies a content-similarity
      retriever built on shared product embeddings + an OpenSearch k-NN
      index. Neither exists — Search Phase 0 shipped on Postgres
      full-text instead of embeddings, so there's no vector space to
      reuse yet. "Similar products" here is a transparent weighted-
      scoring retriever instead (category/brand/origin/price-band +
      quality tie-breaker) — exactly the "keep a transparent
      weighted-scoring fallback ... as the lightweight first-pass
      stage" the spec itself prescribes for cold conditions (Section
      8), just promoted to the *primary* Phase 0 method rather than a
      fallback behind a model that doesn't exist yet. Revisit once
      Search grows real embeddings (its own Phase 2) — Recommendations
      Phase 1+ candidate generation can then reuse the same vector
      index Search would be building for itself, per the spec's own
      "reuse, don't rebuild" principle (Section 5.1/15).
- [ ] **Personalized homepage / for-you ranking** (TBD) — per-user feed
      ordered by browsing, purchase, and location history. Phase 2 of
      System 2 above (Recommendations & Personalization) — see that
      entry's sub-checklist. Not started; mobile's `ForYouFeed` is
      trending-only today despite the name.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): _none yet_ · Notes: _none_
- [~] **Search ranking & relevance** (P1) — query understanding, typo
      tolerance, and multilingual matching across our 100+ supported
      languages. **System 1 of the algorithm roadmap** — full design in
      `Afrizonemart_Search_Discovery_Design_Spec.docx` (Magnus,
      2026-08-11). Also covers Autocomplete (below) — same spec, same
      build, Section 12.
      Design doc: `Afrizonemart_Search_Discovery_Design_Spec.docx` ·
      PR(s): `afrizonemart-api` #79, #80 (backend) ·
      `afrizonemart-v2` #141 (frontend) ·
      Notes: Phase 0 shipped as **Postgres-native** full-text search
      (generated `tsvector` + GIN index + `pg_trgm`), not OpenSearch —
      deliberate substitution to ship without provisioning a new
      cluster; revisit OpenSearch specifically when Phase 2 needs real
      vector/ANN storage for semantic retrieval. See sub-checklist.

      **Sub-checklist** (from the spec's Implementation Roadmap,
      Section 17 — phase timelines are relative effort, not dates):

      _Phase 0 — Foundation_
      - [x] Search index — Postgres generated `tsvector` column
            (field-weighted: name A / brand B / shortDescription C /
            description D, `'simple'` config) + GIN index. Migration
            `20260811120000_search_phase0`. *(Substitutes the spec's
            "search engine cluster" line — see note above.)*
      - [x] Event-driven catalogue sync — `product.created` /
            `product.updated` / `product.deleted` events added to
            `eventBus` and emitted from every admin product write path
            (single + bulk). Not consumed by anything yet: Postgres's
            generated column self-maintains today, so this is
            groundwork for Phase 2's real indexing pipeline, not a
            live dependency.
      - [x] BM25-equivalent keyword search — `ts_rank_cd` over the
            tsvector, `modules/search/repository.ts:lexicalSearch`.
      - [ ] Facets — filtering is wired (reuses the exact shop-filter
            contract: category+descendants, origin, price, rating,
            inStock, onSale, shipsToMe/country) but there's no
            computed facet-*count* aggregation (e.g. "Electronics
            (42)") yet. Not started.
      - [x] Basic autocomplete — query completions (mined from
            `SearchQueryLog`) + product/category jumps (trigram +
            prefix match), `GET /api/search/autocomplete`.
      - [x] Query logging — `SearchQueryLog` model, written on every
            search; `POST /api/search/click` for downstream CTR once
            the frontend wires it in.
      - [x] **Frontend** (`afrizonemart-v2` #141) — header `SearchBar`
            (mobile + desktop) with a debounced autocomplete dropdown,
            SafeBoundary-wrapped with a plain-form fallback; `/search`
            now calls the real `GET /api/search` (was the old naive
            `/api/products?q=` ILIKE match) and forwards the same
            filter/sort params `/shop` reads — `FiltersSidebar`/
            `ShopToolbar` were already rendered there but silently
            non-functional; now wired. Verified against production
            data (real ranked results, typo fallback, price sort) via
            a local dev server pointed at `api.afrizonemart.com` —
            Chrome browser tools weren't available this session to
            click-test the dropdown interactively, so that's still
            outstanding. Click-through tracking UI
            (`POST /api/search/click` exists server-side) and facet
            counts are not wired.
      - [ ] p95 < 200ms verified under real load — not yet measured
            (no production traffic on the new endpoint yet).
      - [ ] Zero-result rate < 5% baseline — nothing to baseline until
            the frontend sends real traffic.

      _Phase 1 — Query understanding (Weeks 4–8 per spec)_
      - [x] Normalization (partial) — NFC, trim, lowercase, whitespace
            collapse (`service.ts:normalizeQuery`). Diacritic folding
            not yet explicit (relies on `'simple'` tsvector config).
      - [ ] Language detection — not started.
      - [ ] Spell correction (query-log-mined) — not started; trigram
            fallback (Phase 0, done) covers the simplest typo cases
            but isn't real spell correction.
      - [ ] Seed synonym dictionary — not started.
      - [x] Zero-result recovery — trigram similarity fallback
            (`trigramFallbackSearch`) when the lexical query returns
            nothing on page 1.

      _Phase 2 — Semantic / hybrid (Weeks 9–14 per spec)_
      - [ ] Embedding service (BGE-M3 / Qwen3-Embedding self-host, or
            a managed API to prototype) — not started. **Infra
            decision needed from Magnus** (self-host vs managed,
            cost/ops tradeoff per spec Section 10.2/14) before this
            can start.
      - [ ] Vector index — not started. Likely where OpenSearch (or a
            dedicated vector store) actually enters the stack, per the
            Phase-0 substitution note above.
      - [ ] RRF hybrid retrieval (fuse lexical + semantic) — not
            started.
      - [ ] Cross-lingual search — not started.
      - [ ] Weighted-score / L1 ranker — not started (Phase 0 uses
            `ts_rank_cd` + rating/reviewCount/createdAt tie-breakers
            directly; no separate scoring formula yet).

      _Phase 3 — Learned ranking (Weeks 15–20 per spec)_
      - [ ] Feature store / signal logging beyond `SearchQueryLog` —
            not started.
      - [ ] LTR model (LambdaMART/XGBoost) — not started.
      - [ ] Business re-ranking beyond the Phase-0 deliverability hard
            filter — bounded origin/margin/private-label boosts not
            started.

      _Phase 4 — Personalization & cold-start (ongoing per spec)_
      - [ ] Light personalization signals — not started.
      - [ ] Bandit-based new-item exploration / guaranteed-impression
            caps — not started (ties to the separate "Cold-start
            recommendations" tracker entry above).

      _Cross-cutting / not phase-specific_
      - [ ] Offline evaluation harness — judgement sets, golden query
            set, NDCG/MRR/Recall tracking. Not started.
      - [ ] Online A/B testing & interleaving for ranker changes — not
            started (ties to "A/B testing & experimentation engine"
            in Platform Intelligence below).
- [~] **Autocomplete / query suggestion** (TBD) — predictive search
      suggestions as the customer types. Built together with Search
      ranking & relevance above (same spec, Section 12) — see that
      entry's sub-checklist for status. Backend shipped
      (`GET /api/search/autocomplete`); frontend dropdown not built.
      Design doc: `Afrizonemart_Search_Discovery_Design_Spec.docx` ·
      PR(s): same as Search ranking & relevance · Notes: see above.
- [x] **Frequently bought together & bundling** (P1, shipped backend) —
      surfaces complementary items to raise average order value. Built
      together with Product recommendation engine above (System 2,
      same spec, Phase 1) — see that entry's sub-checklist. Also covers
      "Customers also bought" and "Viewed also viewed", same PR.
      Frontend (cart page cross-sell switch, PDP module additions) not
      wired yet.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): same as Product recommendation engine (Phase 1) · Notes:
      co-purchase mined live via `OrderItem` self-join, not a
      precomputed batch table — see sub-checklist substitution note.
- [x] **Related / similar products** (P0, shipped) — item-to-item
      similarity for the product detail page. Built together with
      Product recommendation engine above (System 2, same spec, Phase
      0) — see that entry's sub-checklist for the full build notes.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): same as Product recommendation engine · Notes: content-
      based weighted score, not embeddings — see the deliberate-
      substitution note above.
- [x] **Trending & popularity ranking** (P0, shipped) — popularity
      scoring with recency decay so fresh demand surfaces. Built
      together with Product recommendation engine above (System 2,
      same spec, Phase 0) — see that entry's sub-checklist. Wraps the
      pre-existing `views/service.ts:getTrendingProductIds` (already
      powering `/api/products?sort=trending`) with a hard
      deliverability filter and a quality-based pad, exposed as its
      own module/endpoint with impression logging.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): same as Product recommendation engine · Notes: _none_
- [~] **Cold-start recommendations** (P1) — handles new users and newly
      onboarded MSME products with no history — critical given continuous
      supplier onboarding. Partially addressed as a side effect of
      System 2 Phase 0: both "similar products" and "trending near
      you" work from content/behaviour signals that don't require a
      product's own interaction history, so a brand-new product with
      zero views/orders still surfaces normally (content bootstrap,
      spec Section 10.1). What's still missing: an explicit
      exploration budget / bandit framing and guaranteed minimum
      exposure caps for new listings (spec Section 10.1, Phase 3) —
      today a new product's exposure is purely a function of how well
      it scores, no floor guaranteed.
      Design doc:
      `Afrizonemart_Recommendations_Personalization_Design_Spec.docx` ·
      PR(s): same as Product recommendation engine (partial) · Notes:
      see System 2 Phase 3 sub-checklist.
- [ ] **Category & filter auto-classification** (TBD) — auto-tags and
      categorizes incoming supplier products at scale.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 2. Delivery & Logistics

Directly enables the 30–45 minute and 2-hour delivery promise and controls
last-mile cost.

- [ ] **Route optimization** (P1) — efficient last-mile routing to hit
      fast-delivery windows.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Delivery time / ETA prediction** (TBD) — accurate customer-facing
      delivery estimates.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Rider / driver dispatch & assignment** (TBD) — matches each order to
      the nearest available courier.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Geofencing & zone-based fulfillment routing** (TBD) — ties to Smart
      Geofencing and regional shipping badges.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Warehouse slotting / pick-path optimization** (TBD) — speeds order
      picking inside fulfillment hubs.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Order batching** (TBD) — groups nearby deliveries to cut cost per
      drop.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 3. Pricing & Merchandising

Protects margin under the wholesale markup model while honoring the
price-match guarantee across currencies.

- [ ] **Dynamic pricing** (P2) — applies the 143% markup rules with
      currency-adjusted pricing per market.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Multi-currency / FX conversion & rounding** (P2) — handles PAPSS and
      AfriCOIN payment flows and clean price rounding.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Price-matching engine** (P2) — maintains the "par with traditional
      markets" lowest-price guarantee.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Markdown / clearance optimization** (TBD) — prices down slow-moving
      inventory to clear stock efficiently.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 4. Inventory & Supply

Keeps the right products in the right hub and feeds the CallyValley
supplier dashboard.

- [ ] **Demand forecasting** (P1) — per-SKU, per-region, and seasonal
      demand prediction.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Inventory allocation & replenishment** (P2) — balances stock across
      Abuja, Lagos, and Calabar hubs.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Stockout prediction & auto-reorder** (TBD) — flags and pre-empts
      stockouts automatically.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Supplier scoring / ranking** (P2) — rates supplier reliability and
      performance, feeding the CallyValley dashboard.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 5. Trust, Risk & Payments

Builds buyer confidence and unlocks supplier financing — directly
addressing the thin-file problem.

- [ ] **Fraud detection** (P1) — detects payment fraud, fake accounts, and
      promotion abuse.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Payment routing & retry optimization** (TBD) — routes and retries
      across gateways and currencies for higher success rates.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Credit / thin-file scoring** (P3) — scores under-documented MSMEs
      for financing — core to the Access to Finance pillar.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Review authenticity detection** (TBD) — identifies and filters fake
      reviews.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Product authenticity & origin verification** (P3) —
      blockchain-backed Rules-of-Origin and Made-in-Africa checks.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 6. Marketing & Growth

Acquires, retains, and re-engages customers cost-efficiently.

- [ ] **Customer segmentation & LTV prediction** (P2) — groups customers
      and forecasts lifetime value.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Churn prediction & win-back targeting** (P2) — identifies at-risk
      customers for retention campaigns.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Ad bidding / budget allocation** (TBD) — optimizes spend across
      Performance Max and paid channels.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Loyalty & rewards optimization** (P3) — tunes the Africa Rewards
      tier benefits and referral incentives.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Send-time & content personalization** (P3, "advanced
      personalization") — personalizes email/push timing and content per
      user.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

## 7. Platform Intelligence

Cross-cutting systems that make the whole platform smarter and safer over
time.

- [ ] **Support routing & chatbot intent classification** (TBD) — powers
      the AI assistant and routes support tickets.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **A/B testing & experimentation engine** (P2) — measures the impact
      of product and pricing changes.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Image recognition / auto product tagging** (P3, "auto-tagging") —
      auto-tags product photography for search and catalogue.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Content moderation** (P3, "moderation") — screens listings and
      reviews for policy compliance.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_

---

## Log

_(Newest first. One entry per system when its spec lands or it ships —
mirrors the `ARCHITECTURE_TRACKER.md` close-out convention: plain-English
summary of what we built, when, and where the code lives.)_

- **2026-08-15** — Recommendations & Personalization Phase 0 merged and
  deployed live: `afrizonemart-api` #82 → Railway (verified
  `GET /api/recommendations/similar` and `/trending` responding with
  real data and a populated `impressionId` in prod, confirming the
  migration applied on boot); `afrizonemart-v2` #142 → Vercel (verified
  "Trending Near You" rendering on the live homepage); `afrizonemart-mobile`
  #83 → EAS Update OTA push to the `production` branch (published,
  both iOS and Android update IDs confirmed) — no native changes, so no
  app store build/resubmission needed for this one.

- **2026-08-15** — Recommendations & Personalization **Phase 1**
  (backend) shipped: new `modules/recommendations/repository.ts`
  functions `coPurchase` (self-joins `OrderItem` on `orderId`, grouped
  by co-occurring product, ranked by distinct-order count) and
  `viewedAlsoViewed` (self-joins `ProductView` on session/user within a
  90-day window) — both live-queried at request time rather than a
  precomputed batch table, a deliberate substitution for the spec's
  Section 5.2 batch-job recommendation (see sub-checklist). Three new
  endpoints: `GET /api/recommendations/also-bought`,
  `GET /api/recommendations/frequently-bought-together` (seeded by
  every product in the cart, not just the last one added),
  `GET /api/recommendations/viewed-also-viewed`. All three fall back
  to the Phase 0 content-based `similarProducts` retriever when
  co-purchase/co-view data is thin — confirmed necessary by testing
  against real prod order data: most products currently have zero
  co-purchase signal (multi-item orders are still rare this early), so
  without the fallback "Customers also bought" would render empty on
  most PDPs today. `tsc --noEmit` and `npm run build` both clean; all
  three endpoints live-tested against real prod data via a local
  server pointed at `DATABASE_PUBLIC_URL` (`viewed-also-viewed`
  returned real co-view pairs immediately; `also-bought` correctly
  returned empty before the fallback was added, confirmed against the
  raw order rows, then correctly padded after). **Not yet done**:
  frontend wiring on web/mobile (cart page switch from the Phase 0
  "similar" placeholder to the real `frequently-bought-together`, new
  PDP sections for "Customers also bought" / "Viewed also viewed"),
  precomputed batch tables if live-join latency ever becomes a
  problem, Phase 2+ (personalization, reorder, cross-channel).

- **2026-08-15** — Recommendations & Personalization Phase 0 (web +
  mobile frontend) shipped. **Web** (`afrizonemart-v2` #142):
  `RelatedProducts`/`getRelatedProducts` (PDP "You May Also Like" + cart
  cross-sell) switched from same-category-sorted-by-newest to the real
  `GET /api/recommendations/similar`; new home page section "Trending
  Near You" calling `GET /api/recommendations/trending` (didn't exist
  on web before). **Mobile** (`afrizonemart-mobile` #83): PDP
  `PdpRelatedRail`'s "You may also like" rail switched to the same
  endpoint (its "More from `<Country>`" rail intentionally left as-is
  — different concept); Home's `ForYouFeed` switched from raw
  `/api/products?sort=trending` to `GET /api/recommendations/trending`
  and dropped pagination (a recommendation module serves a bounded
  batch, not a paginated crawl). No viewer-country resolution exists on
  web yet, so deliverability filtering only actually activates today on
  requests that pass `country` explicitly. `tsc --noEmit` and full
  production builds clean on both `afrizonemart-v2` and
  `afrizonemart-mobile`. Not done: click-through tracking wiring on
  either platform (server-side `POST /api/recommendations/click`
  exists, unused by any client yet), interactive device/browser
  click-test (no Chrome/Expo device session available this session).

- **2026-08-15** — Recommendations & Personalization Phase 0 (backend)
  shipped against
  `Afrizonemart_Recommendations_Personalization_Design_Spec.docx`. New
  `modules/recommendations/` (schema/repository/service/controller/
  routes) in `afrizonemart-api`: `GET /api/recommendations/similar`
  (content-based weighted score — category/brand/origin/price-band +
  quality tie-breaker — since there's no embedding space to reuse from
  Search yet), `GET /api/recommendations/trending` (wraps the existing
  view-count trending aggregator with a hard deliverability filter and
  a quality-based pad), `POST /api/recommendations/click`. New
  `RecommendationImpression` model (impression/click log loop, same
  shape as `SearchQueryLog`). Migration
  `20260815120000_recommendations_phase0` dry-run-validated against
  prod (rolled back transaction) before merge — confirmed table
  creation, insert, and read-back all succeed; the raw `prisma migrate
  diff` output also surfaced pre-existing prod/schema drift (orphaned
  `imageAlts` columns, stale search-index declarations) which was
  deliberately excluded from this migration, not fixed here. Both new
  endpoints live-tested against real production data via a local server
  pointed at prod (`similar` returns same-category results correctly
  ranked; `trending` returns a mix of real trending + rating-based pad
  given the catalogue's low review-count today). Deliberately
  substituted a transparent weighted-scoring retriever for the spec's
  embedding-similarity retriever, same reasoning as Search's Postgres-
  FTS-for-OpenSearch substitution. `tsc --noEmit` and `npm run build`
  both clean. **Not yet done**: co-purchase/co-view (Phase 1),
  personalization/user profiles (Phase 2), reorder + bandit exploration
  (Phase 3), cross-channel (Phase 4), offline/online evaluation
  harness, perf verification under real traffic. See the expanded
  sub-checklist under "Product recommendation engine" above for full
  phase-by-phase status.

- **2026-08-11** — Search & Discovery Phase 0 (frontend) shipped:
  `afrizonemart-v2` #141 wires `SearchBar` (header autocomplete, mobile +
  desktop) and `/search` into the real `GET /api/search` /
  `GET /api/search/autocomplete` endpoints, replacing the old naive
  `/api/products?q=` match and fixing `/search`'s filter/sort params
  (previously rendered but ignored). Verified end-to-end against
  production data (real ranked results, typo fallback, sort) via a
  local dev server pointed at the live API — `tsc`, `next lint`, and
  `next build` all clean. Deployed; confirmed live via Vercel's
  deployment API. Not wired: click-through tracking UI, facet counts,
  interactive browser click-test of the dropdown (no Chrome tooling
  available this session).

- **2026-08-11** — Search & Discovery Phase 0 (backend) shipped against
  `Afrizonemart_Search_Discovery_Design_Spec.docx`. New `modules/search/`
  (schema/repository/service/controller/routes) in `afrizonemart-api`:
  `GET /api/search` (lexical full-text via a generated `tsvector` column +
  `ts_rank_cd`, trigram zero-result fallback, reuses the shop-filter
  contract for category/origin/price/rating/stock/deliverability),
  `GET /api/search/autocomplete` (query completions + product jumps),
  `POST /api/search/click` (CTR groundwork). New `SearchQueryLog` model
  (the query-log loop). New `product.created/updated/deleted` eventBus
  events, emitted from every admin product write path — not consumed yet,
  groundwork for Phase 2's real indexing pipeline. Migration
  `20260811120000_search_phase0` dry-run-validated against prod (rolled
  back transaction) before merge. Deliberately substituted Postgres FTS
  for the spec's OpenSearch recommendation at Phase 0 to ship without a
  new infra decision — flagged for revisit at Phase 2 (semantic/vector
  search actually needs it). `tsc --noEmit`, `npm run build`, and
  `vitest run` (22/22) all clean. **Not yet done**: frontend (no search
  bar/results page/autocomplete UI wired), facet counts, perf
  verification under real traffic. See the expanded sub-checklist under
  "Search ranking & relevance" above for full phase-by-phase status.

- **2026-08-11** — Tracker created from `Afrizonemart_Algorithm_Systems.docx`.
  30 systems stubbed across 7 categories, phase-tagged per the doc's
  Recommended Build Sequence where explicit. Nothing designed or built yet
  — awaiting per-algorithm specs from Magnus.
