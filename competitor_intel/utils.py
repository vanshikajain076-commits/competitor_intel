import frappe
from frappe.utils import today


def stamp_lost_on(doc, method=None):
	if doc.status == "Lost" and not doc.lost_on:
		doc.db_set("lost_on", today())
