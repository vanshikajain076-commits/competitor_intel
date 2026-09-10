app_name = "competitor_intel"
app_title = "Competitor Intel"
app_publisher = "SMM"
app_description = "acker dashboard"
app_email = "vanshikajain076@gmail.com"
app_license = "mit"

# Fixtures
# ------------------

fixtures = [
	{"doctype": "Custom Field", "filters": [["dt", "in", ["Competitor", "Quotation", "Opportunity"]]]}
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "competitor_intel",
# 		"logo": "/assets/competitor_intel/logo.png",
# 		"title": "Competitor Intel",
# 		"route": "/competitor_intel",
# 		"has_permission": "competitor_intel.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/competitor_intel/css/competitor_intel.css"
# app_include_js = "/assets/competitor_intel/js/competitor_intel.js"

# include js, css files in header of web template
# web_include_css = "/assets/competitor_intel/css/competitor_intel.css"
# web_include_js = "/assets/competitor_intel/js/competitor_intel.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "competitor_intel/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {"Competitor": "public/js/competitor.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "competitor_intel/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "competitor_intel.utils.jinja_methods",
# 	"filters": "competitor_intel.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "competitor_intel.install.before_install"
# after_install = "competitor_intel.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "competitor_intel.uninstall.before_uninstall"
# after_uninstall = "competitor_intel.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "competitor_intel.utils.before_app_install"
# after_app_install = "competitor_intel.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "competitor_intel.utils.before_app_uninstall"
# after_app_uninstall = "competitor_intel.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "competitor_intel.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Quotation": {
		"on_change": "competitor_intel.utils.stamp_lost_on"
	},
	"Opportunity": {
		"on_change": "competitor_intel.utils.stamp_lost_on"
	}
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"competitor_intel.tasks.all"
# 	],
# 	"daily": [
# 		"competitor_intel.tasks.daily"
# 	],
# 	"hourly": [
# 		"competitor_intel.tasks.hourly"
# 	],
# 	"weekly": [
# 		"competitor_intel.tasks.weekly"
# 	],
# 	"monthly": [
# 		"competitor_intel.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "competitor_intel.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "competitor_intel.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "competitor_intel.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["competitor_intel.utils.before_request"]
# after_request = ["competitor_intel.utils.after_request"]

# Job Events
# ----------
# before_job = ["competitor_intel.utils.before_job"]
# after_job = ["competitor_intel.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"competitor_intel.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

