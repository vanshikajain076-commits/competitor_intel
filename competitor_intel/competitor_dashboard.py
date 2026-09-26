from frappe import _


def get_data(data=None):
	return {
		"fieldname": "competitor",
		"transactions": [
			{
				"label": _("Intelligence"),
				"items": ["Competitor Metric", "Competitor Qualitative", "Competitor Loss Snapshot"],
			},
			{"label": _("Strategy"), "items": ["AI Insight", "Strategy Action"]},
		],
	}
