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
    <div id="ci-charts" style="margin-top:24px;"></div>
`);

	let generate_btn = page.set_primary_action('Generate AI Insights', function() {
		let selected = document.getElementById('ci-analysis-select').value;
		if (!selected) {
			frappe.msgprint('Select an analysis first.');
			return;
		}

		generate_btn.prop('disabled', true).text('Generating...');
		frappe.show_alert('Generating insights... this may take a few seconds.');

		frappe.call({
			method: "competitor_intel.competitor_intel.page.competitor_dashboard.competitor_dashboard.generate_ai_insights",
			args: { analysis: selected },
			callback: function(r) {
				render_ai_insights(r.message);
			},
			error: function(r) {
				frappe.msgprint('Error generating insights. Check the browser console for details.');
			},
			always: function() {
				generate_btn.prop('disabled', false).text('Generate AI Insights');
			}
		});
	}, 'octicon octicon-zap');

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

	let existing_insight = document.getElementById('ci-ai-insights');
	if (existing_insight) existing_insight.remove();

	frappe.call({
		method: "competitor_intel.competitor_intel.page.competitor_dashboard.competitor_dashboard.get_dashboard_data",
		args: { analysis: analysis },
		callback: function(r) {
			render_dashboard(r.message);
		}
	});

	frappe.call({
		method: "competitor_intel.competitor_intel.page.competitor_dashboard.competitor_dashboard.get_ai_insight",
		args: { analysis: analysis },
		callback: function(r) {
			if (r.message) {
				render_ai_insights(r.message);
			}
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
	render_charts(data);
}


function render_charts(data) {
	let container = document.getElementById('ci-charts');
	container.innerHTML = `
		<h4>Monthly Visits Comparison</h4>
		<div id="ci-visits-chart" style="margin-bottom:32px;"></div>
		<h4>Traffic Sources by Competitor</h4>
		<div id="ci-source-charts" style="display:flex; flex-wrap:wrap; gap:24px;"></div>
	`;

	// Bar chart: monthly visits across all competitors
	new frappe.Chart("#ci-visits-chart", {
		data: {
			labels: data.map(c => c.competitor_name),
			datasets: [{ values: data.map(c => c.monthly_visits) }]
		},
		type: 'bar',
		height: 220,
		colors: ['#5e64ff']
	});

	// One donut chart per competitor: traffic source split
	data.forEach(c => {
		if (!c.traffic_sources || !c.traffic_sources.length) return;

		let wrap = document.createElement('div');
		wrap.style.minWidth = '360px';
		wrap.innerHTML = `<p style="text-align:center; font-weight:600;">${c.competitor_name}</p>
			<div id="ci-donut-${c.name}"></div>`;
		document.getElementById('ci-source-charts').appendChild(wrap);

		new frappe.Chart(`#ci-donut-${c.name}`, {
			data: {
				labels: c.traffic_sources.map(t => t.source_type),
				datasets: [{ values: c.traffic_sources.map(t => t.percentage) }]
			},
			type: 'donut',
			height: 200
		});
	});
}




function render_ai_insights(insight) {
	let existing = document.getElementById('ci-ai-insights');
	if (existing) existing.remove();

	let color = insight.threat_level === 'High' ? '#d13438' :
	            insight.threat_level === 'Medium' ? '#e8a33d' : '#29a745';

	let html = `
		<div id="ci-ai-insights" style="margin-top:24px; border:1px solid #d1d8dd; border-radius:8px; padding:16px;">
			<h4>AI Competitive Insights
				<span style="background:${color}; color:white; font-size:11px; padding:2px 8px; border-radius:10px; margin-left:8px;">
					${insight.threat_level} THREAT
				</span>
			</h4>
			<p><strong>Why:</strong> ${insight.threat_explanation}</p>
			<p><strong>Market Gap Opportunities:</strong> ${insight.market_gap_opportunities}</p>
			<p><strong>Recommended Positioning:</strong> ${insight.recommended_positioning}</p>
		</div>
	`;
	document.getElementById('ci-dashboard').insertAdjacentHTML('afterend', html);
}

