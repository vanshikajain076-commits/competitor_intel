const CD_AVATAR_COLORS = ['#2563eb', '#d97706', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];
const CD_POSITION_BADGE = { Leader: 'green', Challenger: 'blue', Niche: 'amber', 'New Entrant': 'purple' };

frappe.pages['competitor-detail'].on_page_load = function(wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Detail',
		single_column: true
	});

	// Style + shell markup are injected once here (not in refresh(), which re-runs on
	// every competitor navigation) so switching between competitors doesn't pile up
	// duplicate <style> tags or blow away tab state build-out unnecessarily.
	$(`
		<style>
			.cd-detail { font-size: 13px; color: var(--text-color); padding: 0 15px; max-width: 100%; overflow-x: hidden; box-sizing: border-box; }
			.cd-detail a { cursor: pointer; }

			.cd-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; padding: 2.5px 7px 2.5px 6px; border-radius: 100px; }
			.cd-badge .cd-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
			.cd-badge.red { background: var(--bg-red); color: var(--text-on-red); } .cd-badge.red .cd-dot { background: var(--red-600); }
			.cd-badge.green { background: var(--bg-green); color: var(--text-on-green); } .cd-badge.green .cd-dot { background: var(--green-600); }
			.cd-badge.amber { background: var(--bg-orange); color: var(--text-on-orange); } .cd-badge.amber .cd-dot { background: var(--amber-600); }
			.cd-badge.gray { background: var(--bg-gray); color: var(--text-on-gray); } .cd-badge.gray .cd-dot { background: var(--gray-600); }
			.cd-badge.purple { background: var(--bg-purple); color: var(--text-on-purple); } .cd-badge.purple .cd-dot { background: var(--purple-600); }
			.cd-badge.blue { background: var(--bg-blue); color: var(--text-on-blue); } .cd-badge.blue .cd-dot { background: var(--blue-600); }

			.cd-header { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 18px 20px; margin-bottom: 14px; }
			.cd-header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
			.cd-header-left { display: flex; align-items: center; gap: 14px; }
			.cd-logo { width: 52px; height: 52px; border-radius: 6px; border: 1px solid var(--border-color); flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 600; color: #fff; }
			.cd-logo img { width: 100%; height: 100%; object-fit: cover; }
			.cd-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
			.cd-title { font-size: 19px; font-weight: 600; color: var(--heading-color); letter-spacing: -0.01em; }
			.cd-sub { display: flex; align-items: center; gap: 10px; margin-top: 5px; font-size: 12.5px; color: var(--text-muted); }
			.cd-sub a { color: var(--ink-blue-3); font-weight: 500; }
			.cd-actions { display: flex; align-items: center; gap: 8px; }

			.cd-quick-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
			.cd-qs { padding: 0 16px; border-right: 1px solid var(--border-color); }
			.cd-qs:first-child { padding-left: 0; }
			.cd-qs:last-child { border-right: none; }
			.cd-qs-label { font-size: 11.5px; color: var(--text-muted); margin-bottom: 5px; }
			.cd-qs-value { font-size: 19px; font-weight: 600; color: var(--heading-color); }
			.cd-qs-value.loss { color: var(--ink-red-4); }

			.cd-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); }
			.cd-tabs button { font-family: inherit; font-size: 13px; font-weight: 500; background: none; border: none; color: var(--text-muted); padding: 9px 14px; cursor: pointer; border-bottom: 2px solid transparent; position: relative; top: 1px; border-radius: 6px 6px 0 0; }
			.cd-tabs button:hover { background: var(--fg-hover-color); color: var(--text-color); }
			.cd-tabs button.active { color: var(--ink-blue-3); border-bottom-color: var(--ink-blue-3); }
			.cd-tab-panel { display: none; }
			.cd-tab-panel.active { display: block; }

			.cd-grid-2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-bottom: 12px; }
			@media (max-width: 900px) { .cd-grid-2 { grid-template-columns: 1fr; } .cd-quick-stats { grid-template-columns: repeat(2, 1fr); } }

			.cd-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; }
			.cd-card-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid var(--border-color); }
			.cd-card-head h3 { font-size: 13.5px; font-weight: 600; color: var(--heading-color); margin: 0; }
			.cd-card-body { padding: 16px; }

			.cd-field-row { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 10px 0; }
			.cd-field-row + .cd-field-row { border-top: 1px solid var(--border-color); }
			.cd-fl { font-size: 12px; color: var(--text-muted); }
			.cd-fv { font-size: 13px; color: var(--text-color); font-weight: 500; }
			.cd-fv.strength { color: var(--ink-green-3); }
			.cd-fv.weakness { color: var(--ink-red-4); }
			.cd-notes-meta { font-size: 11.5px; color: var(--text-light); padding: 12px 16px; border-top: 1px solid var(--border-color); }

			.cd-activity-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; gap: 10px; }
			.cd-activity-row + .cd-activity-row { border-top: 1px solid var(--border-color); }
			.cd-activity-title { font-size: 12.5px; color: var(--text-color); }
			.cd-activity-date { font-size: 11.5px; color: var(--text-light); }

			.cd-metric-badges { display: flex; gap: 6px; flex-wrap: wrap; padding: 16px 16px 0; }
			.cd-metric-badge { cursor: pointer; border: none; }

			.cd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 34px 20px; color: var(--text-light); }
			.cd-empty-icon { width: 34px; height: 34px; border-radius: 50%; background: var(--control-bg); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; font-size: 15px; color: var(--text-light); }
			.cd-empty-title { font-size: 13px; font-weight: 500; color: var(--text-muted); margin-bottom: 3px; }
			.cd-empty-sub { font-size: 12px; color: var(--text-light); margin-bottom: 14px; max-width: 280px; }

			.cd-picker { display: none; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 34px 20px; text-align: center; }
			.cd-picker-prompt { font-size: 15px; font-weight: 500; color: var(--text-color); margin-bottom: 4px; }
			.cd-picker-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
			.cd-picker-msg { font-size: 12px; color: var(--ink-red-4); margin-bottom: 12px; }
			.cd-picker-field { max-width: 360px; margin: 0 auto; text-align: left; }
			.cd-detail.cd-picking { overflow: visible; }
			.cd-detail.cd-picking > :not(.cd-picker) { display: none; }
			.cd-detail.cd-picking > .cd-picker { display: block; }
		</style>

		<div class="cd-detail">
			<div class="cd-picker" id="cd-picker">
				<div class="cd-picker-prompt">Select a competitor to view their details</div>
				<div class="cd-picker-sub">Search by name, or open one from the Overview.</div>
				<div class="cd-picker-msg" id="cd-picker-msg" style="display: none;"></div>
				<div class="cd-picker-field" id="cd-picker-field"></div>
			</div>
			<div class="cd-header">
				<div class="cd-header-top">
					<div class="cd-header-left">
						<div id="cd-logo"></div>
						<div>
							<div class="cd-title-row" id="cd-title-row"></div>
							<div class="cd-sub" id="cd-sub"></div>
						</div>
					</div>
					<div class="cd-actions">
						<button class="btn btn-default btn-sm" id="cd-edit-btn">Edit</button>
						<button class="btn btn-primary btn-sm" id="cd-generate-btn">Generate AI Insight</button>
					</div>
				</div>
				<div class="cd-quick-stats" id="cd-quick-stats"></div>
			</div>

			<div class="cd-tabs">
				<button type="button" class="active" data-tab="overview">Overview</button>
				<button type="button" data-tab="loss">Loss Intelligence</button>
				<button type="button" data-tab="bench">Benchmarking</button>
				<button type="button" data-tab="notes">Notes &amp; Actions</button>
			</div>

			<div class="cd-tab-panel active" data-panel="overview">
				<div class="cd-grid-2">
					<div class="cd-card">
						<div class="cd-card-head"><h3>Snapshot</h3></div>
						<div class="cd-card-body" id="cd-snapshot"></div>
					</div>
					<div class="cd-card">
						<div class="cd-card-head"><h3>Recent Activity</h3></div>
						<div class="cd-card-body" id="cd-activity"></div>
					</div>
				</div>
			</div>

			<div class="cd-tab-panel" data-panel="loss">
				<div class="cd-card">
					<div class="cd-card-head"><h3>Losses Over Time</h3></div>
					<div class="cd-card-body" id="loss-trend-chart"></div>
					<div class="cd-card-body text-muted small" id="loss-trend-updated" style="padding-top: 0;"></div>
				</div>
				<div class="cd-card">
					<div class="cd-card-head">
						<h3>This Month So Far</h3>
						<button class="btn btn-default btn-xs" id="month-so-far-btn">Load</button>
					</div>
					<div class="cd-card-body" id="month-so-far-panel">
						<p class="text-muted small" style="margin: 0;">Click Load for live, in-progress numbers for the current month.</p>
					</div>
				</div>
				<div class="cd-card">
					<div class="cd-card-head"><h3>Top Reasons We Lose to Them</h3></div>
					<div class="cd-card-body">
						<div id="top-loss-reasons"></div>
						<div id="top-loss-reasons-action" style="margin-top: 10px;"></div>
					</div>
				</div>
			</div>

			<div class="cd-tab-panel" data-panel="bench">
				<div class="cd-card">
					<div class="cd-card-head"><h3>Metrics</h3></div>
					<div id="metrics-section"></div>
				</div>
			</div>

			<div class="cd-tab-panel" data-panel="notes">
				<div class="cd-grid-2">
					<div class="cd-card">
						<div class="cd-card-head">
							<h3>Qualitative Notes</h3>
							<button class="btn btn-default btn-xs" id="cd-notes-edit-btn">Edit</button>
						</div>
						<div id="qualitative-notes"></div>
					</div>
					<div>
						<div class="cd-card">
							<div class="cd-card-head"><h3>AI Insight</h3></div>
							<div id="ai-insight-section"></div>
						</div>
						<div class="cd-card">
							<div class="cd-card-head">
								<h3>Strategy Actions</h3>
								<button class="btn btn-default btn-xs" id="add-action-btn">Add</button>
							</div>
							<div id="strategy-actions-section"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
	`).appendTo(page.main);

	// Native Link control: standard Frappe search/select behavior against Competitor
	page.competitor_picker = frappe.ui.form.make_control({
		df: {
			fieldtype: 'Link',
			fieldname: 'competitor',
			options: 'Competitor',
			placeholder: 'Search competitors…',
			change: () => {
				const selected = page.competitor_picker.get_value();
				if (selected && selected !== frappe.get_route()[1]) {
					frappe.set_route('competitor-detail', selected);
				}
			}
		},
		parent: page.main.find('#cd-picker-field'),
		render_input: true
	});

	page.main.find('.cd-tabs button').on('click', function() {
		const tab = $(this).data('tab');
		page.main.find('.cd-tabs button').removeClass('active');
		$(this).addClass('active');
		page.main.find('.cd-tab-panel').removeClass('active');
		page.main.find(`.cd-tab-panel[data-panel="${tab}"]`).addClass('active');
	});
};

// Fires on every route show (first load and subsequent navigations between
// different competitors), so route-param-dependent rendering lives here
// rather than in on_page_load, which only runs once.
frappe.pages['competitor-detail'].refresh = function(wrapper) {
	const page = wrapper.page;
	const competitor_name = frappe.get_route()[1];
	const container = page.main;

	// Empty state: no competitor in the route -> show the picker instead of the detail view
	const show_picker = (message) => {
		container.find('.cd-detail').addClass('cd-picking');
		const msg_el = container.find('#cd-picker-msg');
		if (message) msg_el.text(message).show(); else msg_el.hide();
		page.set_title('Competitor Detail');
		page.competitor_picker.set_value('');
	};

	if (!competitor_name) {
		show_picker();
		return;
	}
	container.find('.cd-detail').removeClass('cd-picking');

	frappe.call({
		method: 'frappe.client.get',
		args: { doctype: 'Competitor', name: competitor_name },
		callback: (r) => {
			if (!r.message) {
				show_picker(`Competitor "${competitor_name}" not found. Pick another below.`);
				return;
			}

			const c = r.message;
			page.set_title(c.competitor_name || competitor_name);
			render_header(c, container);

			load_header_stats(competitor_name, container);
			load_loss_trend_chart(competitor_name, container);
			load_top_loss_reasons(competitor_name, container);
			setup_turn_loss_into_action_button(competitor_name, container);
			setup_month_so_far_button(competitor_name, container);
			load_metrics_chart(competitor_name, container);
			load_qualitative(competitor_name, container);
			load_ai_insight(competitor_name, container);
			load_strategy_actions(competitor_name, container);

			container.find('#cd-edit-btn').off('click').on('click', () => {
				frappe.set_route('Form', 'Competitor', competitor_name);
			});
			container.find('#cd-generate-btn').off('click').on('click', () => {
				container.find('.cd-tabs button[data-tab="notes"]').trigger('click');
				container.find('#generate-ai-insight-btn').trigger('click');
			});
		},
		error: () => {
			show_picker(`Could not load competitor "${competitor_name}". Pick another below.`);
		}
	});
};

// ---- shared helpers ----

function cd_color_for(name) {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	return CD_AVATAR_COLORS[hash % CD_AVATAR_COLORS.length];
}

function cd_field_row(label, value, cls, is_html) {
	// is_html: for Text Editor fields, whose content is already-sanitized HTML from
	// Frappe's own sanitize_html() on save — escaping it here would print raw tags.
	const value_html = value ? (is_html ? value : frappe.utils.escape_html(value)) : '-';
	return `
		<div class="cd-field-row">
			<div class="cd-fl">${frappe.utils.escape_html(label)}</div>
			<div class="cd-fv${cls ? ' ' + cls : ''}">${value_html}</div>
		</div>
	`;
}

function cd_empty(title, sub, cta_html) {
	return `
		<div class="cd-empty">
			<div class="cd-empty-icon">&#9679;</div>
			<div class="cd-empty-title">${frappe.utils.escape_html(title)}</div>
			<div class="cd-empty-sub">${frappe.utils.escape_html(sub)}</div>
			${cta_html || ''}
		</div>
	`;
}

// ---- header ----

function render_header(c, container) {
	const logo_el = container.find('#cd-logo');
	if (c.logo) {
		logo_el.html(`<img src="${frappe.utils.escape_html(c.logo)}" alt="">`);
		logo_el.css('background', '#fff');
	} else {
		const initial = (c.competitor_name || '?').trim().charAt(0).toUpperCase();
		logo_el.text(initial);
		logo_el.css('background', cd_color_for(c.competitor_name || ''));
	}

	let title_html = `<span class="cd-title">${frappe.utils.escape_html(c.competitor_name || '')}</span>`;
	if (c.industry) {
		title_html += `<span class="cd-badge gray"><span class="cd-dot"></span>${frappe.utils.escape_html(c.industry)}</span>`;
	}
	if (!c.is_active) {
		title_html += `<span class="cd-badge gray"><span class="cd-dot"></span>Inactive</span>`;
	}
	container.find('#cd-title-row').html(title_html);

	let sub_html = '';
	if (c.website) {
		sub_html += `<a href="${frappe.utils.escape_html(c.website)}" target="_blank" rel="noopener">${frappe.utils.escape_html(c.website)}</a>`;
	}
	if (c.creation) {
		sub_html += `${sub_html ? '<span>·</span>' : ''}<span>Tracked since ${frappe.datetime.str_to_user(c.creation.split(' ')[0])}</span>`;
	}
	container.find('#cd-sub').html(sub_html);
}

function load_header_stats(competitor_name, container) {
	frappe.call({
		method: 'competitor_intel.api.get_competitor_lifetime_stats',
		args: { competitor: competitor_name },
		callback: (r) => {
			const data = r.message || {};
			render_quick_stats(data, container);
			render_activity(data.recent_activity || [], container);
		}
	});
}

function render_quick_stats(data, container) {
	const cards = [
		{ label: 'Opportunities Lost to Them', value: data.opportunity_count || 0 },
		{ label: 'Quotations Lost to Them', value: data.quotation_count || 0 },
		{ label: 'Total Value Lost', value: format_currency(data.total_value_lost || 0) },
		{ label: 'Last Loss Recorded', value: data.last_loss_date ? frappe.datetime.str_to_user(data.last_loss_date) : '-', no_loss_color: true }
	];
	const html = cards.map(c => `
		<div class="cd-qs">
			<div class="cd-qs-label">${frappe.utils.escape_html(c.label)}</div>
			<div class="cd-qs-value${c.no_loss_color ? '' : ' loss'}">${c.value}</div>
		</div>
	`).join('');
	container.find('#cd-quick-stats').html(html);
}

function render_activity(rows, container) {
	const el = container.find('#cd-activity');
	if (rows.length === 0) {
		el.html(cd_empty('No activity yet', 'Losses and note updates for this competitor will show up here.'));
		return;
	}

	const badge_for = (type) => {
		if (type === 'Note') return '<span class="cd-badge gray"><span class="cd-dot"></span>Note</span>';
		return '<span class="cd-badge red"><span class="cd-dot"></span>Loss</span>';
	};

	el.html(rows.map(row => `
		<div class="cd-activity-row">
			<div>
				<div class="cd-activity-title">${row.type === 'Note' ? 'Qualitative note updated' : `${frappe.utils.escape_html(row.type)} lost — ${frappe.utils.escape_html(row.label)}`}</div>
				<div class="cd-activity-date">${row.date ? frappe.datetime.str_to_user(row.date) : '-'}</div>
			</div>
			${badge_for(row.type)}
		</div>
	`).join(''));
}

// ---- Loss Intelligence tab ----

function load_loss_trend_chart(competitor_name, container) {
	frappe.call({
		method: 'competitor_intel.api.get_last_snapshot_generated_on',
		args: { competitor: competitor_name },
		callback: (r) => {
			const el = container.find('#loss-trend-updated');
			if (r.message) {
				el.text(__('Last updated: {0}', [frappe.datetime.str_to_user(r.message)]));
			} else {
				el.empty();
			}
		}
	});

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
				$(el).html(cd_empty('No loss data yet', 'Finalized monthly loss numbers for this competitor will appear here once available.'));
				return;
			}

			$(el).empty();
			new frappe.Chart(el, {
				title: '',
				data: {
					labels: rows.map(row => row.period_start),
					datasets: [
						{ name: 'Quotation Lost', values: rows.map(row => row.quotation_lost_count || 0) },
						{ name: 'Opportunity Lost', values: rows.map(row => row.opportunity_lost_count || 0) }
					]
				},
				type: 'line',
				height: 260,
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

			if (top5.length === 0) {
				el.html(cd_empty(
					'No loss reasons recorded yet',
					`Add a reason the next time a deal is marked lost to ${competitor_name}.`,
					'<button class="btn btn-default btn-sm" id="cd-log-loss-reason-btn">Log a loss reason</button>'
				));
				el.find('#cd-log-loss-reason-btn').on('click', () => {
					frappe.set_route('List', 'Quotation', { status: 'Lost' });
				});
				return;
			}

			let html = '<ul style="list-style: none; padding-left: 0; margin-bottom: 0;">';
			top5.forEach(row => {
				const pill_color = row.reason_type === 'Opportunity Lost Reason' ? 'amber' : 'blue';
				html += `
					<li style="margin-bottom: 6px;">
						<span class="cd-badge ${pill_color}"><span class="cd-dot"></span>${frappe.utils.escape_html(row.reason_type)}</span>
						${frappe.utils.escape_html(row.lost_reason)} — <strong>${row.count}</strong>
					</li>
				`;
			});
			html += '</ul>';
			el.html(html);
		}
	});
}

// Additive only — does not touch load_top_loss_reasons or its rendering,
// per the rule that the already-committed Loss Intelligence section gets
// exactly one small addition (this button) and nothing else changes.
function setup_turn_loss_into_action_button(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Loss Snapshot',
			filters: { competitor: competitor_name },
			fields: ['name'],
			order_by: 'period_start desc',
			limit_page_length: 1
		},
		callback: (r) => {
			const snapshot = (r.message || [])[0];
			const el = container.find('#top-loss-reasons-action');

			if (!snapshot) {
				el.empty();
				return;
			}

			el.html('<button class="btn btn-default btn-sm" id="loss-to-action-btn">Turn this into an action</button>');
			el.find('#loss-to-action-btn').on('click', () => {
				open_add_action_dialog(competitor_name, container, 'Competitor Loss Snapshot', snapshot.name);
			});
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
					<div class="cd-quick-stats" style="margin-top: 0; padding-top: 0; border-top: none;">
						<div class="cd-qs">
							<div class="cd-qs-label">Opportunities Lost</div>
							<div class="cd-qs-value loss">${data.opportunity_count || 0}</div>
						</div>
						<div class="cd-qs">
							<div class="cd-qs-label">Opportunity Value Lost</div>
							<div class="cd-qs-value loss">${format_currency(data.opportunity_value || 0)}</div>
						</div>
						<div class="cd-qs">
							<div class="cd-qs-label">Quotations Lost</div>
							<div class="cd-qs-value loss">${data.quotation_count || 0}</div>
						</div>
						<div class="cd-qs">
							<div class="cd-qs-label">Quotation Value Lost</div>
							<div class="cd-qs-value loss">${format_currency(data.quotation_value || 0)}</div>
						</div>
					</div>
					<div style="margin-top: 10px;">
						<span class="cd-badge amber"><span class="cd-dot"></span>Live — ${data.period_start || ''} to ${data.period_end || ''}</span>
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

// ---- Benchmarking tab ----

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
				section.html(cd_empty('No metrics recorded yet', 'Traffic and benchmarking data for this competitor will appear here once tracked.'));
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
			let current_type = default_type;

			section.html(`
				<div class="cd-metric-badges" id="cd-metric-badges"></div>
				<div class="cd-card-body" id="competitor-metric-chart"></div>
			`);

			const $badges = section.find('#cd-metric-badges');

			const render_badges = () => {
				$badges.html(types.map(t => `
					<span class="cd-badge cd-metric-badge ${t === current_type ? 'blue' : 'gray'}" data-type="${frappe.utils.escape_html(t)}">
						<span class="cd-dot"></span>${frappe.utils.escape_html(t)}
					</span>
				`).join(''));
				$badges.find('.cd-metric-badge').on('click', function() {
					current_type = $(this).data('type');
					render_badges();
					render_metric(current_type);
				});
			};

			const render_metric = (metric_type) => {
				const chart_el = section.find('#competitor-metric-chart')[0];
				const series = by_type[metric_type] || [];
				$(chart_el).empty();
				// A single data point has nothing to draw a trend line between, and
				// frappe-charts silently renders a bare moveto for it (no visible mark
				// at all) — same underlying gap-handling limitation as the Overview
				// comparison chart, just without that chart's 0-fill-across-competitors
				// step to turn it into a visibly misleading line. Since this chart only
				// ever holds one dataset, hideLine/showDots (whole-chart-only options in
				// this frappe-charts version) are enough on their own here — no DOM pass
				// needed like the Overview chart requires for its multi-dataset case.
				const single_point = series.length === 1;
				new frappe.Chart(chart_el, {
					title: '',
					data: {
						labels: series.map(row => row.metric_date),
						datasets: [{ name: metric_type, values: series.map(row => row.value) }]
					},
					type: 'line',
					height: 240,
					colors: ['#2563eb'],
					axisOptions: { shortenYAxisNumbers: true },
					lineOptions: single_point ? { hideLine: true, showDots: true } : {}
				});
			};

			render_badges();
			render_metric(default_type);
		}
	});
}

// ---- Notes & Actions tab (+ Overview tab's Snapshot card, same data) ----

function load_qualitative(competitor_name, container) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Competitor Qualitative',
			filters: { competitor: competitor_name },
			fields: [
				'name', 'review_date', 'source_evidence', 'market_position', 'pricing_model',
				'perceived_threat_level', 'target_audience', 'key_strength', 'key_weakness', 'differentiation'
			],
			order_by: 'review_date desc',
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];
			render_snapshot(rows[0], container);
			render_qualitative_notes(competitor_name, rows, container);
		}
	});
}

function render_snapshot(latest, container) {
	const el = container.find('#cd-snapshot');
	if (!latest) {
		el.html(cd_empty('No qualitative notes yet', 'Add a market position, pricing model, and SWOT read on this competitor.'));
		return;
	}

	const position_html = latest.market_position
		? `<span class="cd-badge ${CD_POSITION_BADGE[latest.market_position] || 'gray'}"><span class="cd-dot"></span>${frappe.utils.escape_html(latest.market_position)}</span>`
		: '-';

	el.html(`
		<div class="cd-field-row"><div class="cd-fl">Market Position</div><div class="cd-fv">${position_html}</div></div>
		${cd_field_row('Pricing Model', latest.pricing_model)}
		${cd_field_row('Perceived Threat Level', latest.perceived_threat_level)}
		${cd_field_row('Target Audience', latest.target_audience, null, true)}
		${cd_field_row('Key Strength', latest.key_strength, 'strength', true)}
		${cd_field_row('Key Weakness', latest.key_weakness, 'weakness', true)}
	`);
}

function render_qualitative_notes(competitor_name, rows, container) {
	const el = container.find('#qualitative-notes');
	const edit_btn = container.find('#cd-notes-edit-btn');

	edit_btn.off('click').on('click', () => {
		if (rows[0]) {
			frappe.set_route('Form', 'Competitor Qualitative', rows[0].name);
		} else {
			frappe.new_doc('Competitor Qualitative', { competitor: competitor_name });
		}
	});

	if (rows.length === 0) {
		el.html(cd_empty(
			'No qualitative notes yet',
			'Add a market position, pricing model, and SWOT read on this competitor.',
			'<button class="btn btn-default btn-sm" id="cd-add-note-btn">Add a note</button>'
		));
		el.find('#cd-add-note-btn').on('click', () => {
			frappe.new_doc('Competitor Qualitative', { competitor: competitor_name });
		});
		return;
	}

	const [latest, ...older] = rows;

	const full_details = (row) => `
		${cd_field_row('Source / Evidence', row.source_evidence)}
		${cd_field_row('Market Position', row.market_position)}
		${cd_field_row('Pricing Model', row.pricing_model)}
		${cd_field_row('Perceived Threat Level', row.perceived_threat_level)}
		${cd_field_row('Target Audience', row.target_audience, null, true)}
		${cd_field_row('Key Strength', row.key_strength, 'strength', true)}
		${cd_field_row('Key Weakness', row.key_weakness, 'weakness', true)}
		${cd_field_row('Differentiation', row.differentiation, null, true)}
	`;

	let html = `<div class="cd-card-body" style="padding-bottom: 4px;">${full_details(latest)}</div>`;

	let meta = `Most recent update — ${frappe.datetime.str_to_user(latest.review_date)}`;
	if (older.length > 0) {
		const label = `${older.length} earlier note${older.length > 1 ? 's' : ''}`;
		meta += ` · <a id="qualitative-history-toggle">Show ${label}</a>`;
	}
	html += `<div class="cd-notes-meta">${meta}</div>`;
	if (older.length > 0) {
		html += `<div id="qualitative-history-list" class="cd-card-body" style="display: none; padding-top: 0;"></div>`;
	}

	el.html(html);

	if (older.length > 0) {
		const label = `${older.length} earlier note${older.length > 1 ? 's' : ''}`;
		const list_el = el.find('#qualitative-history-list');
		list_el.html(
			older.map(row => `
				<div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
					<a href="#" class="qualitative-history-item-toggle">
						${frappe.datetime.str_to_user(row.review_date)} —
						${frappe.utils.escape_html(row.market_position || '-')} ·
						${frappe.utils.escape_html(row.pricing_model || '-')}
					</a>
					<div class="qualitative-history-item-details" style="display: none; margin-top: 8px;">
						${full_details(row)}
					</div>
				</div>
			`).join('')
		);

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

function load_ai_insight(competitor_name, container) {
	const section = container.find('#ai-insight-section');
	const threat_colors = { High: 'red', Medium: 'amber', Low: 'green' };

	const insight_body = (insight) => `
		<p><strong>Why:</strong> ${frappe.utils.escape_html(insight.threat_explanation || '-')}</p>
		<p><strong>Market Gap Opportunities:</strong> ${frappe.utils.escape_html(insight.market_gap_opportunities || '-')}</p>
		<p style="margin-bottom: 0;"><strong>Recommended Positioning:</strong> ${frappe.utils.escape_html(insight.recommended_positioning || '-')}</p>
		${insight.data_snapshot ? `
			<div style="margin-top: 8px;">
				<a href="#" class="ai-insight-data-toggle text-muted small">Show data sent to AI</a>
				<pre class="ai-insight-data" style="display: none; margin-top: 6px; white-space: pre-wrap;">${frappe.utils.escape_html(insight.data_snapshot)}</pre>
			</div>` : ''}
	`;

	const render = (insights) => {
		let html = '';
		const [latest, ...older] = insights;

		if (latest) {
			const color = threat_colors[latest.threat_level] || 'gray';
			html += `
				<div class="cd-card-body">
					<div style="margin-bottom: 8px;">
						<span class="cd-badge ${color}"><span class="cd-dot"></span>${frappe.utils.escape_html(latest.threat_level || 'Unknown')} THREAT</span>
						<span class="text-muted small" style="margin-left: 8px;">
							Generated ${frappe.datetime.str_to_user(latest.generated_on)}
						</span>
					</div>
					${insight_body(latest)}
				</div>
				<div class="cd-card-body" style="padding-top: 0;">
					<button class="btn btn-default btn-xs" id="generate-ai-insight-btn">Generate new insight</button>
					<button class="btn btn-default btn-xs" id="insight-to-action-btn" style="margin-left: 8px;">Turn this into an action</button>
				</div>
			`;

			if (older.length > 0) {
				const label = `${older.length} earlier insight${older.length > 1 ? 's' : ''}`;
				html += `<div class="cd-notes-meta">Most recent insight · <a id="ai-insight-history-toggle">Show ${label}</a></div>`;
				html += `<div id="ai-insight-history-list" class="cd-card-body" style="display: none; padding-top: 0;">
					${older.map(row => {
						const row_color = threat_colors[row.threat_level] || 'gray';
						return `
							<div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
								<a href="#" class="ai-insight-history-item-toggle">
									${frappe.datetime.str_to_user(row.generated_on)} —
									<span class="cd-badge ${row_color}"><span class="cd-dot"></span>${frappe.utils.escape_html(row.threat_level || 'Unknown')}</span>
								</a>
								<div class="ai-insight-history-item-details" style="display: none; margin-top: 8px;">
									${insight_body(row)}
								</div>
							</div>`;
					}).join('')}
				</div>`;
			}
		} else {
			html += cd_empty(
				'No AI insight generated yet',
				'Summarize losses, notes, and metrics into a talk track.',
				'<button class="btn btn-primary btn-sm" id="generate-ai-insight-btn">Generate AI Insights</button>'
			);
		}

		section.html(html);

		section.find('#generate-ai-insight-btn').on('click', function() {
			const btn = $(this);
			btn.prop('disabled', true).text('Generating…');
			frappe.show_alert('Generating insights… this may take a few seconds.');

			frappe.call({
				method: 'competitor_intel.api.generate_ai_insights',
				args: { competitor: competitor_name },
				callback: () => load_ai_insight(competitor_name, container),
				error: () => {
					frappe.msgprint('Error generating insights. Check the browser console for details.');
					btn.prop('disabled', false).text(latest ? 'Generate new insight' : 'Generate AI Insights');
				}
			});
		});

		if (latest) {
			section.find('#insight-to-action-btn').on('click', () => {
				open_add_action_dialog(competitor_name, container, 'AI Insight', latest.name);
			});
		}

		section.find('.ai-insight-data-toggle').on('click', function(e) {
			e.preventDefault();
			const pre = $(this).next('.ai-insight-data');
			const currently_visible = pre.is(':visible');
			pre.slideToggle();
			$(this).text(currently_visible ? 'Show data sent to AI' : 'Hide data sent to AI');
		});

		if (older.length > 0) {
			const label = `${older.length} earlier insight${older.length > 1 ? 's' : ''}`;
			const list_el = section.find('#ai-insight-history-list');

			section.find('#ai-insight-history-toggle').on('click', function(e) {
				e.preventDefault();
				const currently_visible = list_el.is(':visible');
				list_el.slideToggle();
				$(this).text(currently_visible ? `Show ${label}` : `Hide ${label}`);
			});

			list_el.find('.ai-insight-history-item-toggle').on('click', function(e) {
				e.preventDefault();
				$(this).closest('div').find('.ai-insight-history-item-details').first().slideToggle();
			});
		}
	};

	frappe.call({
		method: 'competitor_intel.api.get_ai_insights',
		args: { competitor: competitor_name },
		callback: (r) => render(r.message || [])
	});
}

function load_strategy_actions(competitor_name, container) {
	const section = container.find('#strategy-actions-section');

	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Strategy Action',
			filters: { competitor: competitor_name },
			fields: ['name', 'action_title', 'category', 'priority', 'status', 'due_date'],
			order_by: 'due_date asc',
			limit_page_length: 0
		},
		callback: (r) => {
			const rows = r.message || [];

			if (rows.length === 0) {
				section.html(cd_empty('No strategy actions yet', 'Turn a loss reason or AI insight into a tracked action.'));
			} else {
				section.html(`
					<div class="cd-card-body" style="padding: 0;">
						<table class="table table-bordered" style="margin-bottom: 0;">
							<thead>
								<tr>
									<th>Action</th><th>Category</th><th>Priority</th><th>Status</th><th>Due Date</th>
								</tr>
							</thead>
							<tbody>
								${rows.map(row => `
									<tr>
										<td>${frappe.utils.escape_html(row.action_title)}</td>
										<td>${frappe.utils.escape_html(row.category || '-')}</td>
										<td>${frappe.utils.escape_html(row.priority || '-')}</td>
										<td>${frappe.utils.escape_html(row.status || '-')}</td>
										<td>${row.due_date ? frappe.datetime.str_to_user(row.due_date) : '-'}</td>
									</tr>
								`).join('')}
							</tbody>
						</table>
					</div>
				`);
			}

			container.find('#add-action-btn').off('click').on('click', () => {
				open_add_action_dialog(competitor_name, container);
			});
		}
	});
}

function open_add_action_dialog(competitor_name, container, source_type, source_reference) {
	const dialog = new frappe.ui.Dialog({
		title: 'Add New Action',
		fields: [
			{ fieldname: 'action_title', fieldtype: 'Data', label: 'Action', reqd: 1 },
			{ fieldname: 'category', fieldtype: 'Select', label: 'Category', options: 'Pricing\nProduct\nMarketing\nSales\nPositioning\nOps' },
			{ fieldname: 'priority', fieldtype: 'Select', label: 'Priority', options: 'High\nMedium\nLow', default: 'Medium' },
			{ fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Idea\nPlanned\nIn Progress\nDone\nDropped', default: 'Idea' },
			{ fieldname: 'due_date', fieldtype: 'Date', label: 'Due Date' }
		],
		primary_action_label: 'Add',
		primary_action(values) {
			frappe.call({
				method: 'frappe.client.insert',
				args: {
					doc: {
						doctype: 'Strategy Action',
						competitor: competitor_name,
						source_type: source_type || '',
						source_reference: source_reference || null,
						action_title: values.action_title,
						category: values.category,
						priority: values.priority,
						status: values.status,
						due_date: values.due_date
					}
				},
				callback: () => {
					dialog.hide();
					frappe.show_alert({ message: 'Action added', indicator: 'green' });
					load_strategy_actions(competitor_name, container);
				}
			});
		}
	});
	dialog.show();
}
