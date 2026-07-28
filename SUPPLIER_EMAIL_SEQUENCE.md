# Supplier Email Sequence — design & execution plan

The supplier portal lives under Afrizonemart but reads as its own product, so
its email programme has to do two jobs at once: carry AZM's brand, and speak to
a **business owner being onboarded**, not a shopper.

Status legend: ✅ built · 🟡 partial · ⬜ to build · 🔵 needs a decision from Divine

---

## 0. What already exists (don't rebuild it)

The pipeline is mature — this plan adds *messages and timing*, not plumbing.

- `sendEmail` → provider factory → **Console** in dev, **Resend** in prod.
  It never throws, so a flaky provider can't block a submit or an approval.
- Every send writes a **`Notification`** row → visible at `/admin/notifications`
  with delivery status, and Resend webhooks feed opens/bounces back in.
- Templates are React (`.tsx`) sharing `_layout.tsx` (transactional) and
  `_marketing-layout.tsx` (campaign-style). Brand tokens in `_brand.ts`.
- **Email copy is admin-editable**: `template-resolver.ts` prefers a DB
  `EmailTemplate` row over the compiled template, per `type`. So once a row
  exists, your team can rewrite the words without a deploy.
- **Cron infrastructure is proven** — `review-nudge-cron.ts` is the reference
  implementation: hourly sweep, *bounded* window (24–48h, not "older than"), a
  persisted idempotency marker written after a successful send, and a batch cap.

### The 9 supplier emails live today ✅

| Type | Fires when |
|---|---|
| `supplier.invite` | Set-your-password invite (the magic link) |
| `supplier.piq.submitted` | Supplier submits a product questionnaire |
| `supplier.piq.approved` | Reviewer approves it |
| `supplier.piq.changes` | Reviewer requests changes (with their notes) |
| `supplier.reviewcall.scheduled` | Admin schedules the Stage-5 call |
| `supplier.visit.confirmed` | Facility-visit team confirms a date |
| `supplier.audit.complete` | Audit completed, with outcome + score |
| `supplier.listing.published` | Products go live |
| `supplier.po.issued` | Purchase order issued |

**The gap is obvious once you list them: every one of these is triggered by
*AZM* doing something.** There is nothing that reaches out when the *supplier*
goes quiet — which is exactly the failure mode of a 10-stage journey, and what
this plan is mostly about.

---

## 1. Principles

1. **Every email names the next action and links straight to it.** Deep-link to
   the exact stage page, never a generic dashboard.
2. **Stage-aware, not generic.** A nudge to someone stuck on their PIQ must not
   read like a nudge to someone awaiting a facility visit.
3. **One send per supplier per reason, ever** — enforced by a persisted marker,
   not by hope. A cron that double-sends to 85 real businesses is worse than one
   that misses.
4. **A quiet cap.** No supplier receives more than **2 lifecycle emails in 7
   days**, reminders included. Transactional replies to their own action are
   exempt — those are always welcome.
5. **Offer help, don't demand progress.** "Anything blocking you? Reply to this
   email and a person will answer" beats "You have not completed Stage 4."
6. **Every email carries a reply-to that a human reads.** These are business
   relationships; `no-reply` on a nudge is how you get ignored.
7. **Unsubscribe.** Lifecycle/nudge emails need a preference link. Purely
   transactional ones (invite, PO issued) don't, and shouldn't have one.

---

## 2. The supplier sequence

### A · Account & welcome

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| A1 | `supplier.application.received` | They submit "Apply to supply" | immediate | ⬜ |
| A2 | `supplier.invite` | Admin invites an imported supplier | immediate | ✅ |
| A3 | `supplier.welcome` | First successful password set / first login | immediate | ⬜ |
| A4 | `supplier.getting.started` | 2 days after A3, if still at Stage ≤3 | +48h | ⬜ |

A3 is the one doing real work: it explains **what the 10 stages are, roughly how
long they take, and what AZM needs from them first**. Right now a supplier sets
a password and lands on a dashboard with no orientation to the process at all.

### B · Journey progression

| # | Type | Trigger | Status |
|---|---|---|---|
| B1 | `supplier.stage.advanced` | `currentStage` increases — one template, stage-aware body | ⬜ |
| B2 | `supplier.eoi.received` | Stage 2 submitted | ⬜ |
| B3 | `supplier.profile.received` | Stage 3 registration submitted | ⬜ |

B1 is deliberately **one** template with a per-stage block, not ten templates —
ten near-identical files rot independently.

### C · Product questionnaires

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| C1 | `supplier.piq.submitted` | Submitted | immediate | ✅ |
| C2 | `supplier.piq.approved` | Approved | immediate | ✅ |
| C3 | `supplier.piq.changes` | Changes requested | immediate | ✅ |
| C4 | `supplier.piq.draft.reminder` | A DRAFT PIQ untouched | +5 days | ⬜ |
| C5 | `supplier.piq.revision.reminder` | REVISION_REQUIRED untouched | +7 days | ⬜ |
| C6 | `supplier.piq.none` | At Stage 4 with **zero** PIQs | +3 days | ⬜ |

C5 matters commercially: a supplier who was asked for changes and went silent is
the most recoverable person in the funnel — they were nearly approved.

### D · Review call & orientation

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| D1 | `supplier.reviewcall.scheduled` | Admin schedules | immediate | ✅ |
| D2 | `supplier.reviewcall.reminder` | Before the call | −24h | ⬜ |
| D3 | `supplier.reviewcall.rescheduled` | Reschedule agreed | immediate | ⬜ |
| D4 | `supplier.reviewcall.missed` | Call time passed, not marked complete | +24h | ⬜ |
| D5 | `supplier.orientation.due` | Reaches Stage 5 | immediate | ⬜ |
| D6 | `supplier.orientation.reminder` | Day of the session | 3h before 21:00 WAT | ⬜ |
| D7 | `supplier.orientation.missed` | At Stage 5 >7 days, not completed | +7 days | ⬜ |

D5/D6 need care: orientation is a **one-time live at 21:00 WAT**, and since we
just closed the re-entry gate, a supplier who misses it needs a human path, not
a link to a closed room. 🔵 **Decision needed** — see §6.

### E · Facility visit

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| E1 | `supplier.visit.requested` | They propose a date | immediate | ⬜ |
| E2 | `supplier.visit.confirmed` | Team confirms | immediate | ✅ |
| E3 | `supplier.visit.prep` | Before the visit — what to have ready | −72h | ⬜ |
| E4 | `supplier.visit.reminder` | Before the visit | −24h | ⬜ |
| E5 | `supplier.visit.unscheduled` | At Stage 6, no visit requested | +5 days | ⬜ |

E3 earns its place operationally: the audit has ~215 checkpoints across
categories, and a supplier who hasn't pulled their certifications together
wastes a site visit for both sides.

### F · Audit outcome

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| F1 | `supplier.audit.complete` | Audit completed | immediate | ✅ |
| F2 | `supplier.audit.capa.reminder` | CAPA deadline approaching | −7d, −1d | ⬜ |
| F3 | `supplier.callyvalley.offer` | Outcome routes to CallyValley | immediate | 🔵 |

F3 is blocked on the CallyValley tiers/pricing doc.

### G · Partnership → trade

| # | Type | Trigger | Timing | Status |
|---|---|---|---|---|
| G1 | `supplier.partnership.ready` | Advanced to Stage 7 | immediate | ⬜ |
| G2 | `supplier.partnership.unsigned` | At Stage 7, not signed | +7 days | ⬜ |
| G3 | `supplier.partnership.signed` | They sign | immediate | ⬜ |
| G4 | `supplier.listing.photos.due` | At Stage 8, no photos | +5 days | ⬜ |
| G5 | `supplier.listing.published` | Admin publishes | immediate | ✅ |
| G6 | `supplier.po.issued` | PO issued | immediate | ✅ |
| G7 | `supplier.po.unacknowledged` | PO not acknowledged | +48h | ⬜ |
| G8 | `supplier.po.due.soon` | Delivery due | −3 days | ⬜ |
| G9 | `supplier.po.overdue` | Past due, not fulfilled | +1 day | ⬜ |

### H · Stalled & re-engagement — *the part that doesn't exist at all*

Driven by one cron over `SupplierProfile.updatedAt` + last activity, **stage-aware
in body, escalating in tone**:

| # | Type | Trigger | Tone | Status |
|---|---|---|---|---|
| H1 | `supplier.stalled.7d` | No progress 7 days | "Anything we can help with?" | ⬜ |
| H2 | `supplier.stalled.21d` | No progress 21 days | Offer a call; name the exact blocker | ⬜ |
| H3 | `supplier.stalled.45d` | No progress 45 days | "Still interested? We'll pause your file" | ⬜ |
| H4 | `supplier.dormant` | No progress 90 days | File paused, one-click reactivate | ⬜ |

H1–H4 fire **at most once each per supplier, ever** — a supplier who stalls,
recovers, and stalls again gets H1 once, not twice. That's the difference
between attentive and nagging, and it's why the marker must be persisted per
supplier per type rather than per stall episode.

🔵 **Decision needed:** does H4 actually set `status = SUSPENDED`, or is it a
label only? See §6.

---

## 3. The admin sequence

Your team currently learns about work only by opening a dashboard tab. These
push it to them, routed **by capability**, so the facility-visit team isn't
copied on PIQ traffic.

| # | Type | To (capability) | Trigger |
|---|---|---|---|
| M1 | `admin.supplier.applied` | `suppliers.review` | New application |
| M2 | `admin.piq.submitted` | `suppliers.review` | PIQ hits the queue |
| M3 | `admin.visit.requested` | `suppliers.visits` | Supplier proposes a date |
| M4 | `admin.reviewcall.reschedule` | `suppliers.review` | Reschedule requested |
| M5 | `admin.audit.due` | `suppliers.audit` | At Stage 6 ≥7 days, no audit |
| M6 | `admin.orientation.questions` | `suppliers.review` | Unanswered live-chat questions |
| M7 | `admin.po.acknowledged` | `suppliers.trade` | Supplier acknowledges |
| M8 | `admin.po.fulfilled` | `suppliers.trade` | Supplier marks fulfilled |
| M9 | `admin.queue.digest` | per capability | **Daily 08:00 WAT** — everything pending for that team |

**M9 is the highest-value item on this page.** One digest per team per morning
replaces most per-event noise; build it first and make M1–M8 opt-in, or the team
will filter all of it within a fortnight. Right now there are **91 PIQs sitting
in the review queue** — a daily digest surfaces that; 91 individual emails
would have buried it.

---

## 4. What has to be built underneath

1. **`SupplierEmailLog`** — `(supplierId, type, sentAt, meta)` with a unique
   index on `(supplierId, type)` for once-ever sends, plus a relaxed variant
   keyed on the entity (`piqId`, `poId`) for per-object reminders. This is the
   idempotency spine; without it every cron is one restart away from spamming
   real businesses.
2. **`supplier-lifecycle-cron.ts`** — hourly, following `review-nudge-cron`
   exactly: bounded windows, batch cap, marker written *after* a successful
   send. One sweep evaluates every time-based rule above.
3. **A due-at scheduler for "−24h" style sends** (D2, E3, E4, F2, G8). Two
   options — 🔵 see §6.
4. **`notify-admins.ts`** — resolve recipients by capability
   (`effectiveCapabilities`), dedupe, send. Currently no helper mails *staff*.
5. **Quiet-hours + frequency cap** — a shared `canSendLifecycle(supplierId)`
   guard consulted by every non-transactional send. Also: hold nudges to
   **08:00–18:00 WAT**; a "you've stalled" email at 3am reads badly.
6. **Preference/unsubscribe** — `SupplierProfile.emailOptOut` honoured by
   lifecycle sends, ignored by transactional ones.
7. **Seed `EmailTemplate` rows** for every new type, so the team can edit copy
   without a deploy.

---

## 5. Execution phases

**Phase 1 — foundation (no supplier-visible change).**
`SupplierEmailLog`, the frequency cap, `notify-admins.ts`, unsubscribe field.
Nothing sends yet. Acceptance: unit-level proof that a repeated send is a no-op.

**Phase 2 — the welcome path.** A1, A3, A4, B1–B3.
The highest-leverage gap: today a supplier sets a password and is left to guess.
Acceptance: apply → invite → set password → welcome → advance a stage → the
stage email lands, all visible as SENT in `/admin/notifications`.

**Phase 3 — the admin digest.** M9 first, then M1–M4.
Acceptance: 08:00 digest to a `suppliers.review` holder lists exactly the 91
queued PIQs.

**Phase 4 — stalled & re-engagement.** H1–H4 + the lifecycle cron.
Ship **behind a dry-run flag first** — log who *would* receive what for a few
days and read it before a single email goes out. With 85 real businesses, one
bad sweep is a reputational event, not a bug.

**Phase 5 — per-stage reminders.** C4–C6, D2–D7, E1/E3–E5, G1–G4, G7–G9.
**Phase 6 — audit/CAPA + CallyValley.** F2, F3 (needs the CallyValley doc).

---

## 6. 🔵 Decisions I need from you

1. **Sending domain.** `RESEND_API_KEY` and `EMAIL_FROM` are both empty. Which
   domain sends — `no-reply@afrizonemart.com`, or a supplier-specific identity
   like `suppliers@afrizonemart.com`? I'd argue the latter: it separates this
   from shopper mail, and protects the storefront's sending reputation if a
   nudge campaign ever draws complaints.
2. **Reply-to.** Which inbox does a supplier's reply reach? Principle 6 depends
   on a real human reading it.
3. **Scheduler approach.** Either (a) an hourly cron that computes "is anything
   due in the next hour" — simple, no new table, ±1h precision; or (b) a
   `ScheduledEmail` table with exact due timestamps — precise, cancellable when
   a visit is rescheduled, more machinery. **I'd take (b)** purely because
   reminders for *cancelled* meetings are the classic embarrassment, and (a)
   can't retract.
4. **Dormancy.** Does H4 set `status = SUSPENDED` (which hides them from active
   queues) or is it a label only?
5. **Orientation misses.** A supplier who misses the 21:00 WAT live now finds a
   closed room. Do they wait for the next day's session, or does the team run a
   catch-up? This changes D5–D7 materially.
6. **Backfill.** The 85 imported suppliers have never received *any* of this.
   When Phase 2 ships, do they get the welcome sequence retroactively, or does
   it apply only to new signups? Retroactive means 85 emails on day one —
   defensible, but it should be a deliberate choice, not a side effect of a
   cron's first sweep.
