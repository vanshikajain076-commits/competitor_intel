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
				</div>
				<div style="margin-bottom: 24px;">
					<h4>Profile &amp; Benchmarking</h4>
				</div>
			`);
		},
		error: () => {
			container.html(`<p class="text-muted">Could not load competitor "${frappe.utils.escape_html(competitor_name)}".</p>`);
		}
	});
};
