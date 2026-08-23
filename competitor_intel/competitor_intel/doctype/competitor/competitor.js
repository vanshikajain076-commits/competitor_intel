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

			render_chart(frm);
		}
	}
});

function render_chart(frm) {
	frappe.call({
		method: 'competitor_intel.api.get_monthly_visits_trend',
		args: { competitor: frm.doc.name },
		callback: (r) => {
			const wrapper = frm.get_field('metrics_chart').$wrapper;
			wrapper.empty();
			if (!r.message || !r.message.labels || r.message.labels.length === 0) {
				wrapper.html('<p class="text-muted">No metric history yet. Click "Fetch Traffic Data" or "Seed Demo History" above.</p>');
				return;
			}
			const chart_id = 'competitor-chart-' + frappe.utils.get_random(6);
			wrapper.html(`<div id="${chart_id}"></div>`);
			new frappe.Chart(`#${chart_id}`, {
				title: 'Monthly Visits Trend',
				data: {
					labels: r.message.labels,
					datasets: [{ name: 'Monthly Visits', values: r.message.values }]
				},
				type: 'line',
				height: 250,
				colors: ['#7cd6fd']
			});
		}
	});
}