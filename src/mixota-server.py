import os
import http.server
import socketserver
import urllib.parse

PORT = 5055
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        query = ('?' + parsed.query) if parsed.query else ''

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

if __name__ == '__main__':
    print(f"Mixota server listening at http://localhost:{PORT}/")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nMixota server stopped.")
