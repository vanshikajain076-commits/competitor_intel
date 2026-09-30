import frappe
from frappe.utils import add_days, get_first_day, get_last_day, getdate, now_datetime, nowdate


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


def bucket_ranges(period_start, period_end, target_buckets=8):
	"""Split [period_start, period_end] into up to target_buckets contiguous day-ranges.

	generate_monthly_loss_snapshots() is the only place collect_loss_data() gets bucketed
	today, and only by calendar month. This generalizes that same idea (run the flat
	aggregator once per bucket) to an arbitrary window and granularity, so a comparison
	chart can turn collect_loss_data()'s single flat total into a real time series.

	Returns a list of (bucket_start, bucket_end, label) tuples, oldest first.
	"""
	start = getdate(period_start)
	end = getdate(period_end)

	total_days = (end - start).days + 1
	bucket_count = max(1, min(target_buckets, total_days))
	base_size, remainder = divmod(total_days, bucket_count)

	buckets = []
	cursor = start
	for i in range(bucket_count):
		size = base_size + (1 if i < remainder else 0)
		if size == 0:
			continue
		bucket_start = cursor
		bucket_end = add_days(cursor, size - 1)
		label = str(bucket_start) if bucket_start == bucket_end else f"{bucket_start} to {bucket_end}"
		buckets.append((bucket_start, bucket_end, label))
		cursor = add_days(bucket_end, 1)

	return buckets


def generate_monthly_loss_snapshots():
	"""Scheduled monthly job: snapshot last calendar month's loss data.

	Per-record failures are caught and logged individually so one bad
	Competitor/Lost Reason doesn't stop the rest of the run.
	"""
	period_start = get_first_day(nowdate(), d_months=-1)
	period_end = get_last_day(period_start)

	by_competitor, by_reason = collect_loss_data(period_start, period_end)
	failures = []

	for competitor in frappe.get_all("Competitor", filters={"is_active": 1}, pluck="name"):
		try:
			_upsert_competitor_snapshot(
				competitor, period_start, period_end, by_competitor.get(competitor)
			)
		except Exception:
			failures.append(f"Competitor Loss Snapshot: {competitor}")
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
			failures.append(f"Loss Reason Snapshot: {reason_type} / {reason_name}")
			frappe.log_error(
				title=f"Loss Reason Snapshot failed: {reason_type} / {reason_name} ({period_start} - {period_end})",
				message=frappe.get_traceback(),
			)

	frappe.db.commit()

	if failures:
		_notify_snapshot_failures(failures, period_start, period_end)


def _notify_snapshot_failures(failures, period_start, period_end):
	"""Assign a ToDo (plus a bell Notification Log) to every enabled System Manager.

	Per-record errors are only in Error Log, which nobody browses unprompted; this
	is what makes a partial run visible. Must never raise -- it runs after the
	snapshots are already committed.
	"""
	try:
		users = frappe.get_all(
			"User",
			filters={"enabled": 1, "name": ["in", frappe.get_all(
				"Has Role", filters={"role": "System Manager", "parenttype": "User"}, pluck="parent"
			)]},
			pluck="name",
		)

		shown = failures[:20]
		summary = (
			f"Monthly Loss Intelligence snapshots for {period_start} to {period_end}: "
			f"{len(failures)} record(s) failed."
		)
		details = "".join(f"<li>{frappe.utils.escape_html(f)}</li>" for f in shown)
		if len(failures) > len(shown):
			details += f"<li>...and {len(failures) - len(shown)} more</li>"
		body = f"{summary}<ul>{details}</ul>See Error Log (titles ending \"({period_start} - {period_end})\") for tracebacks."

		for user in users:
			todo = frappe.get_doc({
				"doctype": "ToDo",
				"allocated_to": user,
				"description": body,
				"priority": "High",
				"status": "Open",
			}).insert(ignore_permissions=True)

			frappe.get_doc({
				"doctype": "Notification Log",
				"for_user": user,
				"type": "Alert",
				"subject": summary,
				"email_content": body,
				"document_type": "ToDo",
				"document_name": todo.name,
			}).insert(ignore_permissions=True)

		frappe.db.commit()
	except Exception:
		frappe.log_error(
			title="Loss snapshot failure notification failed",
			message=frappe.get_traceback(),
		)


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
