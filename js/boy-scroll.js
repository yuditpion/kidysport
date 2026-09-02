/* ==========================================================================
   Kidysport — scroll-driven boy animation across the first four sections.

   This used to scrub the three alpha-WebM clips (assets/seq/t1..t3). It no
   longer does: the source renders push the camera in until the boy leaves the
   frame, so his legs are cropped on 90 of clip 1's 122 frames, his shoes on
   clip 2's opening and his kippah on frames 68-107, and clip 3 is cropped on
   all but about twenty. Those pixels were never rendered, so no amount of
   compositing brings them back — the only fix would be to re-generate the
   clips. Until that happens the boy is drawn from the four full-body poses
   that the sections already carry (.boy-static), which are whole head to
   shoes, and the leap between two sections is animated rather than scrubbed:
   the pose travels along an arc, tilts into the direction of travel, swells
   slightly at the apex and cross-fades to the next pose there, where he is
   moving fastest and the swap reads as motion.

   At both ends of every leap the arc, tilt and swell are all zero, so the boy
   still lands exactly on the Figma position at each section boundary — the
   poses are measured by their alpha bounding box, as before.

   The first leap is no longer one of these. Scrolling out of the hero now
   scrubs a clip that was rendered for it (seq_r, driven by do-scroll.js),
   which runs the boy over the ladder and ends on him catching the ball —
   the pose the next section already draws. So the chain here starts at that
   section instead, and picks the boy up where the clip sets him down.

   Respects prefers-reduced-motion: the static poses stay as they are.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('boy-canvas');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = canvas.getContext('2d');

  /* Desktop runs four poses over three leaps. The mobile frame repeats the
     ball pose in the strength-cards band, so there it is five poses: that
     extra leap is a "hold" — same pose at both ends, so the boy travels
     without a pose change. */
  var howBoy    = document.querySelector('.how__boy');
  var whatisBoy = document.querySelector('.whatis__boy');
  var strengthBoy = document.querySelector('.strength__boy');
  var planBoy   = document.querySelector('.plan__boy');

  var secHow    = document.getElementById('how');
  var secWhatis = document.getElementById('what-is');
  var secPlan   = document.getElementById('plan');

  if (!howBoy || !whatisBoy || !planBoy ||
      !secHow || !secWhatis || !secPlan) return;

  var statics = [];   // anchor elements, in order
  var segs    = [];   // {hold} per gap between anchors
  var boundFns = [];  // scroll position where each anchor is "on its mark"

  function pageTop(el) { return el.getBoundingClientRect().top + window.scrollY; }
  function pageBottom(el) { return pageTop(el) + el.getBoundingClientRect().height; }

  function buildChain() {
    var useStrength = strengthBoy &&
      window.getComputedStyle(strengthBoy).display !== 'none';

    if (useStrength) {
      statics  = [howBoy, whatisBoy, strengthBoy, planBoy];
      boundFns = [
        function () { return pageTop(secHow); },
        function () { return pageTop(secWhatis); },
        function () { return pageBottom(secWhatis); },   /* strength band starts */
        function () { return pageTop(secPlan); }
      ];
    } else {
      statics  = [howBoy, whatisBoy, planBoy];
      boundFns = [
        function () { return pageTop(secHow); },
        function () { return pageTop(secWhatis); },
        function () { return pageTop(secPlan); }
      ];
    }

    /* A leap whose two poses are the same picture is a hold: the boy travels
       but keeps his shape, so there is nothing to cross-fade. Compare `.src`,
       which resolves to an absolute URL straight away — `currentSrc` is still
       empty this early, and two empties would read as every leap being a hold. */
    segs = [];
    for (var i = 0; i < statics.length - 1; i++) {
      segs.push({ hold: statics[i].src === statics[i + 1].src });
    }
  }
  buildChain();

  var poseBox  = [];  // alpha box of each pose, in that image's natural px
  var staticBox = []; // the same box as a 0-1 fraction, for placing anchors
  var anchors  = [];  // tight page-space rect of the boy per section
  var tops     = [];
  var leaps    = []; // {arc, dx} per segment, sized to the room on screen
  var ready = false;
  var dpr = 1;

  /* The leap, in three parts. He shrinks towards the apex — a boy who recedes
     and comes back reads as jumping away from you — which is also what buys
     the headroom the arc then spends. */
  var SHRINK = 0.10;                  /* smallest at the apex, as a fraction */
  var TILT   = 7 * Math.PI / 180;     /* lean into the direction of travel   */
  var ARC_MAX = 90;                   /* px, however much room there is      */
  var ARC_MARGIN = 10;                /* px of daylight kept above his head  */

  /* Alpha bounding box, measured on a small proxy for speed. */
  function alphaBox(img) {
    var W = 200;
    var H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, W, H);
    var d;
    try { d = cx.getImageData(0, 0, W, H).data; }
    catch (e) { return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }; }
    var minX = W, minY = H, maxX = -1, maxY = -1;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    var sx = img.naturalWidth / W, sy = img.naturalHeight / H;
    return {
      x: minX * sx, y: minY * sy,
      w: (maxX - minX + 1) * sx, h: (maxY - minY + 1) * sy
    };
  }

  function decoded(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve(img);
    return new Promise(function (res) {
      img.addEventListener('load', function () { res(img); }, { once: true });
      img.addEventListener('error', function () { res(img); }, { once: true });
    });
  }

  function boot() {
    Promise.all(statics.map(decoded)).then(function () {
      /* A pose that failed to decode has no box to place, and guessing one
         would drop the boy in the wrong spot — leave the static composition. */
      if (!statics.every(function (img) { return img.naturalWidth > 0; })) return;

      poseBox = statics.map(alphaBox);
      staticBox = poseBox.map(function (b, i) {
        var img = statics[i];
        return {
          x: b.x / img.naturalWidth,  y: b.y / img.naturalHeight,
          w: b.w / img.naturalWidth,  h: b.h / img.naturalHeight
        };
      });

      measure();
      ready = true;
      document.documentElement.classList.add('js-boy-anim');
      canvas.classList.add('is-live');
      wire();
      render();
    }).catch(function () {
      /* nothing to draw — the static Figma composition stays as-is */
    });
  }

  /* Tight page-space rect of the boy inside a static <img>. */
  function tightRect(el, frac) {
    var r = el.getBoundingClientRect();
    return {
      x: r.left + window.scrollX + frac.x * r.width,
      y: r.top + window.scrollY + frac.y * r.height,
      w: frac.w * r.width,
      h: frac.h * r.height
    };
  }

  function measure() {
    /* A window "load" or a ScrollTrigger refresh can land before the alpha
       boxes exist; there is nothing to place until then. */
    if (staticBox.length !== statics.length) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    anchors = statics.map(function (el, i) { return tightRect(el, staticBox[i]); });
    tops = boundFns.map(function (fn) { return fn(); });
    planLeaps();
  }

  /* How high each leap may arc. The anchors are placed so the boy is only just
     inside the viewport as he passes, so the arc gets whatever is left over
     once the shrink and the tilt have been paid for — measured, not guessed,
     because it changes with the viewport and with the mobile chain. */
  function planLeaps() {
    leaps = segs.map(function (seg, k) {
      var A = anchors[k], B = anchors[k + 1];
      var tilt = seg.hold ? 0 : TILT;
      var pair = pathFor(k);
      seg.pair = pair;          /* render reuses it; it only changes on measure */
      var room = Infinity;

      for (var p = 0.1; p < 0.95; p += 0.1) {
        var hop = Math.sin(Math.PI * p);
        for (var i = 0; i < pair.length; i++) {
          var leg = pair[i];
          var c = centreAt(leg.box, leg.from, leg.to, p);
          var s = c.s * (1 - SHRINK * hop);
          /* half-height of the tilted, shrunken pose */
          var half = (leg.box.h * s * Math.cos(tilt) +
                      leg.box.w * s * Math.sin(tilt)) / 2;
          var head = c.y - lerp(tops[k], tops[k + 1], p) - half;
          room = Math.min(room, (head - ARC_MARGIN) / hop);
        }
      }

      return {
        arc: Math.max(0, Math.min(ARC_MAX, room)),
        dx: centreOf(B).x - centreOf(A).x
      };
    });
  }

  /* The two poses of leap k, each with its placement on both anchors. */
  function pathFor(k) {
    var A = anchors[k], B = anchors[k + 1];
    return [k, k + 1].map(function (i) {
      return {
        img:  statics[i],
        box:  poseBox[i],
        from: layerFor(poseBox[i], A),
        to:   layerFor(poseBox[i], B)
      };
    });
  }

  /* Where to draw pose `box` so its alpha box lands exactly on `anchor`. */
  function layerFor(box, anchor) {
    var scale = anchor.w / box.w;
    return { scale: scale, x: anchor.x - box.x * scale, y: anchor.y - box.y * scale };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function centreOf(anchor) {
    return { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 };
  }

  /* Where the centre of one pose's alpha box sits, in page space, part-way
     through a leap. The two poses are placed on each anchor the way the static
     composition places them — by the top-left of the alpha box, not by its
     centre, because a pose is rarely the same shape as the box Figma gave it
     and centring would lift the boy off his mark. */
  function centreAt(box, from, to, p) {
    var s = lerp(from.scale, to.scale, p);
    return {
      s: s,
      x: lerp(from.x, to.x, p) + (box.x + box.w / 2) * s,
      y: lerp(from.y, to.y, p) + (box.y + box.h / 2) * s
    };
  }
  /* 0 below e0, 1 above e1, eased in between */
  function smoothstep(e0, e1, x) {
    var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  var lastKey = '';

  /* Set by the ScrollTrigger scrubs; falls back to raw scroll maths when
     ScrollTrigger is unavailable. */
  var cur = { k: 0, p: 0 };

  function readScroll() {
    var scrollY = window.scrollY;
    var last = segs.length - 1;
    if (scrollY <= tops[0]) return { k: 0, p: 0 };
    if (scrollY >= tops[last + 1]) return { k: last, p: 1 };
    for (var i = 0; i <= last; i++) {
      if (scrollY >= tops[i] && scrollY < tops[i + 1]) {
        return { k: i, p: (scrollY - tops[i]) / Math.max(1, tops[i + 1] - tops[i]) };
      }
    }
    return cur;
  }

  /* Draw one pose with its alpha-box centre at (cx, cy), scaled by `s` about
     that same centre and rotated by `angle` about it. */
  function drawPose(img, box, s, cx, cy, angle, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(img,
      -(box.x + box.w / 2) * s, -(box.y + box.h / 2) * s,
      img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
  }

  function blank() {
    if (lastKey !== 'blank') {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      lastKey = 'blank';
    }
  }

  function render() {
    if (!ready) return;

    var scrollY = window.scrollY;
    var k = Math.min(cur.k, segs.length - 1), p = cur.p;
    var seg = segs[k];
    var leap = leaps[k];
    var pair = seg.pair;

    /* The leap: rise off the straight line, peaking halfway; lean into the
       direction of travel; shrink towards the apex. All three are zero at
       p = 0 and p = 1, so both landings stay exactly on their marks. */
    var hop  = Math.sin(Math.PI * p);
    var arc  = -leap.arc * hop;
    var tilt = seg.hold ? 0 : (leap.dx < 0 ? -1 : 1) * TILT * hop;
    var pop  = 1 - SHRINK * hop;

    /* He changes shape at the apex, where he is smallest and moving fastest,
       so the swap reads as motion rather than as a dissolve. */
    var fade = seg.hold ? 1 : smoothstep(0.40, 0.62, p);
    var alpha = [1 - fade, fade];

    var shot = [], reach = 0, visible = false;
    for (var i = 0; i < pair.length; i++) {
      var c = centreAt(pair[i].box, pair[i].from, pair[i].to, p);
      var s = c.s * pop;
      var cy = c.y + arc - scrollY;
      shot.push({ s: s, x: c.x - window.scrollX, y: cy });
      reach = Math.max(reach, pair[i].box.h * s);
      if (alpha[i] > 0) visible = true;
    }

    if (!visible ||
        shot[0].y - reach > window.innerHeight || shot[1].y + reach < 0) {
      blank(); return;
    }

    var key = k + ':' + Math.round(shot[1].x) + ':' + Math.round(shot[1].y) +
              ':' + Math.round(shot[1].s * 1000) + ':' + Math.round(fade * 100) +
              ':' + Math.round(tilt * 1000);
    if (key === lastKey) return;
    lastKey = key;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (i = 0; i < pair.length; i++) {
      if (alpha[i] <= 0) continue;
      drawPose(pair[i].img, pair[i].box, shot[i].s,
               shot[i].x, shot[i].y, tilt, alpha[i]);
    }
  }

  function onResize() { measure(); lastKey = ''; cur = readScroll(); render(); }

  var useGsap = !!(window.gsap && window.ScrollTrigger);

  function wire() {
    if (!useGsap) {
      var raw = function () { cur = readScroll(); render(); };
      window.addEventListener('scroll', raw, { passive: true });
      raw();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    /* One scrub per leap: section N's top → section N+1's top. That is exactly
       where Figma places the two poses, so the boy is on his marks at both
       ends and leaps in between. */
    segs.forEach(function (seg, i) {
      ScrollTrigger.create({
        trigger: document.body,
        start: function () { return tops[i]; },
        end:   function () { return tops[i + 1]; },
        scrub: true,
        onUpdate: function (self) { cur = { k: i, p: self.progress }; },
        onRefresh: function () { measure(); lastKey = ""; }
      });
    });

    /* Redraw on GSAP's ticker so the canvas follows the smoothed scrub. */
    gsap.ticker.add(render);
    cur = readScroll();
  }

  window.addEventListener('resize', function () {
    if (useGsap) ScrollTrigger.refresh(); else onResize();
  });
  window.addEventListener('load', onResize);

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
