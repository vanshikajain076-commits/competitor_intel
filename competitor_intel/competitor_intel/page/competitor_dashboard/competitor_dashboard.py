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

import json
import requests


@frappe.whitelist()
def generate_ai_insights(analysis):
	snapshots = get_dashboard_data(analysis)

	if not snapshots:
		frappe.throw("No competitor snapshots found for this analysis.")

	# Build a plain-text summary of the data to feed the model
	summary_lines = []
	for s in snapshots:
		summary_lines.append(
			f"- {s['competitor_name']}: {s['monthly_visits']} monthly visits, "
			f"{s['bounce_rate']}% bounce rate, position: {s['market_position']}, "
			f"pricing: {s['pricing_model']}, strength: {s['key_strength']}, "
			f"weakness: {s['key_weakness']}, differentiation: {s['differentiation']}"
		)
	data_summary = "\n".join(summary_lines)

	prompt = f"""You are a market analyst. Based on this competitor data:

{data_summary}

Respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) with exactly these keys:
- "threat_level": one of "High", "Medium", "Low"
- "threat_explanation": a 2-3 sentence explanation of the threat level
- "market_gap_opportunities": 2-3 sentences on gaps in the market these competitors aren't covering
- "recommended_positioning": 2-3 sentences on how to position against these competitors
"""

	response = requests.post(
		"https://api.groq.com/openai/v1/chat/completions",
		headers={
			"Authorization": f"Bearer {frappe.conf.groq_api_key}",
			"Content-Type": "application/json"
		},
		json={
			"model": "llama-3.3-70b-versatile",
			"messages": [{"role": "user", "content": prompt}],
			"temperature": 0.4
		},
		timeout=30
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

	# One insight record per analysis: update if exists, else create new
	existing = frappe.get_all("AI Insight", filters={"analysis": analysis}, limit_page_length=1)

	if existing:
		doc = frappe.get_doc("AI Insight", existing[0].name)
	else:
		doc = frappe.new_doc("AI Insight")
		doc.analysis = analysis

	doc.threat_level = parsed.get("threat_level")
	doc.threat_explanation = parsed.get("threat_explanation")
	doc.market_gap_opportunities = parsed.get("market_gap_opportunities")
	doc.recommended_positioning = parsed.get("recommended_positioning")
	doc.generated_on = frappe.utils.now()
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return doc.as_dict()