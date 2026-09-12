import json
import random

import frappe
import requests
from frappe.utils import add_days, get_first_day, today

from competitor_intel.loss_intelligence import collect_loss_data

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
		if frappe.db.exists("Competitor Metric", {
			"competitor": competitor, "metric_type": "Monthly Visits", "metric_date": day
		}):
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

	website = doc.website.replace("https://", "").replace("http://", "").rstrip("/")

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
	competitors = frappe.get_all("Competitor", fields=["name", "competitor_name", "website", "industry"])
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

		result.append({
			"competitor_name": c.competitor_name,
			"website": c.website,
			"industry": c.industry,
			"monthly_visits": latest.get("Monthly Visits"),
			"search_trend": latest.get("Search Trend Index"),
			"bounce_rate": latest.get("Bounce Rate"),
			"market_position": q.get("market_position"),
			"key_strength": q.get("key_strength"),
			"key_weakness": q.get("key_weakness"),
		})
	return result


@frappe.whitelist()
def get_comparison_trend(metric_type="Monthly Visits"):
	competitors = frappe.get_all("Competitor", fields=["name", "competitor_name"])
	series = {}
	all_dates = set()
	for c in competitors:
		rows = frappe.get_all(
			"Competitor Metric",
			filters={"competitor": c.name, "metric_type": metric_type},
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
		datasets.append({
			"name": name,
			"values": [values_by_date.get(d, 0) for d in sorted_dates],
			"real_flags": [d in values_by_date for d in sorted_dates],
		})
	return {"labels": sorted_dates, "datasets": datasets}


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
def get_top_competitors_by_losses(quarter_start, quarter_end):
	"""Top 5 competitors by total deals lost (quotation + opportunity) in a period.

	Sums quotation_lost_count + opportunity_lost_count across each
	competitor's Competitor Loss Snapshot rows whose period falls within
	[quarter_start, quarter_end].
	"""
	rows = frappe.get_all(
		"Competitor Loss Snapshot",
		filters={
			"period_start": [">=", quarter_start],
			"period_end": ["<=", quarter_end],
		},
		fields=["competitor", "quotation_lost_count", "opportunity_lost_count"],
	)

	totals = {}
	for row in rows:
		totals[row.competitor] = (
			totals.get(row.competitor, 0)
			+ (row.quotation_lost_count or 0)
			+ (row.opportunity_lost_count or 0)
		)

	ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:5]
	return [{"competitor": name, "total_lost": total} for name, total in ranked]


@frappe.whitelist()
def get_ai_insight(competitor):
	"""Moved from competitor_dashboard.py (Step 9d) — scoped to `competitor` instead of the old `analysis`."""
	existing = frappe.get_all(
		"AI Insight",
		filters={"competitor": competitor},
		fields=[
			"name", "generated_on", "threat_level", "threat_explanation",
			"market_gap_opportunities", "recommended_positioning"
		],
		order_by="generated_on desc",
		limit_page_length=1
	)
	return existing[0] if existing else None


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
		fields=["market_position", "pricing_model", "target_audience", "key_strength", "key_weakness", "differentiation"],
		order_by="review_date desc",
		limit_page_length=1,
	)
	qual = qual_rows[0] if qual_rows else {}

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
		headers={
			"Authorization": f"Bearer {frappe.conf.groq_api_key}",
			"Content-Type": "application/json"
		},
		json={
			"model": GROQ_MODEL,
			"messages": [{"role": "user", "content": prompt}],
			"temperature": 0.4
		},
		timeout=30
	)

	if response.status_code == 404:
		try:
			error_code = response.json().get("error", {}).get("code")
		except ValueError:
			error_code = None

		if error_code == "model_not_found":
			frappe.throw(
				f"Groq model \"{GROQ_MODEL}\" isn't available to this API key (404 model_not_found). "
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

	# One insight record per competitor: update if exists, else create new
	existing = frappe.get_all("AI Insight", filters={"competitor": competitor}, limit_page_length=1)

	if existing:
		insight_doc = frappe.get_doc("AI Insight", existing[0].name)
	else:
		insight_doc = frappe.new_doc("AI Insight")
		insight_doc.competitor = competitor

	insight_doc.threat_level = parsed.get("threat_level")
	insight_doc.threat_explanation = parsed.get("threat_explanation")
	insight_doc.market_gap_opportunities = parsed.get("market_gap_opportunities")
	insight_doc.recommended_positioning = parsed.get("recommended_positioning")
	insight_doc.generated_on = frappe.utils.now()
	insight_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return insight_doc.as_dict()