/* Kidysport — UI behaviour (menu, FAQ accordion, in-page links) */
(function () {
  'use strict';

  /* --- mobile menu ------------------------------------------------------ */
  var burger = document.querySelector('.hdr__burger');
  var menu   = document.getElementById('m-menu');

  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      menu.hidden = open;
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        burger.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
      }
    });
  }

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
