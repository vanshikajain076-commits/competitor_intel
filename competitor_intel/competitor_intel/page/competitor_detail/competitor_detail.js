frappe.pages['competitor-detail'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Detail',
		single_column: true
	});

	page.main.html('<div id="competitor-detail-content"></div>');
};

// Fires on every route show (first load and subsequent navigations between
// different competitors), so route-param-dependent rendering lives here
// rather than in on_page_load, which only runs once.
frappe.pages['competitor-detail'].refresh = function(wrapper) {
	const page = wrapper.page;
	const competitor_name = frappe.get_route()[1];
	const container = page.main.find('#competitor-detail-content');

	if (!competitor_name) {
		container.html('<p class="text-muted">No competitor specified.</p>');
		return;
	}

	container.html('<p class="text-muted">Loading…</p>');

	frappe.call({
		method: 'frappe.client.get',
		args: { doctype: 'Competitor', name: competitor_name },
		callback: (r) => {
			if (!r.message) {
				container.html(`<p class="text-muted">Competitor "${frappe.utils.escape_html(competitor_name)}" not found.</p>`);
				return;
			}

			const c = r.message;
			page.set_title(c.competitor_name || competitor_name);

			const active_pill = c.is_active
				? ''
				: '<span class="indicator-pill gray" style="margin-left: 10px; vertical-align: middle;">Inactive</span>';
			const logo_html = c.logo
				? `<img src="${frappe.utils.escape_html(c.logo)}" style="max-height: 60px; margin: 8px 0; display: block;">`
				: '';

			container.html(`
				<div style="margin-bottom: 24px;">
					<h2 style="margin-bottom: 4px;">${frappe.utils.escape_html(c.competitor_name || competitor_name)}${active_pill}</h2>
					${logo_html}
					<div class="text-muted">${c.industry || '-'}</div>
					<div class="text-muted">${c.website || '-'}</div>
				</div>
				<div style="margin-bottom: 24px;">
					<h4>Loss Intelligence</h4>
					<div id="loss-trend-chart" style="margin-bottom: 20px;"></div>
					<div id="top-loss-reasons" style="margin-bottom: 20px;"></div>
					<div>
						<button class="btn btn-default btn-sm" id="month-so-far-btn">This Month So Far</button>
						<div id="month-so-far-panel" style="margin-top: 12px;"></div>
					</div>
				</div>
				<div style="margin-bottom: 24px;">
					<h4>Profile &amp; Benchmarking</h4>
					<div style="margin-bottom: 24px;">
						<h5>Metrics</h5>
						<div id="metrics-section"></div>
					</div>
					<div>
						<h5>Qualitative Notes</h5>
						<div id="qualitative-notes"></div>
					</div>
				</div>
			`);

			load_loss_trend_chart(competitor_name, container);
			load_top_loss_reasons(competitor_name, container);
			setup_month_so_far_button(competitor_name, container);
			load_metrics_chart(competitor_name, container);
			load_qualitative_notes(competitor_name, container);
		},
		error: () => {
			container.html(`<p class="text-muted">Could not load competitor "${frappe.utils.escape_html(competitor_name)}".</p>`);
		}
	});
};

function load_loss_trend_chart(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Loss Snapshot',
			filters: { competitor: competitor_name },
			fields: ['period_start', 'quotation_lost_count', 'opportunity_lost_count'],
			order_by: 'period_start asc',
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];
			const el = container.find('#loss-trend-chart')[0];

			if (rows.length === 0) {
				$(el).html('<p class="text-muted">No finalized monthly data yet.</p>');
				return;
			}

			$(el).empty();
			new frappe.Chart(el, {
				title: 'Losses Over Time',
				data: {
					labels: rows.map(row => row.period_start),
					datasets: [
						{ name: 'Quotation Lost', values: rows.map(row => row.quotation_lost_count || 0) },
						{ name: 'Opportunity Lost', values: rows.map(row => row.opportunity_lost_count || 0) }
					]
				},
				type: 'line',
				height: 280,
				colors: ['#7cd6fd', '#ff5858']
			});
		}
	});
}

function load_top_loss_reasons(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Loss Snapshot',
			filters: { competitor: competitor_name },
			fields: ['lost_reasons.reason_type', 'lost_reasons.lost_reason', 'lost_reasons.count'],
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];
			const el = container.find('#top-loss-reasons');

			// Keyed by (reason_type, lost_reason) so an Opportunity-stage
			// reason never merges with a Quotation-stage reason of the same name.
			const totals = {};
			rows.forEach(row => {
				if (!row.lost_reason) return;
				const key = `${row.reason_type}::${row.lost_reason}`;
				if (!totals[key]) {
					totals[key] = { reason_type: row.reason_type, lost_reason: row.lost_reason, count: 0 };
				}
				totals[key].count += row.count || 0;
			});

			const top5 = Object.values(totals).sort((a, b) => b.count - a.count).slice(0, 5);

			let html = '<h5>Top Reasons We Lose to Them</h5>';
			if (top5.length === 0) {
				html += '<p class="text-muted">No loss reasons recorded yet.</p>';
			} else {
				html += '<ul style="list-style: none; padding-left: 0; margin-bottom: 0;">';
				top5.forEach(row => {
					const pill_color = row.reason_type === 'Opportunity Lost Reason' ? 'orange' : 'blue';
					html += `
						<li style="margin-bottom: 6px;">
							<span class="indicator-pill ${pill_color}" style="margin-right: 8px;">${frappe.utils.escape_html(row.reason_type)}</span>
							${frappe.utils.escape_html(row.lost_reason)} — <strong>${row.count}</strong>
						</li>
					`;
				});
				html += '</ul>';
			}
			el.html(html);
		}
	});
}

function setup_month_so_far_button(competitor_name, container) {
	const btn = container.find('#month-so-far-btn');
	const panel = container.find('#month-so-far-panel');

	btn.off('click').on('click', () => {
		panel.html('<p class="text-muted">Loading…</p>');
		frappe.call({
			method: 'competitor_intel.api.get_current_month_loss_data',
			args: { competitor: competitor_name },
			callback: (r) => {
				const data = r.message || {};
				const html = `
					<div style="border: 1px solid #d1d8dd; border-radius: 6px; padding: 16px;">
						<div style="display: flex; align-items: center; margin-bottom: 10px;">
							<h4 style="margin: 0;">This Month So Far</h4>
							<span class="indicator-pill orange" style="margin-left: 10px;">
								Live / in progress — ${data.period_start || ''} to ${data.period_end || ''}
							</span>
						</div>
						<div style="display: flex; gap: 32px; flex-wrap: wrap;">
							<div>
								<div class="text-muted small">Opportunities Lost</div>
								<div style="font-size: 22px;">${data.opportunity_count || 0}</div>
							</div>
							<div>
								<div class="text-muted small">Opportunity Value Lost</div>
								<div style="font-size: 22px;">${format_currency(data.opportunity_value || 0)}</div>
							</div>
							<div>
								<div class="text-muted small">Quotations Lost</div>
								<div style="font-size: 22px;">${data.quotation_count || 0}</div>
							</div>
							<div>
								<div class="text-muted small">Quotation Value Lost</div>
								<div style="font-size: 22px;">${format_currency(data.quotation_value || 0)}</div>
							</div>
						</div>
						<p class="text-muted small" style="margin-top: 8px; margin-bottom: 0;">
							Month-to-date and still moving — this is not the finalized monthly snapshot used
							in the historical chart above.
						</p>
					</div>
				`;
				panel.html(html);
			}
		});
	});
}

function load_metrics_chart(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Metric',
			filters: { competitor: competitor_name },
			fields: ['metric_type', 'metric_date', 'value'],
			order_by: 'metric_date asc',
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];
			const section = container.find('#metrics-section');

			if (rows.length === 0) {
				section.html('<p class="text-muted">No metrics recorded yet.</p>');
				return;
			}

			const by_type = {};
			rows.forEach(row => {
				if (!by_type[row.metric_type]) by_type[row.metric_type] = [];
				by_type[row.metric_type].push(row);
			});

			const types = Object.keys(by_type).sort();
			const default_type = types.reduce(
				(best, t) => (by_type[t].length > by_type[best].length ? t : best),
				types[0]
			);

			section.html(`
				<div style="margin-bottom: 8px;">
					<label for="competitor-metric-select" style="font-weight: 600; margin-right: 8px;">Metric:</label>
					<select id="competitor-metric-select" class="form-control" style="display: inline-block; width: auto;"></select>
				</div>
				<div id="competitor-metric-chart"></div>
			`);

			const select = section.find('#competitor-metric-select');
			select.html(
				types.map(t => `<option value="${frappe.utils.escape_html(t)}">${frappe.utils.escape_html(t)}</option>`).join('')
			);
			select.val(default_type);

			const render_metric = (metric_type) => {
				const chart_el = section.find('#competitor-metric-chart')[0];
				const series = by_type[metric_type] || [];
				$(chart_el).empty();
				new frappe.Chart(chart_el, {
					title: metric_type,
					data: {
						labels: series.map(row => row.metric_date),
						datasets: [{ name: metric_type, values: series.map(row => row.value) }]
					},
					type: 'line',
					height: 240,
					colors: ['#7cd6fd']
				});
			};

			render_metric(default_type);
			select.off('change').on('change', () => render_metric(select.val()));
		}
	});
}

function load_qualitative_notes(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Qualitative',
			filters: { competitor: competitor_name },
			fields: [
				'review_date', 'market_position', 'pricing_model',
				'target_audience', 'key_strength', 'key_weakness', 'differentiation'
			],
			order_by: 'review_date desc',
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];
			const el = container.find('#qualitative-notes');

			if (rows.length === 0) {
				el.html('<p class="text-muted">No qualitative notes yet.</p>');
				return;
			}

			const [latest, ...older] = rows;

			const field_row = (label, value) => `
				<div style="margin-bottom: 8px;">
					<div class="text-muted small">${label}</div>
					<div>${value ? frappe.utils.escape_html(value) : '-'}</div>
				</div>
			`;

			const full_details = (row) => `
				${field_row('Market Position', row.market_position)}
				${field_row('Pricing Model', row.pricing_model)}
				${field_row('Target Audience', row.target_audience)}
				${field_row('Key Strength', row.key_strength)}
				${field_row('Key Weakness', row.key_weakness)}
				${field_row('Differentiation', row.differentiation)}
			`;

			let html = `
				<div style="border: 1px solid #d1d8dd; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
					<div class="text-muted small" style="margin-bottom: 8px;">
						Most recent — ${frappe.datetime.str_to_user(latest.review_date)}
					</div>
					${full_details(latest)}
				</div>
			`;

			if (older.length > 0) {
				const label = `${older.length} earlier note${older.length > 1 ? 's' : ''}`;
				html += `
					<div>
						<a href="#" id="qualitative-history-toggle">Show ${label}</a>
						<div id="qualitative-history-list" style="display: none; margin-top: 10px;"></div>
					</div>
				`;
			}

			el.html(html);

			if (older.length > 0) {
				const list_el = el.find('#qualitative-history-list');
				list_el.html(
					older.map(row => `
						<div style="border: 1px solid #ecf0f2; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
							<div>
								<a href="#" class="qualitative-history-item-toggle">
									${frappe.datetime.str_to_user(row.review_date)} —
									${frappe.utils.escape_html(row.market_position || '-')} ·
									${frappe.utils.escape_html(row.pricing_model || '-')}
								</a>
							</div>
							<div class="qualitative-history-item-details" style="display: none; margin-top: 8px;">
								${full_details(row)}
							</div>
						</div>
					`).join('')
				);

				const label = `${older.length} earlier note${older.length > 1 ? 's' : ''}`;
				el.find('#qualitative-history-toggle').on('click', function(e) {
					e.preventDefault();
					const currently_visible = list_el.is(':visible');
					list_el.slideToggle();
					$(this).text(currently_visible ? `Show ${label}` : `Hide ${label}`);
				});

				list_el.find('.qualitative-history-item-toggle').on('click', function(e) {
					e.preventDefault();
					$(this).closest('div').next('.qualitative-history-item-details').slideToggle();
				});
			}
		}
	});
}
