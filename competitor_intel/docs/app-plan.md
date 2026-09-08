# Competitor Intel App — Full Plan (v2)

This document captures every decision made while planning the redesign, in the order it makes sense to build things. Written for a beginner to Frappe — nothing here assumes prior framework knowledge.

---

## 1. The Vision

A custom ERPNext app for a **single business** to understand its competitors, in two connected ways:

- **Loss Intelligence** — when a deal is marked "Lost" in standard ERPNext (this can happen at two points: an **Opportunity**, or later at the **Quotation** stage — both use the same "Set as Lost" popup), the sales rep can (but doesn't have to) note which competitor(s) they lost to and why. This app turns that data into monthly trends: who are we losing to, why, and at which stage.
- **Competitor Profiling & Benchmarking** — a business can also manually add any competitor (whether or not that competitor has ever appeared on a lost Quotation) and track metrics, qualitative notes, and AI-generated insights about them over time — full freedom over who they choose to track.

These two subsystems share one thing in common: the `Competitor` record. Everything else about them is different (automatic vs. manual data, transactional vs. profile-style).

The end goal isn't just reporting — it's closing the loop: insights (from either subsystem) should turn into `Strategy Action` items with an owner and a deadline, so the app drives decisions, not just dashboards.

---

## 2. Key architectural decision

**Don't create a new "Competitor" doctype.** ERPNext already ships one (used by the standard "Set as Lost" popup on Quotations). The original build had created a *separate* custom `Competitor` doctype, which would have caused the same competitor to exist as two disconnected records — one from Quotation data, one from manual entry.

**Fix:** use the *standard* `Competitor` doctype everywhere, extended with custom fields. Every other doctype in this app links to that standard doctype.

---

## 3. Business model assumption

Single business tracking its own competitors continuously — **not** an agency managing multiple clients. This is why there's no "Competitor Analysis" project-wrapper doctype in the new design; `Competitor` itself is the top-level entity.

---

## 4. Full Data Model

### `Competitor` (standard ERPNext doctype + new custom fields)
| Field | Type | Notes |
|---|---|---|
| `industry` | Select (SaaS / E-commerce / Manufacturing / Consulting / Services / Local Business / Other) | Drives which metrics are relevant later |
| `website` | Data | Domain only, e.g. `example.com` |
| `logo` | Attach Image | |
| `notes` | Small Text | |
| `is_active` | Check, default 1 | Lets you archive a competitor without losing their history |

*(Action item before building: check Customize Form → Competitor in the desk UI to confirm what standard fields already exist, so nothing above duplicates them. Field names for both `Quotation` and `Opportunity` are now confirmed from actual exports — see Section 4's `lost_on` addition for the details and the one remaining open item, the true name of the lost-reason master doctype.)*

### `Competitor Metric` (already exists — keep, just re-point the Link)
| Field | Type |
|---|---|
| `competitor` | Link → Competitor (standard) |
| `metric_date` | Date |
| `metric_type` | Select — existing values **plus** new `"Traffic: <source>"` values (Direct, Organic Search, Paid Search, Social, Referral, Email, Display Ads) — traffic-source breakdowns became metric rows instead of a separate doctype |
| `value` | Float |
| `source` | Select |

### `Competitor Qualitative` (already exists — keep, just re-point the Link)
| Field | Type |
|---|---|
| `competitor` | Link → Competitor (standard) |
| `review_date` | Date |
| `market_position` | Select |
| `pricing_model` | Select |
| `target_audience` | Small Text |
| `key_strength` / `key_weakness` / `differentiation` | Small Text |

### `Competitor Loss Snapshot` (NEW)
One row per **active** competitor per month, **always generated even if the count is zero** (keeps trend charts continuous and trustworthy).

| Field | Type |
|---|---|
| `competitor` | Link → Competitor |
| `period_start` / `period_end` | Date |
| `opportunity_lost_count` | Int |
| `opportunity_value_lost` | Currency |
| `quotation_lost_count` | Int |
| `quotation_value_lost` | Currency |
| `lost_reasons` | Table → **Competitor Loss Reason Count** (child table) |
| `generated_on` | Datetime, read-only |

**Kept deliberately separate rather than one merged number:** a deal dying at Opportunity stage (before you even sent a price) usually points to a lead-qualification or first-impression problem, while dying at Quotation stage (they seriously considered you, then chose someone else) usually points to a pricing or final-comparison problem. Merging them would hide which one is actually the bigger issue for the business.

**`Competitor Loss Reason Count`** (child table): `reason_type` (Select: "Opportunity Lost Reason" / "Quotation Lost Reason"), `lost_reason` (Dynamic Link, target = `reason_type`), `count` (Int)

### `Loss Reason Snapshot` (NEW — company-wide, no competitor)
Handles the case where a lost deal has a reason but **no competitor named** (standard ERPNext only requires Lost Reason, not Competitor, on the "Set as Lost" popup, at either stage). One row per existing reason per month, always generated.

| Field | Type |
|---|---|
| `period_start` / `period_end` | Date |
| `reason_type` | Select: "Opportunity Lost Reason" / "Quotation Lost Reason" |
| `lost_reason` | Dynamic Link (target = whatever `reason_type` says) |
| `count` | Int |
| `total_value_lost` | Currency |
| `generated_on` | Datetime, read-only |

**Why `reason_type` + Dynamic Link instead of one Link field:** confirmed by checking both child doctypes directly — `Opportunity` and `Quotation` each draw their lost-reason picker from a genuinely separate master doctype (`Opportunity Lost Reason` and `Quotation Lost Reason` respectively), not a shared list. There's no guarantee the two lists even contain the same reason names, so a single row can't safely combine "opportunity count" and "quotation count" for what might be two unrelated reasons that just happen to look similar. Each row now belongs to one specific reason from one specific list.

### `AI Insight` (already exists — re-point from analysis to competitor)
| Field | Type | Change |
|---|---|---|
| `competitor` | Link → Competitor | **was** `analysis` → Competitor Analysis |
| `generated_on`, `threat_level`, `threat_explanation`, `market_gap_opportunities`, `recommended_positioning` | unchanged | |

### `Strategy Action` (already exists — re-point + new source fields)
| Field | Type | Notes |
|---|---|---|
| `competitor` | Link → Competitor | Re-pointed, otherwise unchanged |
| `source_type` | Select — blank / AI Insight / Competitor Loss Snapshot / Loss Reason Snapshot | Optional — blank means "just a manual idea" |
| `source_reference` | Dynamic Link (target = whatever `source_type` says) | Optional |
| `action_title`, `category`, `priority`, `status`, `owner`, `due_date`, `expected_impact`, `result_notes` | unchanged | |

**Design note on `source_type`/`source_reference`:** to keep this user-friendly, plan "Turn this into an action" quick-add buttons on the AI Insight box and on the loss-numbers panel, which pre-fill these two fields automatically. A person starting a brand-new action from scratch just leaves them blank — same effort as if the fields didn't exist.

### Small addition to standard `Quotation` AND standard `Opportunity`
Same field, same reasoning, added to **both** doctypes. Neither has a dedicated "date it was marked lost" field by default, and the trigger mechanism differs slightly but doesn't matter for us: Quotation has an explicit "Set as Lost" button, Opportunity just triggers the same popup when you set its `status` field to "Lost" directly — either way, a `doc_events` hook watching for `status` becoming "Lost" on save catches both.

| Field | Type | Purpose |
|---|---|---|
| `lost_on` | Date, read-only, hidden | Stamped automatically via a `doc_events` hook the moment `status` changes to "Lost." Needed because relying on `transaction_date` or `modified` would misattribute which month a loss belongs to. |

**Note on double-counting:** if a deal starts as an Opportunity and later becomes a Quotation, in normal usage nobody goes back and marks the original Opportunity "Lost" too once it's progressed — so this shouldn't double-count the same deal at both stages. Worth keeping an eye on in practice rather than building reconciliation logic against it up front; cheap to fix later if it turns out to be a real pattern.

**Confirmed field names (checked directly on both child doctypes and their master doctypes on this instance):**

| Doctype | Lost reasons field | Reason master doctype | Competitors field | Value field(s) |
|---|---|---|---|---|
| `Opportunity` | `lost_reasons` — Table MultiSelect, child doctype `Opportunity Lost Reason Detail` | **`Opportunity Lost Reason`** | `competitors` — Table MultiSelect, child doctype `Competitor Detail` | `opportunity_amount`, `base_opportunity_amount` |
| `Quotation` | `lost_reasons` — child doctype `Quotation Lost Reason Detail` | **`Quotation Lost Reason`** | `competitors` — child doctype `Competitor Detail` | `grand_total` |

**Resolved:** the two doctypes use two separate, unrelated master lists for lost reasons (not a shared one, as first guessed). This is why `Loss Reason Snapshot` and `Competitor Loss Reason Count` use a `reason_type` + Dynamic Link pair rather than a single `Link` field — see those doctypes above for the corrected shape. `Competitor Detail` (the competitors child doctype) *is* shared between both, so no equivalent correction was needed there.

---

## 5. Doctypes and files being DELETED

- Custom `Competitor` doctype (`competitor.json/py/js`) — replaced by standard `Competitor` + custom fields
- `Competitor Snapshot` doctype — replaced by `Competitor Metric` + `Competitor Qualitative` (which already existed)
- `Competitor Analysis` doctype — no longer needed (single-business model, no client-wrapper)
- `Traffic Source` child table — folded into `Competitor Metric` as new metric types instead
- Dead duplicate `get_search_trends()` function in `competitor_dashboard.py` (the uncached version — the cached one stays)

No data-migration patch needed — confirmed all current data is test/demo data, safe to delete and rebuild clean.

---

## 6. Loss Intelligence: the aggregation logic

One shared function does all the counting, used two different ways. It now reads from **both** `Opportunity` and `Quotation`, keeping the two stages separate throughout rather than merging them — and since each stage draws from its own separate reason list (`Opportunity Lost Reason` vs. `Quotation Lost Reason`), reasons are tracked per stage too, not merged by name.