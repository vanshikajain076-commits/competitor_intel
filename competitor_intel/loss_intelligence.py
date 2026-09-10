import frappe


def collect_loss_data(period_start, period_end):
	"""Aggregate lost Quotations and Opportunities in [period_start, period_end].

	Returns (by_competitor, by_reason):
	  by_competitor: {competitor_name: {opportunity_count, opportunity_value,
	      quotation_count, quotation_value, reasons: {(reason_type, reason_name): count}}}
	  by_reason: {(reason_type, reason_name): {opportunity_count, opportunity_value,
	      quotation_count, quotation_value}}

	Full attribution: a deal with multiple competitors or reasons counts fully
	toward each one, not split.
	"""
	by_competitor = {}
	by_reason = {}

	_collect_quotations(period_start, period_end, by_competitor, by_reason)
	_collect_opportunities(period_start, period_end, by_competitor, by_reason)

	return by_competitor, by_reason


def _empty_competitor_bucket():
	return {
		"opportunity_count": 0,
		"opportunity_value": 0,
		"quotation_count": 0,
		"quotation_value": 0,
		"reasons": {},
	}


def _empty_reason_bucket():
	return {
		"opportunity_count": 0,
		"opportunity_value": 0,
		"quotation_count": 0,
		"quotation_value": 0,
	}


def _collect_quotations(period_start, period_end, by_competitor, by_reason):
	quotations = frappe.get_all(
		"Quotation",
		filters={
			"status": "Lost",
			"lost_on": ["between", [period_start, period_end]],
		},
		pluck="name",
	)

	for name in quotations:
		doc = frappe.get_doc("Quotation", name)
		competitor_names = [row.competitor for row in doc.competitors if row.competitor]
		reason_keys = [
			("Quotation Lost Reason", row.lost_reason) for row in doc.lost_reasons if row.lost_reason
		]
		_apply(by_competitor, by_reason, competitor_names, reason_keys, "quotation", doc.grand_total or 0)


def _collect_opportunities(period_start, period_end, by_competitor, by_reason):
	opportunities = frappe.get_all(
		"Opportunity",
		filters={
			"status": "Lost",
			"lost_on": ["between", [period_start, period_end]],
		},
		pluck="name",
	)

	for name in opportunities:
		doc = frappe.get_doc("Opportunity", name)
		competitor_names = [row.competitor for row in doc.competitors if row.competitor]
		reason_keys = [
			("Opportunity Lost Reason", row.lost_reason) for row in doc.lost_reasons if row.lost_reason
		]
		_apply(
			by_competitor, by_reason, competitor_names, reason_keys, "opportunity", doc.opportunity_amount or 0
		)


def _apply(by_competitor, by_reason, competitor_names, reason_keys, stage, value):
	count_field = f"{stage}_count"
	value_field = f"{stage}_value"

	for reason_key in reason_keys:
		reason_bucket = by_reason.setdefault(reason_key, _empty_reason_bucket())
		reason_bucket[count_field] += 1
		reason_bucket[value_field] += value

	for competitor_name in competitor_names:
		competitor_bucket = by_competitor.setdefault(competitor_name, _empty_competitor_bucket())
		competitor_bucket[count_field] += 1
		competitor_bucket[value_field] += value

		for reason_key in reason_keys:
			competitor_bucket["reasons"][reason_key] = competitor_bucket["reasons"].get(reason_key, 0) + 1
