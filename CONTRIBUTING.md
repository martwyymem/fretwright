# Contributing to Fretwright

Thanks for helping. Bug reports, measurements that don't match a real instrument, new presets, templates and
desktop fixes are all welcome.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

Open an [issue](https://github.com/martwyymem/fretwright/issues/new/choose) and pick **Bug report**. The most
useful reports include:

- What you did, what you expected and what happened.
- Where you ran it: browser, or the macOS, Windows or Linux app, and its version.
- The project file (the `.fretwright.json` from **Save**) or the preset and the fields you changed, so the design can be reproduced.
- For wrong dimensions: the value Fretwright shows, the value you expected and where it comes from (a spec sheet,
  a measured instrument, a formula).

Security problems go through the private form in [SECURITY.md](SECURITY.md), not public issues.

## Setting up

You need Node.js 22.12 or later (CI uses 24).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run typecheck
npm run build      # static site in dist/
```

The desktop apps are optional; see [Desktop builds](README.md#desktop-builds) for what each one needs.

## Making a change

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Fork, create a branch from `main` and keep the change focused on one thing.
3. Follow the conventions in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:
   - Lengths are millimetres and angles are degrees everywhere; inches exist only in the UI.
   - `src/core/` is pure TypeScript (no DOM, no React). `src/ui/` imports only from `src/core/index.ts` and
     `src/export/index.ts`.
   - Validation messages say what is wrong and what to change.
   - A schema change bumps `SPEC_VERSION` and adds a migration (optional additive fields don't need one).
4. **Test geometry with numbers, not by eye.** Every template and geometry change needs assertions on the
   geometry (golden values, symmetry, bounds). Include the source of any reference value in a comment.
5. Run `npm test`, `npm run typecheck` and `npm run build` before opening the pull request. CI also builds and
   self-tests the macOS, Windows and Linux apps.
6. Write commit messages in the imperative ("Add a 7-string preset"), with a short explanation in the body when
   the reason isn't obvious.

## Body and headstock shapes

Only add outlines you drew yourself or that are clearly free to use. Don't trace or copy trademarked body or
headstock shapes from guitar makers.

## License

Fretwright is GPL-3.0-or-later. By contributing you agree that your contribution is licensed under the same
terms. Code adapted from other projects must have a GPL-compatible license, and the source should be credited
in a comment.
