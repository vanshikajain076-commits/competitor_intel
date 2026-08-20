import frappe
import requests
from frappe.utils import today

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