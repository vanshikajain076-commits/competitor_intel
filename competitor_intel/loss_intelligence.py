import frappe
from frappe.utils import get_first_day, get_last_day, now_datetime, nowdate


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


def generate_monthly_loss_snapshots():
	"""Scheduled monthly job: snapshot last calendar month's loss data.

	Per-record failures are caught and logged individually so one bad
	Competitor/Lost Reason doesn't stop the rest of the run.
	"""
	period_start = get_first_day(nowdate(), d_months=-1)
	period_end = get_last_day(period_start)

	by_competitor, by_reason = collect_loss_data(period_start, period_end)

	for competitor in frappe.get_all("Competitor", filters={"is_active": 1}, pluck="name"):
		try:
			_upsert_competitor_snapshot(
				competitor, period_start, period_end, by_competitor.get(competitor)
			)
		except Exception:
			frappe.log_error(
				title=f"Competitor Loss Snapshot failed: {competitor} ({period_start} - {period_end})",
				message=frappe.get_traceback(),
			)

	reason_records = [
		("Quotation Lost Reason", name) for name in frappe.get_all("Quotation Lost Reason", pluck="name")
	] + [
		("Opportunity Lost Reason", name) for name in frappe.get_all("Opportunity Lost Reason", pluck="name")
	]

	for reason_type, reason_name in reason_records:
		try:
			_upsert_reason_snapshot(
				reason_type, reason_name, period_start, period_end, by_reason.get((reason_type, reason_name))
			)
		except Exception:
			frappe.log_error(
				title=f"Loss Reason Snapshot failed: {reason_type} / {reason_name} ({period_start} - {period_end})",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()


def _get_or_create(doctype, filters):
	name = frappe.db.get_value(doctype, filters)
	if name:
		return frappe.get_doc(doctype, name)
	doc = frappe.new_doc(doctype)
	doc.update(filters)
	return doc


def _upsert_competitor_snapshot(competitor, period_start, period_end, data):
	data = data or _empty_competitor_bucket()

	doc = _get_or_create(
		"Competitor Loss Snapshot",
		{"competitor": competitor, "period_start": period_start, "period_end": period_end},
	)
	doc.opportunity_lost_count = data["opportunity_count"]
	doc.opportunity_value_lost = data["opportunity_value"]
	doc.quotation_lost_count = data["quotation_count"]
	doc.quotation_value_lost = data["quotation_value"]

	doc.set("lost_reasons", [])
	for (reason_type, reason_name), count in data["reasons"].items():
		doc.append(
			"lost_reasons",
			{"reason_type": reason_type, "lost_reason": reason_name, "count": count},
		)

	doc.generated_on = now_datetime()
	doc.save(ignore_permissions=True)


def _upsert_reason_snapshot(reason_type, reason_name, period_start, period_end, data):
	data = data or _empty_reason_bucket()

	doc = _get_or_create(
		"Loss Reason Snapshot",
		{
			"reason_type": reason_type,
			"lost_reason": reason_name,
			"period_start": period_start,
			"period_end": period_end,
		},
	)

	if reason_type == "Quotation Lost Reason":
		doc.count = data["quotation_count"]
		doc.total_value_lost = data["quotation_value"]
	else:
		doc.count = data["opportunity_count"]
		doc.total_value_lost = data["opportunity_value"]

	doc.generated_on = now_datetime()
	doc.save(ignore_permissions=True)
