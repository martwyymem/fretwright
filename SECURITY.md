# Security policy

## Supported versions

Security fixes go into the latest release and the `main` branch. Older releases are not updated; please
upgrade to the latest one from the [Releases](https://github.com/martwyymem/fretwright/releases) page.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/martwyymem/fretwright/security/advisories/new).
Only the maintainer can see the report.

Include what's affected (web app, or the macOS, Windows or Linux app, and the version), the steps or a file that
reproduces it, and what an attacker could do with it.

You can expect an acknowledgement within 7 days. Once the problem is confirmed, a fix and a release follow as
soon as practical, and you'll be credited in the advisory unless you'd rather not be.

## Scope

Fretwright runs entirely on your computer and makes no network requests. Relevant reports include, for example:

- A crafted project file (`.fretwright.json`) or imported SVG outline that runs script, reads local files or crashes the app.
- The desktop apps loading content from outside the bundled app or opening untrusted URLs in the app window.
- Problems in how the release builds are produced (the CI workflow).

Wrong dimensions on a template are bugs, not vulnerabilities; please report them as a
[bug report](https://github.com/martwyymem/fretwright/issues/new/choose).
