# Competitor Intel: Product and Engineering Spec (v2)

> Single source of truth. If code and this file disagree, fix one of them in the same PR.
> Replaces `competitor_intel-product-design-notes_1.md` and `competitor_intel/docs/app-plan.md`.
> Status: draft for owner review. Items marked **VERIFY** must be checked on a real bench before relying on them.

---

## 1. Purpose

An ERPNext app that shows **who the company loses deals to and why**, tracks what its main competitors are doing, and turns both into **assigned actions**.

**Primary user:** a business tracking its *own* competitors (founder, sales manager, marketing lead). Not an agency tool. There is no client or multi-tenant wrapper.

**What leads:** Loss Intelligence. ERPNext already holds lost-deal data (competitor and reason on Quotation and Opportunity). No standalone tool has this. Competitor profiling and benchmarking support it.

### A typical week (every feature must serve one of these)

1. **Sales rep** marks a deal lost and picks the competitor and reason in ERPNext's existing popup. No new data entry.
2. **Manager** opens Overview on Monday: who is beating us this month, is it getting worse, which reasons dominate.
3. **Anyone** logs "Acme cut prices 20%" as a dated event with a source link in about ten seconds.
4. **Founder or marketer** opens a competitor page and reads its battlecard before a call or campaign.
5. **Manager** reads an AI insight, clicks "Create action", and assigns it with an owner and due date.
6. **Everyone** gets a weekly digest of what changed, so nobody has to visit the dashboard to find out.

### User stories

- As a sales manager, I want to see which competitors we lost to this month and why, so I know where to focus coaching.
- As a founder, I want to be told when a competitor changes pricing or launches something, so I do not find out from a customer.
- As a marketer, I want a one-page battlecard per competitor, so campaigns and sales pitches are consistent.

---

## 2. Scope

### v1 (this spec)

| Area | What |
|---|---|
| Loss Intelligence | Existing monthly snapshots, Overview, Comparison, Competitor Detail pages |
| Competitor profile | ERPNext `Competitor` (extended), Competitor Metric, Competitor Qualitative |
| Events | Competitor Event log (new) |
| Battlecards | One per competitor (new) |
| AI | On-demand insights, user-supplied provider and key, company-aware (new Settings and Company Profile) |
| Actions | Strategy Action, creatable from an insight or event |
| Digest | Weekly email summary (new) |
| Data hygiene | Duplicate prevention, detection, merge (new) |
| Signals | Google Trends and Cloudflare Radar rank, as scheduled jobs |
| Security | Two roles, permission checks on every endpoint |

### Not now (do not let these creep in)

- Paid traffic APIs (SimilarWeb, Semrush, Ahrefs)
- Pricing-page monitor, review ratings, hiring and news signals
- Industry-aware metric sets
- Bounce rate, pages per visit, and similar traffic-quality cards
- Mock API and demo-data seeding (remove from the product)
- Frappe v15 or earlier support
- Multi-company and agency or client wrapper
- Automatic (unattended) AI runs

---

## 3. Platform and compatibility

| Item | Decision |
|---|---|
| Frappe and ERPNext | **v16 only.** Branch convention `version-16`. State the tested version range in README. |
| Python | Set `requires-python` from the official v16 migration guide, **not from memory** (v16 requires a newer Python than v15). |
| ERPNext | **Required dependency.** `required_apps = ["erpnext"]` in `hooks.py`. The app extends ERPNext's `Competitor` and hooks Quotation and Opportunity. |
| Frappe UI | Desk pages and doctype forms only. No standalone Vue app. |

Rules for staying version-proof:
- Prefer **configuration over code**: Workspace, Number Cards, Dashboard Charts, Reports, Notifications. These survive upgrades better than custom pages.
- Keep custom Desk pages to the existing three. Do not add more without a decision-log entry.
- Check every new API call against v16 docs. Treat deprecation warnings in `bench` output as bugs.

---

## 4. Data model

Legend: **E** = exists on `rebuild-v2`, **N** = new, **C** = change to existing.

### 4.1 Competitor (ERPNext standard doctype, extended)  **E**
- Extended only through Custom Field fixtures (`fixtures/custom_field.json`). Never edit ERPNext core files.
- Needs a **website/domain** field, used for duplicate detection and for Cloudflare and Trends.
- **VERIFY:** whether the doctype allows rename (needed for merge, section 7). If not, enable via Property Setter fixture.
- **VERIFY:** ERPNext's own permissions on `Competitor`. Adjust only through Custom DocPerm, documented in the decisions log.

### 4.2 Loss Intelligence  **E**
`Competitor Loss Snapshot`, `Competitor Loss Reason Count`, `Loss Reason Snapshot`, filled by `generate_monthly_loss_snapshots` (monthly) and by `utils.stamp_lost_on` on Quotation and Opportunity change.
- Keep as is. Changes limited to permissions (section 6) and error handling (section 8).

### 4.3 Competitor Metric  **E, C**
Dated numeric values per competitor (date, type, value, source).
- **C:** remove `Mock API` from `source` options. Add a patch that relabels or deletes existing mock-sourced rows. Keep sources: `Manual Entry`, `Google Trends`, `Cloudflare Radar`, `Other`.
- **C:** metric types to keep: Monthly Visits (manual only), Search Trend Index, Domain Rank. Remove the traffic-quality types from the select unless data exists on a site.
- Cloudflare returns a **rank** (lower is better). Charts must handle the inverted axis and label it clearly.

### 4.4 Competitor Qualitative  **E**
Market position, pricing model, target audience, strength, weakness, differentiation, review date.
- Normalize select options (older notes mixed "Niche" and "Niche Player").

### 4.5 Competitor Event  **N**
The quickest, most useful manual record.

| Field | Type | Notes |
|---|---|---|
| competitor | Link: Competitor | required |
| event_date | Date | default Today |
| event_type | Select | Pricing Change, Product Launch, Funding, Hiring, Partnership, Marketing Campaign, Leadership, Other |
| summary | Small Text | required, short |
| impact | Select | High, Medium, Low |
| source_url | Data (URL) | strongly encouraged; shown as link |
| logged_by | Link: User | auto |

Appears in the competitor timeline and in the weekly digest.

### 4.5b Competitor Battlecard  **N**
One per competitor (name equals competitor).

| Field | Type |
|---|---|
| competitor | Link: Competitor (unique) |
| their_strengths, their_weaknesses | Small Text |
| how_we_win | Text Editor |
| objections | Table: Battlecard Objection (objection, response) |
| pricing_notes | Small Text |
| last_reviewed | Date |
| status | Select: Draft, Approved |

AI may **draft** a battlecard from profile, events, loss reasons and Company Profile. A human approves it. Drafts never appear as Approved automatically.

### 4.6 AI Insight  **E, C**
- Keep every insight (history), do not overwrite.
- **C:** add `model_used`, `provider`, `input_summary` (the exact data the model saw), `generated_by`.
- **C:** link `Strategy Action.linked_insight` (see 4.7).

### 4.7 Strategy Action  **E, C**
- **C:** add `linked_insight` (Link: AI Insight) and `linked_event` (Link: Competitor Event), both optional.
- "Create action" buttons on AI Insight and Competitor Event pre-fill the action.
- Remove the stale `Competitor Analysis`-era assumptions if any remain.

### 4.8 Competitor Intel Settings (Single)  **N**

| Field | Type | Notes |
|---|---|---|
| llm_provider | Select | OpenAI-compatible, Anthropic |
| llm_base_url | Data | pre-filled per provider, editable |
| llm_model | Data | free text, so new models work without code changes |
| llm_api_key | Password | encrypted, read with `get_password`, never logged |
| llm_temperature | Float | default 0.4 |
| cloudflare_api_token | Password | optional |
| enable_trends, enable_cloudflare | Check | |
| digest_enabled | Check | |
| digest_day | Select | weekday |
| digest_recipients_role | Link: Role | default Competitor Intel Manager |

Behavior:
- **Test connection** button reports success or the exact provider error.
- Fallback: if a key is not set but `frappe.conf.groq_api_key` exists, use it, log a deprecation note, and remove the fallback in a later release.
- Access: Manager and System Manager only.

### 4.9 Company Profile (Single)  **N**
What we sell, who we sell to, price positioning, main differentiators, markets. Injected into every AI prompt and battlecard draft. Manager edits, User reads.
This is the cheapest improvement to AI quality. Without it advice is generic.

---

## 5. Screens and flows

| Screen | Type | Purpose |
|---|---|---|
| Workspace "Competitor Intel" | Workspace (config) | Entry point: shortcuts, number cards (losses this month, open actions, new events this week) |
| Competitor Overview | existing page | Who beats us, trend, top reasons |
| Competitor Comparison | existing page | Side by side |
| Competitor Detail | existing page | Metrics, qualitative, timeline of events, loss history, battlecard, insights, actions |
| Competitor Event | list and form | Fast logging (aim: under ten seconds) |
| Competitor Battlecard | form (print-friendly) | Sales-ready one pager |
| Possible Duplicates | report | Manager tool (section 7) |
| Settings, Company Profile | single forms | Configuration |

Flow: Insight generated (on demand) -> "Create action" -> action has owner and due date -> due date passes -> prompt to fill `result_notes`.

Design rules: see `DESIGN.md`. Use Frappe CSS variables for background, text, borders so light and dark themes both work. Hex colors only for chart series and threat or status colors, chosen to be legible in both themes.

---

## 6. Roles and permissions

| Role | Can |
|---|---|
| **Competitor Intel User** | Read everything. Create Competitor Event. Create and edit own Strategy Actions. Read Battlecards and Company Profile. |
| **Competitor Intel Manager** | All of User, plus: run AI, edit Battlecards and Company Profile, assign actions, merge competitors, edit Settings, delete. |
| System Manager | Inherits all. |

Rules:
- Every whitelisted function checks permission with `frappe.has_permission` (or reads via `frappe.get_list`) before acting. Running AI, fetching external signals, and writing metrics require Manager.
- No endpoint relies on being "logged in" as authorization.
- Doctype permissions are defined on the doctypes, not only in code.

---

## 7. Duplicate competitors (dirty data)

Three layers:

1. **Prevent.** On Competitor `validate`, normalize the name (lowercase, strip punctuation and suffixes such as Inc, Ltd, LLC, Pvt) and compare against existing names and website domains. Same domain: block with a link to the existing record. Similar name: warn "Did you mean X?" and require confirmation.
2. **Detect.** "Possible Duplicates" report for Managers using the same normalization, plus fuzzy match.
3. **Fix.** Use Frappe's built-in rename-and-merge, which re-points every link (Quotation, Opportunity, Metrics, Events, Actions). Merges are permanent. Show a confirmation naming the record that will remain.

**VERIFY on bench:** rename and merge works for `Competitor` and updates links in our doctypes.

---

## 8. Automation

| Job | Frequency | Notes |
|---|---|---|
| Monthly loss snapshots | monthly | existing |
| Google Trends | weekly | writes `Competitor Metric` (source Google Trends). Max 5 terms per request. Wrap `pytrends` behind one function so it can be swapped. Brand names can be ambiguous: let a Competitor set a search term override. |
| Cloudflare Radar rank | weekly | optional, needs token in Settings |
| Weekly digest | weekly | new events, loss changes, new insights, metric moves. `frappe.sendmail` to the recipients role. |

Rules for every job:
- Wrapped in `try/except`, logs to Error Log, notifies a Manager **once per failure streak**, never fails the whole batch because one competitor failed.
- No live external calls on page load. Pages read stored data only.
- External or LLM calls from a user click run through `frappe.enqueue`, with a "running" state and a realtime or reload update.

Google Trends is an unofficial scraper and is relative (0 to 100), so it is a trend signal, not a measurement.

---

## 9. AI behavior

- **On demand only.** Nothing runs unattended.
- Prompt includes: Company Profile, selected competitors' qualitative data, recent events, loss reasons and counts for the period.
- Each result stores the input summary and model, so a reader can judge it.
- Output is parsed as JSON with a tolerant parser. If parsing fails, store the raw text and show an error, do not crash.
- Never render model output as HTML. Escape it.
- Provider code: one OpenAI-compatible path, one small Anthropic adapter. Everything else is configuration.

---

## 10. Engineering rules (binding for every Claude session)

**Structure**
1. Follow `CLAUDE.md` for folder depth. Before adding any file, find an existing file of the same kind and place the new one beside it. After adding a top-level module, run `import competitor_intel.<module>` in `bench console`.
2. After any doctype, page or report change: `bench --site <site> migrate` and fix sync errors before moving on.
3. Create and edit doctypes with **Developer Mode on, in Desk**, then commit the JSON Frappe exports. Do not hand-write doctype JSON.
4. Never vendor third-party libraries or reference material into the repo. Reference folders stay untracked (`.gitignore`).

**Code**
5. Python and JS use **tabs**. Run `ruff check --fix` and `ruff format` before every commit (the repo's pre-commit config does this).
6. No `ignore_permissions=True` in whitelisted code. If system-level access is needed, do it in a background job and say why in a comment.
7. No `frappe.db.commit()` inside request handlers. Frappe commits at request end. Commit only in long background jobs where partial progress matters.
8. Escape every dynamic value rendered as HTML (`frappe.utils.escape_html` in JS, `frappe.utils.escape_html` or Jinja autoescape in Python).
9. No hardcoded URLs, hosts, model names, or keys. Secrets live only in Password fields (never in code, fixtures, logs, or error messages).
10. Page scripts are scoped inside the page handler. No globals, no `document`-level listeners that outlive the page.
11. User-facing strings use `__()` (and `frappe._()` in Python).
12. Fixtures contain no site-specific data (owners, emails, creation timestamps from a personal site).
13. Declare every Python dependency in `pyproject.toml`.

**Process**
14. One concern per PR. Small PRs. Each milestone ends with: fresh install on a clean bench, `bench migrate` clean, tests passing.
15. New behavior needs a test (Frappe test classes). Permission rules need tests that prove a User cannot do Manager actions.
16. Record every non-obvious decision in section 13.

---

## 11. Milestones (each has a "done" check)

**M0. Cleanup** (branch `cleanup-v2`)
- Untrack `docs/design/frappe-ui-reference/`, add to `.gitignore`. Write `DESIGN.md`.
- Add `required_apps`. Fix `app_description`, README, `license.txt`, author contact.
- Ruff fixes, tab consistency in `api.py`.
- *Done when:* repo has no vendored folder, fresh `bench get-app` and `install-app` works on a clean v16 bench with ERPNext, `bench migrate` clean.

**M1. Foundations**
- Roles and doctype permissions. Permission checks on every endpoint.
- Competitor Intel Settings with Test connection. Company Profile.
- Move LLM call behind provider config, run via `frappe.enqueue`. AI Insight history fields.
- *Done when:* a User cannot run AI or read the API key (tested). Switching provider and model needs no code change. Insight generation does not block the page.

**M2. Data hygiene and signals**
- Remove mock API and its buttons; relabel old mock rows via patch.
- Trends and Cloudflare as scheduled jobs writing metrics.
- Duplicate prevention, report, verified merge.
- *Done when:* pages never call external services; a duplicate name or domain is caught on save; a merge keeps all history.

**M3. Events and digest**
- Competitor Event doctype, timeline on Competitor Detail.
- Weekly digest.
- *Done when:* logging an event takes under ten seconds and appears in next digest.

**M4. Battlecards and actions**
- Battlecard doctype, AI draft, approve flow, print format.
- "Create action" from Insight and Event. Result-notes prompt after due date.
- *Done when:* a Manager can go insight to approved action with owner and due date in a few clicks.

**M5. Design pass**
- Replace hardcoded colors with Frappe CSS variables in the three pages. Workspace and Number Cards.
- *Done when:* both light and dark themes look native on v16.

**M6. Release hygiene**
- Tests, GitHub Actions CI that installs the app on a fresh bench, README with install, requirements, optional keys, screenshots.
- *Done when:* a stranger can install from GitHub and see a working Overview with no manual steps beyond the README.

---

## 12. Open items to verify on a bench

1. Does ERPNext `Competitor` allow rename and merge, and what are its default permissions?
2. Exact Python and Node versions required by the target Frappe v16 release (read the migration guide).
3. Do the existing three pages render correctly in v16 dark theme, and which Frappe CSS variables exist in the installed version (read them from the installed `frappe` stylesheets).
4. Do `stamp_lost_on` hooks behave correctly when a Quotation is lost via ERPNext's popup on v16?
5. Cloudflare Radar: confirm current endpoint, free-tier limits, and response shape before relying on it.

---

## 13. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10 | Single business tracking own competitors; no client wrapper | Matches intended user; simpler model |
| 2026-10 | Loss Intelligence is the core feature | Uses ERPNext data no standalone tool has |
| 2026-10 | ERPNext is a required dependency (supersedes "optional") | App extends `Competitor` and hooks Quotation and Opportunity |
| 2026-10 | Frappe v16 only | Current release, repo already v16-style, solo maintainer cannot test two versions |
| 2026-10 | Two roles: Competitor Intel User and Manager | Simple, covers the weekly flows |
| 2026-10 | AI on demand, user supplies provider, model, key via Settings | Free-tier friendly, no vendor lock-in |
| 2026-10 | No industry-aware metrics in v1 | Complexity before demand |
| 2026-10 | Remove mock API and demo seeding | Fake numbers stored as real data mislead users |
| 2026-10 | Duplicates: prevent, detect, merge | Free-text names split statistics |
| 2026-10 | Reference UI library stays untracked locally; rules captured in `DESIGN.md` | Keeps repo clean while preserving look and feel |
