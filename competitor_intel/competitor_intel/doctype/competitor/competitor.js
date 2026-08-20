frappe.ui.form.on('Competitor', {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button('Fetch Traffic Data', () => {
				frappe.call({
					method: 'competitor_intel.api.fetch_traffic_data',
					args: { competitor: frm.doc.name },
					freeze: true,
					freeze_message: 'Fetching traffic data...',
					callback: () => {
						frappe.show_alert({ message: 'Traffic data fetched', indicator: 'green' });
						frm.reload_doc();
					}
				});
			});
		}
	}
});