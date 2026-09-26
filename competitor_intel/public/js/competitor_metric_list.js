frappe.listview_settings['Competitor Metric'] = {
	onload(listview) {
		listview.page.add_inner_button(__('Review Old Metrics'), () => {
			frappe.prompt(
				[
					{
						fieldname: 'older_than_days',
						fieldtype: 'Int',
						label: __('Older Than (days)'),
						default: 180,
						reqd: 1,
					},
				],
				(values) => {
					listview.filter_area.clear();
					listview.filter_area.add([
						[
							'Competitor Metric',
							'metric_date',
							'<',
							frappe.datetime.add_days(frappe.datetime.now_date(), -values.older_than_days),
						],
					]);
					frappe.show_alert({
						message: __(
							'Showing metrics older than {0} days. Review them, then select the ones to remove and use Actions > Delete.',
							[values.older_than_days]
						),
						indicator: 'blue',
					});
				},
				__('Review Old Metrics'),
				__('Show')
			);
		});
	},
};
