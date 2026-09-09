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

			frm.add_custom_button('Seed Demo History (14 days)', () => {
				frappe.call({
					method: 'competitor_intel.api.seed_demo_history',
					args: { competitor: frm.doc.name, days: 14 },
					freeze: true,
					freeze_message: 'Generating history...',
					callback: () => {
						frappe.show_alert({ message: 'Demo history generated', indicator: 'green' });
						frm.reload_doc();
					}
				});
			}, 'Demo Tools');

			frm.add_custom_button('Fetch Cloudflare Rank', () => {
				frappe.call({
					method: 'competitor_intel.api.fetch_cloudflare_rank',
					args: { competitor: frm.doc.name },
					freeze: true,
					freeze_message: 'Fetching Cloudflare rank...',
					callback: (r) => {
						if (r.message && r.message.message) {
							frappe.show_alert({ message: r.message.message, indicator: 'orange' });
						} else {
							frappe.show_alert({ message: 'Cloudflare rank fetched', indicator: 'green' });
							frm.reload_doc();
						}
					}
				});
			}, 'Real Data');
		}
	}
});
