import json
import random
import re

import frappe
import requests
from frappe.utils import add_days, get_first_day, strip_html, today

from competitor_intel.loss_intelligence import bucket_ranges, collect_loss_data

MOCK_API_BASE = "http://localhost:5001"

# Groq's model lineup changes over time (deprecations, plan-tier gating, etc.) —
# verified against the live /v1/models list for this site's API key on 2026-09-11.
# If this starts 404ing again, check https://console.groq.com/docs/models for what
# your key currently has access to and swap the name here.
GROQ_MODEL = "openai/gpt-oss-120b"

METRIC_MAP = {
	"monthly_visits": "Monthly Visits",
	"page_views": "Page Views",
	"bounce_rate": "Bounce Rate",
	"avg_duration_seconds": "Avg Duration (seconds)",
	"pages_per_visit": "Pages per Visit",
}


@frappe.whitelist()
def fetch_traffic_data(competitor):
	"""Fetch mock traffic data for a Competitor and save it as Competitor Metric records."""
	doc = frappe.get_doc("Competitor", competitor)
	if not doc.website:
		frappe.throw("This Competitor has no website set.")

	response = requests.get(f"{MOCK_API_BASE}/traffic/{doc.website}", timeout=10)
	response.raise_for_status()
	data = response.json()

	created = []
	for api_field, metric_type in METRIC_MAP.items():
		if api_field not in data:
			continue
		metric = frappe.new_doc("Competitor Metric")
		metric.competitor = competitor
		metric.metric_date = today()
		metric.metric_type = metric_type
		metric.value = data[api_field]
		metric.source = "Mock API"
		metric.insert(ignore_permissions=True)
		created.append(metric.name)

	frappe.db.commit()
	return {"created": created, "raw": data}


@frappe.whitelist()
def seed_demo_history(competitor, days=14):
	"""Backfill a believable-looking Monthly Visits trend, for demo purposes only."""
	doc = frappe.get_doc("Competitor", competitor)
	if not doc.website:
		frappe.throw("This Competitor has no website set.")

	days = int(days)
	response = requests.get(f"{MOCK_API_BASE}/traffic/{doc.website}", timeout=10)
	response.raise_for_status()
	base_visits = response.json().get("monthly_visits", 100000)

	random.seed(doc.website)
	trend = random.choice([1, -1]) * random.uniform(0.005, 0.02)

	created = []
	for i in range(days, -1, -1):
		day = add_days(today(), -i)
		if frappe.db.exists(
			"Competitor Metric",
			{"competitor": competitor, "metric_type": "Monthly Visits", "metric_date": day},
		):
			continue
		noise = random.uniform(-0.03, 0.03)
		day_value = int(base_visits * (1 + trend * (days - i)) * (1 + noise))
		metric = frappe.new_doc("Competitor Metric")
		metric.competitor = competitor
		metric.metric_date = day
		metric.metric_type = "Monthly Visits"
		metric.value = day_value
		metric.source = "Mock API"
		metric.insert(ignore_permissions=True)
		created.append(metric.name)

	frappe.db.commit()
	return {"created": created}


@frappe.whitelist()
def fetch_cloudflare_rank(competitor):
	"""Fetch a domain's real traffic rank from the Cloudflare Radar API and save it as a Competitor Metric."""
	doc = frappe.get_doc("Competitor", competitor)
	if not doc.website:
		frappe.throw("This Competitor has no website set.")

	token = frappe.conf.get("cloudflare_api_token")
	if not token:
		frappe.throw(
			"Cloudflare API token isn't configured. Add <code>cloudflare_api_token</code> "
			"to your site config to enable this feature."
		)

	website = doc.website.replace("https://", "").replace("http://", "").rstrip("/").split("/")[0]

	response = requests.get(
		f"https://api.cloudflare.com/client/v4/radar/ranking/domain/{website}",
		headers={"Authorization": f"Bearer {token}"},
		timeout=10,
	)
	response.raise_for_status()
	data = response.json()

	details = None
	for key, value in data.get("result", {}).items():
		if key == "meta" or not isinstance(value, dict):
			continue
		details = value
		break

	rank = details.get("rank") if details else None
	bucket = details.get("bucket") if details else None

	# `bucket` is the domain's rank ceiling, e.g. "10000" means "ranked somewhere
	# in the top 10,000". Beyond the largest defined bucket, Cloudflare returns a
	# non-numeric sentinel like ">200000" — that can't be turned into a real
	# upper-bound estimate, so it's treated the same as "no ranking data".
	bucket_estimate = None
	if bucket is not None:
		try:
			bucket_estimate = int(bucket)
		except (TypeError, ValueError):
			bucket_estimate = None

	if rank is not None:
		value = rank
		source = "Cloudflare Radar (Exact Rank)"
	elif bucket_estimate is not None:
		value = bucket_estimate
		source = "Cloudflare Radar (Bucket Estimate)"
	else:
		return {"message": "No Cloudflare ranking available for this domain"}

	metric = frappe.new_doc("Competitor Metric")
	metric.competitor = competitor
	metric.metric_date = today()
	metric.metric_type = "Cloudflare Traffic Rank"
	metric.value = value
	metric.source = source
	metric.insert(ignore_permissions=True)
	frappe.db.commit()

	return {"created": metric.name, "value": value, "source": source}


@frappe.whitelist()
def fetch_search_trend(competitor):
	"""Fetch real Google Trends interest-over-time for a Competitor's name and
	save it as Competitor Metric rows (metric_type = "Search Trend Index").

	Google Trends is keyword-based, not domain-based, so this searches on
	`competitor_name` rather than `website`. Re-running this is safe: an
	existing row for a date that's already been fetched gets its value
	updated in place instead of erroring against the duplicate-prevention
	validation on Competitor Metric.
	"""
	from pytrends.request import TrendReq

	doc = frappe.get_doc("Competitor", competitor)
	keyword = doc.competitor_name

	try:
		pytrends = TrendReq(hl="en-US", tz=360)
		pytrends.build_payload([keyword], timeframe="today 3-m")
		df = pytrends.interest_over_time()
	except Exception:
		frappe.log_error(
			title=f"Google Trends fetch failed: {competitor}",
			message=frappe.get_traceback(),
		)
		return {"message": f"No search trend data available for '{keyword}' right now."}

	if df.empty:
		return {"message": f"No search trend data available for '{keyword}' right now."}

	# `isPartial` marks the most recent point(s) as not-yet-finalized by Google -
	# excluded rather than stored, so a Competitor Metric row is never a value
	# that could still change.
	if "isPartial" in df.columns:
		df = df[df["isPartial"] == False]  # noqa: E712
		df = df.drop(columns=["isPartial"])

	if df.empty or keyword not in df.columns:
		return {"message": f"No search trend data available for '{keyword}' right now."}

	created, updated = [], []
	for date, row in df.iterrows():
		metric_date = date.strftime("%Y-%m-%d")
		existing_name = frappe.db.get_value(
			"Competitor Metric",
			{"competitor": competitor, "metric_date": metric_date, "metric_type": "Search Trend Index"},
		)
		is_new = not existing_name
		if existing_name:
			metric = frappe.get_doc("Competitor Metric", existing_name)
		else:
			metric = frappe.new_doc("Competitor Metric")
			metric.competitor = competitor
			metric.metric_date = metric_date
			metric.metric_type = "Search Trend Index"

		metric.value = row[keyword]
		metric.source = "Google Trends"
		metric.save(ignore_permissions=True)

		(created if is_new else updated).append(metric.name)

	frappe.db.commit()

	return {"created": created, "updated": updated}


@frappe.whitelist()
def get_monthly_visits_trend(competitor):
	rows = frappe.get_all(
		"Competitor Metric",
		filters={"competitor": competitor, "metric_type": "Monthly Visits"},
		fields=["metric_date", "value"],
		order_by="metric_date asc",
	)
	return {
		"labels": [str(r.metric_date) for r in rows],
		"values": [r.value for r in rows],
	}


@frappe.whitelist()
def get_overview_data():
	"""Per-competitor snapshot for the Overview table.

	Surfaces the latest value for every Competitor Metric type that actually
	has data recorded anywhere, instead of a hardcoded subset (Monthly Visits/
	Bounce Rate) that silently ignored newer metric types like Cloudflare
	Traffic Rank or the Traffic: * breakdown. Also reports is_active so the
	frontend can de-emphasize retired competitors instead of mixing them in
	with current ones.
	"""
	# Inactive competitors are excluded by default rather than shown alongside
	# current ones -- an old/retired competitor with stale metrics reads as
	# current data otherwise, which is worse than just leaving it off this view.
	competitors = frappe.get_all(
		"Competitor",
		filters={"is_active": 1},
		fields=["name", "competitor_name", "website", "industry", "is_active", "logo"],
		order_by="competitor_name asc",
	)

	# Columns are scoped to metrics that exist for a competitor actually shown
	# here -- an inactive-only metric type would otherwise add an all-dash
	# column now that inactive competitors are excluded above.
	metric_types = []
	if competitors:
		metric_types = frappe.get_all(
			"Competitor Metric",
			filters={"competitor": ["in", [c.name for c in competitors]]},
			fields=["metric_type"],
			group_by="metric_type",
			order_by="metric_type asc",
			pluck="metric_type",
		)

	result = []
	for c in competitors:
		latest = {}
		for row in frappe.get_all(
			"Competitor Metric",
			filters={"competitor": c.name},
			fields=["metric_type", "value", "metric_date"],
			order_by="metric_date desc",
		):
			if row.metric_type not in latest:
				latest[row.metric_type] = row.value

		qual = frappe.get_all(
			"Competitor Qualitative",
			filters={"competitor": c.name},
			fields=["market_position", "key_strength", "key_weakness"],
			order_by="review_date desc",
			limit_page_length=1,
		)
		q = qual[0] if qual else {}

		result.append(
			{
				"competitor_name": c.competitor_name,
				"website": c.website,
				"industry": c.industry,
				"is_active": bool(c.is_active),
				"logo": c.logo,
				"metrics": {mt: latest.get(mt) for mt in metric_types},
				"market_position": q.get("market_position"),
				"key_strength": q.get("key_strength"),
				"key_weakness": q.get("key_weakness"),
			}
		)
	return {
		"metric_types": metric_types,
		"rows": result,
		# Full Select option lists (not just values in use) so a filter chip for an
		# unused option -- e.g. an Industry no competitor has been tagged with yet --
		# still shows up instead of only appearing once someone starts using it.
		"industry_options": _select_options("Competitor", "industry"),
		"position_options": _select_options("Competitor Qualitative", "market_position"),
	}


def _select_options(doctype, fieldname):
	options = frappe.get_meta(doctype).get_field(fieldname).options or ""
	return [o for o in options.split("\n") if o.strip()]


def _parse_list_arg(value):
	"""Whitelisted methods can receive a JS array either already decoded or as a JSON string, depending on how the call was made."""
	if isinstance(value, str):
		return json.loads(value)
	return value


@frappe.whitelist()
def get_comparison_trend(metric_type="Monthly Visits", competitors=None, period_start=None, period_end=None):
	"""Multi-competitor trend for one Competitor Metric type.

	`competitors`/`period_start`/`period_end` are optional filters on top of the
	original all-competitors, all-time behaviour (used as-is by competitor_overview.js),
	so a comparison view can scope this to just the competitors and date range picked there.
	"""
	competitor_filters = {}
	if competitors:
		competitor_filters["name"] = ["in", _parse_list_arg(competitors)]
	all_competitors = frappe.get_all(
		"Competitor", filters=competitor_filters, fields=["name", "competitor_name"]
	)

	series = {}
	all_dates = set()
	for c in all_competitors:
		metric_filters = {"competitor": c.name, "metric_type": metric_type}
		if period_start and period_end:
			metric_filters["metric_date"] = ["between", [period_start, period_end]]
		rows = frappe.get_all(
			"Competitor Metric",
			filters=metric_filters,
			fields=["metric_date", "value"],
			order_by="metric_date asc",
		)
		series[c.competitor_name] = {str(r.metric_date): r.value for r in rows}
		all_dates.update(str(r.metric_date) for r in rows)

	sorted_dates = sorted(all_dates)
	datasets = []
	for name, values_by_date in series.items():
		# frappe-charts (bundled here, v2.0.0-rc27) has no real "skip this point" gap
		# support for line charts: its own dataset sanitizer only coerces undefined/NaN
		# to 0 (and still requires every series to be as long as `labels`), while a bare
		# `null` slips through uncoerced and breaks path generation (`<path> attribute d:
		# ... "M485,undefined"` in the console). Confirmed by reproducing it live before
		# this fix. 0 is a known imperfect stand-in for "no data that day" rather than
		# "measured zero" — but it's the only value this chart can actually render here.
		# Also flag which of those values are real vs. the 0 stand-in above, so the
		# chart layer can tell a genuine single-day measurement apart from a mostly-
		# empty series — otherwise a competitor with exactly one real data point
		# reads as a misleading line rising from an implied zero.
		datasets.append(
			{
				"name": name,
				"values": [values_by_date.get(d, 0) for d in sorted_dates],
				"real_flags": [d in values_by_date for d in sorted_dates],
			}
		)
	return {"labels": sorted_dates, "datasets": datasets}


@frappe.whitelist()
def get_comparison_loss_series(competitors, period_start, period_end, value="count"):
	"""Multi-competitor loss trend for the comparison chart's loss-derived metrics.

	collect_loss_data() aggregates a whole [period_start, period_end] window into one flat
	number per competitor with no time-bucketing of its own (generate_monthly_loss_snapshots
	is the only place that buckets it today, and only by calendar month). This generalizes
	that same aggregator to an arbitrary window by calling it once per bucket_ranges() slice,
	returning the same {labels, datasets: [{name, values, real_flags}]} shape get_comparison_trend
	does, so the chart/single-point-dot logic on the frontend is identical either way.
	"""
	competitors = _parse_list_arg(competitors)
	buckets = bucket_ranges(period_start, period_end)

	labels = []
	datasets = {c: {"name": c, "values": [], "real_flags": []} for c in competitors}
	for b_start, b_end, label in buckets:
		labels.append(label)
		by_competitor, _ = collect_loss_data(b_start, b_end)
		for c in competitors:
			bucket = by_competitor.get(c)
			count = (bucket["quotation_count"] + bucket["opportunity_count"]) if bucket else 0
			lost_value = (bucket["quotation_value"] + bucket["opportunity_value"]) if bucket else 0
			v = count if value == "count" else (lost_value / count if count else 0)
			datasets[c]["values"].append(v)
			datasets[c]["real_flags"].append(count > 0)

	return {"labels": labels, "datasets": list(datasets.values())}


@frappe.whitelist()
def get_comparison_table(competitors, period_start, period_end):
	"""Side-by-side row data for the comparison page: real Competitor + latest
	Competitor Qualitative + latest in-range Competitor Metric + loss numbers for
	the exact selected period, per selected competitor. Missing data comes back
	as None so the frontend can render an honest "-" instead of inventing copy.
	"""
	competitors = _parse_list_arg(competitors)
	by_competitor, _ = collect_loss_data(period_start, period_end)

	result = []
	for name in competitors:
		docs = frappe.get_all(
			"Competitor",
			filters={"name": name},
			fields=["name", "competitor_name", "industry", "website"],
			limit_page_length=1,
		)
		if not docs:
			continue
		c = docs[0]

		qual_rows = frappe.get_all(
			"Competitor Qualitative",
			filters={"competitor": name},
			fields=[
				"market_position",
				"pricing_model",
				"target_audience",
				"key_strength",
				"key_weakness",
				"differentiation",
			],
			order_by="review_date desc",
			limit_page_length=1,
		)
		qual = qual_rows[0] if qual_rows else {}

		current_visits = frappe.get_all(
			"Competitor Metric",
			filters={
				"competitor": name,
				"metric_type": "Monthly Visits",
				"metric_date": ["between", [period_start, period_end]],
			},
			fields=["value"],
			order_by="metric_date desc",
			limit_page_length=1,
		)
		prior_visits = frappe.get_all(
			"Competitor Metric",
			filters={"competitor": name, "metric_type": "Monthly Visits", "metric_date": ["<", period_start]},
			fields=["value"],
			order_by="metric_date desc",
			limit_page_length=1,
		)

		loss = by_competitor.get(name) or {
			"opportunity_count": 0,
			"opportunity_value": 0,
			"quotation_count": 0,
			"quotation_value": 0,
		}

		result.append(
			{
				"competitor_name": c.competitor_name,
				"industry": c.industry,
				"website": c.website,
				"market_position": qual.get("market_position"),
				"pricing_model": qual.get("pricing_model"),
				"target_audience": qual.get("target_audience"),
				"key_strength": qual.get("key_strength"),
				"key_weakness": qual.get("key_weakness"),
				"differentiation": qual.get("differentiation"),
				"monthly_visits": current_visits[0].value if current_visits else None,
				"monthly_visits_prior": prior_visits[0].value if prior_visits else None,
				"deals_lost": loss["quotation_count"] + loss["opportunity_count"],
				"pipeline_lost": loss["quotation_value"] + loss["opportunity_value"],
			}
		)

	return result


@frappe.whitelist()
def get_current_month_loss_data(competitor=None):
	"""Read-only, on-demand current-month-to-date loss numbers.

	Does not write anything to the database. If `competitor` is given,
	returns only that competitor's slice of by_competitor; otherwise
	returns the full company-wide by_competitor/by_reason breakdown.
	"""
	period_start = get_first_day(today())
	period_end = today()

	by_competitor, by_reason = collect_loss_data(period_start, period_end)

	if competitor:
		data = by_competitor.get(competitor) or {
			"opportunity_count": 0,
			"opportunity_value": 0,
			"quotation_count": 0,
			"quotation_value": 0,
			"reasons": {},
		}
		return {
			"period_start": period_start,
			"period_end": period_end,
			"competitor": competitor,
			"opportunity_count": data["opportunity_count"],
			"opportunity_value": data["opportunity_value"],
			"quotation_count": data["quotation_count"],
			"quotation_value": data["quotation_value"],
			"reasons": [
				{"reason_type": reason_type, "lost_reason": reason_name, "count": count}
				for (reason_type, reason_name), count in data["reasons"].items()
			],
		}

	return {
		"period_start": period_start,
		"period_end": period_end,
		"by_competitor": [
			{
				"competitor": name,
				"opportunity_count": data["opportunity_count"],
				"opportunity_value": data["opportunity_value"],
				"quotation_count": data["quotation_count"],
				"quotation_value": data["quotation_value"],
				"reasons": [
					{"reason_type": reason_type, "lost_reason": reason_name, "count": count}
					for (reason_type, reason_name), count in data["reasons"].items()
				],
			}
			for name, data in by_competitor.items()
		],
		"by_reason": [
			{"reason_type": reason_type, "lost_reason": reason_name, **data}
			for (reason_type, reason_name), data in by_reason.items()
		],
	}


@frappe.whitelist()
def get_top_competitors_by_losses(period_start, period_end):
	"""Top 5 competitors by total deals lost (quotation + opportunity) in a period.

	Live via collect_loss_data() rather than the (month-aligned, finalized-only)
	Competitor Loss Snapshot table, so this works for the in-progress current
	month/quarter/year the Overview page's shared date-range control can select,
	as well as an arbitrary custom range -- not just already-snapshotted months.
	"""
	by_competitor, _ = collect_loss_data(period_start, period_end)

	totals = {
		name: data["quotation_count"] + data["opportunity_count"] for name, data in by_competitor.items()
	}
	ranked = sorted(
		((name, total) for name, total in totals.items() if total > 0),
		key=lambda item: item[1],
		reverse=True,
	)[:5]
	return [{"competitor": name, "total_lost": total} for name, total in ranked]


@frappe.whitelist()
def get_loss_kpis(period_start, period_end, prior_start, prior_end):
	"""Company-wide loss KPIs for the Overview page's KPI row: the selected
	period's totals plus the same totals for a prior comparison period, both
	computed live via collect_loss_data() (never from Competitor Loss Snapshot,
	so this works for in-progress periods and custom ranges too).

	What counts as the "equivalent prior period" depends on the selected
	granularity (Month/Quarter/Year vs. Custom Range), so that date math lives
	in the frontend (competitor_overview.js) where the granularity is known --
	this just aggregates whatever two ranges it's given.

	Totals are summed via by_reason, the same way the page's former "This Month
	So Far" cards did -- so this carries the same full-attribution trade-off
	documented in collect_loss_data's docstring (a deal with multiple reasons
	counts fully toward each), not a new one.
	"""

	def _totals(start, end):
		_, by_reason = collect_loss_data(start, end)
		totals = {
			"opportunity_count": 0,
			"opportunity_value": 0,
			"quotation_count": 0,
			"quotation_value": 0,
		}
		for data in by_reason.values():
			totals["opportunity_count"] += data["opportunity_count"]
			totals["opportunity_value"] += data["opportunity_value"]
			totals["quotation_count"] += data["quotation_count"]
			totals["quotation_value"] += data["quotation_value"]
		return totals

	return {
		"period_start": period_start,
		"period_end": period_end,
		"prior_start": prior_start,
		"prior_end": prior_end,
		"current": _totals(period_start, period_end),
		"prior": _totals(prior_start, prior_end),
	}


@frappe.whitelist()
def get_last_snapshot_generated_on(competitor=None):
	"""Most recent generated_on across Competitor Loss Snapshots (optionally one competitor)."""
	filters = {"generated_on": ["is", "set"]}
	if competitor:
		filters["competitor"] = competitor
	rows = frappe.get_all(
		"Competitor Loss Snapshot",
		filters=filters,
		fields=["generated_on"],
		order_by="generated_on desc",
		limit_page_length=1,
	)
	return str(rows[0].generated_on) if rows else None


@frappe.whitelist()
def get_competitor_lifetime_stats(competitor):
	"""All-time quick stats + recent activity for the Competitor Detail page header.

	Unlike collect_loss_data() (bounded to one [period_start, period_end] window and always
	loading full docs to unpack per-deal `lost_reasons`), this only needs per-record totals,
	the latest loss date, and a short activity feed for one competitor -- so it queries
	Quotation/Opportunity directly through the shared "Competitor Detail" Table MultiSelect
	child doctype instead of walking every lost deal company-wide.
	"""
	quotations = frappe.get_all(
		"Quotation",
		filters=[
			["Competitor Detail", "competitor", "=", competitor],
			["Quotation", "status", "=", "Lost"],
		],
		fields=["name", "customer_name", "lost_on", "grand_total"],
		order_by="lost_on desc",
	)
	opportunities = frappe.get_all(
		"Opportunity",
		filters=[
			["Competitor Detail", "competitor", "=", competitor],
			["Opportunity", "status", "=", "Lost"],
		],
		fields=["name", "title", "lost_on", "opportunity_amount"],
		order_by="lost_on desc",
	)

	activity = [
		{
			"type": "Quotation",
			"label": q.customer_name or q.name,
			"date": str(q.lost_on) if q.lost_on else None,
			"value": q.grand_total or 0,
		}
		for q in quotations
	] + [
		{
			"type": "Opportunity",
			"label": o.title or o.name,
			"date": str(o.lost_on) if o.lost_on else None,
			"value": o.opportunity_amount or 0,
		}
		for o in opportunities
	]

	latest_note = frappe.get_all(
		"Competitor Qualitative",
		filters={"competitor": competitor},
		fields=["modified"],
		order_by="modified desc",
		limit_page_length=1,
	)
	if latest_note and latest_note[0].modified:
		activity.append(
			{
				"type": "Note",
				"label": "Qualitative note updated",
				"date": str(latest_note[0].modified.date()),
				"value": None,
			}
		)

	activity = [row for row in activity if row["date"]]
	activity.sort(key=lambda row: row["date"], reverse=True)

	loss_dates = [row["date"] for row in activity if row["type"] != "Note"]

	return {
		"opportunity_count": len(opportunities),
		"quotation_count": len(quotations),
		"total_value_lost": sum(q.grand_total or 0 for q in quotations)
		+ sum(o.opportunity_amount or 0 for o in opportunities),
		"last_loss_date": max(loss_dates) if loss_dates else None,
		"recent_activity": activity[:6],
	}


THREAT_LEVEL_OPTIONS = ("High", "Medium", "Low")


def _normalize_threat_level(raw):
	"""Map the model's threat_level output onto the AI Insight Select options.

	Handles case/whitespace/punctuation differences ("high", " HIGH. ") and
	near-matches ("High threat", "medium-high risk"). Returns "" (a valid empty
	Select value) when nothing maps unambiguously, so the save never fails on it.
	"""
	if not isinstance(raw, str):
		return ""

	text = raw.strip().strip("\"'.").strip().lower()
	for option in THREAT_LEVEL_OPTIONS:
		if text == option.lower():
			return option

	found = {option for option in THREAT_LEVEL_OPTIONS if re.search(rf"\b{option.lower()}\b", text)}
	return found.pop() if len(found) == 1 else ""


@frappe.whitelist()
def get_ai_insights(competitor):
	"""All AI Insights for `competitor`, newest first (history: the first row is the current insight)."""
	return frappe.get_all(
		"AI Insight",
		filters={"competitor": competitor},
		fields=[
			"name",
			"generated_on",
			"threat_level",
			"threat_explanation",
			"market_gap_opportunities",
			"recommended_positioning",
			"data_snapshot",
		],
		order_by="generated_on desc, creation desc",
		limit_page_length=0,
	)


@frappe.whitelist()
def generate_ai_insights(competitor):
	"""Moved from competitor_dashboard.py (Step 9d) — scoped to `competitor` instead of the old `analysis`."""
	if not frappe.conf.get("groq_api_key"):
		frappe.throw("Groq API key not configured. Ask your administrator to set one up.")

	doc = frappe.get_doc("Competitor", competitor)

	latest_metrics = {}
	for row in frappe.get_all(
		"Competitor Metric",
		filters={"competitor": competitor},
		fields=["metric_type", "value"],
		order_by="metric_date desc",
	):
		if row.metric_type not in latest_metrics:
			latest_metrics[row.metric_type] = row.value

	qual_rows = frappe.get_all(
		"Competitor Qualitative",
		filters={"competitor": competitor},
		fields=[
			"market_position",
			"pricing_model",
			"target_audience",
			"key_strength",
			"key_weakness",
			"differentiation",
		],
		order_by="review_date desc",
		limit_page_length=1,
	)
	# Several qualitative fields are Text Editor (HTML) -- send plain text to the model
	qual = (
		{k: strip_html(v).strip() if isinstance(v, str) else v for k, v in qual_rows[0].items()}
		if qual_rows
		else {}
	)

	if not latest_metrics and not qual:
		frappe.throw("No metrics or qualitative notes found for this competitor yet.")

	metrics_summary = ", ".join(f"{k}: {v}" for k, v in latest_metrics.items()) or "no metrics recorded"

	data_summary = (
		f"Competitor: {doc.competitor_name} (industry: {doc.industry or 'unknown'}, website: {doc.website or 'unknown'})\n"
		f"Latest metrics: {metrics_summary}\n"
		f"Market position: {qual.get('market_position') or 'unknown'}, pricing model: {qual.get('pricing_model') or 'unknown'}, "
		f"target audience: {qual.get('target_audience') or 'unknown'}\n"
		f"Strength: {qual.get('key_strength') or 'unknown'}, weakness: {qual.get('key_weakness') or 'unknown'}, "
		f"differentiation: {qual.get('differentiation') or 'unknown'}"
	)

	prompt = f"""You are a market analyst. Based on this competitor data:

{data_summary}

Respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) with exactly these keys:
- "threat_level": one of "High", "Medium", "Low"
- "threat_explanation": a 2-3 sentence explanation of the threat level
- "market_gap_opportunities": 2-3 sentences on gaps in the market this competitor isn't covering
- "recommended_positioning": 2-3 sentences on how to position against this competitor
"""

	response = requests.post(
		"https://api.groq.com/openai/v1/chat/completions",
		headers={"Authorization": f"Bearer {frappe.conf.groq_api_key}", "Content-Type": "application/json"},
		json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.4},
		timeout=30,
	)

	if response.status_code == 404:
		try:
			error_code = response.json().get("error", {}).get("code")
		except ValueError:
			error_code = None

		if error_code == "model_not_found":
			frappe.throw(
				f'Groq model "{GROQ_MODEL}" isn\'t available to this API key (404 model_not_found). '
				"Groq's model lineup changes over time — models get deprecated or moved behind higher "
				"plan tiers — so this hardcoded name can go stale again. Check "
				"https://console.groq.com/docs/models (or GET /v1/models with your key) for what's "
				"currently available, then update GROQ_MODEL in competitor_intel/api.py."
			)

	if response.status_code != 200:
		frappe.throw(f"Groq API error: {response.status_code} - {response.text}")

	result = response.json()
	content = result["choices"][0]["message"]["content"].strip()

	# Models sometimes wrap JSON in code fences despite instructions -- strip if present
	if content.startswith("```"):
		content = content.strip("`")
		content = content.replace("json\n", "", 1) if content.startswith("json") else content

	try:
		parsed = json.loads(content)
	except json.JSONDecodeError:
		frappe.throw(f"Could not parse AI response as JSON: {content}")

	if not isinstance(parsed, dict):
		frappe.throw(f"Unexpected AI response shape (expected a JSON object): {content}")

	# History is kept: every generation inserts a new record instead of updating the last one
	insight_doc = frappe.new_doc("AI Insight")
	insight_doc.competitor = competitor
	insight_doc.threat_level = _normalize_threat_level(parsed.get("threat_level"))
	insight_doc.threat_explanation = parsed.get("threat_explanation")
	insight_doc.market_gap_opportunities = parsed.get("market_gap_opportunities")
	insight_doc.recommended_positioning = parsed.get("recommended_positioning")
	insight_doc.data_snapshot = data_summary
	insight_doc.generated_on = frappe.utils.now()
	insight_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return insight_doc.as_dict()
