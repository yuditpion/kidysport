/* ==========================================================================
   Clip-backed sections, on מה אנחנו עושים and אודות.

   Any `[data-film]` section gets a canvas that pages through a numbered still
   sequence. Stills rather than a <video>: seeking a video on every scroll
   frame stalls (badly so on iOS), while paging through decoded stills is
   instant and, at these lengths, smaller than the source MP4 as well.

   `data-film-mode` picks how the clip is driven:
     scroll     (default) — the section's pinned stretch, so it holds the
                            opening frame until the section fills the screen
     enter               — the section's own height: the clip sits on its
                            first frame while the section is at the top of the
                            screen and runs as the section scrolls away, for a
                            hero that is only about a viewport tall and so has
                            no pinned stretch for `scroll` to measure

     visibility          — from 70% of a short section being on screen to all
                            of it, for backdrops that are not pinned
     loop                — not scrubbed; plays while the section is on screen
     once                — plays through once when the section is fully on
                            screen, then holds its last frame
   `data-film-end` below 1 lands the last frame early and holds it there, so
   the end of a walk is on screen rather than arriving as the section leaves.

   `data-film-pin` names a still further down the page that the clip's last
   frame is a picture of. Two things follow from it. The clip is pinned to the
   screen while it runs, instead of scrolling away with its section — the boy
   has to stay in front of you the whole way, or he vanishes off the top just
   as he starts moving. And it finishes exactly where that still is, so the
   last frame lands on it and the handover is invisible; both ends are measured
   by `data-film-anchor`, which is the fraction of the clip frame that the
   still sits at — found by overlapping the two pictures rather than by
   measuring either one edge, which thresholds disagree about. The scrub runs to the top of the still's own section,
   which is where boy-scroll.js picks the boy up, so the two never overlap.

   The three cards on מה אנחנו עושים also swap their photo for a clip on hover;
   that lives at the bottom of this file.

   Respects prefers-reduced-motion: every stage keeps its first frame and all
   revealed content stays visible.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var films = [].slice.call(document.querySelectorAll('[data-film]'));

  /* The bundled single-file build injects the frames as data URIs; the served
     site reads them off disk. */
  function frameSrc(tag, i, count, ext) {
    var seq = window.KIDY_SEQ && window.KIDY_SEQ[tag];
    if (seq && seq.length) {
      /* the bundle ships a thinned sequence — map this clip's own frame count
         onto whatever length it was given */
      return seq[Math.round(i / (count - 1) * (seq.length - 1))];
    }
    /* opaque sequences are JPEG; one that has to sit over other artwork
       carries alpha and says so */
    return 'assets/seq/seq_' + tag + '_' + String(i).padStart(3, '0') + '.' + ext;
  }

  /* ---------------------------------------------------------------- reveal --
     The eight points light up one at a time, right column first and then the
     left — "right to left" across the picture. Each point's dotted leader
     comes up with it. */
  var LEADERS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 8, 6: 5, 7: 6, 8: 7 };

  function buildReveal(section) {
    var items = [];
    for (var n = 1; n <= 8; n++) {
      var point = section.querySelector('.gp--' + n);
      if (!point) continue;
      items.push({ point: point, lead: section.querySelector('.gl--' + LEADERS[n]) });
    }
    if (items.length) section.classList.add('is-anim');
    return items;
  }

  function paintReveal(items, p) {
    /* spread the eight across the middle of the pass so the first is not
       already lit as the section arrives, nor the last still dark as it goes */
    var from = 0.12, to = 0.78;
    for (var i = 0; i < items.length; i++) {
      var at = from + (to - from) * (i / (items.length - 1 || 1));
      var on = p >= at;
      items[i].point.classList.toggle('is-on', on);
      if (items[i].lead) items[i].lead.classList.toggle('is-on', on);
    }
  }

  /* ------------------------------------------------------------------ film -- */
  function setup(section) {
    var tag = section.dataset.film;
    var count = parseInt(section.dataset.frames, 10) || 40;
    /* JPEG unless the clip needs alpha to sit over other artwork */
    var ext = section.dataset.filmExt || 'jpg';
    /* How far through the section's pass the clip should reach its last frame.
       Below 1 it finishes early and holds, so the end of the walk is on screen
       for a while instead of landing just as the section leaves. */
    var filmEnd = parseFloat(section.dataset.filmEnd) || 1;

    /* scroll     — progress is the section's pinned stretch (the default)
       visibility — progress runs from 70% of the section being on screen to
                    all of it, for a section shorter than the viewport
       loop       — not scrubbed at all: it just plays while on screen
       once       — plays through once, the first time the whole section is
                    on screen, and stays on the last frame                  */
    var mode = section.dataset.filmMode || 'scroll';
    var VIS_FROM = 0.7;

    /* The still this clip hands over to, and where the boy sits inside the
       clip's last frame as a fraction of it. */
    var pinSel = section.dataset.filmPin;
    var pinTo = pinSel ? document.querySelector(pinSel) : null;
    var pinSec = pinTo ? pinTo.closest('.s') : null;
    var anchor = (section.dataset.filmAnchor || '0,0').split(',');
    var ANCH = { x: parseFloat(anchor[0]) || 0, y: parseFloat(anchor[1]) || 0 };
    /* Where the clip sits when nothing has been scrolled — the position it
       must not jump away from as the pin takes over. Measured unpinned. */
    var natPage = null, cbZero = { x: 0, y: 0 };
    /* 0 below, 1 above, eased in between */
    function ease(x) {
      var s = x < 0 ? 0 : x > 1 ? 1 : x;
      return s * s * (3 - 2 * s);
    }
    var stage = section.querySelector('.film');
    var canvas = section.querySelector('.film__canvas');
    var still = section.querySelector('.film__still');
    var reveal = buildReveal(section);

    var frames = [];
    var ready = 0;
    /* An opaque canvas is cheaper to composite and every full-frame clip is
       opaque anyway — but a clip that has to sit over other artwork carries
       alpha, and on an opaque canvas its transparent pixels come out black. */
    var ctx = canvas.getContext('2d', { alpha: ext !== 'jpg' });
    var drawn = -1;
    var sized = 0;

    function fit() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.round(canvas.clientWidth * dpr);
      var h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
        drawn = -1;                       // resizing clears the bitmap
      }
      sized = w;
    }

    function draw(i) {
      var img = frames[i];
      if (!img || !img.complete || !img.naturalWidth) return;
      if (i === drawn) return;
      fit();
      if (!canvas.width || !canvas.height) return;

      /* Wipe first. Every opaque sequence paints over the last frame by simply
         covering it, but a sequence with alpha does not: without this the
         frames pile up and the boy is drawn once for every step of his jump. */
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // cover: fill the stage, centre the overflow
      var s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      drawn = i;
      if (!stage.classList.contains('is-live')) stage.classList.add('is-live');
    }

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () {
          ready++;
          if (idx === 0) draw(0);
        };
        img.src = frameSrc(tag, idx, count, ext);
        frames[idx] = img;
      })(i);
    }

    /* loop and once both run on their own clock rather than on scroll */
    var loopAt = 0, loopTimer = 0, played = false;
    function loopTick() {
      draw(loopAt);
      if (mode === 'once') {
        if (loopAt >= count - 1) { clearInterval(loopTimer); loopTimer = 0; played = true; return; }
        loopAt++;
      } else {
        loopAt = (loopAt + 1) % count;
      }
    }
    function loopRun(on) {
      if (on && !loopTimer) { loopTimer = setInterval(loopTick, 1000 / 15); loopTick(); }
      else if (!on && loopTimer) { clearInterval(loopTimer); loopTimer = 0; }
    }

    return {
      section: section,
      update: function () {
        var r = section.getBoundingClientRect();
        var vh = window.innerHeight || 1;
        var onScreen = r.bottom > 0 && r.top < vh;

        if (mode === 'loop') {
          loopRun(onScreen && !reduced);
          return;
        }
        if (mode === 'once') {
          /* Wait until the section is being seen in full, so the run-up is not
             half cut off by the fold, then let it play out and stay there.
             "In full" cannot mean the whole box is on screen: the section is
             taller than a laptop viewport, so that gate never opens and the
             clip never starts. It means as much of it as the screen can hold —
             fully visible when it fits, filling the screen when it does not.

             Scrolling right away from the section arms it again, so coming
             back down replays the run-up instead of landing on a finished
             picture. Leaving is judged well clear of the trigger, or the two
             would trade on every small scroll. */
          if (reduced) { draw(count - 1); return; }
          var seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          var need = Math.min(r.height, vh);
          if (played) {
            if (seen <= need * 0.35) { played = false; loopAt = 0; }
            return;
          }
          if (seen >= need - 2) loopRun(true);
          return;
        }

        var p;
        if (mode === 'enter' && pinTo && pinSec) {
          /* Run to the point where the still it hands over to begins its own
             journey — the top of that still's section, which is exactly where
             boy-scroll.js picks the boy up. Tying the two to the same scroll
             position is what makes the handover land on one frame rather than
             leaving a gap or an overlap between the clip and the canvas. */
          var handoff = pinSec.getBoundingClientRect().top + window.scrollY;
          p = handoff > 0 ? window.scrollY / handoff : 0;
        } else if (mode === 'enter') {
          /* The hero is about one viewport tall, so it has no pinned stretch:
             `scroll` would divide by a travel of nearly nothing and start the
             clip halfway through. Progress here is simply how far the section
             has scrolled up out of its own height — 0 with the page at the
             top, 1 once the section has gone by — which is exactly "still
             while you are looking at it, running as you leave it". */
          p = r.height > 0 ? (-r.top) / r.height : 0;
        } else if (mode === 'visibility') {
          /* how much of the section is on screen, 0..1 */
          var shown = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          var vis = shown / Math.min(r.height, vh);
          p = (vis - VIS_FROM) / (1 - VIS_FROM);
        } else {
          /* Progress is the pinned stretch, not the whole approach: it stays at
             0 while the section is still rising into view — so you arrive on
             the opening frame — and only starts once it fills the screen. */
          var travel = r.height - vh;
          p = travel > 0 ? (-r.top) / travel : (vh - r.top) / (r.height + vh);
        }
        p = p < 0 ? 0 : p > 1 ? 1 : p;

        /* One normalised progress drives both the clip and the reveal, so the
           picture and the points finish together rather than drifting apart. */
        var t = filmEnd < 1 ? Math.min(1, p / filmEnd) : p;

        if (reveal.length) paintReveal(reveal, reduced ? 1 : t);
        if (reduced) return;

        /* The pin. While the clip runs it is held on the screen rather than
           on the page, so the boy stays in front of you instead of sliding
           off the top the moment he starts moving. It is held between two
           places: where it sits with nothing scrolled, and wherever the still
           it hands over to happens to be right now, offset by the fraction of
           the frame the boy occupies. Both ends are exact, so there is no jump
           into the pin at the start and none out of it at the end — and past
           the end the clip steps aside and the canvas takes the boy on. */
        if (pinTo) {
          if (!natPage) {
            var n = stage.getBoundingClientRect();
            natPage = { x: n.left + window.scrollX, y: n.top + window.scrollY };
            /* `position: fixed` is not necessarily relative to the viewport
               here: an ancestor of this stage establishes a containing block
               for fixed descendants, so `left: 0` lands at the page's left
               edge rather than the screen's. Find out where zero actually is
               once, and take it off every position from here on — without it
               the clip sits exactly one page margin to the side and the boy
               steps sideways as the canvas takes over. */
            var prevPos = stage.style.position, prevL = stage.style.left, prevT = stage.style.top;
            stage.style.position = 'fixed';
            stage.style.left = '0px';
            stage.style.top = '0px';
            var z = stage.getBoundingClientRect();
            cbZero = { x: z.left, y: z.top };
            stage.style.position = prevPos;
            stage.style.left = prevL;
            stage.style.top = prevT;
          }
          if (t >= 0.999) {
            stage.style.position = '';
            stage.style.left = stage.style.top = '';
            stage.style.visibility = 'hidden';
          } else {
            var tr = pinTo.getBoundingClientRect();
            var fw = stage.offsetWidth, fh = stage.offsetHeight;
            var endL = tr.left - ANCH.x * fw;
            var endT = tr.top - ANCH.y * fh;
            stage.style.visibility = '';
            stage.style.position = 'fixed';
            /* Three places, not two. Where it starts is where the frame draws
               it, which on the narrower frames is partly below the fold — that
               is fine standing still, but it cannot be where the boy is held
               while he runs. So it rises just far enough to be wholly on the
               screen, stays there for the length of the run, and only in the
               last third eases onto the still it hands over to. Blending
               straight from start to target instead pulled him down towards a
               target that begins a screen and a half below, and he spent the
               middle of the run off the bottom of the screen. */
            var fh = stage.offsetHeight;
            var holdY = Math.min(Math.max(natPage.y, 0), Math.max(0, vh - fh));
            var rise = ease(t / 0.15);            // onto the hold, at the start
            var land = ease((t - 0.68) / 0.32);   // off it, onto the still
            var baseY = natPage.y + (holdY - natPage.y) * rise;
            stage.style.left = (natPage.x + (endL - natPage.x) * land - cbZero.x) + "px";
            stage.style.top  = (baseY + (endT - baseY) * land - cbZero.y) + "px";
          }
        }

        if (r.bottom < -vh || r.top > vh * 2) return;   // far off-screen: skip
        draw(Math.min(count - 1, Math.max(0, Math.round(t * (count - 1)))));
      },
      resize: function () { drawn = -1; natPage = null; cbZero = { x: 0, y: 0 }; }
    };
  }

  var players = films.map(setup);

  /* ------------------------------------------------------- cut-out hover --
     The boy in "יש לכם שאלה נוספת?" is a still until you point at him, and
     then he lowers the hoop. The clip is background-removed, so its frames
     carry alpha and the canvas has to be cleared between them; it is cropped
     to the ink of the still it replaces, and faq.css places it accordingly. */
  (function () {
    var boys = [].slice.call(document.querySelectorAll('[data-hoverclip]'));
    if (!boys.length || reduced) return;

    boys.forEach(function (box) {
      var tag = box.dataset.hoverclip;
      var count = parseInt(box.dataset.hoverframes, 10) || 18;
      var canvas = box.querySelector('canvas');
      var ctx = canvas.getContext('2d');
      var frames = null, timer = 0, at = 0, on = false;

      function load() {
        if (frames) return;
        frames = [];
        for (var i = 0; i < count; i++) {
          var img = new Image();
          img.decoding = 'async';
          var seq = window.KIDY_SEQ && window.KIDY_SEQ[tag];
          img.src = seq ? seq[Math.round(i / (count - 1) * (seq.length - 1))]
                        : 'assets/seq/seq_' + tag + '_' + String(i).padStart(3, '0') + '.webp';
          frames.push(img);
        }
      }
      function fit() {
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      }
      function paint() {
        var img = frames && frames[at];
        if (img && img.complete && img.naturalWidth) {
          fit();
          ctx.clearRect(0, 0, canvas.width, canvas.height);   // alpha: no stacking
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          box.classList.add('is-playing');
        }
        /* run once to the end and hold there — he lowers the hoop and keeps it */
        if (at < count - 1) at++;
      }
      function start() {
        if (on) return;
        on = true; load(); at = 0; paint();
        timer = setInterval(function () { if (on) paint(); }, 1000 / 14);
      }
      function stop() {
        on = false; clearInterval(timer); timer = 0;
        box.classList.remove('is-playing');
      }
      box.addEventListener('pointerenter', start);
      box.addEventListener('pointerleave', stop);
    });
  })();

  /* ------------------------------------------------------------ card hover --
     Each of the three cards swaps its photo for a looping clip while the
     pointer is anywhere on that card, and goes back to the photo on the way
     out. The clip paints into a canvas inside the photo's own clipping box, so
     it can never spill over the copy beside it. Frames load on first hover. */
  (function () {
    var CLIP_FRAMES = 20;
    var FPS = 12;
    var cards = [].slice.call(document.querySelectorAll('.dc-pic[data-clip]'));
    if (!cards.length || reduced) return;

    cards.forEach(function (box) {
      var tag = box.dataset.clip;
      var canvas = box.querySelector('.dc-pic__film');
      var ctx = canvas.getContext('2d', { alpha: false });
      var frames = null, timer = 0, at = 0, hovering = false;

      /* the card is three separate absolutely-placed pieces, so the hover zone
         is the pad, the photo, the heading and the copy taken together */
      var key = box.className.match(/dc-pic--(\w)/)[1];
      var zone = ['.dc-pad--', '.dc-pic--', '.dc-x--', '.dc-t--']
        .map(function (s) { return document.querySelector(s + key); })
        .filter(Boolean);

      function load() {
        if (frames) return;
        frames = [];
        for (var i = 0; i < CLIP_FRAMES; i++) {
          var img = new Image();
          img.decoding = 'async';
          var seq = window.KIDY_HOVER && window.KIDY_HOVER[tag];
          img.src = seq ? seq[Math.round(i / (CLIP_FRAMES - 1) * (seq.length - 1))]
                        : 'assets/hover/hov_' + tag + '_' + String(i).padStart(2, '0') + '.jpg';
          frames.push(img);
        }
      }

      function fit() {
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      }

      function paint() {
        var img = frames && frames[at];
        if (img && img.complete && img.naturalWidth) {
          fit();
          var s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
          var w = img.naturalWidth * s, h = img.naturalHeight * s;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          box.classList.add('is-playing');
        }
        at = (at + 1) % CLIP_FRAMES;
      }

      function start() {
        if (hovering) return;
        hovering = true;
        load();
        at = 0;
        paint();
        timer = setInterval(function () { if (hovering) paint(); }, 1000 / FPS);
      }
      function stop() {
        hovering = false;
        clearInterval(timer); timer = 0;
        box.classList.remove('is-playing');
      }

      zone.forEach(function (el) {
        el.addEventListener('pointerenter', start);
        el.addEventListener('pointerleave', function (e) {
          /* moving between two pieces of the same card is not a leave */
          var to = e.relatedTarget;
          if (to && zone.some(function (z) { return z === to || z.contains(to); })) return;
          stop();
        });
      });
    });
  })();

  /* Exposed so the layout harness can step the sections deterministically —
     it drives the page without a compositor, where scroll events and rAF do
     not fire. Same idea as window.KIDY_SEQ in the bundled build. */
  window.KIDY_FILM = players;

  var queued = false;
  function tick() {
    queued = false;
    for (var i = 0; i < players.length; i++) players[i].update();
  }
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(tick);
  }

  if (players.length) {
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', function () {
      for (var i = 0; i < players.length; i++) players[i].resize();
      request();
    });
    addEventListener('load', request);
    request();
  }
})();
