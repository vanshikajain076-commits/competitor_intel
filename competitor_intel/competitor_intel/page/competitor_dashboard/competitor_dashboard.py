import frappe

@frappe.whitelist()
def get_dashboard_data(analysis=None):
	filters = {}
	if analysis:
		filters["analysis"] = analysis

	snapshots = frappe.get_all(
		"Competitor Snapshot",
		filters=filters,
		fields=[
			"name", "competitor_name", "website", "monthly_visits",
			"bounce_rate", "avg_duration_seconds", "pages_per_visit",
			"trend_percent", "market_position", "pricing_model",
			"target_audience", "key_strength", "key_weakness", "differentiation"
		]
	)

	for s in snapshots:
		s["traffic_sources"] = frappe.get_all(
			"Traffic Source",
			filters={"parent": s["name"]},
			fields=["source_type", "percentage"]
		)

	return snapshots