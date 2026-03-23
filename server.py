import http.server
import os

class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle clean URLs: /about -> /about.html
        path = self.path.split('?')[0].split('#')[0]
        if path == '/':
            self.path = '/home.html'
        elif not os.path.splitext(path)[1] and not os.path.isdir(path.lstrip('/')):
            html_path = path + '.html'
            if os.path.isfile(html_path.lstrip('/')):
                self.path = html_path
        return super().do_GET()

if __name__ == '__main__':
    server = http.server.HTTPServer(('', 8000), CleanURLHandler)
    print('Server running at http://localhost:8000')
    server.serve_forever()
