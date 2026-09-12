frappe.pages['competitor-overview'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Overview',
		single_column: true
	});

	page.main.html(`
		<style>
			.competitor-overview-row:hover { background-color: #f5f7fa; cursor: pointer; }
		</style>
		<div id="month-so-far-panel" style="margin-bottom: 20px;"></div>
		<div id="quarter-ranking-panel" style="margin-bottom: 20px;"></div>
		<div style="margin-bottom: 20px;">
			<div style="margin-bottom: 8px;">
				<label for="metric-type-select" style="font-weight: 600; margin-right: 8px;">Historical metric:</label>
				<select id="metric-type-select" class="form-control" style="display: inline-block; width: auto;"></select>
			</div>
			<div id="comparison-chart"></div>
		</div>
		<div id="overview-table"></div>
	`);

	load_month_so_far();
	load_quarter_ranking();
	load_metric_dropdown();
	load_table();

	function load_month_so_far() {
		frappe.call({
			method: 'competitor_intel.api.get_current_month_loss_data',
			callback: (r) => {
				const data = r.message || {};
				const reasons = data.by_reason || [];
				let opp_count = 0, opp_value = 0, quote_count = 0, quote_value = 0;
				reasons.forEach(row => {
					opp_count += row.opportunity_count || 0;
					opp_value += row.opportunity_value || 0;
					quote_count += row.quotation_count || 0;
					quote_value += row.quotation_value || 0;
				});

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
								<div style="font-size: 22px;">${opp_count}</div>
							</div>
							<div>
								<div class="text-muted small">Opportunity Value Lost</div>
								<div style="font-size: 22px;">${format_currency(opp_value)}</div>
							</div>
							<div>
								<div class="text-muted small">Quotations Lost</div>
								<div style="font-size: 22px;">${quote_count}</div>
							</div>
							<div>
								<div class="text-muted small">Quotation Value Lost</div>
								<div style="font-size: 22px;">${format_currency(quote_value)}</div>
							</div>
						</div>
						<p class="text-muted small" style="margin-top: 8px; margin-bottom: 0;">
							Month-to-date and still moving — this is not the finalized monthly snapshot used
							in the historical chart below.
						</p>
					</div>
				`;
				page.main.find('#month-so-far-panel').html(html);
			}
		});
	}

	function get_current_quarter_range() {
		const now = new Date();
		const quarter = Math.floor(now.getMonth() / 3);
		const start = new Date(now.getFullYear(), quarter * 3, 1);
		const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
		return { start: format_date(start), end: format_date(end) };
	}

	function format_date(d) {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}

	function load_quarter_ranking() {
		const { start, end } = get_current_quarter_range();
		frappe.call({
			method: 'competitor_intel.api.get_top_competitors_by_losses',
			args: { quarter_start: start, quarter_end: end },
			callback: (r) => {
				const rows = r.message || [];
				let html = `
					<div style="border: 1px solid #d1d8dd; border-radius: 6px; padding: 16px;">
						<h4 style="margin-top: 0;">Who We're Losing To Most
							<span class="text-muted small">(current quarter: ${start} to ${end})</span>
						</h4>
				`;
				if (rows.length === 0) {
					html += '<p class="text-muted" style="margin-bottom: 0;">No Competitor Loss Snapshot data for this quarter yet.</p>';
				} else {
					html += '<ol style="padding-left: 20px; margin-bottom: 0;">';
					rows.forEach(row => {
						html += `<li>${frappe.utils.escape_html(row.competitor)} — <strong>${row.total_lost}</strong> deals lost</li>`;
					});
					html += '</ol>';
				}
				html += '</div>';
				page.main.find('#quarter-ranking-panel').html(html);
			}
		});
	}

	function load_metric_dropdown() {
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Competitor Metric',
				fields: ['metric_type'],
				group_by: 'metric_type',
				order_by: 'metric_type asc',
				limit_page_length: 0
			},
			callback: (r) => {
				const types = (r.message || []).map(row => row.metric_type).filter(Boolean);
				const select = page.main.find('#metric-type-select');

				if (types.length === 0) {
					select.html('<option value="">No metric data yet</option>');
					page.main.find('#comparison-chart').html(
						'<p class="text-muted">No metric history yet across your competitors.</p>'
					);
					return;
				}

				select.html(
					types.map(t => `<option value="${frappe.utils.escape_html(t)}">${frappe.utils.escape_html(t)}</option>`).join('')
				);
				const default_type = types.includes('Monthly Visits') ? 'Monthly Visits' : types[0];
				select.val(default_type);

				load_chart(default_type);
				select.off('change').on('change', () => load_chart(select.val()));
			}
		});
	}

	let comparison_chart_observer = null;

	function load_chart(metric_type) {
		frappe.call({
			method: 'competitor_intel.api.get_comparison_trend',
			args: { metric_type },
			callback: (r) => {
				if (comparison_chart_observer) {
					comparison_chart_observer.disconnect();
					comparison_chart_observer = null;
				}
				const el = page.main.find('#comparison-chart')[0];
				$(el).empty();
				if (!r.message || !r.message.labels || r.message.labels.length === 0) {
					$(el).html('<p class="text-muted">No metric history yet across your competitors.</p>');
					return;
				}
				const datasets = r.message.datasets;
				new frappe.Chart(el, {
					title: `${metric_type} — All Competitors`,
					data: {
						labels: r.message.labels,
						datasets: datasets
					},
					type: 'line',
					height: 280,
					colors: ['#7cd6fd', '#ff5858', '#98d85b', '#ffa00a', '#743ee2'],
					axisOptions: { shortenYAxisNumbers: true },
					lineOptions: { showDots: true }
				});

				// frappe-charts (bundled here, v2.0.0-rc27) only exposes hideLine/showDots
				// as whole-chart options (AxisChart.js reads them off `this.lineOptions` for
				// every line dataset) — there's no per-dataset switch. This chart overlays one
				// line per competitor, and get_comparison_trend 0-fills any date a competitor
				// has no real measurement for, so a competitor with exactly one real data point
				// would otherwise draw as a line rising from that implied zero. Since the library
				// can't mix "line" and "dot only" per dataset, do it as a DOM pass after render:
				// dots are turned on globally above (so frappe-charts computes correct pixel
				// positions for every point), then per dataset we either hide the connecting
				// line and every dot but the one real one (single-measurement competitors) or
				// hide the auto-added dots so multi-point lines look exactly as before.
				//
				// BaseChart.js unconditionally schedules a second internal render ~700ms
				// after first mount (`configure()`'s `setTimeout(() => this.update(...))`,
				// INIT_CHART_UPDATE_TIMEOUT) that rebuilds these SVG nodes from scratch,
				// wiping any DOM changes made right after construction. Reapplying via a
				// MutationObserver (instead of a guessed delay) makes this survive that
				// rebuild and any future one, without depending on the library's internal
				// timing constants.
				const apply_single_point_style = () => {
					datasets.forEach((d, i) => {
						const real_idx = (d.real_flags || [])
							.reduce((acc, is_real, idx) => (is_real ? acc.concat(idx) : acc), []);
						const group = $(el).find(`.dataset-line.dataset-${i}`);
						if (real_idx.length === 1) {
							group.find('path.line-graph-path').hide();
							group.find('circle[data-point-index]').each(function() {
								const is_the_one_real_point = Number($(this).attr('data-point-index')) === real_idx[0];
								$(this).toggle(is_the_one_real_point);
							});
						} else {
							group.find('path.line-graph-path').show();
							group.find('circle[data-point-index]').hide();
						}
					});
				};

				apply_single_point_style();
				comparison_chart_observer = new MutationObserver(apply_single_point_style);
				comparison_chart_observer.observe(el, { childList: true, subtree: true });
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
					html += `<tr class="competitor-overview-row" data-competitor="${frappe.utils.escape_html(row.competitor_name)}">
						<td>${frappe.utils.escape_html(row.competitor_name)}</td>
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
				page.main.find('.competitor-overview-row').on('click', function() {
					frappe.set_route('competitor-detail', $(this).attr('data-competitor'));
				});
			}
		});
	}
};
