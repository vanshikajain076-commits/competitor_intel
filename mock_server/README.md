# Mock Traffic Server

Local test data only — **never real traffic data**. All numbers are randomly
generated (seeded by the website string, so the same domain returns
consistent numbers across calls). This exists purely so `fetch_traffic_data`
and `seed_demo_history` in `competitor_intel/api.py` have something to call
during local development.

## Run it

```
python3 mock_server/server.py
```

No external dependencies — stdlib only (`http.server`, `json`, `random`).
Listens on `http://localhost:5001`.

## Endpoint

`GET /traffic/<website>` → JSON:

```json
{
  "monthly_visits": 1234567,
  "page_views": 4567890,
  "bounce_rate": 42.13,
  "avg_duration_seconds": 187,
  "pages_per_visit": 3.7
}
```
