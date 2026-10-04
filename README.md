# Competitor Intel

A Frappe app for tracking competitors and understanding why you lose deals to
them. It builds on ERPNext sales data:

- **Competitor records** with qualitative notes (strengths, weaknesses,
  pricing, perceived threat level, source evidence) and traffic metrics.
- **Loss intelligence**: Quotations and Opportunities marked Lost against a
  competitor are stamped and rolled up into monthly per-competitor and
  per-loss-reason snapshots (scheduled monthly job, with failure
  notifications).
- **Desk pages**: *Competitor Overview* (KPIs, who you lose to, trends,
  tracked competitors), *Competitor Detail* (profile, loss history,
  benchmarking, notes and actions) and *Competitor Comparison* (side-by-side
  metrics across a date range).
- **AI insights** per competitor (optional, needs a Groq key).

## Requirements

- **ERPNext is required** (declared via `required_apps`; Quotation and
  Opportunity are extended with custom fields and hooks).
- Frappe / ERPNext **version 16** only. Tested on Frappe 16.31.0 and
  ERPNext 16.32.3 (`version-16`). Other versions are untested.
- Python 3.14 and Node 24 or newer (Frappe v16's own requirements; tested on
  Python 3.14.6, Node 24.19.0).

## Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app erpnext --branch version-16   # skip if already installed
bench get-app $URL_OF_THIS_REPO --branch <branch>
bench --site <site> install-app erpnext     # skip if already installed
bench --site <site> install-app competitor_intel
bench --site <site> migrate
```

Installing the app on a site without ERPNext will fail by design.

## Optional configuration

The app works without any external keys. The following features need a key
set in `sites/<site>/site_config.json` (or via
`bench --site <site> set-config <key> <value>`):

| Key | Enables | Without it |
| --- | --- | --- |
| `cloudflare_api_token` | *Fetch Cloudflare Rank* (Competitor form): real domain traffic rank from [Cloudflare Radar](https://developers.cloudflare.com/radar/) (token needs Radar read access) | The button shows a message asking you to configure the token |
| `groq_api_key` | *Generate AI Insight* on the Competitor Detail page, via [Groq](https://console.groq.com/) | Generating an insight shows "Groq API key not configured" |

```bash
bench --site <site> set-config cloudflare_api_token <token>
bench --site <site> set-config groq_api_key <key>
```

Other data sources:

- *Fetch Search Trend* uses Google Trends through `pytrends` (installed with the app,
  no key needed).
- *Fetch Traffic Data* and *Seed Demo History* read from a local mock server
  for development only. Run `python3 mock_server/server.py` (see
  `mock_server/README.md`); the numbers are random, never real traffic.

## Design

Page styling rules are in [DESIGN.md](DESIGN.md). Pages use Frappe's CSS
variables so they follow the light and dark Desk themes.

## Contributing

This app uses `pre-commit` for code formatting and linting. Please
[install pre-commit](https://pre-commit.com/#installation) and enable it for
this repository:

```bash
cd apps/competitor_intel
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

## License

MIT. See [license.txt](license.txt).
