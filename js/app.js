/* Kidysport — UI behaviour (menu, FAQ accordion, in-page links) */
(function () {
  'use strict';

  /* --- mobile menu ------------------------------------------------------
     One header per page — but the single-file preview holds all six pages in
     one document, so `document.querySelector` wired the first burger and left
     the other five doing nothing but their hover animation. Wire each header
     to the menu inside it, and rename the ids the preview duplicates so
     aria-controls still points at the panel that actually opens. */
  var closers = [];

  Array.prototype.forEach.call(document.querySelectorAll('.site-hdr'), function (hdr, i) {
    var burger = hdr.querySelector('.hdr__burger');
    var menu   = hdr.querySelector('.m-menu');
    if (!burger || !menu) return;

    if (i > 0) menu.id = 'm-menu-' + i;
    burger.setAttribute('aria-controls', menu.id);

    function set(open) {
      burger.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
    }

    burger.addEventListener('click', function () {
      set(burger.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) set(false);
    });

    closers.push(function () { set(false); });
  });

  /* Switching view in the preview leaves the menu it was opened from standing
     open behind the new page. */
  function closeMenus() { closers.forEach(function (f) { f(); }); }
  window.addEventListener('hashchange', closeMenus);

  /* --- FAQ: one row open at a time, and the page grows/shrinks with it ---
     The layout is an absolute artboard, so nothing below the list would move
     on its own. The artboard reserves room for exactly one open answer (as the
     Figma frame draws it), so we publish the difference from that baseline and
     the sections after the list ride on it. */
  var items = Array.prototype.slice.call(document.querySelectorAll('.fq'));
  var lists = Array.prototype.slice.call(document.querySelectorAll('.faq__list'));
  var baselines = [];

  /* There is one list per page, but the single-file preview holds every page
     in one document — so measure whichever list is actually on screen, and
     keep a baseline per list. */
  function currentList() {
    for (var i = 0; i < lists.length; i++) if (lists[i].offsetParent) return i;
    return lists.length ? 0 : -1;
  }

  function syncFaqHeight() {
    var n = currentList();
    if (n < 0) return;
    var h = lists[n].getBoundingClientRect().height;
    if (baselines[n] == null) baselines[n] = h;   // load state == the artboard
    var delta = Math.round(h - baselines[n]);
    document.documentElement.style.setProperty('--faq-shift', delta + 'px');
    /* The delta needs a baseline, which is awkward when the single-file
       preview holds every page at once. The list's own height needs none,
       so pages that can use it directly do. */
    document.documentElement.style.setProperty('--faq-list-h', Math.round(h) + 'px');
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  items.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) {
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      }
      syncFaqHeight();
    });
  });

  if (lists.length) {
    window.addEventListener('load', syncFaqHeight);
    window.addEventListener('resize', function () { baselines = []; syncFaqHeight(); });
    syncFaqHeight();
  }

  /* --- the health-fund bar -----------------------------------------------
     The desktop artboard draws it as a panel over the pinned scene, so it has
     to be inside the stage there. The phone and tablet frames put it after the
     scene, in a section of its own, where a child of a pinned box cannot go.
     Rather than carry the bar twice in the markup, the one bar moves. */
  var fundsBar   = document.querySelector('.funds');
  var fundsHost  = document.querySelector('.do-funds');
  var fundsStage = document.querySelector('.gets-stage');
  if (fundsBar && fundsHost && fundsStage) {
    var wide = window.matchMedia('(min-width: 1200px)');
    var placeFunds = function () {
      (wide.matches ? fundsStage : fundsHost).appendChild(fundsBar);
    };
    if (wide.addEventListener) wide.addEventListener('change', placeFunds);
    else if (wide.addListener) wide.addListener(placeFunds);
    placeFunds();
  }

  /* --- smooth in-page navigation --------------------------------------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute('href');
    if (id === '#' || id.length < 2) return;
    /* Anything that is not a real target on this page is left alone — the
       single-file preview routes between pages through the hash, and those
       must reach their own handler rather than being treated as an anchor. */
    var target = null;
    try { target = document.querySelector(id); } catch (err) { return; }
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });
})();
