frappe.pages['competitor-dashboard'].on_page_load =  frappe.pages['competitor-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Dashboard',
		single_column: true
	});

	page.main.html(`
		<div style="margin-bottom: 20px;">
			<label style="font-weight: 600; margin-right: 8px;">Competitor Analysis:</label>
			<select id="ci-analysis-select" style="padding: 6px 10px; min-width: 260px;"></select>
		</div>
		<div id="ci-dashboard">Loading...</div>
	`);

	// Fetch all existing analyses to populate the dropdown
	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Competitor Analysis",
			fields: ["name", "analysis_title"],
			order_by: "creation desc",
			limit_page_length: 50
		},
		callback: function(r) {
			let options = r.message.map(a =>
				`<option value="${a.name}">${a.analysis_title || a.name}</option>`
			).join('');
			document.getElementById('ci-analysis-select').innerHTML = options;

			if (r.message.length) {
				load_dashboard(r.message[0].name);
			}
		}
	});

	// Reload dashboard whenever the dropdown changes
	document.addEventListener('change', function(e) {
		if (e.target && e.target.id === 'ci-analysis-select') {
			load_dashboard(e.target.value);
		}
	});
};

function load_dashboard(analysis) {
	document.getElementById('ci-dashboard').innerHTML = 'Loading...';
	frappe.call({
		method: "competitor_intel.competitor_intel.page.competitor_dashboard.competitor_dashboard.get_dashboard_data",
		args: { analysis: analysis },
		callback: function(r) {
			render_dashboard(r.message);
		}
	});
}
function render_dashboard(data) {
	let cards_html = data.map(c => `
		<div class="ci-card">
			<h4>${c.competitor_name}</h4>
			<p class="ci-visits">${Number(c.monthly_visits).toLocaleString()} visits/mo</p>
			<div class="ci-stats">
				<span>Bounce: ${c.bounce_rate}%</span>
				<span>Duration: ${c.avg_duration_seconds}s</span>
				<span>Pages/Visit: ${c.pages_per_visit}</span>
				<span class="${c.trend_percent >= 0 ? 'ci-up' : 'ci-down'}">
					${c.trend_percent >= 0 ? '▲' : '▼'} ${Math.abs(c.trend_percent)}%
				</span>
			</div>
		</div>
	`).join('');

	let rows_html = data.map(c => `
		<tr>
			<td><strong>${c.competitor_name}</strong></td>
			<td>${c.market_position || '-'}</td>
			<td>${c.pricing_model || '-'}</td>
			<td>${c.key_strength || '-'}</td>
			<td>${c.key_weakness || '-'}</td>
			<td>${c.differentiation || '-'}</td>
		</tr>
	`).join('');

	let html = `
		<style>
			.ci-cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
			.ci-card { border: 1px solid #d1d8dd; border-radius: 8px; padding: 16px; min-width: 220px; flex: 1; }
			.ci-card h4 { margin: 0 0 4px 0; }
			.ci-visits { font-size: 22px; font-weight: 600; margin: 4px 0 12px 0; }
			.ci-stats { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #6c7680; }
			.ci-up { color: #29a745; font-weight: 600; }
			.ci-down { color: #d13438; font-weight: 600; }
			.ci-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
			.ci-table th, .ci-table td { border: 1px solid #d1d8dd; padding: 8px 12px; text-align: left; font-size: 13px; vertical-align: top; }
			.ci-table th { background: #f4f5f6; }
		</style>
		<div class="ci-cards">${cards_html}</div>
		<h4>Competitive Comparison</h4>
		<table class="ci-table">
			<tr><th>Competitor</th><th>Position</th><th>Pricing</th><th>Strength</th><th>Weakness</th><th>Differentiation</th></tr>
			${rows_html}
		</table>
	`;

	document.getElementById('ci-dashboard').innerHTML = html;
}