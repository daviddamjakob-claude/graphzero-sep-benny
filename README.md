# graphzero-sep

A static marketing site. No build step and no framework — plain HTML, CSS and
JS, served by GitHub Pages from `main` at the repository root.

Live: https://daviddamjakob-claude.github.io/graphzero-sep/

## Two versions

Both are live at once, and each is a full independent copy — its own `assets/`,
its own stylesheet and script. That duplication is deliberate: the two are an
A/B comparison, so a change to one must not be able to reach the other.

| Version | Files       | URL                                                     |
| ------- | ----------- | ------------------------------------------------------- |
| v1      | repo root   | https://daviddamjakob-claude.github.io/graphzero-sep/    |
| v2      | `v2/`       | https://daviddamjakob-claude.github.io/graphzero-sep/v2/ |

They differ in one section. `#capabilities` on the landing page is the original
`.cap` table in v1, and in v2 it is the Technical Capabilities block: an
isometric SVG layer stack, five capability rows, and an enterprise trust bar.
Everything else is the same in both.

A v3 is a copy of a whole version folder. Nothing else is needed — see the
first rule below for why that works.

## Pages

Three per version, and the nav is static markup repeated on each of them. There
is no router, so **adding a nav entry means editing all three pages of that
version**.

- `index.html` — Product. Opens on the animated lattice hero, then the context
  fold, the layer list, the comparison diagram, and capabilities.
- `work-with-us.html`
- `security.html`

## Conventions

1. **Every path is relative.** `assets/…`, never `/assets/…`. This is the only
   reason `v2/` runs unchanged from a subpath; a single root-absolute reference
   breaks it. The same goes for links between pages.

2. **Bump `?v=N` when you touch a version's `site.css` or `site.js`**, on all
   three of that version's pages, in the same commit. Pages serves with
   `max-age=600`, so without it a browser can run ten-minute-old CSS against
   new markup. HTML-only edits need no bump.

3. **Tokens, not literals** — spacing (`--space-*`, `--section-*`), radii
   (`--radius-*`), type (`--fs-*`), colour (`--ink`, `--ink-muted`,
   `--hairline`, `--surface-2`). They live in `assets/design-system/tokens/`.

4. **The brand blue is `var(--hl)`.** This page layer sets `--accent: #000000`
   — the site's accent is black, and blue is a separate token: `#0000ff`, which
   becomes `#4d9a9e` under the alternate brand identity `site.js` can switch
   on. A hardcoded `#0000ff` will not follow that switch.

5. **No box-shadow** except an inset hairline ring, and one heading weight
   (500) — hierarchy is size and space. Both are the design system's own rules.
   The single exception in the tree is the shadow on the v2 stack's lid, where
   the shadow is the drawing rather than chrome.

6. Reach for an existing component before writing CSS: `.chip-outline`,
   `.chip-row`, `.card`, `.kv`, `.numlist`, `.secsplit`, `.markrow`,
   `.band--dark`, `.sec` / `.sec-head`. When a component needs to behave
   differently in one place, scope the override tightly rather than changing the
   component — several pages share these.

## Deploying

Push to `main`. It is live in about a minute. To wait for the build before
checking:

```sh
until [ "$(gh api repos/daviddamjakob-claude/graphzero-sep/pages/builds/latest --jq .status)" = built ]; do sleep 10; done
```

If a page looks stale straight after a deploy, it is the ten-minute HTML cache,
not a bad build — hard-reload it.

## Local preview

Relative paths need a server; opening the file directly will not do.

```sh
python3 -m http.server 8000        # then http://localhost:8000/ and /v2/
```

## Known quirks

Deliberate or inherited. Worth a decision rather than a silent fix.

- `work-with-us.html` has no `<h1>` — it opens on an `h2`. Inherited from the
  site this was replicated from.
- `.cap` / `.cap-list` CSS is dead in v2, where nothing uses it. Left in place
  so v2 stays diffable against v1.
- The design-system tokens name Inter Tight, but `assets/site.css` overrides
  `--font-sans` to Geist. Geist is what renders.
- `assets/hero-lattice.js` is fetched on demand by `site.js`, only on a page
  with a lattice stage, and skipped entirely under `prefers-reduced-motion`. It
  reports failure rather than leaving a dead canvas when WebGL2 is missing.

## Design reference

Parts of this site were ported from https://ascending-lp.vercel.app/9 — along
with its `/9/security` and `/9/toolbox` sub-pages — which is still live. Its
source is not in any GitHub repository, so mirror it from the live site if you
need it locally.
