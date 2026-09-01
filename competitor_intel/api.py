import random

import frappe
import requests
from frappe.utils import add_days, today

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