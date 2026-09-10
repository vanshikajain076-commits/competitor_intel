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

### `Competitor Metric` (already existed — kept, Link re-pointed)
| Field | Type |
|---|---|
| `competitor` | Link → Competitor (standard) |
| `metric_date` | Date |
| `metric_type` | Select — includes Traffic: <source> values, plus "Cloudflare Traffic Rank" |
| `value` | Float |
| `source` | Select — includes "Mock API", "Cloudflare Radar (Exact Rank)", "Cloudflare Radar (Bucket Estimate)", "Google Trends", "Manual Entry", "Other" |

### `Competitor Qualitative` (already existed — kept, Link re-pointed)
| Field | Type |
|---|---|
| `competitor` | Link → Competitor (standard) |
| `review_date` | Date |
| `market_position` | Select |
| `pricing_model` | Select |
| `target_audience` | Small Text |
| `key_strength` / `key_weakness` / `differentiation` | Small Text |

### `Competitor Loss Snapshot`
One row per **active** competitor per month, always generated even if zero.

| Field | Type |
|---|---|
| `competitor` | Link → Competitor |
| `period_start` / `period_end` | Date |
| `opportunity_lost_count` | Int |
| `opportunity_value_lost` | Currency |
| `quotation_lost_count` | Int |
| `quotation_value_lost` | Currency |
| `lost_reasons` | Table → **Competitor Loss Reason Count** |
| `generated_on` | Datetime, read-only |

**`Competitor Loss Reason Count`** (child table): `reason_type` (Select: "Opportunity Lost Reason" / "Quotation Lost Reason"), `lost_reason` (Dynamic Link, target = `reason_type`), `count` (Int)

### `Loss Reason Snapshot` (company-wide, no competitor)
| Field | Type |
|---|---|
| `period_start` / `period_end` | Date |
| `reason_type` | Select: "Opportunity Lost Reason" / "Quotation Lost Reason" |
| `lost_reason` | Dynamic Link (target = `reason_type`) |
| `count` | Int |
| `total_value_lost` | Currency |
| `generated_on` | Datetime, read-only |

### `AI Insight`
| Field | Type |
|---|---|
| `competitor` | Link → Competitor |
| `generated_on`, `threat_level`, `threat_explanation`, `market_gap_opportunities`, `recommended_positioning` | unchanged |

### `Strategy Action`
| Field | Type | Notes |
|---|---|---|
| `competitor` | Link → Competitor | |
| `source_type` | Select — blank / "AI Insight" / "Competitor Loss Snapshot" / "Loss Reason Snapshot" | Blank is an explicit, selectable option meaning "just a manual idea" |
| `source_reference` | Dynamic Link (target = `source_type`) | Optional |
| `action_title`, `category`, `priority`, `status`, `owner`, `due_date`, `expected_impact`, `result_notes` | unchanged | |

### `Quotation` and `Opportunity` — small addition
| Field | Type | Purpose |
|---|---|---|
| `lost_on` | Date, read-only, hidden | Stamped via a `doc_events` hook on `on_change` (verified as the one event guaranteed to fire on both doctypes' real "mark as Lost" code paths) — only set once, never overwritten |

**Confirmed field names:** `Opportunity` → `lost_reasons` (child doctype `Opportunity Lost Reason Detail`, master `Opportunity Lost Reason`), `competitors` (child doctype `Competitor Detail`), value fields `opportunity_amount`/`base_opportunity_amount`. `Quotation` → `lost_reasons` (child doctype `Quotation Lost Reason Detail`, master `Quotation Lost Reason`), `competitors` (child doctype `Competitor Detail`, shared), value field `grand_total`. The two lost-reason master lists are genuinely separate — this is why `reason_type` + Dynamic Link is used instead of a single Link field.

**Traffic data sourcing strategy:**
- `Cloudflare Traffic Rank` — real, free, via Cloudflare Radar API (token stored as `frappe.conf.cloudflare_api_token`). Falls back from exact rank (only ~top 100 global domains) to a bucket-derived estimate for everyone else; clearly labeled via two distinct `source` values so exact and estimated are never confused. Domains with neither get no record and a friendly message, never a fabricated value.
- `Monthly Visits`, `Page Views`, `Bounce Rate`, `Avg Duration`, `Pages per Visit` — simulated via a standalone local mock server (`mock_server/server.py`, stdlib-only, run separately on port 5001), always tagged `source = "Mock API"`. To be swapped for a real paid API later once the product idea is validated.

---

## 5. Doctypes and files DELETED

- Custom `Competitor` doctype — replaced by standard `Competitor` + custom fields
- `Competitor Snapshot` — replaced by `Competitor Metric` + `Competitor Qualitative`
- `Competitor Analysis` — no longer needed (single-business model)
- `Traffic Source` — folded into `Competitor Metric` as new metric types
- Dead duplicate `get_search_trends()` in `competitor_dashboard.py`

No data-migration patch needed — all data on this instance was test/demo data.

---

## 6. Loss Intelligence: the aggregation logic

`collect_loss_data(period_start, period_end)` in `competitor_intel/loss_intelligence.py` — reads from both `Opportunity` and `Quotation` (filtered by `lost_on`), keeping the two stages separate throughout, and keeping reasons separate per stage too (keyed by `(reason_type, reason_name)`, never merged by name across the two master lists).

**Attribution rule:** full attribution — a deal with multiple competitors or reasons counts fully toward each one, not split. Understood trade-off: summed totals across competitors/reasons can exceed true total lost value for the period.

**Returns** `(by_competitor, by_reason)` — plain dictionaries, writes nothing to the database itself.

**Two callers:**
1. **`generate_monthly_loss_snapshots()`** — registered in `hooks.py`'s `scheduler_events["monthly"]`, runs automatically, processes the previous fully-completed month, get-or-creates (updates in place, never duplicates) a `Competitor Loss Snapshot` per active competitor and a `Loss Reason Snapshot` per existing reason (both master lists), zero-filled if unused. Each record's upsert is individually wrapped in try/except + `frappe.log_error`, so one bad record doesn't stop the rest of the batch.
2. **`get_current_month_loss_data(competitor=None)`** in `api.py` — on-demand, whitelisted, read-only, computes month-start-to-today, returns a JSON-serializable (tuple keys flattened to lists) slice of the same underlying data. Never writes to the database. Powers the "this month so far" live panels/buttons — company-wide if no competitor given, scoped if one is.

---

## 7. Page Layouts

### Competitor Overview (home page)
1. "This month so far" company-wide loss panel (live, via `get_current_month_loss_data()`), clearly labeled as in-progress/unfinalized, distinct from historical data
2. Competitor table, one row per competitor, clickable through to the detail page
3. Comparison chart with a metric-type picker (not hardcoded to one metric)
4. "Who we're losing to most" ranking (top 5, current quarter, via `get_top_competitors_by_losses()`)

### Competitor Detail (click into one competitor)
**Section A — Loss Intelligence (shown first):**
- This competitor's loss trend chart (from saved monthly snapshots)
- Top reasons we lose to them specifically
- "This month so far" live button, scoped to this competitor

**Section B — Profile & Benchmarking (shown second):**
- Basic info (website, industry, notes)
- Metrics chart (pick a metric type)
- Qualitative notes, most recent + history
- AI Insight box, scoped to this competitor
- Strategy Actions list + "add new action" button, with quick-add-from-insight prefilling `source_type`/`source_reference`

---

## 8. Known cleanup items

- Remove the dead duplicate `get_search_trends()` in `competitor_dashboard.py`
- `generate_ai_insights()` should handle a missing `frappe.conf.groq_api_key` gracefully
- `fetch_traffic_data` / `seed_demo_history` — confirm `doc.website` still resolves correctly as a custom field
- Permissions are System Manager-only everywhere — fine for now, needs real role design before multiple people use this

---

## 9. Suggested Build Order

1. Add custom fields to standard `Competitor` — **done**
2. Re-point `Competitor Metric`, `Competitor Qualitative`, `Strategy Action`, `AI Insight` Links to standard `Competitor` — **done**
3. Move `competitor.js` form logic to a `doctype_js` hook; delete old custom Competitor doctype files — **done**
4. Delete `Competitor Snapshot`, `Competitor Analysis`, `Traffic Source`; add Traffic metric types — **done**
5. Add `lost_on` + `doc_events` hook on `Quotation` and `Opportunity` — **done**
6. Build `Competitor Loss Snapshot`, `Loss Reason Snapshot`, `Competitor Loss Reason Count` doctypes — **done**
7. Build `collect_loss_data()`, the monthly scheduled job, and the on-demand current-month function — **done**
8. Add `source_type`/`source_reference` to `Strategy Action` — **done**
9. Rebuild the two pages (Overview upgrades; new Detail page in sub-steps 9a–9d) — **in progress**
10. Clean up known issues in Section 8
11. Test end-to-end on one real competitor and one real lost Quotation/Opportunity

---

## 10. Working setup

- App folder: `apps/competitor_intel`, git repo, remote named `upstream`
- Site: `metalco.localhost`
- Claude Code runs in a terminal `cd`'d into the app folder; a `mock_server/server.py` process runs separately in its own terminal when needed
- This chat stays the planning/architecture reference; Claude Code handles hands-on implementation
- Normal loop: edit → `bench --site metalco.localhost migrate` (schema changes) → test in browser/console → `git add/commit/push`, one small step at a time
- `CLAUDE.md` at the repo root documents the two-level nested-folder gotcha (repo root vs. inner Python package) — check it whenever creating a new top-level module