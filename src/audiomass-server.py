# Backwards compatibility alias for mixota-server.py
# Recommended: run `python mixota-server.py` or `python server.py`
import os
import http.server
import socketserver

PORT = 5055
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

print(f"Mixota server listening at http://localhost:{PORT}/")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
