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

- [ ] **Product recommendation engine** (P1, cold-start variant) — hybrid
      collaborative-filtering + content-based model powering "customers also
      bought" and "you may like."
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Personalized homepage / for-you ranking** (TBD) — per-user feed
      ordered by browsing, purchase, and location history.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Search ranking & relevance** (P1) — query understanding, typo
      tolerance, and multilingual matching across our 100+ supported
      languages.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Autocomplete / query suggestion** (TBD) — predictive search
      suggestions as the customer types.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Frequently bought together & bundling** (TBD) — surfaces
      complementary items to raise average order value.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Related / similar products** (TBD) — item-to-item similarity for the
      product detail page.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Trending & popularity ranking** (TBD) — popularity scoring with
      recency decay so fresh demand surfaces.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
- [ ] **Cold-start recommendations** (P1) — handles new users and newly
      onboarded MSME products with no history — critical given continuous
      supplier onboarding.
      Design doc: _pending_ · PR(s): _none_ · Notes: _none_
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

- **2026-08-11** — Tracker created from `Afrizonemart_Algorithm_Systems.docx`.
  30 systems stubbed across 7 categories, phase-tagged per the doc's
  Recommended Build Sequence where explicit. Nothing designed or built yet
  — awaiting per-algorithm specs from Magnus.
