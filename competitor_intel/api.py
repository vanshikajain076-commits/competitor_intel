import random

import frappe
import requests
from frappe.utils import add_days, get_first_day, today

from competitor_intel.loss_intelligence import collect_loss_data

MOCK_API_BASE = "http://localhost:5001"

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
		datasets.append({
			"name": name,
			"values": [values_by_date.get(d) for d in sorted_dates],
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