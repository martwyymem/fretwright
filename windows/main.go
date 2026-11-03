// SPDX-License-Identifier: GPL-3.0-or-later

//go:build windows

// Fretwright for Windows: a native window (Microsoft Edge WebView2) around the web app.
// The built web app is embedded in the .exe, unpacked once per version to
// %LOCALAPPDATA%\Fretwright\web\<hash>, and served from https://fretwright.example/ through
// WebView2's virtual host mapping, so the page has a stable origin and the autosave persists.
// Downloads, <input type=file> and confirm() use WebView2's built-in Windows dialogs.
package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

//go:embed all:web
var webFS embed.FS

// A reserved TLD (RFC 2606): never collides with a real site.
const host = "fretwright.example"

func main() {
	base := filepath.Join(os.Getenv("LOCALAPPDATA"), "Fretwright")
	webDir, err := unpackWeb(filepath.Join(base, "web"))
	if err != nil {
		fatal("Fretwright could not unpack its files.", err.Error())
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:  filepath.Join(base, "WebView2"),
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "Fretwright",
			Width:  1360,
			Height: 860,
			IconId: 1, // winres: RT_GROUP_ICON #1
			Center: true,
		},
	})
	if w == nil {
		fatal("Fretwright needs the Microsoft Edge WebView2 Runtime.",
			"It is part of Windows 11 and up-to-date Windows 10. Install it from "+
				"https://developer.microsoft.com/microsoft-edge/webview2/ and start Fretwright again.")
	}
	defer w.Destroy()
	w.SetSize(900, 600, webview2.HintMin)

	core := chromiumOf(w)
	if core == nil {
		fatal("Fretwright could not start its window.", "Unsupported WebView2 binding (internal error).")
	}
	wv3 := core.GetICoreWebView2_3()
	if wv3 == nil {
		fatal("Your Microsoft Edge WebView2 Runtime is too old.",
			"Update it from https://developer.microsoft.com/microsoft-edge/webview2/ and start Fretwright again.")
	}
	// The returned error comes from GetLastError and can be stale; a real failure shows up as a load error.
	_ = wv3.SetVirtualHostNameToFolderMapping(host, webDir, edge.COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW)

	if dir := os.Getenv("FRETWRIGHT_SELFTEST"); dir != "" {
		installSelfTest(w, dir)
	}
	w.Navigate("https://" + host + "/index.html")
	w.Run()
}

// chromiumOf reaches the *edge.Chromium inside go-webview2's window (needed for the virtual host
// mapping, which the high-level API doesn't expose). The module version is pinned in go.mod.
func chromiumOf(w webview2.WebView) *edge.Chromium {
	v := reflect.ValueOf(w)
	if v.Kind() != reflect.Pointer || v.Elem().Kind() != reflect.Struct {
		return nil
	}
	f := v.Elem().FieldByName("browser")
	if !f.IsValid() {
		return nil
	}
	b := reflect.NewAt(f.Type(), unsafe.Pointer(f.UnsafeAddr())).Elem().Interface()
	c, _ := b.(*edge.Chromium)
	return c
}

// unpackWeb writes the embedded web app to root/<content hash> (once) and removes older versions.
func unpackWeb(root string) (string, error) {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		return "", err
	}
	var files []string
	if err := fs.WalkDir(sub, ".", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			files = append(files, p)
		}
		return err
	}); err != nil {
		return "", err
	}
	sort.Strings(files)
	h := sha256.New()
	for _, p := range files {
		data, err := fs.ReadFile(sub, p)
		if err != nil {
			return "", err
		}
		fmt.Fprintf(h, "%s\x00%d\x00", p, len(data))
		h.Write(data)
	}
	id := hex.EncodeToString(h.Sum(nil))[:16]
	dest := filepath.Join(root, id)
	if _, err := os.Stat(filepath.Join(dest, ".complete")); err == nil {
		return dest, nil
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.MkdirTemp(root, "unpack-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp) // no-op after the rename below
	for _, p := range files {
		data, _ := fs.ReadFile(sub, p)
		out := filepath.Join(tmp, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
			return "", err
		}
		if err := os.WriteFile(out, data, 0o644); err != nil {
			return "", err
		}
	}
	if err := os.WriteFile(filepath.Join(tmp, ".complete"), []byte(id), 0o644); err != nil {
		return "", err
	}
	_ = os.RemoveAll(dest)
	if err := os.Rename(tmp, dest); err != nil {
		return "", err
	}
	// Best effort: drop other unpacked versions.
	if entries, err := os.ReadDir(root); err == nil {
		for _, e := range entries {
			if e.IsDir() && e.Name() != id && !strings.HasPrefix(e.Name(), "unpack-") {
				_ = os.RemoveAll(filepath.Join(root, e.Name()))
			}
		}
	}
	return dest, nil
}

func fatal(text, detail string) {
	title, _ := windows.UTF16PtrFromString("Fretwright")
	msg, _ := windows.UTF16PtrFromString(text + "\n\n" + detail)
	_, _ = windows.MessageBox(0, msg, title, windows.MB_OK|windows.MB_ICONERROR)
	os.Exit(1)
}

// installSelfTest (FRETWRIGHT_SELFTEST=<dir>): once the page has loaded, report its state to
// <dir>\selftest.json, click the SVG / DXF / PDF export buttons (files land in the Downloads
// folder), then quit.
func installSelfTest(w webview2.WebView, dir string) {
	_ = w.Bind("fretwrightSelfTestReport", func(report string) {
		_ = os.WriteFile(filepath.Join(dir, "selftest.json"), []byte(report), 0o644)
		w.Dispatch(w.Terminate)
	})
	w.Init(strings.TrimSpace(`
window.addEventListener('load', () => setTimeout(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const before = localStorage.getItem('fretwright-selftest');
  localStorage.setItem('fretwright-selftest', String(Date.now()));
  const report = {
    title: document.title,
    origin: location.origin,
    svgs: document.querySelectorAll('svg').length,
    buttons: document.querySelectorAll('button').length,
    text: document.body.innerText.slice(0, 300),
    previousRun: before,
    autosaveKeys: Object.keys(localStorage),
  };
  for (const name of ['SVG', 'DXF', 'PDF']) {
    for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === name) b.click();
    await sleep(1500);
  }
  await sleep(2000);
  window.fretwrightSelfTestReport(JSON.stringify(report));
}, 1500));
`))
}
