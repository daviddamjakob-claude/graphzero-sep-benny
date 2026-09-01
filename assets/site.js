/* Knowledge Base selector (section 03).

   A numbered list on the left drives a detail panel on the right. It advances
   on its own every 6s, and the rule under the active row is the progress bar —
   it fills over that interval, so the change is signalled before it happens
   rather than surprising the reader. Click or arrow keys select directly and
   restart the interval.

   Hovering the list pauses it: the panel changing mid-sentence while someone is
   reading is the main failure mode of an auto-advancing control. That pause only
   lasts as long as the pointer is there, so the marker square on the active row
   is also a latch — click it and the list stays stopped after you move away.
   Filled means running, hollow means stopped.

   Under prefers-reduced-motion it does not advance or animate at all — the bar
   is drawn full width as a plain underline and selection is click-only.

   Rendered from a data array rather than markup so the list and the panel
   cannot drift apart. */
(function () {
  'use strict';

  var DURATION = 6000;
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ITEMS = [
    {
      title: 'Centralizes knowledge, with continuous sync',
      tags: ['Incremental sync', 'Change detection', 'Deletion propagation', 'Permission refresh', 'Entity resolution'],
      body: 'Scheduled and incremental sync across AFAS, Exact, DATEV, Personio, SharePoint, Drive, Slack and your file shares, with change detection, deletion propagation and permission refresh on every pass. Entities and typed edges are extracted as content lands and resolved into canonical nodes, so one customer is one node across all of them. The unit is the entity, not the chunk. No manual uploads, no stale context, no migration project.'
    },
    {
      title: 'Finds the complete answer, with proof',
      tags: ['Exhaustive scan', 'Multi-hop reasoning', 'Temporality', 'Provenance', 'Coverage reporting'],
      body: 'A subscription assistant fires one query and cannot tell you what it missed, because it has nothing to enumerate. This layer knows the boundary of its own corpus, so it can walk all of it, carry a complex question across multiple hops, and report what it has covered. Older versions are retained rather than overwritten, so an answer can be asked for as of any date. Every claim comes back pinned to the passage it came from.'
    },
    {
      title: 'Gives access to answers AND sources',
      tags: ['Ranked source set', 'Direct document access', 'Passage-level citations', 'Wiki pages', 'Editable in place'],
      body: 'Answers arrive with the ranked source set behind them and direct access to the documents themselves, which almost nothing on the market returns. What the system derives on top, the summaries, connections and conclusions, is written to a wiki: one page per customer, product, process or policy, every claim linked back to its source. Humans can browse it, search it, and even correct it in place. No embeddings-only store, no query language, no black box.'
    },
    {
      title: 'Maintains and optimizes knowledge',
      tags: ['Gap & contradiction detection', 'Graph inference', 'Draft & human approval', 'Write-back to your files', 'Org-level learning'],
      body: 'Continuous detection of gaps, contradictions and stale pages, each queued with the missing piece already drafted; a person approves, and it lands in the knowledge base and, where you want it, in your own canonical files. It learns from everyday communication too, deriving new knowledge across the graph rather than only retrieving what a vector store already holds. Those learnings are written to the organisation’s knowledge, never to a private per-user memory. Claude, ChatGPT and Copilot learn into a store no colleague can read; this one warms up for whoever asks next.'
    },
    {
      title: 'Makes no compromises to security & control',
      tags: ['Fact-level permissions', 'Permission propagation', 'Sensitivity tagging', 'Source-side rerouting', 'Retrieval logging', 'Full export'],
      body: 'Fact-level access control that propagates into everything derived from it: a summary carries the combined permissions of its sources, and revoking one document withdraws access to every answer built on it since. Sensitivity is tagged and rerouted at the source, so confidential content never reaches a model that should not see it. Your knowledge stays yours, with full export in open formats at any time. No lock-in, no vendor-held copy, no export project.'
    }
  ];

  var list = document.getElementById('kb-list');
  var detail = document.getElementById('kb-detail');
  var text = document.getElementById('kb-text');
  if (!list || !detail || !text) return;

  var active = 0;
  var buttons = [];
  var progress = null;

  /* Three independent reasons to hold the timer. Latched is the only one the
     reader sets deliberately, so it is the only one the square reports. */
  var latched = false;
  var hovering = false;
  var focused = false;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function pad(i) { return ('0' + (i + 1)).slice(-2); }

  /* A row is a div rather than a button so the square inside it can be a real
     button — a control nested in a control is not valid markup. The tab role and
     its keyboard contract are reproduced below. */
  ITEMS.forEach(function (item, i) {
    var row = el('div', 'kb-item');
    row.id = 'kb-tab-' + i;
    row.setAttribute('role', 'tab');
    row.tabIndex = -1;
    row.appendChild(el('span', 'kb-item__num', pad(i)));
    row.appendChild(el('span', 'kb-item__title', item.title));

    var mark = el('button', 'kb-item__mark');
    mark.type = 'button';
    mark.tabIndex = -1;
    mark.setAttribute('aria-hidden', 'true');
    mark.addEventListener('click', function (e) {
      /* Without this the click reaches the row and restarts what it just stopped. */
      e.stopPropagation();
      setLatched(!latched);
    });
    row.appendChild(mark);
    row.appendChild(el('span', 'kb-item__bar'));

    row.addEventListener('click', function () { select(i, false); });
    row.addEventListener('keydown', onKeydown);

    buttons.push(row);
    list.appendChild(row);
  });

  detail.setAttribute('role', 'tabpanel');

  /* Reading should not be interrupted by the thing you are reading about. */
  list.addEventListener('mouseenter', function () { hovering = true; sync(); });
  list.addEventListener('mouseleave', function () { hovering = false; sync(); });
  list.addEventListener('focusin', function () { focused = true; sync(); });
  list.addEventListener('focusout', function () { focused = false; sync(); });

  /* The square is decorative to assistive tech — the latch it sets is announced
     on the list itself, where a screen reader is already told the list advances. */
  function setLatched(next) {
    latched = next;
    list.setAttribute('data-paused', latched ? 'true' : 'false');
    list.setAttribute('aria-label',
      'Knowledge base capabilities' + (latched ? ', auto-advance paused' : ''));
    buttons.forEach(function (row) {
      row.querySelector('.kb-item__mark').title = latched ? 'Resume' : 'Pause';
    });
    sync();
  }

  function sync() {
    if (!progress) return;
    if (latched || hovering || focused) progress.pause();
    else progress.play();
  }

  function runProgress(row) {
    if (progress) { progress.onfinish = null; progress.cancel(); progress = null; }
    var bar = row.querySelector('.kb-item__bar');
    if (!bar || REDUCED) return;
    progress = bar.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: DURATION, easing: 'linear', fill: 'forwards' }
    );
    progress.onfinish = function () { select((active + 1) % ITEMS.length, false); };
    /* A fresh animation starts playing — hand it straight back to the held state. */
    sync();
  }

  function onKeydown(e) {
    /* A div does not activate itself the way the button it replaced did. */
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      select(buttons.indexOf(e.currentTarget), false);
      return;
    }
    var delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
              : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
              : 0;
    if (!delta) return;
    e.preventDefault();
    select((active + delta + ITEMS.length) % ITEMS.length, true);
  }

  function select(i, moveFocus) {
    active = i;
    var item = ITEMS[i];

    buttons.forEach(function (b, n) {
      var on = n === i;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    if (moveFocus) buttons[i].focus();
    runProgress(buttons[i]);

    detail.setAttribute('aria-labelledby', 'kb-tab-' + i);
    text.textContent = '';
    /* The reference repeats the title in the eyebrow, but its titles are one
       word. These are sentences, so the eyebrow carries the position only. */
    text.appendChild(el('span', 'eyebrow', pad(i) + ' / ' + pad(ITEMS.length - 1)));
    text.appendChild(el('h3', 'h3-fixed', item.title));

    var tags = el('div', 'chip-row kb-tags');
    item.tags.forEach(function (t) { tags.appendChild(el('span', 'chip-outline', t)); });
    text.appendChild(tags);

    text.appendChild(el('p', 'body', item.body));
  }

  setLatched(false);
  select(0, false);
})();

/* Closing line of the Knowledge Base section — the last word cycles through the
   clients the layer plugs into, so the claim reads as a list without being one.

   The name leaves upward and the next arrives from below, which reads as one
   list moving rather than two unrelated words. Under prefers-reduced-motion it
   crossfades in place instead: the names still get shown, but nothing travels.

   The line sits at the end of the section, so a longer name would push the page
   under it. The tallest variant's height is measured once and held. */
(function () {
  'use strict';

  var HOLD = 2000;
  var OUT = 260;
  var IN = 320;
  var EASE = 'cubic-bezier(.2,.6,.2,1)';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var WORDS = ['Claude', 'Copilot', 'ChatGPT', 'Langdock', 'white-label UI by Ascending'];
  /* The full stop travels with the name rather than sitting outside the animated
     span. Left outside it would stay lit while the name is faded out, and jump
     sideways on its own as the next name changes the width. */
  var STOP = '.';

  var slot = document.getElementById('kb-rot');
  var word = slot && slot.querySelector('.rot__word');
  var line = slot && slot.closest('.kb-close__with');
  if (!word) return;

  var i = 0;
  var timer = null;
  var anim = null;

  function reserve() {
    if (!line) return;
    var keep = word.textContent;
    line.style.minHeight = '';
    var tallest = 0;
    WORDS.forEach(function (w) {
      word.textContent = w + STOP;
      tallest = Math.max(tallest, line.getBoundingClientRect().height);
    });
    word.textContent = keep;
    line.style.minHeight = Math.ceil(tallest) + 'px';
  }

  /* Cancelling the previous animation first keeps one filled animation on the
     element rather than a new one every couple of seconds for as long as the
     page is open. Both end states match the element's base style, so the drop is
     invisible — and it means a stalled animation can only ever revert to a
     visible word, never strand an invisible one. */
  function play(frames, duration) {
    if (anim) anim.cancel();
    anim = word.animate(frames, { duration: duration, easing: EASE, fill: 'forwards' });
  }

  /* Timers drive the swap, not the animation's finish event. A browser that is
     not rendering — a background tab — never dispatches that event, and hanging
     the sequence off it leaves the word faded out and never brought back. */
  function step() {
    var next = (i + 1) % WORDS.length;
    var out = REDUCED ? [{ opacity: 1 }, { opacity: 0 }]
                      : [{ transform: 'translateY(0)', opacity: 1 },
                         { transform: 'translateY(-0.55em)', opacity: 0 }];
    var into = REDUCED ? [{ opacity: 0 }, { opacity: 1 }]
                       : [{ transform: 'translateY(0.55em)', opacity: 0 },
                          { transform: 'translateY(0)', opacity: 1 }];

    play(out, OUT);
    setTimeout(function () {
      word.textContent = WORDS[next] + STOP;
      i = next;
      play(into, IN);
      queue();
    }, OUT);
  }

  function queue() {
    clearTimeout(timer);
    timer = setTimeout(step, HOLD);
  }

  /* Coming back to a backgrounded tab, a half-run fade is stale and its timer
     was throttled. Drop it and restart cleanly — cancelling can only ever leave
     the word at its base style, which is visible. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (anim) { anim.cancel(); anim = null; }
    queue();
  });

  /* Measure once the real face is in, or the reserved height is Arial's. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserve);
  else reserve();
  addEventListener('resize', reserve);

  queue();
})();

/* Header nav.

   Solutions opens on hover where there is a pointer and on click everywhere, so
   it works the same whether it is a menu bar or a panel. The scroll spy marks
   whichever section is currently under the header, which is what makes the
   Solutions group light up for both of the sections behind it. */
(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var nav = document.getElementById('site-nav');
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.querySelector('.nav-menu');
  if (!header || !nav) return;

  var trigger = menu && menu.querySelector('.nav-menu__trigger');
  var COMPACT = '(max-width: 900px)';

  function openMenu(open) {
    if (!menu || !trigger) return;
    menu.setAttribute('data-open', open ? 'true' : 'false');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openNav(open) {
    header.setAttribute('data-nav-open', open ? 'true' : 'false');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) openMenu(false);
  }

  openMenu(false);
  openNav(false);

  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = header.getAttribute('data-nav-open') !== 'true';
      openNav(next);
      /* The group starts open on a phone. The sheet is the whole screen and has
         room for it, and it saves a tap to reach the one live entry in there.
         Guarded on width so the floating dropdown does not open by itself. */
      if (next && matchMedia(COMPACT).matches) openMenu(true);
    });
  }

  if (menu && trigger) {
    trigger.addEventListener('click', function () {
      openMenu(menu.getAttribute('data-open') !== 'true');
    });
    /* Hover is an accelerator on top of the click, never the only way in. */
    menu.addEventListener('mouseenter', function () {
      if (!matchMedia(COMPACT).matches) openMenu(true);
    });
    menu.addEventListener('mouseleave', function () {
      if (!matchMedia(COMPACT).matches) openMenu(false);
    });
    menu.addEventListener('focusout', function (e) {
      if (!matchMedia(COMPACT).matches && !menu.contains(e.relatedTarget)) openMenu(false);
    });
  }

  document.addEventListener('click', function (e) {
    /* The menu button is excluded: it opens the group itself on a phone, and
       this handler runs after it as the click bubbles, so without the guard it
       shut the group again on the way up. */
    var onToggle = toggle && toggle.contains(e.target);
    if (menu && !menu.contains(e.target) && !onToggle) openMenu(false);
    if (!header.contains(e.target)) openNav(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menu && menu.getAttribute('data-open') === 'true') {
      openMenu(false);
      if (trigger) trigger.focus();
      return;
    }
    if (header.getAttribute('data-nav-open') === 'true') {
      openNav(false);
      if (toggle) toggle.focus();
    }
  });

  /* Following a link closes the panel, otherwise it covers what you jumped to. */
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) { openNav(false); openMenu(false); }
  });

  /* Scroll spy. Rather than "most visible", this asks which section the header
     is currently sitting in — the one the reader is actually looking at. */
  var links = [].slice.call(nav.querySelectorAll('a[href^="#"]'));
  var targets = links
    .map(function (a) {
      return { link: a, section: document.getElementById(a.getAttribute('href').slice(1)) };
    })
    .filter(function (t) { return t.section; });
  if (!targets.length) return;

  var ticking = false;

  function markCurrent() {
    ticking = false;
    var current = null;
    targets.forEach(function (t) {
      /* Measure against the section's own scroll-margin, which is the offset the
         anchor jump uses. Anything else marks the previous section on landing. */
      var top = t.section.getBoundingClientRect().top + window.scrollY;
      var margin = parseFloat(getComputedStyle(t.section).scrollMarginTop) || header.offsetHeight;
      if (top - margin <= window.scrollY + 1) current = t;
    });
    /* Past the last section the page is in the footer; keep the last mark. */
    targets.forEach(function (t) {
      if (t === current) t.link.setAttribute('aria-current', 'true');
      else t.link.removeAttribute('aria-current');
    });
    if (menu) {
      var inside = current && menu.contains(current.link);
      menu.setAttribute('data-current', inside ? 'true' : 'false');
    }
  }

  addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(markCurrent);
  }, { passive: true });
  addEventListener('resize', markCurrent);
  markCurrent();
})();

/* Inline popovers holding an address, with a button that copies it.

   The address is not a mailto: the point is to hand it over, not to launch
   whatever the machine has registered as a mail client. Copy needs a secure
   context, so where the clipboard is unavailable the button says so rather
   than silently doing nothing. */
(function () {
  'use strict';

  var pops = [].slice.call(document.querySelectorAll('.pop'));
  if (!pops.length) return;

  function close(pop) {
    pop.setAttribute('data-open', 'false');
    pop.querySelector('.pop__trigger').setAttribute('aria-expanded', 'false');
  }
  function closeAll() { pops.forEach(close); }

  pops.forEach(function (pop) {
    var trigger = pop.querySelector('.pop__trigger');
    var copy = pop.querySelector('.pop__copy');
    close(pop);

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = pop.getAttribute('data-open') === 'true';
      closeAll();
      if (wasOpen) return;
      pop.setAttribute('data-open', 'true');
      trigger.setAttribute('aria-expanded', 'true');
    });

    if (!copy) return;
    var label = copy.textContent;
    var revert = null;
    copy.addEventListener('click', function (e) {
      e.stopPropagation();
      var say = function (msg) {
        copy.textContent = msg;
        clearTimeout(revert);
        revert = setTimeout(function () { copy.textContent = label; }, 2000);
      };
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        say('Select it and copy');
        return;
      }
      navigator.clipboard.writeText(copy.getAttribute('data-copy')).then(
        function () { say('Copied'); },
        function () { say('Select it and copy'); }
      );
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.pop')) closeAll();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = pops.filter(function (p) { return p.getAttribute('data-open') === 'true'; })[0];
    if (!open) return;
    close(open);
    open.querySelector('.pop__trigger').focus();
  });
})();

/* Language. The copy is English only for now, so this records the choice and
   sets the document language; it does not yet swap any text. */
(function () {
  'use strict';

  var opts = [].slice.call(document.querySelectorAll('.lang__opt'));
  if (!opts.length) return;

  var KEY = 'ascending:lang';

  function apply(code) {
    opts.forEach(function (b) {
      var on = b.dataset.lang === code;
      if (on) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    document.documentElement.lang = code;
  }

  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  if (saved && opts.some(function (b) { return b.dataset.lang === saved; })) apply(saved);

  opts.forEach(function (b) {
    b.addEventListener('click', function () {
      apply(b.dataset.lang);
      try { localStorage.setItem(KEY, b.dataset.lang); } catch (e) {}
    });
  });
})();

/* Hero mark comparison. Two drawings, one shown at a time, remembered so the
   choice survives a reload while it is being lived with. Scaffolding: remove
   this block with the .hero__marks markup and rules once a mark is picked. */
(function () {
  'use strict';

  var stage = document.querySelector('[data-mark-switch]');
  if (!stage) return;
  var marks = [].slice.call(stage.querySelectorAll('.hero__mark'));
  if (marks.length < 2) return;

  var KEY = 'graph0:hero-mark';
  var index = 0;

  /* A stored name with no drawing left falls back to the first, so removing a
     mark cannot strand the fold on nothing. */
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  marks.forEach(function (m, i) { if (m.dataset.mark === saved) index = i; });

  function apply() {
    marks.forEach(function (m, i) {
      if (i === index) m.setAttribute('data-current', 'true');
      else m.removeAttribute('data-current');
    });
    try { localStorage.setItem(KEY, marks[index].dataset.mark); } catch (e) {}
  }

  apply();

  stage.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mark-step]');
    if (!btn) return;
    var step = parseInt(btn.dataset.markStep, 10) || 1;
    index = (index + step + marks.length) % marks.length;
    apply();
  });
})();

/* Identity switch — graphzero / vongraph.

   Two names under comparison. The wordmark is the only text that changes; the
   accent, and the plate on the Knowledge Base fold, follow from the attribute
   this sets on .page rather than from anything here, so adding a third
   identity is a CSS block and an entry below.

   Scaffolding: remove this block with the .brand-switch markup and rules once
   a name is chosen. */
(function () {
  'use strict';

  var sw = document.querySelector('[data-identity-switch]');
  var page = document.querySelector('.page');
  if (!sw || !page) return;

  var NAMES = ['graphzero', 'vongraph'];
  var KEY = 'graphzero:identity';
  var brand = sw.querySelector('.brand');
  if (!brand) return;
  /* Every place the name is written out, not just the wordmark: the diagram's
     fourth assistant tile is ours too, and hard-coding one name there would
     leave it wrong under the other identity. */
  var labels = document.querySelectorAll('.brand__name, [data-identity-name]');

  var index = 0;
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  /* A stored name that no longer exists falls back to the first, so dropping
     an identity cannot strand the site on one nothing can switch away from. */
  var at = NAMES.indexOf(saved);
  if (at > -1) index = at;

  function apply() {
    var name = NAMES[index];
    page.setAttribute('data-identity', name);
    for (var i = 0; i < labels.length; i++) labels[i].textContent = name;
    brand.title = '/' + name;
    try { localStorage.setItem(KEY, name); } catch (e) {}
  }

  apply();

  sw.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-identity-step]');
    if (!btn) return;
    var step = parseInt(btn.dataset.identityStep, 10) || 1;
    index = (index + step + NAMES.length) % NAMES.length;
    apply();
  });
})();

/* Hero shimmer — vongraph's plate, lit.

   Specks drift across the picture: white squares a pixel or two across that
   fade up and back down over a second or two each, staggered so a scattering
   is always mid-life while the rest of the plate stays plain. Individually
   they are hard pixel artefacts; together, because each fades rather than
   switches, they read as a shimmer.

   The reference draws the photograph into its own canvas and repaints the
   whole plate every frame. Here the picture stays a real <img> underneath, so
   this canvas is transparent and a frame is a clear plus ~48 fillRects.

   Costs kept down rather than assumed cheap: ~24fps, paused when the fold is
   off screen or the canvas is not being shown, and never started at all under
   prefers-reduced-motion — where the plate alone is the design. */
(function () {
  'use strict';

  var cv = document.querySelector('canvas[data-shimmer]');
  var page = document.querySelector('.page');
  if (!cv || !page) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var FRAME_MS = 1000 / 24;
  var SPECKS = 48;

  var ctx = cv.getContext('2d');
  if (!ctx) return;
  var bits = [], raf = null, last = 0, onScreen = true, dpr = 1;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* Most specks are one or two pixels at a few percent opacity; a few are a
     shade larger and brighter. Without that spread it reads as even static
     rather than glinting. Deliberately at the edge of noticing: on a plate
     this dark, anything you can pick out frame by frame reads as dirt. */
  function spawn(w, h, now) {
    var loud = Math.random() < 0.15;
    var size = Math.round(rand(loud ? 2 : 1, loud ? 3 : 2));
    return {
      x: Math.round(rand(0, Math.max(0, w - size))),
      y: Math.round(rand(0, Math.max(0, h - size))),
      w: size,
      h: size,
      peak: loud ? rand(0.15, 0.25) : rand(0.04, 0.12),
      /* a long wait before each one returns, so only about half the set is
         alive at any moment and the rest of the plate stays plain */
      born: now + rand(0, 2600),
      life: rand(900, 2400)
    };
  }

  function size() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function draw(now) {
    var w = cv.width / dpr, h = cv.height / dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      var age = now - b.born;
      if (age < 0) continue;
      if (age > b.life) { bits[i] = spawn(w, h, now); continue; }
      /* sin over the lifetime: up and back down, so nothing ever pops on */
      ctx.globalAlpha = Math.sin((age / b.life) * Math.PI) * b.peak;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;
  }

  function seed() {
    if (!size()) return false;
    var w = cv.width / dpr, h = cv.height / dpr;
    var now = performance.now();
    bits.length = 0;
    for (var i = 0; i < SPECKS; i++) {
      var b = spawn(w, h, now);
      /* seeded mid-life at staggered phases: spawning the set together leaves
         them in step, and every so often they all fade out on one frame and
         the shimmer blinks off */
      b.born -= Math.random() * (b.life + 260);
      bits.push(b);
    }
    return true;
  }

  /* Read off the CSS rather than off the attribute: which identity shows the
     plate is a styling decision, and this way the script does not hold a
     second copy of it. */
  function live() {
    return onScreen && getComputedStyle(cv).display !== 'none';
  }

  function loop(now) {
    if (!live()) { raf = null; return; }
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    draw(now);
  }

  function start() {
    if (raf || !live()) return;
    if (!bits.length && !seed()) return;
    /* One frame up front. Without it the first paint waits on the first
       animation frame, and the plate arrives bare for a beat on switching. */
    last = performance.now();
    draw(last);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (cv.width) ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
  }

  function refresh() {
    if (live()) { bits.length = 0; start(); } else { stop(); }
  }

  if (window.MutationObserver) {
    new MutationObserver(refresh).observe(page, {
      attributes: true, attributeFilter: ['data-identity']
    });
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) start(); else stop();
    }, { threshold: 0 }).observe(cv);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(function () { if (live()) { bits.length = 0; start(); } }).observe(cv);
  }

  refresh();
})();

/* Challenges by area. The open area is recorded in one place — data-area on
   the card track — and the stylesheet decides from that which cards show.
   Nothing is written onto the cards themselves, so there is no state to clean
   up and no way for the two to disagree.

   Arrow keys move between the tabs, which is what a tablist is expected to do
   and what a row of buttons does not give you for free. */
(function () {
  'use strict';

  var tabs = document.querySelector('.areas .tabs');
  var cards = document.getElementById('challenge-cards');
  if (!tabs || !cards) return;

  var buttons = [].slice.call(tabs.querySelectorAll('[data-area]'));

  function show(area, focus) {
    cards.setAttribute('data-area', area);
    buttons.forEach(function (b) {
      var open = b.getAttribute('data-area') === area;
      b.setAttribute('aria-selected', open);
      /* only the open tab is in the tab order; the arrows reach the others */
      b.tabIndex = open ? 0 : -1;
      if (open && focus) b.focus();
    });
  }

  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-area]');
    if (btn) show(btn.getAttribute('data-area'), false);
  });

  tabs.addEventListener('keydown', function (e) {
    var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    var at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    var next = buttons[(at + step + buttons.length) % buttons.length];
    show(next.getAttribute('data-area'), true);
  });

  show(cards.getAttribute('data-area') || 'strategy', false);
})();


/* Hero plates. The arrows step between the two plates the fold has been tried
   with. Each stop names its own image set, its intrinsic size - they are not
   the same shape, and getting that wrong makes the hero jump as a plate decodes
   - and whether the type reverses out of it.

   The plate is fetched before it goes in. Assigning src directly leaves the
   <img> empty until the new one arrives: a white hero, with white type on it
   for a beat, because the tone flips at once while the picture takes a moment.
   `load` rather than decode(), which never settles in a background tab; the
   timeout is the same argument one step on, so a plate that stalls or 404s
   cannot strand the carousel on the stop before it. */
(function () {
  'use strict';

  var swap = document.getElementById('hero-swap');
  var hero = document.getElementById('hero');
  var img = hero && hero.querySelector('.hero__img');
  if (!swap || !hero || !img) return;

  var PLATES = [
    { base: 'hero-pale',  widths: [900, 1600, 2157], w: 2157, h: 1180, light: true },
    { base: 'hero-plate', widths: [900, 1600, 2157], w: 2157, h: 1180 }
  ];

  var count = swap.querySelector('[data-swap-count]');
  var at = 0;
  var pending = 0;

  function url(plate, w) { return 'assets/media/' + plate.base + '-' + w + '.jpg'; }

  function srcsetFor(plate) {
    return plate.widths.map(function (w) { return url(plate, w) + ' ' + w + 'w'; }).join(', ');
  }

  function apply(plate) {
    img.srcset = srcsetFor(plate);
    img.src = url(plate, plate.widths[1]);
    img.width = plate.w;
    img.height = plate.h;
    hero.classList.toggle('hero--light', !!plate.light);
  }

  function show(i) {
    at = (i + PLATES.length) % PLATES.length;
    var plate = PLATES[at];
    var token = ++pending;

    if (count) count.textContent = (at + 1) + '/' + PLATES.length;

    function settle() {
      if (token !== pending) return;
      pending++;                /* so the losing callbacks stay dropped */
      apply(plate);
    }

    var pre = new Image();
    pre.sizes = img.sizes;
    pre.onload = settle;
    pre.onerror = settle;
    pre.srcset = srcsetFor(plate);
    pre.src = url(plate, plate.widths[1]);

    if (pre.complete) settle();
    else setTimeout(settle, 1200);
  }

  swap.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-step]');
    if (!btn) return;
    show(at + Number(btn.getAttribute('data-step')));
  });

  show(0);
})();

/* The challenge tabs. Only the open tab is recorded - on the track, as
   data-tab - and the stylesheet decides from that which pair shows. */
(function () {
  'use strict';

  var tabs = document.getElementById('challenge-tabs');
  var track = document.getElementById('challenge-track');
  if (!tabs || !track) return;

  var buttons = [].slice.call(tabs.querySelectorAll('[data-tab]'));

  function show(which, focus) {
    track.setAttribute('data-tab', which);
    buttons.forEach(function (b) {
      var open = b.getAttribute('data-tab') === which;
      b.setAttribute('aria-selected', open);
      b.tabIndex = open ? 0 : -1;
      if (open && focus) b.focus();
    });
  }

  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tab]');
    if (btn) show(btn.getAttribute('data-tab'), false);
  });

  tabs.addEventListener('keydown', function (e) {
    var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    var i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    show(buttons[(i + step + buttons.length) % buttons.length].getAttribute('data-tab'), true);
  });

  show('0', false);
})();

/* Hero lattice.

   The piece is a separate file because it is the one heavy thing on the page —
   a WebGL2 simulation — and nothing else needs it. It is fetched on first use
   rather than blocking the fold, and only on the page that has a stage for it,
   so work-with-us pays nothing for this block.

   heroLattice.mount() reports whether it could start: no WebGL2, or no float
   buffers, and there is nothing to show. A false is not an error — the band is
   page colour underneath, which is a fine opening image on its own — so the
   failure path just drops the canvas rather than leaving a dead one on screen.

   Reduced motion is checked before the fetch, not after: someone who has asked
   for less movement should not pay for the file either. */
(function () {
  'use strict';

  var stage = document.getElementById('hero-lattice-stage');
  if (!stage) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var el = document.createElement('script');
  el.src = 'assets/hero-lattice.js?v=9';
  el.onload = function () {
    try {
      if (!window.heroLattice || !window.heroLattice.mount(stage)) fail();
    } catch (e) { fail(); }
  };
  el.onerror = fail;
  document.head.appendChild(el);

  /* Leave the box standing but empty: the band keeps its height, so the copy
     below does not jump up the page when the graph cannot run. */
  function fail() {
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }
})();
