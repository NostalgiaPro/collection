"""Shared bits for the scripts that draw a picture with the site's own canvas
code: serve the repo on a throwaway local port and drive headless Chromium
(Playwright). Nothing here touches the live site.

    pip install playwright && python3 -m playwright install chromium
"""
import contextlib, functools, http.server, os, socketserver, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@contextlib.contextmanager
def serve():
    """Serve the repo root on 127.0.0.1:<free port>; yields the base URL."""
    handler = functools.partial(_Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as httpd:
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        try:
            yield f"http://127.0.0.1:{httpd.server_address[1]}"
        finally:
            httpd.shutdown()


@contextlib.contextmanager
def page():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit("Needs Playwright: pip install playwright && python3 -m playwright install chromium")
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1300, "height": 900})
        # no CRT intro, no service worker in the way
        ctx.add_init_script("try{localStorage.setItem('np-intro-seen','1')}catch(e){}")
        pg = ctx.new_page()
        try:
            yield pg
        finally:
            b.close()


def save_data_url(data_url, out):
    import base64
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(data_url.split(",", 1)[1]))
    return out
