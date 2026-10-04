import frappe
from frappe import _
from frappe.model.document import Document


class CompetitorMetric(Document):
	def validate(self):
		self.check_duplicate()

	def check_duplicate(self):
		duplicate = frappe.db.exists(
			"Competitor Metric",
			{
				"competitor": self.competitor,
				"metric_date": self.metric_date,
				"metric_type": self.metric_type,
				"name": ["!=", self.name],
			},
		)
		if duplicate:
			frappe.throw(
				_(
					"A {0} metric for {1} on {2} already exists ({3}). Edit that record instead of creating a duplicate."
				).format(
					frappe.bold(self.metric_type),
					frappe.bold(self.competitor),
					frappe.utils.formatdate(self.metric_date),
					frappe.utils.get_link_to_form("Competitor Metric", duplicate),
				),
				frappe.DuplicateEntryError,
			)
