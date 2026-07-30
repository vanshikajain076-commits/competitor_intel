frappe.pages['competitor-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Competitor Dashboard',
		single_column: true
	});

	page.main.html('<h3>Dashboard is loading correctly 🎉</h3>');
};