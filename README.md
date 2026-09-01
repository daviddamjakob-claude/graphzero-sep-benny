# graphzero 2

A static site, no build step. GitHub Pages serves `main` from the repository root.

Two pages:

- `index.html` — the main page: the Knowledge Base 3 fold, then the Knowledge Base B
  content from "Companies that make the right architectural choices…" down.
- `work-with-us.html` — the reference landing page from "Empowering organizations…" down.

`?v=N` on `assets/site.css` and `assets/site.js` is cache-busting. Pages serves
everything with `max-age=600`, so a browser can otherwise pick up new markup while
still running ten-minute-old CSS. Bump it on every page in the same commit as an
edit to either file.
