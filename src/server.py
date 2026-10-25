import os
import http.server
import urllib.parse

PORT = 5055
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
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

        # 1. Permanent redirect for /index.html and /index to /
        if path in ('/index.html', '/index'):
            self.send_response(301)
            self.send_header('Location', '/' + query)
            self.end_headers()
            return

        # 2. Permanent redirect for /home or /home.html to /about
        if path in ('/home', '/home.html'):
            self.send_response(301)
            self.send_header('Location', '/about' + query)
            self.end_headers()
            return

        # 3. Permanent redirect for any *.html to its clean URL
        if path.endswith('.html'):
            clean_target = path[:-5]
            if not clean_target:
                clean_target = '/'
            self.send_response(301)
            self.send_header('Location', clean_target + query)
            self.end_headers()
            return

        # 4. Internal rewrite: if <clean_path>.html exists on disk, serve it
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
    print(f"Mixota audio editor running at http://localhost:{PORT}/")
    with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
