frappe.pages['competitor-comparison'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Comparison',
		single_column: true
	});

	const SERIES_COLORS = [
		'oklch(0.55 0.14 265)', 'oklch(0.58 0.14 195)', 'oklch(0.58 0.14 150)',
		'oklch(0.6 0.14 60)', 'oklch(0.58 0.14 25)', 'oklch(0.56 0.14 320)',
		'oklch(0.58 0.14 105)', 'oklch(0.55 0.14 235)'
	];

	// Two kinds of chart metric: ones backed by real Competitor Metric rows
	// (queried via get_comparison_trend), and loss-derived ones with no doctype
	// of their own (queried via get_comparison_loss_series, which buckets
	// loss_intelligence.collect_loss_data across the date range).
	const LOSS_METRICS = [
		{ key: '__deals_lost__', label: 'Deals lost to them', kind: 'loss', value: 'count' },
		{ key: '__avg_deal_size__', label: 'Avg deal size', kind: 'loss', value: 'avg' }
	];

	const PRESETS = [
		['month', 'This month so far'],
		['d30', 'Last 30 days'],
		['quarter', 'Last quarter'],
		['custom', 'Custom range']
	];

	const state = {
		query: '',
		selected: [],           // array of Competitor `name` strings
		preset: 'month',
		custom_start: null,
		custom_end: null,
		metric_key: 'Monthly Visits',
		focus: null,
		metric_options: LOSS_METRICS.slice()  // extended once competitors are selected
	};

	let all_competitors = [];   // cached {name, competitor_name, industry}
	let chart_observer = null;

	page.main.html(`
		<style>
			.cc-wrap { display: flex; flex-direction: column; gap: 18px; font-family: 'Plus Jakarta Sans', var(--font-stack, sans-serif); }
			.cc-eyebrow { display: flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
			.cc-title { margin: 0 0 14px; font-size: 24px; font-weight: 700; letter-spacing: -.01em; }
			.cc-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 1px 2px rgba(20,20,30,.04); }
			.cc-controls { padding: 18px 20px; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; position: relative; z-index: 3; }
			@media (max-width: 720px) { .cc-controls { grid-template-columns: 1fr; } }
			.cc-label { font-size: 12px; font-weight: 600; color: var(--text-color); display: block; margin-bottom: 8px; }
			.cc-selected-note { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); float: right; }
			.cc-selected-note a { cursor: pointer; }
			.cc-picker-box { position: relative; }
			.cc-picker-input-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 40px; padding: 6px 8px; box-sizing: border-box; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); }
			.cc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 8px; border-radius: 6px; background: var(--card-bg); border: 1px solid var(--border-color); font-size: 13px; font-weight: 500; }
			.cc-chip-dot { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
			.cc-chip-remove { border: 0; background: var(--fg-hover-color); width: 16px; height: 16px; border-radius: 4px; display: inline-grid; place-items: center; cursor: pointer; color: var(--text-color); font-size: 12px; line-height: 1; padding: 0; }
			.cc-search-input { flex: 1 1 140px; min-width: 120px; border: 0; outline: none; background: transparent; font-size: 13.5px; padding: 4px 2px; }
			.cc-dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 20; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 16px 32px -16px rgba(20,20,30,.35); overflow: hidden; }
			.cc-dropdown-header { padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-light); border-bottom: 1px solid var(--border-color); }
			.cc-suggestion-list { max-height: 240px; overflow-y: auto; }
			.cc-suggestion { width: 100%; display: flex; flex-direction: column; gap: 1px; text-align: left; border: 0; background: var(--card-bg); padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); }
			.cc-suggestion:hover { background: var(--fg-hover-color); }
			.cc-suggestion-name { font-size: 13.5px; font-weight: 600; color: var(--heading-color); }
			.cc-suggestion-meta { font-size: 11.5px; color: var(--text-muted); }
			.cc-empty-msg { padding: 14px 12px; font-size: 13px; color: var(--text-muted); }
			.cc-date-btn { width: 100%; box-sizing: border-box; min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); cursor: pointer; text-align: left; }
			.cc-date-title { font-size: 13px; font-weight: 600; color: var(--heading-color); }
			.cc-date-sub { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--text-muted); }
			.cc-date-panel { position: absolute; top: calc(100% + 6px); right: 0; width: 280px; z-index: 20; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 16px 32px -16px rgba(20,20,30,.35); padding: 6px; }
			.cc-preset-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; border: 0; border-radius: 6px; background: var(--card-bg); padding: 8px 9px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-color); text-align: left; }
			.cc-preset-btn:hover { background: var(--fg-hover-color); }
			.cc-preset-btn.active { background: var(--bg-blue); color: var(--ink-blue-3); }
			.cc-custom-row { border-top: 1px solid var(--border-color); margin: 6px 3px 0; padding-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
			.cc-custom-row label { display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; color: var(--text-muted); }
			.cc-custom-row input { border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 6px; font-size: 12px; }
			.cc-empty-card { padding: 56px 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
			.cc-empty-bars { display: flex; align-items: flex-end; gap: 6px; height: 54px; }
			.cc-empty-bars span { width: 14px; border-radius: 3px; background: var(--blue-200); }
			.cc-quick-add { border: 1px solid var(--border-color); background: var(--card-bg); border-radius: 18px; padding: 6px 12px; font-size: 12.5px; font-weight: 500; color: var(--text-color); cursor: pointer; }
			.cc-quick-add:hover { border-color: var(--ink-blue-2); color: var(--ink-blue-3); }
			.cc-table-wrap { overflow-x: auto; }
			.cc-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 560px; }
			.cc-table th, .cc-table td { border-bottom: 1px solid var(--border-color); padding: 12px 16px; vertical-align: top; text-align: left; }
			.cc-table thead th { position: sticky; top: 0; background: var(--card-bg); font-size: 13px; }
			.cc-table th:first-child, .cc-table td:first-child { position: sticky; left: 0; background: var(--card-bg); min-width: 170px; z-index: 1; }
			.cc-attr-label { font-size: 12.5px; font-weight: 600; color: var(--text-color); }
			.cc-attr-hint { font-size: 10.5px; color: var(--text-light); display: block; }
			.cc-col-head-name { font-size: 14px; font-weight: 700; color: var(--heading-color); }
			.cc-col-head-sub { font-size: 11px; color: var(--text-muted); }
			.cc-cell-val { font-size: 13.5px; color: var(--heading-color); }
			.cc-cell-num { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 500; color: var(--heading-color); display: block; }
			.cc-cell-sub { font-size: 11px; color: var(--text-muted); display: block; margin-top: 2px; }
			.cc-legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
			.cc-legend-item { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border-color); background: var(--card-bg); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
			.cc-legend-item.dim { opacity: .4; }
			.cc-legend-line { width: 16px; height: 3px; border-radius: 2px; display: inline-block; }
			.cc-legend-name { font-size: 12px; font-weight: 600; color: var(--heading-color); }
			.cc-legend-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); }
			.cc-metric-btn { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border-color); background: var(--card-bg); border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--heading-color); }
			.cc-metric-panel { position: absolute; top: calc(100% + 6px); right: 0; width: 220px; z-index: 20; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 16px 32px -16px rgba(20,20,30,.35); padding: 6px; }
			.cc-backdrop { position: fixed; inset: 0; z-index: 2; }
			[hidden] { display: none !important; }
		</style>

		<div class="cc-wrap">
			<div>
				<div class="cc-eyebrow"><span>Market Intelligence</span></div>
				<h1 class="cc-title">Competitor Comparison</h1>
			</div>

			<div class="cc-card cc-controls">
				<div>
					<span class="cc-label">Competitors <span id="cc-selected-note" class="cc-selected-note"></span></span>
					<div class="cc-picker-box">
						<div class="cc-picker-input-row">
							<span id="cc-chips"></span>
							<input type="text" id="cc-search-input" class="cc-search-input" placeholder="Search competitors by name or industry…">
						</div>
						<div id="cc-suggestions" class="cc-dropdown" hidden></div>
					</div>
				</div>
				<div>
					<span class="cc-label">Date range</span>
					<div style="position: relative;">
						<button type="button" id="cc-date-btn" class="cc-date-btn">
							<span><span id="cc-date-title" class="cc-date-title"></span><br><span id="cc-date-sub" class="cc-date-sub"></span></span>
							<span style="font-size: 10px; color: var(--text-light);">▾</span>
						</button>
						<div id="cc-date-panel" class="cc-date-panel" hidden></div>
					</div>
				</div>
			</div>

			<div id="cc-body"></div>
		</div>
		<div id="cc-backdrop" class="cc-backdrop" hidden></div>
	`);

	// ---- formatting helpers ----

	function fmt_visits(v) {
		if (v === null || v === undefined) return '—';
		return v >= 1000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : String(Math.round(v));
	}
	function fmt_percent(v) {
		if (v === null || v === undefined) return '—';
		return v.toFixed(1) + '%';
	}
	function fmt_count(v) {
		if (v === null || v === undefined) return '—';
		return String(Math.round(v));
	}
	function fmt_currency_k(v) {
		if (v === null || v === undefined) return '—';
		return '$' + (v / 1000).toFixed(1) + 'k';
	}
	function metric_fmt(metric_key) {
		if (metric_key === 'Bounce Rate') return fmt_percent;
		if (metric_key === '__deals_lost__') return fmt_count;
		if (metric_key === '__avg_deal_size__') return fmt_currency_k;
		return fmt_visits;
	}
	function metric_label(metric_key) {
		const loss = LOSS_METRICS.find(m => m.key === metric_key);
		if (loss) return loss.label;
		const found = state.metric_options.find(m => m.key === metric_key);
		return found ? found.label : metric_key;
	}
	function color_of(name) {
		const idx = state.selected.indexOf(name);
		return SERIES_COLORS[idx % SERIES_COLORS.length];
	}
	function competitor_by_name(name) {
		return all_competitors.find(c => c.name === name);
	}

	// ---- date range ----

	function format_date(d) {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}
	function days_ago(n) {
		const d = new Date();
		d.setDate(d.getDate() - n);
		return d;
	}
	function compute_range() {
		const now = new Date();
		if (state.preset === 'month') {
			return { start: format_date(new Date(now.getFullYear(), now.getMonth(), 1)), end: format_date(now), title: 'This month so far' };
		}
		if (state.preset === 'd30') {
			return { start: format_date(days_ago(29)), end: format_date(now), title: 'Last 30 days' };
		}
		if (state.preset === 'quarter') {
			return { start: format_date(days_ago(90)), end: format_date(now), title: 'Last quarter' };
		}
		return {
			start: state.custom_start || format_date(days_ago(29)),
			end: state.custom_end || format_date(now),
			title: 'Custom range'
		};
	}

	// ---- backdrop / dropdown visibility ----

	function close_all_dropdowns() {
		page.main.find('#cc-suggestions').attr('hidden', true);
		page.main.find('#cc-date-panel').attr('hidden', true);
		page.main.find('#cc-metric-panel').attr('hidden', true);
		update_backdrop();
	}
	function update_backdrop() {
		const any_open = !page.main.find('#cc-suggestions').attr('hidden')
			|| !page.main.find('#cc-date-panel').attr('hidden')
			|| (page.main.find('#cc-metric-panel').length && !page.main.find('#cc-metric-panel').attr('hidden'));
		page.main.find('#cc-backdrop').attr('hidden', !any_open);
	}
	page.main.find('#cc-backdrop').on('click', close_all_dropdowns);

	// ---- competitor picker ----

	function render_chips() {
		const html = state.selected.map(name => {
			const c = competitor_by_name(name);
			const label = c ? c.competitor_name : name;
			return `
				<span class="cc-chip">
					<span class="cc-chip-dot" style="background: ${color_of(name)}"></span>
					<span>${frappe.utils.escape_html(label)}</span>
					<button type="button" class="cc-chip-remove" data-name="${frappe.utils.escape_html(name)}">×</button>
				</span>`;
		}).join('');
		page.main.find('#cc-chips').html(html);
		page.main.find('.cc-chip-remove').on('click', function() {
			remove_competitor($(this).attr('data-name'));
		});

		const note = page.main.find('#cc-selected-note');
		if (state.selected.length > 0) {
			note.html(`${state.selected.length} selected · <a id="cc-clear-all">Clear all</a>`);
			note.find('#cc-clear-all').on('click', clear_all);
		} else {
			note.html('');
		}
	}

	function render_suggestions() {
		const q = state.query.trim().toLowerCase();
		const candidates = all_competitors.filter(c =>
			!state.selected.includes(c.name)
			&& (!q || c.competitor_name.toLowerCase().includes(q) || (c.industry || '').toLowerCase().includes(q))
		).slice(0, 30);

		const header = q
			? `${candidates.length} match${candidates.length === 1 ? '' : 'es'}`
			: 'Tracked competitors';

		let body;
		if (candidates.length === 0) {
			body = `<div class="cc-empty-msg">No competitors match that search.</div>`;
		} else {
			body = `<div class="cc-suggestion-list">${candidates.map(c => `
				<button type="button" class="cc-suggestion" data-name="${frappe.utils.escape_html(c.name)}">
					<span class="cc-suggestion-name">${frappe.utils.escape_html(c.competitor_name)}</span>
					<span class="cc-suggestion-meta">${frappe.utils.escape_html(c.industry || 'Uncategorized')}</span>
				</button>`).join('')}</div>`;
		}

		page.main.find('#cc-suggestions').html(`<div class="cc-dropdown-header">${header}</div>${body}`);
		page.main.find('.cc-suggestion').on('click', function() {
			add_competitor($(this).attr('data-name'));
		});
	}

	function add_competitor(name) {
		if (!state.selected.includes(name)) {
			state.selected.push(name);
		}
		state.query = '';
		page.main.find('#cc-search-input').val('');
		render_chips();
		render_suggestions();
		refresh_metric_options_then_body();
	}
	function remove_competitor(name) {
		state.selected = state.selected.filter(n => n !== name);
		if (state.focus === name) state.focus = null;
		render_chips();
		render_suggestions();
		refresh_metric_options_then_body();
	}
	function clear_all() {
		state.selected = [];
		state.focus = null;
		render_chips();
		render_suggestions();
		refresh_metric_options_then_body();
	}

	page.main.find('#cc-search-input').on('input', function() {
		state.query = $(this).val();
		render_suggestions();
	}).on('focus', function() {
		close_all_dropdowns();
		page.main.find('#cc-suggestions').attr('hidden', false);
		update_backdrop();
	});

	// ---- date picker ----

	function render_date_button() {
		const r = compute_range();
		page.main.find('#cc-date-title').text(r.title);
		page.main.find('#cc-date-sub').text(`${r.start} – ${r.end}`);
	}

	function render_date_panel() {
		const html = PRESETS.map(([key, label]) => `
			<button type="button" class="cc-preset-btn${state.preset === key ? ' active' : ''}" data-preset="${key}">${label}</button>
		`).join('') + `
			<div class="cc-custom-row">
				<label>Start<input type="date" id="cc-custom-start" value="${state.custom_start || ''}"></label>
				<label>End<input type="date" id="cc-custom-end" value="${state.custom_end || ''}"></label>
			</div>`;
		page.main.find('#cc-date-panel').html(html);

		page.main.find('.cc-preset-btn').on('click', function() {
			state.preset = $(this).attr('data-preset');
			render_date_button();
			render_date_panel();
			if (state.preset !== 'custom') {
				close_all_dropdowns();
			}
			refresh_metric_options_then_body();
		});
		page.main.find('#cc-custom-start').on('change', function() {
			state.preset = 'custom';
			state.custom_start = $(this).val();
			render_date_button();
			refresh_metric_options_then_body();
		});
		page.main.find('#cc-custom-end').on('change', function() {
			state.preset = 'custom';
			state.custom_end = $(this).val();
			render_date_button();
			refresh_metric_options_then_body();
		});
	}

	page.main.find('#cc-date-btn').on('click', function() {
		const panel = page.main.find('#cc-date-panel');
		const was_open = !panel.attr('hidden');
		close_all_dropdowns();
		if (!was_open) {
			render_date_panel();
			panel.attr('hidden', false);
			update_backdrop();
		}
	});

	// ---- body: empty state / table / chart ----

	function render_body() {
		if (state.selected.length === 0) {
			render_empty_state();
			return;
		}
		page.main.find('#cc-body').html(`
			<div class="cc-card" style="margin-bottom: 18px;">
				<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
					<h2 style="margin: 0; font-size: 15px; font-weight: 700;">Side-by-side comparison</h2>
					<span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-light);">${state.selected.length} columns</span>
				</div>
				<div class="cc-table-wrap"><table class="cc-table"><thead></thead><tbody></tbody></table></div>
			</div>
			<div class="cc-card" style="padding: 16px 20px 20px; position: relative;">
				<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
					<div>
						<h2 style="margin: 0; font-size: 15px; font-weight: 700;">Trend comparison</h2>
						<p id="cc-trend-sub" style="margin: 2px 0 0; font-size: 12px; color: var(--text-muted);"></p>
					</div>
					<div style="position: relative;">
						<button type="button" id="cc-metric-btn" class="cc-metric-btn">
							<span style="color: var(--text-muted); font-weight: 500;">Metric</span>
							<span id="cc-metric-label"></span>
							<span style="font-size: 10px;">▾</span>
						</button>
						<div id="cc-metric-panel" class="cc-metric-panel" hidden></div>
					</div>
				</div>
				<div id="cc-legend" class="cc-legend"></div>
				<div id="cc-chart"></div>
			</div>
		`);

		page.main.find('#cc-metric-btn').on('click', function() {
			const panel = page.main.find('#cc-metric-panel');
			const was_open = !panel.attr('hidden');
			close_all_dropdowns();
			if (!was_open) {
				render_metric_panel();
				panel.attr('hidden', false);
				update_backdrop();
			}
		});

		load_table();
		load_chart();
	}

	function render_empty_state() {
		const quick = all_competitors.slice(0, 4);
		page.main.find('#cc-body').html(`
			<div class="cc-card cc-empty-card">
				<div class="cc-empty-bars">
					<span style="height: 20px; background: var(--bg-blue);"></span>
					<span style="height: 40px; background: var(--blue-200);"></span>
					<span style="height: 30px; background: var(--blue-200);"></span>
					<span style="height: 54px; background: var(--blue-500);"></span>
				</div>
				<div>
					<h2 style="margin: 0 0 6px; font-size: 17px; font-weight: 700;">Pick competitors to compare</h2>
					<p style="margin: 0; font-size: 13.5px; color: var(--text-muted); max-width: 420px;">
						Search your tracked competitors above and add as many as you like. We'll build a side-by-side profile and plot their metrics across your date range.
					</p>
				</div>
				<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
					${quick.map(c => `<button type="button" class="cc-quick-add" data-name="${frappe.utils.escape_html(c.name)}">+ ${frappe.utils.escape_html(c.competitor_name)}</button>`).join('')}
				</div>
			</div>
		`);
		page.main.find('.cc-quick-add').on('click', function() {
			add_competitor($(this).attr('data-name'));
		});
	}

	// ---- metric picker (only present once selected.length > 0) ----

	function render_metric_panel() {
		page.main.find('#cc-metric-label').text(metric_label(state.metric_key));
		const html = state.metric_options.map(m => `
			<button type="button" class="cc-preset-btn${state.metric_key === m.key ? ' active' : ''}" data-metric="${m.key}">
				${frappe.utils.escape_html(m.label)}
			</button>
		`).join('');
		page.main.find('#cc-metric-panel').html(html);
		page.main.find('#cc-metric-panel .cc-preset-btn').on('click', function() {
			state.metric_key = $(this).attr('data-metric');
			close_all_dropdowns();
			page.main.find('#cc-metric-label').text(metric_label(state.metric_key));
			load_chart();
		});
	}

	function refresh_metric_options_then_body() {
		if (state.selected.length === 0) {
			state.metric_options = LOSS_METRICS.slice();
			render_body();
			return;
		}
		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Competitor Metric',
				filters: { competitor: ['in', state.selected] },
				fields: ['metric_type'],
				group_by: 'metric_type',
				order_by: 'metric_type asc',
				limit_page_length: 0
			},
			callback: (r) => {
				const types = (r.message || []).map(row => row.metric_type).filter(Boolean);
				state.metric_options = types.map(t => ({ key: t, label: t, kind: 'metric' })).concat(LOSS_METRICS);
				if (!state.metric_options.find(m => m.key === state.metric_key)) {
					state.metric_key = state.metric_options[0].key;
				}
				render_body();
			}
		});
	}

	// ---- table ----

	function load_table() {
		const r = compute_range();
		frappe.call({
			method: 'competitor_intel.api.get_comparison_table',
			args: { competitors: state.selected, period_start: r.start, period_end: r.end },
			callback: (resp) => {
				render_table(resp.message || [], r);
			}
		});
	}

	function render_table(rows, range) {
		const thead = page.main.find('.cc-table thead');
		thead.html(`<tr><th>Attribute</th>${rows.map(row => `
			<th>
				<span class="cc-chip-dot" style="background: ${color_of(row.competitor_name)}; margin-right: 6px;"></span>
				<span class="cc-col-head-name">${frappe.utils.escape_html(row.competitor_name)}</span><br>
				<span class="cc-col-head-sub">${frappe.utils.escape_html(row.website || '—')}</span>
			</th>`).join('')}</tr>`);

		const row_defs = [
			['Industry', '', 'industry', false],
			['Market position', 'Relative to us', 'market_position', false],
			['Pricing model', '', 'pricing_model', false],
			['Key strength', 'Where they beat us', 'key_strength', false],
			['Key weakness', 'Where we win', 'key_weakness', false],
			['Differentiation', 'Their core wedge', 'differentiation', false],
			['Monthly visits', 'Est. web sessions', 'monthly_visits', true],
			['Deals lost to them', range.title.toLowerCase(), 'deals_lost', true]
		];

		const tbody = page.main.find('.cc-table tbody');
		tbody.html(row_defs.map(([label, hint, key]) => `
			<tr>
				<td><span class="cc-attr-label">${label}</span>${hint ? `<span class="cc-attr-hint">${hint}</span>` : ''}</td>
				${rows.map(row => render_cell(key, row)).join('')}
			</tr>`).join(''));
	}

	function render_cell(key, row) {
		if (key === 'monthly_visits') {
			const val = row.monthly_visits;
			let sub = '';
			if (val !== null && val !== undefined && row.monthly_visits_prior) {
				const pct = ((val - row.monthly_visits_prior) / row.monthly_visits_prior) * 100;
				sub = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + '% vs prior';
			}
			return `<td><span class="cc-cell-num">${fmt_visits(val)}</span>${sub ? `<span class="cc-cell-sub">${sub}</span>` : ''}</td>`;
		}
		if (key === 'deals_lost') {
			const sub = row.deals_lost > 0 ? `$${(row.pipeline_lost / 1000).toFixed(0)}k pipeline` : '';
			return `<td><span class="cc-cell-num">${row.deals_lost}</span>${sub ? `<span class="cc-cell-sub">${sub}</span>` : ''}</td>`;
		}
		const val = row[key];
		return `<td><span class="cc-cell-val">${val ? frappe.utils.escape_html(val) : '—'}</span></td>`;
	}

	// ---- chart ----

	function load_chart() {
		const r = compute_range();
		const el = page.main.find('#cc-chart')[0];
		page.main.find('#cc-trend-sub').text(`${metric_label(state.metric_key)} · ${r.start} – ${r.end}`);
		page.main.find('#cc-metric-label').text(metric_label(state.metric_key));

		const loss_def = LOSS_METRICS.find(m => m.key === state.metric_key);
		const call = loss_def
			? { method: 'competitor_intel.api.get_comparison_loss_series', args: { competitors: state.selected, period_start: r.start, period_end: r.end, value: loss_def.value } }
			: { method: 'competitor_intel.api.get_comparison_trend', args: { metric_type: state.metric_key, competitors: state.selected, period_start: r.start, period_end: r.end } };

		frappe.call({
			method: call.method,
			args: call.args,
			callback: (resp) => {
				if (chart_observer) {
					chart_observer.disconnect();
					chart_observer = null;
				}
				$(el).empty();
				page.main.find('#cc-legend').empty();

				const data = resp.message || { labels: [], datasets: [] };
				if (!data.labels || data.labels.length === 0) {
					$(el).html('<p class="text-muted">No data for this metric across the selected competitors and date range.</p>');
					return;
				}

				const fmt = metric_fmt(state.metric_key);
				render_legend(data.datasets, fmt);

				const active_datasets = data.datasets.map(d => ({
					name: d.name,
					values: d.values
				}));

				new frappe.Chart(el, {
					title: '',
					data: { labels: data.labels, datasets: active_datasets },
					type: 'line',
					height: 260,
					colors: data.datasets.map(d => color_of(d.name)),
					axisOptions: { shortenYAxisNumbers: true },
					lineOptions: { showDots: true }
				});

				// frappe-charts (bundled here) only exposes hideLine/showDots per whole
				// chart, not per dataset. get_comparison_trend/get_comparison_loss_series
				// 0-fill any period a competitor has no real measurement for and flag
				// which points are real via real_flags, so a competitor with exactly one
				// real point needs its line hidden and only that one dot shown — done as
				// a DOM pass, re-applied via MutationObserver since frappe-charts
				// re-renders internally ~700ms after mount (same fix as competitor_overview.js).
				const apply_single_point_style = () => {
					data.datasets.forEach((d, i) => {
						const real_idx = (d.real_flags || [])
							.reduce((acc, is_real, idx) => (is_real ? acc.concat(idx) : acc), []);
						const group = $(el).find(`.dataset-line.dataset-${i}`);
						const dim = state.focus && state.focus !== d.name;
						group.css('opacity', dim ? 0.18 : 1);
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
				chart_observer = new MutationObserver(apply_single_point_style);
				chart_observer.observe(el, { childList: true, subtree: true });
			}
		});
	}

	function render_legend(datasets, fmt) {
		const html = datasets.map(d => {
			const last = d.values.length ? d.values[d.values.length - 1] : null;
			const dim = state.focus && state.focus !== d.name;
			return `
				<span class="cc-legend-item${dim ? ' dim' : ''}" data-name="${frappe.utils.escape_html(d.name)}">
					<span class="cc-legend-line" style="background: ${color_of(d.name)}"></span>
					<span class="cc-legend-name">${frappe.utils.escape_html(competitor_by_name(d.name) ? competitor_by_name(d.name).competitor_name : d.name)}</span>
					<span class="cc-legend-val">${fmt(last)}</span>
				</span>`;
		}).join('');
		page.main.find('#cc-legend').html(html);
		page.main.find('.cc-legend-item').on('click', function() {
			const name = $(this).attr('data-name');
			state.focus = state.focus === name ? null : name;
			load_chart();
		});
	}

	// ---- init ----

	render_date_button();
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor',
			filters: { is_active: 1 },
			fields: ['name', 'competitor_name', 'industry'],
			order_by: 'competitor_name asc',
			limit_page_length: 0
		},
		callback: (r) => {
			all_competitors = r.message || [];
			render_chips();
			render_suggestions();
			refresh_metric_options_then_body();
		}
	});
};
