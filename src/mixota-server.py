import os
import http.server
import socketserver
import urllib.parse
import mimetypes

PORT = 5055
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

mimetypes.init()
mimetypes.add_type('application/wasm', '.wasm')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map['.wasm'] = 'application/wasm'
    extensions_map['.js'] = 'application/javascript'
    extensions_map['.json'] = 'application/json'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        query = ('?' + parsed.query) if parsed.query else ''

        # Route /editor and /multitrack to /index.html (the editor)
        if path.rstrip('/') in ('/editor', '/multitrack'):
            self.path = '/index.html' + query
            return super().do_GET()

        if path in ('/index.html', '/index'):
            self.send_response(301)
            self.send_header('Location', '/' + query)
            self.end_headers()
            return

        if path in ('/home', '/home.html'):
            self.send_response(301)
            self.send_header('Location', '/about' + query)
            self.end_headers()
            return

        if path.endswith('.html'):
            clean_target = path[:-5]
            if not clean_target:
                clean_target = '/'
            self.send_response(301)
            self.send_header('Location', clean_target + query)
            self.end_headers()
            return

        clean_name = path.lstrip('/')
        if clean_name:
            candidate = os.path.join(DIRECTORY, clean_name + '.html')
            if os.path.isfile(candidate):
                self.path = '/' + clean_name + '.html' + query

        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

if __name__ == '__main__':
    print(f"Mixota server listening at http://localhost:{PORT}/")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nMixota server stopped.")
