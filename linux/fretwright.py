#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fretwright for Linux: a GTK 4 / libadwaita window (WebKitGTK 6) around the web app.

The built web app is served from a private ``fretwright://app/`` scheme, so the page has a stable
origin and the autosave persists. Exports are saved to the Downloads folder (with a toast that can
show the file); <input type=file> uses the desktop's file chooser (a portal under Flatpak).
Nothing is fetched from the network.
"""

import os
import sys

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
gi.require_version("WebKit", "6.0")
from gi.repository import Adw, Gio, GLib, Gtk, WebKit  # noqa: E402

APP_ID = "io.github.martwyymem.Fretwright"
SCHEME = "fretwright"
START_URI = f"{SCHEME}://app/index.html"
SELFTEST = os.environ.get("FRETWRIGHT_SELFTEST")

MIME = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".txt": "text/plain",
}


def find_web_root() -> str:
    here = os.path.dirname(os.path.realpath(__file__))
    candidates = [
        os.environ.get("FRETWRIGHT_WEB", ""),
        "/app/share/fretwright/web",  # Flatpak
        os.path.join(here, "..", "share", "fretwright", "web"),  # /usr/local style install
        os.path.join(here, "..", "dist"),  # running from a source checkout
    ]
    for c in candidates:
        if c and os.path.isfile(os.path.join(c, "index.html")):
            return os.path.realpath(c)
    sys.exit("Fretwright: the web app files are missing (looked in: %s)" % ", ".join(c for c in candidates if c))


WEB_ROOT = find_web_root()


def serve(request: WebKit.URISchemeRequest) -> None:
    path = request.get_path() or "/"
    if path == "/":
        path = "/index.html"
    full = os.path.realpath(os.path.join(WEB_ROOT, path.lstrip("/")))
    # Never serve anything outside the web folder.
    if not full.startswith(WEB_ROOT + os.sep) or not os.path.isfile(full):
        request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(), f"Not found: {path}", Gio.IOErrorEnum.NOT_FOUND))
        return
    with open(full, "rb") as f:
        data = f.read()
    mime = MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream")
    request.finish(Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data)), len(data), mime)


def downloads_dir() -> str:
    if SELFTEST:
        return SELFTEST
    d = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or os.path.join(GLib.get_home_dir(), "Downloads")
    os.makedirs(d, exist_ok=True)
    return d


def unique_path(folder: str, name: str) -> str:
    name = os.path.basename(name) or "download"
    stem, ext = os.path.splitext(name)
    path, n = os.path.join(folder, name), 2
    while os.path.exists(path):
        path, n = os.path.join(folder, f"{stem} ({n}){ext}"), n + 1
    return path


class Window(Adw.ApplicationWindow):
    def __init__(self, app: Adw.Application):
        super().__init__(application=app, title="Fretwright", default_width=1360, default_height=860)
        self.set_size_request(900, 600)
        self.loaded_once = False

        self.view = WebKit.WebView()
        self.view.set_vexpand(True)
        settings = self.view.get_settings()
        settings.set_enable_developer_extras(bool(os.environ.get("FRETWRIGHT_DEBUG")))
        settings.set_javascript_can_open_windows_automatically(False)
        self.view.connect("decide-policy", self.on_decide_policy)
        self.view.connect("load-changed", self.on_load_changed)
        self.view.connect("web-process-terminated", lambda v, _r: v.reload())
        self.view.get_network_session().connect("download-started", self.on_download_started)

        toolbar = Adw.ToolbarView()
        toolbar.add_top_bar(Adw.HeaderBar())
        toolbar.set_content(self.view)
        self.toasts = Adw.ToastOverlay()
        self.toasts.set_child(toolbar)
        self.set_content(self.toasts)
        self.view.load_uri(START_URI)

    # Stay on our scheme; real links open in the default browser.
    def on_decide_policy(self, _view, decision, kind) -> bool:
        if kind in (WebKit.PolicyDecisionType.NAVIGATION_ACTION, WebKit.PolicyDecisionType.NEW_WINDOW_ACTION):
            uri = decision.get_navigation_action().get_request().get_uri()
            scheme = GLib.Uri.peek_scheme(uri) or ""
            if scheme in (SCHEME, "blob", "data", "about") and kind == WebKit.PolicyDecisionType.NAVIGATION_ACTION:
                return False
            if scheme in ("http", "https", "mailto"):
                Gtk.UriLauncher.new(uri).launch(self, None, None, None)
            decision.ignore()
            return True
        if kind == WebKit.PolicyDecisionType.RESPONSE and not decision.is_mime_type_supported():
            decision.download()
            return True
        return False

    # Downloads (SVG / PDF / DXF / project files) → Downloads folder + toast.
    def on_download_started(self, _session, download: WebKit.Download) -> None:
        download.connect("decide-destination", self.on_decide_destination)
        download.connect("finished", self.on_download_finished)
        download.connect("failed", self.on_download_failed)

    def on_decide_destination(self, download: WebKit.Download, suggested: str) -> bool:
        download.set_destination(unique_path(downloads_dir(), suggested))
        return True

    def on_download_finished(self, download: WebKit.Download) -> None:
        path = download.get_destination()
        if not path or getattr(download, "_failed", False):
            return
        toast = Adw.Toast.new(f"Saved {os.path.basename(path)} to {os.path.basename(os.path.dirname(path))}")
        toast.set_button_label("Show")
        toast.connect("button-clicked", lambda _t: Gtk.FileLauncher.new(Gio.File.new_for_path(path)).open_containing_folder(self, None, None, None))
        toast.set_timeout(6)
        self.toasts.add_toast(toast)

    def on_download_failed(self, download: WebKit.Download, error: GLib.Error) -> None:
        download._failed = True
        if error.matches(WebKit.download_error_quark(), WebKit.DownloadError.CANCELLED_BY_USER):
            return
        self.toasts.add_toast(Adw.Toast.new(f"The file could not be saved: {error.message}"))

    def on_load_changed(self, _view, event) -> None:
        if event == WebKit.LoadEvent.FINISHED and not self.loaded_once:
            self.loaded_once = True
            if SELFTEST:
                GLib.timeout_add(1500, self.run_selftest)

    # FRETWRIGHT_SELFTEST=<dir>: report page state, snapshot, click the exports (saved into <dir>), quit.
    def run_selftest(self) -> bool:
        js = """
          (() => {
            const before = localStorage.getItem('fretwright-selftest');
            localStorage.setItem('fretwright-selftest', String(Date.now()));
            return JSON.stringify({
              title: document.title,
              origin: location.origin,
              svgs: document.querySelectorAll('svg').length,
              buttons: document.querySelectorAll('button').length,
              text: document.body.innerText.slice(0, 300),
              previousRun: before,
              autosaveKeys: Object.keys(localStorage),
            });
          })()
        """

        def got_report(view, result):
            try:
                report = view.evaluate_javascript_finish(result).to_string()
            except GLib.Error as e:
                report = f'{{"error": {e.message!r}}}'
            with open(os.path.join(SELFTEST, "selftest.json"), "w") as f:
                f.write(report)
            view.get_snapshot(WebKit.SnapshotRegion.VISIBLE, WebKit.SnapshotOptions.NONE, None, got_snapshot)

        def got_snapshot(view, result):
            try:
                view.get_snapshot_finish(result).save_to_png(os.path.join(SELFTEST, "selftest.png"))
            except GLib.Error as e:
                print("snapshot failed:", e.message, file=sys.stderr)
            for i, name in enumerate(["SVG", "DXF", "PDF"]):
                click = f"for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === '{name}') b.click();"
                GLib.timeout_add(1000 * i + 1, self.eval_once, click)
            GLib.timeout_add(7000, lambda: self.get_application().quit())

        self.view.evaluate_javascript(js, -1, None, None, None, got_report)
        return False

    def eval_once(self, js: str) -> bool:
        self.view.evaluate_javascript(js, -1, None, None, None, None)
        return False


class App(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        GLib.set_application_name("Fretwright")
        self.zoom = 1.0

    def do_startup(self):
        Adw.Application.do_startup(self)
        Gtk.Window.set_default_icon_name(APP_ID)
        ctx = WebKit.WebContext.get_default()
        ctx.register_uri_scheme(SCHEME, serve)
        security = ctx.get_security_manager()
        security.register_uri_scheme_as_secure(SCHEME)
        security.register_uri_scheme_as_cors_enabled(SCHEME)
        for name, accels, fn in [
            ("quit", ["<Control>q"], lambda *_: self.quit()),
            ("close", ["<Control>w"], lambda *_: self.get_active_window() and self.get_active_window().close()),
            ("zoom-in", ["<Control>plus", "<Control>equal"], lambda *_: self.set_zoom(self.zoom + 0.1)),
            ("zoom-out", ["<Control>minus"], lambda *_: self.set_zoom(self.zoom - 0.1)),
            ("zoom-reset", ["<Control>0"], lambda *_: self.set_zoom(1.0)),
        ]:
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", fn)
            self.add_action(action)
            self.set_accels_for_action(f"app.{name}", accels)

    def set_zoom(self, z: float) -> None:
        self.zoom = min(2.0, max(0.6, round(z, 2)))
        win = self.get_active_window()
        if isinstance(win, Window):
            win.view.set_zoom_level(self.zoom)

    def do_activate(self):
        win = self.get_active_window() or Window(self)
        win.present()


if __name__ == "__main__":
    sys.exit(App().run(sys.argv))
