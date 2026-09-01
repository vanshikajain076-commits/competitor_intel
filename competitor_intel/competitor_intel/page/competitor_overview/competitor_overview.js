frappe.pages['competitor-overview'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Overview',
		single_column: true
	});

	page.main.html(`
		<div style="margin-bottom: 20px;">
			<div id="comparison-chart"></div>
		</div>
		<div id="overview-table"></div>
	`);

	load_chart();
	load_table();

	function load_chart() {
		frappe.call({
			method: 'competitor_intel.api.get_comparison_trend',
			args: { metric_type: 'Monthly Visits' },
			callback: (r) => {
				const el = page.main.find('#comparison-chart')[0];
				if (!r.message || !r.message.labels || r.message.labels.length === 0) {
					$(el).html('<p class="text-muted">No metric history yet across your competitors.</p>');
					return;
				}
				new frappe.Chart(el, {
					title: 'Monthly Visits — All Competitors',
					data: {
						labels: r.message.labels,
						datasets: r.message.datasets
					},
					type: 'line',
					height: 280,
					colors: ['#7cd6fd', '#ff5858', '#98d85b', '#ffa00a', '#743ee2']
				});
			}
		});
	}

	function load_table() {
		frappe.call({
			method: 'competitor_intel.api.get_overview_data',
			callback: (r) => {
				const rows = r.message || [];
				if (rows.length === 0) {
					page.main.find('#overview-table').html('<p class="text-muted">No competitors added yet.</p>');
					return;
				}
				let html = `<table class="table table-bordered">
					<thead><tr>
						<th>Competitor</th><th>Industry</th><th>Monthly Visits</th>
						<th>Search Trend</th><th>Bounce Rate</th><th>Position</th>
						<th>Key Strength</th><th>Key Weakness</th>
					</tr></thead><tbody>`;
				rows.forEach(row => {
					html += `<tr>
						<td><a href="/app/competitor/${encodeURIComponent(row.competitor_name)}">${frappe.utils.escape_html(row.competitor_name)}</a></td>
						<td>${row.industry || '-'}</td>
						<td>${row.monthly_visits ?? '-'}</td>
						<td>${row.search_trend ?? '-'}</td>
						<td>${row.bounce_rate ?? '-'}</td>
						<td>${row.market_position || '-'}</td>
						<td>${row.key_strength || '-'}</td>
						<td>${row.key_weakness || '-'}</td>
					</tr>`;
				});
				html += '</tbody></table>';
				page.main.find('#overview-table').html(html);
			}
		});
	}
};