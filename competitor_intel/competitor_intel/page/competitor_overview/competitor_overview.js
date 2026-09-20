const CI_TREND_CHART_CAP = 6;
const CI_CHART_COLORS = ['#7cd6fd', '#ff5858', '#98d85b', '#ffa00a', '#743ee2', '#2563eb'];
const CI_AVATAR_COLORS = ['#2563eb', '#d97706', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

frappe.pages['competitor-overview'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Overview',
		single_column: true
	});

	page.set_primary_action('Add competitor', () => frappe.new_doc('Competitor'), 'add');

	// ---- page markup (content-area only -- desk supplies sidebar/topbar/chrome) ----
	// appendTo(), not page.main.html(): the Page constructor already prepended
	// page.page_form (used below for the date-range control) into page.main,
	// and .html() would wipe it out along with everything else in page.main.

	$(`
		<style>
			/* .layout-main-section (Desk's content wrapper) has zero left/right
			   padding of its own -- every native page supplies its own inset
			   (Frappe's own list/report views put padding: 0 15px on their
			   content elements). Without it here, our cards render flush against
			   the sidebar. max-width/overflow-x additionally keep an overflowing
			   child (e.g. the metrics table, or a KPI value wide enough to blow
			   out its grid track) from bleeding past this column into Desk's own
			   chrome -- the table scrolls internally via .ci-table-wrap instead. */
			.ci-overview { font-size: 13px; color: #1f2937; padding: 0 15px; max-width: 100%; overflow-x: hidden; box-sizing: border-box; }
			.ci-overview a { cursor: pointer; }
			.ci-period-strip { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #9ca3af; margin-bottom: 10px; }
			.ci-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #dc2626; flex-shrink: 0; }

			.ci-kpi-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
			@media (max-width: 900px) { .ci-kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
			.ci-kpi-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
			.ci-kpi-label { font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 8px; }
			.ci-kpi-value { font-size: 22px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
			.ci-kpi-trend { margin-top: 9px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
			.ci-kpi-trend-note { font-size: 11.5px; color: #9ca3af; }

			.ci-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 2.5px 7px 2.5px 6px; border-radius: 100px; }
			.ci-badge .ci-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
			.ci-badge.red { background: #fef2f2; color: #dc2626; }
			.ci-badge.red .ci-dot { background: #dc2626; }
			.ci-badge.green { background: #f0fdf4; color: #16a34a; }
			.ci-badge.green .ci-dot { background: #16a34a; }
			.ci-badge.gray { background: #f3f4f6; color: #4b5563; }
			.ci-badge.gray .ci-dot { background: #6b7280; }

			.ci-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
			.ci-card-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid #f3f4f6; }
			.ci-card-head h3 { font-size: 13.5px; font-weight: 600; color: #111827; margin: 0; }
			.ci-meta { font-size: 12px; color: #9ca3af; }
			.ci-card-body { padding: 16px; }
			.ci-empty { font-size: 12.5px; color: #9ca3af; margin: 0; }

			.ci-rank-row { display: flex; align-items: center; gap: 11px; padding: 9px 0; }
			.ci-rank-row + .ci-rank-row { border-top: 1px solid #f3f4f6; }
			.ci-co-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 600; color: #fff; flex-shrink: 0; }
			.ci-rank-name { width: 130px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
			.ci-bar-track { flex: 1; height: 6px; background: #f3f4f6; border-radius: 100px; overflow: hidden; }
			.ci-bar-fill { height: 100%; border-radius: 100px; background: #dc2626; }
			.ci-rank-val { width: 24px; text-align: right; font-size: 12.5px; font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
			.ci-empty-note { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e7eb; font-size: 12px; color: #9ca3af; }
			.ci-empty-note b { color: #4b5563; font-weight: 500; }

			.ci-tabs { display: flex; gap: 20px; border-bottom: 1px solid #f3f4f6; padding: 0 16px; flex-wrap: wrap; }
			.ci-tabs button { font-family: inherit; font-size: 12.5px; font-weight: 500; background: none; border: none; color: #6b7280; padding: 11px 0; cursor: pointer; border-bottom: 2px solid transparent; position: relative; top: 1px; }
			.ci-tabs button.active { color: #2563eb; border-bottom-color: #2563eb; }
			.ci-chart-legend { display: flex; gap: 16px; flex-wrap: wrap; padding: 0 16px 16px; align-items: center; }
			.ci-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #4b5563; font-weight: 500; }
			.ci-legend-sw { width: 12px; height: 2px; border-radius: 2px; display: inline-block; }
			.ci-legend-more { font-size: 11.5px; font-weight: 600; color: #2563eb; }

			.ci-table-toolbar { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f3f4f6; }
			.ci-filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
			.ci-filter-label { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.03em; }
			.ci-chip-group { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
			.ci-chip { font-size: 12px; font-weight: 500; color: #4b5563; background: #fff; border: 1px solid #e5e7eb; padding: 5px 10px; border-radius: 100px; cursor: pointer; }
			.ci-chip.active { background: #111827; color: #fff; border-color: #111827; }
			.ci-active-filters { display: flex; align-items: center; gap: 10px; margin-left: auto; font-size: 12px; color: #6b7280; white-space: nowrap; }
			.ci-active-filters a { color: #2563eb; font-weight: 500; }

			.ci-table-wrap { overflow-x: auto; }
			.ci-table { width: 100%; border-collapse: collapse; }
			.ci-table thead th { text-align: left; font-weight: 500; color: #6b7280; font-size: 11.5px; padding: 9px 16px; background: #fcfcfd; border-bottom: 1px solid #f3f4f6; cursor: pointer; white-space: nowrap; }
			.ci-table thead th:first-child, .ci-table tbody td:first-child { padding-left: 16px; }
			.ci-table tbody tr { cursor: pointer; }
			.ci-table tbody tr:hover { background: #f9fafb; }
			.ci-table tbody td { padding: 11px 16px; border-bottom: 1px solid #f3f4f6; font-size: 12.5px; color: #374151; vertical-align: middle; }
			.ci-table tbody tr:last-child td { border-bottom: none; }
			.ci-co-cell { display: flex; align-items: center; gap: 9px; }
			.ci-co-name { font-weight: 500; color: #111827; }
			.ci-strength { color: #16a34a; }
			.ci-weak { color: #dc2626; }
			.ci-sort-indicator { color: #9ca3af; margin-left: 4px; }
		</style>

		<div class="ci-overview">
			<div class="ci-period-strip">
				<span class="ci-live-dot"></span>
				<span id="ci-period-caption"></span>
				<span>· updating live</span>
			</div>

			<div class="ci-kpi-row" id="ci-kpi-row"></div>

			<div class="ci-card" style="margin-bottom: 12px;">
				<div class="ci-card-head">
					<h3>Who we're losing to</h3>
					<span class="ci-meta" id="ci-losing-to-meta"></span>
				</div>
				<div class="ci-card-body">
					<div id="ci-losing-to-body"></div>
					<div class="ci-empty-note" id="ci-losing-to-empty-note"></div>
				</div>
			</div>

			<div class="ci-card" style="margin-bottom: 12px;">
				<div class="ci-card-head"><h3>Trend</h3></div>
				<div class="ci-tabs" id="ci-chart-tabs"></div>
				<div style="padding: 16px;" id="ci-chart-body"></div>
				<div class="ci-chart-legend" id="ci-chart-legend"></div>
			</div>

			<div class="ci-card">
				<div class="ci-card-head"><h3>Tracked competitors</h3></div>
				<div class="ci-table-toolbar" id="ci-table-toolbar"></div>
				<div class="ci-table-wrap" id="ci-table-wrap"></div>
			</div>
		</div>
	`).appendTo(page.main);

	// ---- shared date-range control (native page fields, not a hand-rolled dropdown) ----

	const range_field = page.add_field({
		fieldname: 'range_type',
		label: 'Range',
		fieldtype: 'Select',
		options: ['Month', 'Quarter', 'Year', 'Custom Range'],
		default: 'Month',
		change() { on_range_type_change(); }
	});
	const custom_start_field = page.add_field({
		fieldname: 'custom_start',
		label: 'From',
		fieldtype: 'Date',
		change() { refresh_range_dependent_sections(); }
	});
	const custom_end_field = page.add_field({
		fieldname: 'custom_end',
		label: 'To',
		fieldtype: 'Date',
		change() { refresh_range_dependent_sections(); }
	});
	custom_start_field.$wrapper.hide();
	custom_end_field.$wrapper.hide();

	// ---- shared helpers ----

	function pad(n) { return String(n).padStart(2, '0'); }
	function fmt_date(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
	function parse_date(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
	function add_days(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
	function days_between(a, b) { return Math.round((b - a) / 86400000); }
	function first_day_of_month(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
	function first_day_of_quarter(d) { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); }
	function first_day_of_year(d) { return new Date(d.getFullYear(), 0, 1); }

	function color_for(name) {
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
		return CI_AVATAR_COLORS[hash % CI_AVATAR_COLORS.length];
	}
	function avatar_html(name, size) {
		size = size || 24;
		const logo = competitor_logos[name];
		if (logo) {
			return `<img class="ci-co-avatar" src="${frappe.utils.escape_html(logo)}" style="width:${size}px;height:${size}px;object-fit:cover;" alt="">`;
		}
		const initial = (name || '?').trim().charAt(0).toUpperCase();
		return `<div class="ci-co-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px;background:${color_for(name)};">${frappe.utils.escape_html(initial)}</div>`;
	}

	// ---- date-range math ----
	// Month/Quarter/Year are always "current period to date" (live, anchored to
	// today). The prior comparison period is the *same day-offset range* in the
	// immediately preceding calendar period (e.g. Sep 1-17 -> Aug 1-17, not a
	// rolling "last 17 days" window and not the full prior month) -- capped if
	// the prior period is shorter than the elapsed span. Custom Range has no
	// calendar period to align to, so its prior period is just the immediately
	// preceding window of the same length.

	function compute_range() {
		const today = new Date();
		const range_type = range_field.get_value() || 'Month';

		if (range_type === 'Custom Range') {
			const end = custom_end_field.get_value() ? parse_date(custom_end_field.get_value()) : today;
			const start = custom_start_field.get_value() ? parse_date(custom_start_field.get_value()) : add_days(end, -29);
			const length = days_between(start, end) + 1;
			const prior_end = add_days(start, -1);
			const prior_start = add_days(prior_end, -(length - 1));
			return {
				period_start: fmt_date(start), period_end: fmt_date(end),
				prior_start: fmt_date(prior_start), prior_end: fmt_date(prior_end)
			};
		}

		let anchor_start;
		if (range_type === 'Quarter') anchor_start = first_day_of_quarter(today);
		else if (range_type === 'Year') anchor_start = first_day_of_year(today);
		else anchor_start = first_day_of_month(today);

		const elapsed = days_between(anchor_start, today) + 1;
		const prior_anchor_end = add_days(anchor_start, -1);
		let prior_anchor_start;
		if (range_type === 'Quarter') prior_anchor_start = first_day_of_quarter(prior_anchor_end);
		else if (range_type === 'Year') prior_anchor_start = first_day_of_year(prior_anchor_end);
		else prior_anchor_start = first_day_of_month(prior_anchor_end);

		let prior_end = add_days(prior_anchor_start, elapsed - 1);
		if (prior_end > prior_anchor_end) prior_end = prior_anchor_end;

		return {
			period_start: fmt_date(anchor_start), period_end: fmt_date(today),
			prior_start: fmt_date(prior_anchor_start), prior_end: fmt_date(prior_end)
		};
	}

	function on_range_type_change() {
		const is_custom = range_field.get_value() === 'Custom Range';
		custom_start_field.$wrapper.toggle(is_custom);
		custom_end_field.$wrapper.toggle(is_custom);
		if (is_custom) {
			if (!custom_start_field.get_value()) custom_start_field.set_value(fmt_date(add_days(new Date(), -29)));
			if (!custom_end_field.get_value()) custom_end_field.set_value(fmt_date(new Date()));
		}
		refresh_range_dependent_sections();
	}

	// ---- state ----

	let overview_rows = [];
	let overview_metric_types = [];
	let industry_options = [];
	let position_options = [];
	let sort_state = { key: null, dir: 1 };
	let filter_state = { industry: [], position: [] };
	let current_range = null;
	let current_metric_type = null;
	let comparison_chart_observer = null;
	let competitor_logos = {};

	// ---- KPI row ----

	function load_kpis(range) {
		frappe.call({
			method: 'competitor_intel.api.get_loss_kpis',
			args: {
				period_start: range.period_start, period_end: range.period_end,
				prior_start: range.prior_start, prior_end: range.prior_end
			},
			callback: (r) => render_kpis(r.message || {})
		});
	}

	function render_kpis(data) {
		const current = data.current || {};
		const prior = data.prior || {};
		const cards = [
			{ label: 'Opportunities Lost', cur: current.opportunity_count || 0, prior: prior.opportunity_count || 0, fmt: (v) => String(v) },
			{ label: 'Opportunity Value Lost', cur: current.opportunity_value || 0, prior: prior.opportunity_value || 0, fmt: (v) => format_currency(v) },
			{ label: 'Quotations Lost', cur: current.quotation_count || 0, prior: prior.quotation_count || 0, fmt: (v) => String(v) },
			{ label: 'Quotation Value Lost', cur: current.quotation_value || 0, prior: prior.quotation_value || 0, fmt: (v) => format_currency(v) }
		];

		const html = cards.map(c => {
			const delta = c.cur - c.prior;
			let badge_class = 'gray', label = 'No change';
			if (delta > 0) { badge_class = 'red'; label = `+${c.fmt(delta)}`; }
			else if (delta < 0) { badge_class = 'green'; label = `−${c.fmt(Math.abs(delta))}`; }
			return `
				<div class="ci-kpi-card">
					<div class="ci-kpi-label">${frappe.utils.escape_html(c.label)}</div>
					<div class="ci-kpi-value">${c.fmt(c.cur)}</div>
					<div class="ci-kpi-trend">
						<span class="ci-badge ${badge_class}"><span class="ci-dot"></span>${frappe.utils.escape_html(label)}</span>
						<span class="ci-kpi-trend-note">vs prior period</span>
					</div>
				</div>`;
		}).join('');
		page.main.find('#ci-kpi-row').html(html);
	}

	// ---- "Who we're losing to" ----

	function load_losing_to(range) {
		frappe.call({
			method: 'competitor_intel.api.get_top_competitors_by_losses',
			args: { period_start: range.period_start, period_end: range.period_end },
			callback: (r) => render_losing_to(r.message || [])
		});
	}

	function render_losing_to(rows) {
		const $body = page.main.find('#ci-losing-to-body');
		const $note = page.main.find('#ci-losing-to-empty-note');

		if (rows.length === 0) {
			$body.html('<p class="ci-empty">No deals lost to any competitor in this period.</p>');
			render_losing_to_note([]);
			return;
		}

		const max = Math.max(...rows.map(r => r.total_lost));
		$body.html(rows.map(r => `
			<div class="ci-rank-row">
				${avatar_html(r.competitor, 24)}
				<span class="ci-rank-name" title="${frappe.utils.escape_html(r.competitor)}">${frappe.utils.escape_html(r.competitor)}</span>
				<div class="ci-bar-track"><div class="ci-bar-fill" style="width:${Math.max(4, Math.round(r.total_lost / max * 100))}%;"></div></div>
				<span class="ci-rank-val">${r.total_lost}</span>
			</div>
		`).join(''));

		render_losing_to_note(rows.map(r => r.competitor));

		function render_losing_to_note(named) {
			const zero = overview_rows
				.map(r => r.competitor_name)
				.filter(name => !named.includes(name));
			if (zero.length === 0) { $note.empty(); return; }
			const shown = zero.slice(0, 5);
			const names_html = shown.map(n => `<b>${frappe.utils.escape_html(n)}</b>`).join(', ');
			const extra = zero.length > shown.length ? ` and ${zero.length - shown.length} more` : '';
			$note.html(`No deals lost to ${names_html}${extra} this period.`);
		}
	}

	// ---- Trend chart ----

	function load_metric_tabs() {
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
				const $tabs = page.main.find('#ci-chart-tabs');

				if (types.length === 0) {
					$tabs.empty();
					page.main.find('#ci-chart-body').html('<p class="ci-empty">No metric history yet across your competitors.</p>');
					page.main.find('#ci-chart-legend').empty();
					return;
				}

				if (!current_metric_type || !types.includes(current_metric_type)) {
					current_metric_type = types.includes('Monthly Visits') ? 'Monthly Visits' : types[0];
				}

				$tabs.html(types.map(t => `
					<button type="button" data-type="${frappe.utils.escape_html(t)}" class="${t === current_metric_type ? 'active' : ''}">${frappe.utils.escape_html(t)}</button>
				`).join(''));
				$tabs.find('button').on('click', function() {
					current_metric_type = $(this).data('type');
					$tabs.find('button').removeClass('active');
					$(this).addClass('active');
					load_chart(current_range);
				});

				load_chart(current_range);
			}
		});
	}

	function cap_datasets(datasets, n) {
		const scored = datasets
			.map(d => {
				const real_flags = d.real_flags || [];
				const real_count = real_flags.filter(Boolean).length;
				let last_value = -Infinity;
				for (let i = real_flags.length - 1; i >= 0; i--) {
					if (real_flags[i]) { last_value = d.values[i]; break; }
				}
				return { d, real_count, last_value };
			})
			.filter(s => s.real_count > 0);
		scored.sort((a, b) => (b.real_count - a.real_count) || (b.last_value - a.last_value));
		return {
			shown: scored.slice(0, n).map(s => s.d),
			hidden_count: Math.max(0, scored.length - n)
		};
	}

	function load_chart(range) {
		if (!current_metric_type || !range) return;
		const active_names = overview_rows.map(r => r.competitor_name);
		if (active_names.length === 0) {
			page.main.find('#ci-chart-body').html('<p class="ci-empty">No competitors added yet.</p>');
			page.main.find('#ci-chart-legend').empty();
			return;
		}

		frappe.call({
			method: 'competitor_intel.api.get_comparison_trend',
			args: {
				metric_type: current_metric_type,
				competitors: active_names,
				period_start: range.period_start,
				period_end: range.period_end
			},
			callback: (r) => {
				if (comparison_chart_observer) { comparison_chart_observer.disconnect(); comparison_chart_observer = null; }
				const $body = page.main.find('#ci-chart-body').empty();
				const $legend = page.main.find('#ci-chart-legend').empty();
				const msg = r.message || {};

				if (!msg.labels || msg.labels.length === 0) {
					$body.html('<p class="ci-empty">No metric history yet for the selected period.</p>');
					return;
				}

				const { shown, hidden_count } = cap_datasets(msg.datasets, CI_TREND_CHART_CAP);
				if (shown.length === 0) {
					$body.html('<p class="ci-empty">No competitors have data for this metric in the selected period.</p>');
					return;
				}

				$body.html('<div id="ci-chart-el"></div>');
				const el = $body.find('#ci-chart-el')[0];

				new frappe.Chart(el, {
					title: '',
					data: { labels: msg.labels, datasets: shown },
					type: 'line',
					height: 260,
					colors: CI_CHART_COLORS,
					axisOptions: { shortenYAxisNumbers: true },
					lineOptions: { showDots: true }
				});

				// Same single-point-dot fix as before: frappe-charts only exposes
				// hideLine/showDots per whole chart, and 0-fills any point a
				// competitor has no real measurement for -- so a competitor with
				// exactly one real point needs its line hidden and only that dot
				// shown. Re-applied via MutationObserver since BaseChart.js
				// schedules an internal re-render ~700ms after mount.
				const apply_single_point_style = () => {
					shown.forEach((d, i) => {
						const real_idx = (d.real_flags || [])
							.reduce((acc, is_real, idx) => (is_real ? acc.concat(idx) : acc), []);
						const group = $(el).find(`.dataset-line.dataset-${i}`);
						if (real_idx.length === 1) {
							group.find('path.line-graph-path').hide();
							group.find('circle[data-point-index]').each(function() {
								$(this).toggle(Number($(this).attr('data-point-index')) === real_idx[0]);
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

				let legend_html = shown.map((d, i) => `
					<span class="ci-legend-item"><span class="ci-legend-sw" style="background:${CI_CHART_COLORS[i % CI_CHART_COLORS.length]}"></span>${frappe.utils.escape_html(d.name)}</span>
				`).join('');
				if (hidden_count > 0) {
					legend_html += `<a class="ci-legend-more" id="ci-compare-link">+${hidden_count} more · Compare</a>`;
				}
				$legend.html(legend_html);
				$legend.find('#ci-compare-link').on('click', () => frappe.set_route('competitor-comparison'));
			}
		});
	}

	// ---- Table ----

	function load_table() {
		frappe.call({
			method: 'competitor_intel.api.get_overview_data',
			callback: (r) => {
				const data = r.message || {};
				overview_rows = data.rows || [];
				overview_metric_types = data.metric_types || [];
				industry_options = data.industry_options || [];
				position_options = data.position_options || [];
				sort_state = { key: null, dir: 1 };
				filter_state = { industry: [], position: [] };
				competitor_logos = {};
				overview_rows.forEach(row => { if (row.logo) competitor_logos[row.competitor_name] = row.logo; });
				render_filter_chips();
				render_table();

				refresh_range_dependent_sections();
				load_metric_tabs();
			}
		});
	}

	function render_filter_chips() {
		function chip_group(label, values, key) {
			const selected = filter_state[key];
			let html = `<div class="ci-filter-group">`;
			html += `<span class="ci-filter-label">${frappe.utils.escape_html(label)}</span>`;
			html += `<div class="ci-chip-group">`;
			html += `<span class="ci-chip${selected.length === 0 ? ' active' : ''}" data-key="${key}" data-value="">All</span>`;
			values.forEach(v => {
				html += `<span class="ci-chip${selected.includes(v) ? ' active' : ''}" data-key="${key}" data-value="${frappe.utils.escape_html(v)}">${frappe.utils.escape_html(v)}</span>`;
			});
			html += `</div></div>`;
			return html;
		}

		const active_count = filter_state.industry.length + filter_state.position.length;
		let html = chip_group('Industry', industry_options, 'industry') + chip_group('Position', position_options, 'position');
		if (active_count > 0) {
			html += `
				<div class="ci-active-filters">
					<span>${active_count} filter${active_count === 1 ? '' : 's'} active</span>
					<a id="ci-clear-filters">Clear all</a>
				</div>`;
		}

		const $toolbar = page.main.find('#ci-table-toolbar');
		$toolbar.html(html);
		$toolbar.find('.ci-chip').on('click', function() {
			const key = $(this).data('key');
			const value = $(this).attr('data-value');
			if (!value) {
				filter_state[key] = [];
			} else {
				const idx = filter_state[key].indexOf(value);
				if (idx === -1) filter_state[key].push(value);
				else filter_state[key].splice(idx, 1);
			}
			render_filter_chips();
			render_table();
		});
		$toolbar.find('#ci-clear-filters').on('click', function() {
			filter_state = { industry: [], position: [] };
			render_filter_chips();
			render_table();
		});
	}

	function filtered_rows() {
		return overview_rows.filter(r =>
			(filter_state.industry.length === 0 || filter_state.industry.includes(r.industry)) &&
			(filter_state.position.length === 0 || filter_state.position.includes(r.market_position))
		);
	}

	function sort_rows(rows) {
		if (!sort_state.key) return rows;
		const key = sort_state.key;
		const dir = sort_state.dir;
		const get_value = (row) => key.startsWith('metric:') ? row.metrics[key.slice(7)] : row[key];
		return [...rows].sort((a, b) => {
			const av = get_value(a);
			const bv = get_value(b);
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
			return String(av).localeCompare(String(bv)) * dir;
		});
	}

	function render_table() {
		const $wrap = page.main.find('#ci-table-wrap').empty();

		if (overview_rows.length === 0) {
			$wrap.html('<p class="ci-empty" style="padding: 16px;">No competitors added yet.</p>');
			return;
		}

		const base_rows = filtered_rows();
		if (base_rows.length === 0) {
			$wrap.html('<p class="ci-empty" style="padding: 16px;">No competitors match the selected filters.</p>');
			return;
		}

		const columns = [
			{ key: 'competitor_name', label: 'Competitor' },
			{ key: 'industry', label: 'Industry' },
			...overview_metric_types.map(mt => ({ key: `metric:${mt}`, label: mt })),
			{ key: 'market_position', label: 'Position' },
			{ key: 'key_strength', label: 'Key Strength' },
			{ key: 'key_weakness', label: 'Key Weakness' }
		];

		const rows = sort_rows(base_rows);

		const $table = $(`<table class="ci-table">
			<thead><tr>
				${columns.map(col => `
					<th class="ci-sortable" data-key="${frappe.utils.escape_html(col.key)}">
						${frappe.utils.escape_html(col.label)}<span class="ci-sort-indicator"></span>
					</th>
				`).join('')}
			</tr></thead>
			<tbody></tbody>
		</table>`);

		const $tbody = $table.find('tbody');
		rows.forEach(row => {
			// get_overview_data already excludes is_active=0 competitors, so every
			// row reaching this point is a currently-active competitor.
			const $tr = $(`<tr class="ci-row" data-competitor="${frappe.utils.escape_html(row.competitor_name)}"></tr>`);

			$tr.append(`<td><div class="ci-co-cell">${avatar_html(row.competitor_name, 24)}<span class="ci-co-name">${frappe.utils.escape_html(row.competitor_name)}</span></div></td>`);
			$tr.append(`<td>${row.industry || '-'}</td>`);
			overview_metric_types.forEach(mt => {
				const v = row.metrics[mt];
				$tr.append(`<td>${v ?? '-'}</td>`);
			});
			$tr.append(`<td>${row.market_position || '-'}</td>`);
			$tr.append(`<td class="ci-strength">${row.key_strength || '-'}</td>`);
			$tr.append(`<td class="ci-weak">${row.key_weakness || '-'}</td>`);
			$tr.appendTo($tbody);
		});

		$table.find('th.ci-sortable').on('click', function() {
			const key = $(this).data('key');
			if (sort_state.key === key) {
				sort_state.dir = -sort_state.dir;
			} else {
				sort_state = { key, dir: 1 };
			}
			render_table();
		});

		if (sort_state.key) {
			$table.find(`th.ci-sortable[data-key="${sort_state.key}"] .ci-sort-indicator`)
				.text(sort_state.dir === 1 ? '▲' : '▼');
		}

		$wrap.append($table);
		$wrap.find('.ci-row').on('click', function() {
			frappe.set_route('competitor-detail', $(this).attr('data-competitor'));
		});
	}

	// ---- orchestration ----

	function refresh_range_dependent_sections() {
		current_range = compute_range();
		page.main.find('#ci-period-caption').text(`${current_range.period_start} – ${current_range.period_end}`);
		load_kpis(current_range);
		load_losing_to(current_range);
		if (current_metric_type) load_chart(current_range);
	}

	load_table();
};
