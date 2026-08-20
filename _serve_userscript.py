# -*- coding: utf-8 -*-
"""Serve userscript with headers Violentmonkey can intercept."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

ROOT = r"C:\Users\A\Projects\zhihu-dark-grid"
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(".user.js"):
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Disposition", "inline")
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        with open(os.path.join(ROOT, "_http_access.log"), "a", encoding="utf-8") as f:
            f.write("%s - %s\n" % (self.address_string(), fmt % args))

if __name__ == "__main__":
    # Prefer 8766 to avoid conflict
    port = 8766
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    with open(os.path.join(ROOT, "_http_server.txt"), "w", encoding="utf-8") as f:
        f.write("serving on %s\n" % port)
    httpd.serve_forever()
