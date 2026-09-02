/* Knowledge-graph flow — nine source systems fan into one knowledge base, which
   answers through four assistants. Built from the design handoff, ported to
   this codebase: the same geometry as plain DOM plus one SVG layer.

   Where this departs from the handoff, and why:

   · No build sequence. The handoff choreographs the figure assembling itself
     over seventeen seconds; here it is simply there on the first frame. It sits
     beside the module list rather than opening a page, and a diagram that
     assembles while you are reading the copy next to it competes with that
     copy instead of supporting it.
   · Nothing moves until it is asked to. At rest the figure is a still diagram:
     the boxes and the lines that join them, and no traffic. The module list
     drives it, and the three modules stack rather than each lighting its own
     piece — Integration lights the sources and the flow into the base, the
     Knowledge Base adds the base itself, Search & Agents adds the exchange out
     to the assistants and lights the panel. Each module shows what it is plus
     everything underneath it, which is the argument the list is making.
   · The closing inversion is off. The handoff says to turn it off when the page
     already has a dark block, and this one does — the security band.
   · The accent is read from --eu-blue rather than the handoff's #0000ff. The
     page already carries one blue, on the challenge tags, and the handoff is
     explicit that there is never a second accent hue.
   · The header trio and the footer wordmark are gone. The module number, the
     headline and the mark all already sit beside this figure in the showcase
     copy, so drawing them again was the same thing twice. What is left is
     cropped to fit the slot, which the handoff sanctions for a non-square one.

   Third-party marks are files under assets/images; a tile falls back to the
   name if its file is missing, and nothing here draws an approximation of
   someone else's logo. graphzero's own mark is type, so it is drawn.
*/
(function () {
  'use strict';

  var host = document.querySelector('[data-kg-flow]');
  if (!host) return;

  /* ---------- geometry, on the handoff's 600x600 grid ---------- */
  var W = 600;
  /* The drawn content plus a generous margin. The margin is what actually
     narrows the figure on screen: the plate's width is fixed by the column, so
     a crop cut tight to the drawing only scales the drawing up to fill it.
     Content spans x 24 to 500, and the crop is 40 wider on each side. */
  var CROP = { x: -16, w: 556, y: 80, h: 404 };

  var SRC = ['SharePoint', 'Outlook', 'Google Drive', 'Gmail', 'HubSpot',
             'DATEV', 'AFAS', 'Exact', 'Personio'];
  var ASSIST = [
    { name: 'Claude', logo: 'logo-claude.svg' },
    { name: 'Copilot', logo: 'logo-copilot.svg' },
    { name: 'ChatGPT', logo: 'logo-chatgpt.svg' },
    { name: 'graphzero', mark: true }
  ];
  var LOGO_DIR = 'assets/media/';

  var SB = { x: 24, w: 108, h: 34, gap: 5, y0: 118 };
  /* The convergence, pulled left with the source column: the run from the
     boxes to the hub is what most of the figure's width was going on. */
  var HUB = { x: 200, y: 291 };
  /* The base is narrower than the handoff's 160: taking 32 off its right edge
     pulls the assistants in with it and is what makes the whole figure more
     compact across, without moving the source column or the convergence the
     curves are drawn to. */
  var KB = { x: 202, y: 208, w: 128, h: 166 };
  var AP = { x: 362, y: 161, w: 138, h: 260 };
  /* the link between the base and the assistants, which the exchange runs along */
  var LINK = { x1: KB.x + KB.w, x2: AP.x, y: 291 };

  function srcY(i) { return SB.y0 + i * (SB.h + SB.gap); }

  var PATHS = SRC.map(function (_, i) {
    var sy = srcY(i) + SB.h / 2;
    /* The handles are a fixed share of the run rather than fixed lengths, so
       shortening the run keeps the fan's shape instead of kinking it. */
    var run = HUB.x - (SB.x + SB.w);
    return [{ x: SB.x + SB.w, y: sy },
            { x: SB.x + SB.w + run * 0.55, y: sy },
            { x: HUB.x - run * 0.69, y: HUB.y },
            HUB];
  });

  function bez(p, c) {
    var m = 1 - p;
    return {
      x: m*m*m*c[0].x + 3*m*m*p*c[1].x + 3*m*p*p*c[2].x + p*p*p*c[3].x,
      y: m*m*m*c[0].y + 3*m*m*p*c[1].y + 3*m*p*p*c[2].y + p*p*p*c[3].y
    };
  }

  /* ---------- colours, from the page rather than from the handoff ---------- */
  var cs = getComputedStyle(host);
  var C = {
    ink: cs.getPropertyValue('--heading').trim() || '#000',
    body: cs.getPropertyValue('--meta').trim() || '#565656',
    line: cs.getPropertyValue('--line').trim() || 'rgba(0,0,0,.16)',
    accent: cs.getPropertyValue('--eu-blue').trim() || '#003399'
  };

  /* Longhand, never the `font` shorthand. The shorthand demands a family, and
     `inherit` is not a legal value inside it — the whole declaration is dropped
     as invalid, which is exactly what had been happening to every label in this
     figure. Longhand lets the family inherit from the stage as intended.

     500 is as heavy as this typeface goes here: the page ships Geist 400 and
     500 only, and the design system's base stylesheet says in as many words
     that it never goes to 600 or 700. Asking for 700 would get a synthesised
     bold — heavier, but smeared, and off the system. */
  var LABEL = 'font-weight:500;font-size:12px';
  /* The mark, at the centre of the figure and again in its own assistant tile.
     One figure, so one size — set here rather than twice. */
  var MARK = 'font-weight:500;font-size:26px';
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.setAttribute('style', css);
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function ring(x, y, w, h, r, extra) {
    return el('div',
      'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h +
      'px;border-radius:' + r + 'px;box-shadow:inset 0 0 0 1px ' + C.line +
      ';display:flex;align-items:center;' + (extra || ''));
  }
  /* ---------- build, complete, once ---------- */
  /* Absolute, so the stage's literal 600px does not become the column's
     minimum width: in flow it was setting the grid track and leaving the block
     short of the container's right edge. */
  var stage = el('div',
    'position:absolute;left:0;top:0;width:' + W + 'px;height:' + W + 'px;color:' + C.ink +
    ';transform-origin:0 0;');
  host.appendChild(stage);

  var layer = svg('svg', { width: W, height: W, viewBox: '0 0 ' + W + ' ' + W,
                           'aria-hidden': 'true',
                           style: 'position:absolute;inset:0;overflow:visible' });
  /* Held rather than dropped: the flow lines and the boxes take the accent when
     a module is pointed at, so each needs to be reachable afterwards. */
  var pathEls = PATHS.map(function (c) {
    var p = svg('path', {
      d: 'M ' + c[0].x + ' ' + c[0].y + ' C ' + c[1].x + ' ' + c[1].y + ' ' +
         c[2].x + ' ' + c[2].y + ' ' + c[3].x + ' ' + c[3].y,
      fill: 'none', stroke: C.line, 'stroke-width': '1'
    });
    layer.appendChild(p);
    return p;
  });
  var linkEl = svg('line', { x1: LINK.x1, y1: LINK.y, x2: LINK.x2, y2: LINK.y,
                             stroke: C.line, 'stroke-width': '1' });
  layer.appendChild(linkEl);

  /* One packet per ingestion curve, and a larger one for the exchange between
     the base and the assistants. These are the only things that ever move, and
     they start invisible: at rest there is no traffic to show. */
  var packets = PATHS.map(function () {
    var d = svg('circle', { r: '2', fill: C.accent, opacity: '0' });
    layer.appendChild(d);
    return d;
  });
  var exchange = svg('circle', { r: '3.5', fill: C.accent, opacity: '0', cy: LINK.y });
  layer.appendChild(exchange);
  stage.appendChild(layer);

  var srcRings = SRC.map(function (name, i) {
    var r = ring(SB.x, srcY(i), SB.w, SB.h, 8);
    r.appendChild(el('span',
      'padding-left:12px;font-size:12.5px;letter-spacing:-0.01em;color:' + C.ink, name));
    stage.appendChild(r);
    return r;
  });

  var kb = ring(KB.x, KB.y, KB.w, KB.h, 24, 'flex-direction:column;justify-content:center;gap:14px;');
  kb.appendChild(el('div',
    LABEL + ';letter-spacing:-0.02em;color:' + C.ink, 'Knowledge Base'));
  var plate = el('div',
    'width:62px;height:62px;border-radius:16px;box-shadow:inset 0 0 0 1px ' + C.line +
    ';display:flex;align-items:center;justify-content:center;');
  var glyph = el('span', MARK + ';letter-spacing:-0.05em;line-height:1;');
  glyph.appendChild(el('span', 'color:' + C.accent, '/'));
  glyph.appendChild(el('span', 'color:' + C.ink, 'g'));
  plate.appendChild(glyph);
  kb.appendChild(plate);
  stage.appendChild(kb);

  var panel = ring(AP.x, AP.y, AP.w, AP.h, 24,
                   'flex-direction:column;align-items:stretch;justify-content:flex-start;padding:14px 12px;');
  panel.appendChild(el('div',
    LABEL + ';letter-spacing:-0.02em;color:' + C.ink +
    ';text-align:center;padding-bottom:12px', 'AI assistant'));

  var tileWrap = el('div',
    'display:grid;grid-template-columns:1fr 1fr;gap:10px 10px;justify-items:center');
  ASSIST.forEach(function (a) {
    var cell = el('div', 'display:grid;justify-items:center;gap:5px');
    var tile = el('div',
      'width:52px;height:52px;border-radius:14px;box-shadow:inset 0 0 0 1px ' + C.line +
      ';display:grid;place-items:center;overflow:hidden');

    if (a.mark) {
      var g = el('span', MARK + ';letter-spacing:-0.04em;line-height:1;');
      g.appendChild(el('span', 'color:' + C.accent, '/'));
      g.appendChild(el('span', 'color:' + C.ink, 'g'));
      tile.appendChild(g);
    } else {
      var img = document.createElement('img');
      img.src = LOGO_DIR + a.logo;
      img.alt = '';
      img.setAttribute('style', 'width:28px;height:28px;object-fit:contain');
      img.addEventListener('error', function () {
        img.replaceWith(el('span',
          'font-size:11px;letter-spacing:-0.01em;color:' + C.ink + ';text-align:center;padding:0 4px',
          a.name));
      });
      tile.appendChild(img);
    }

    cell.appendChild(tile);
    cell.appendChild(el('div',
      'font-size:10.5px;letter-spacing:-0.01em;color:' + C.body + ';text-align:center', a.name));
    tileWrap.appendChild(cell);
  });
  panel.appendChild(tileWrap);
  panel.appendChild(el('div',
    'margin-top:auto;padding-top:12px;font-size:10.5px;line-height:1.35;color:' + C.body +
    ';text-align:center', 'Answers from the full, holistic picture'));
  stage.appendChild(panel);

  /* ---------- fit ---------- */
  function fit() {
    var box = host.getBoundingClientRect();
    var s = Math.min(box.width / CROP.w, box.height / CROP.h);
    /* centre the crop in the slot, then lift its own origin into view */
    stage.style.transform =
      'translate(' + ((box.width - CROP.w * s) / 2 - CROP.x * s) + 'px,' +
      ((box.height - CROP.h * s) / 2 - CROP.y * s) + 'px) scale(' + s + ')';
  }
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(host);
  else window.addEventListener('resize', fit);

  /* ---------- what each module lights ----------

     Cumulative, because the modules are: the Knowledge Base is what the
     ingestion feeds, and Search & Agents is what the base answers through. So
     pointing at one shows it and everything under it rather than its own slice
     in isolation, and moving down the list adds to the picture instead of
     replacing it.

     Both flows run from level 2. The base is the thing traffic passes through
     in each direction — it is fed and it answers — so showing only what feeds
     it would be half of what it does. What Search & Agents adds on top is the
     panel: the flow is already drawn by then, and the module that is the panel
     is what lights it.

     Level 0 is the resting state and it is completely still — hairline boxes,
     hairline joins, no packets. */
  var LEVEL = { ingest: 1, graph: 2, agents: 3 };
  var level = 0;

  function ringOf(on) { return 'inset 0 0 0 1px ' + (on ? C.accent : C.line); }

  /* Everything the level decides, in one place, so the resting state cannot
     drift from what the loop happens to have left behind. */
  function paint() {
    var lit = level >= 1;
    srcRings.forEach(function (r) { r.style.boxShadow = ringOf(lit); });
    kb.style.boxShadow = ringOf(level >= 2);
    panel.style.boxShadow = ringOf(level >= 3);
    pathEls.forEach(function (p) { p.setAttribute('stroke', lit ? C.accent : C.line); });
    linkEl.setAttribute('stroke', level >= 2 ? C.accent : C.line);
    if (!lit) packets.forEach(function (d) { d.setAttribute('opacity', 0); });
    if (level < 2) exchange.setAttribute('opacity', 0);
  }

  [].concat(srcRings, [kb, panel]).forEach(function (n) {
    n.style.transition = 'box-shadow 180ms ease';
  });
  pathEls.concat([linkEl]).forEach(function (n) {
    n.style.transition = 'stroke 180ms ease';
  });

  /* Pointer only: these are reading aids, not controls, and there is nothing in
     the figure that is not already said in the copy beside it. */
  document.querySelectorAll('[data-flow]').forEach(function (item) {
    var n = LEVEL[item.getAttribute('data-flow')];
    if (!n) return;
    item.addEventListener('pointerenter', function () { level = n; paint(); start(); });
    item.addEventListener('pointerleave', function () { level = 0; paint(); stop(); });
  });

  paint();

  /* ---------- motion ----------
     Only while a module is pointed at. The packets run the ingestion curves
     from level 1, and the exchange between the base and the assistants joins
     at level 2 — the base both receives and answers, so pointing at it shows
     both directions.

     Phase is accumulated per frame rather than computed from elapsed time, so
     the run picks up where it left off when the pointer moves from one module
     to the next rather than snapping to a new position. */
  var PHASE = { ingest: 0, agents: 0 };
  var ING_SPEED = 0.42, AG_SPEED = 0.5;
  var ING_R = 2.6, AG_R = 4;
  var STAGGER = 0.13;   /* so the nine ingestion packets are never in step */

  var raf = null, last = 0, visible = true;

  function frame(now) {
    if (!visible || level === 0) { raf = null; return; }
    raf = requestAnimationFrame(frame);

    /* clamped: a throttled or backgrounded tab can hand back a gap of seconds,
       which would teleport every dot on the first frame after it wakes */
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    PHASE.ingest = (PHASE.ingest + dt * ING_SPEED) % 1;
    PATHS.forEach(function (path, i) {
      var p = (PHASE.ingest + i * STAGGER) % 1;
      var at = bez(p, path);
      var d = packets[i];
      d.setAttribute('cx', at.x);
      d.setAttribute('cy', at.y);
      d.setAttribute('r', ING_R);
      /* fades in and out at the ends, so nothing appears or vanishes on a
         hard edge */
      d.setAttribute('opacity', Math.sin(Math.PI * p));
    });

    if (level >= 2) {
      PHASE.agents = (PHASE.agents + dt * AG_SPEED) % 2;
      /* a question out and an answer back: a triangle wave, so it turns around
         rather than jumping back to the start */
      var q = PHASE.agents > 1 ? 2 - PHASE.agents : PHASE.agents;
      exchange.setAttribute('cx', LINK.x1 + q * (LINK.x2 - LINK.x1));
      exchange.setAttribute('r', AG_R);
      exchange.setAttribute('opacity', 0.35 + 0.65 * Math.sin(Math.PI * q));
    }
  }

  /* The highlight is the point; the traffic is the embellishment. Under
     prefers-reduced-motion the figure still lights up, it simply does not move. */
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start() {
    if (still || raf || !visible || level === 0) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0 }).observe(host);
  }
})();
