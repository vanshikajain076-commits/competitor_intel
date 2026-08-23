import random

import frappe
import requests
from frappe.utils import add_days, today

MOCK_API_BASE = "http://mock-traffic-api:5000"

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