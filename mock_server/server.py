"""Standalone mock traffic-data server. Stdlib only, no dependencies.

Run with: python3 mock_server/server.py
Then GET http://localhost:5001/traffic/<website>
"""

import json
import random
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 5001
TRAFFIC_PATH_RE = re.compile(r"^/traffic/(?P<website>.+)$")


def build_traffic_data(website):
	random.seed(website)

	monthly_visits = random.randint(10_000, 5_000_000)
	pages_per_visit = round(random.uniform(1.5, 6.0), 2)
	page_views = int(monthly_visits * pages_per_visit)
	bounce_rate = round(random.uniform(25.0, 75.0), 2)
	avg_duration_seconds = random.randint(30, 600)

	return {
		"monthly_visits": monthly_visits,
		"page_views": page_views,
		"bounce_rate": bounce_rate,
		"avg_duration_seconds": avg_duration_seconds,
		"pages_per_visit": pages_per_visit,
	}


class MockTrafficHandler(BaseHTTPRequestHandler):
	def do_GET(self):
		match = TRAFFIC_PATH_RE.match(self.path)
		if not match:
			self.send_error(404, "Not Found")
			return

		website = match.group("website")
		data = build_traffic_data(website)
		body = json.dumps(data).encode("utf-8")

		self.send_response(200)
		self.send_header("Content-Type", "application/json")
		self.send_header("Content-Length", str(len(body)))
		self.end_headers()
		self.wfile.write(body)

	def log_message(self, format, *args):
		pass


def main():
	server = HTTPServer(("localhost", PORT), MockTrafficHandler)
	print(f"Mock traffic server listening on http://localhost:{PORT}")
	print("Example: GET /traffic/example.com")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		pass
	finally:
		server.server_close()


if __name__ == "__main__":
	main()
