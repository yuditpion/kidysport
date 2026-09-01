/* The two choosers on the contact form.

   A native <select> is styled by the operating system once it opens — the sheet,
   the highlight and the corners in the design cannot be reached from CSS. So the
   list is built from real elements, and the chosen value rides in a hidden input
   so the form still submits exactly as it did.

   The prompt ("שפה", "אזור מגורים") names the field. It is deliberately not one
   of the options: it is not something a person can pick. */
(function () {
  var picks = [].slice.call(document.querySelectorAll('[data-pick]'));
  if (!picks.length) return;

  picks.forEach(function (root) {
    var btn   = root.querySelector('.pick__btn');
    var value = root.querySelector('.pick__value');
    var list  = root.querySelector('.pick__list');
    var field = root.querySelector('input[type="hidden"]');
    var opts  = [].slice.call(root.querySelectorAll('.pick__opt'));
    var active = -1;

    function open() {
      closeOthers();
      list.hidden = false;
      root.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      mark(opts.findIndex(function (o) { return o.getAttribute('aria-selected') === 'true'; }));
    }
    function close() {
      list.hidden = true;
      root.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      mark(-1);
    }
    function closeOthers() {
      picks.forEach(function (p) {
        if (p === root) return;
        p.classList.remove('is-open');
        p.querySelector('.pick__list').hidden = true;
        p.querySelector('.pick__btn').setAttribute('aria-expanded', 'false');
      });
    }
    /* `mark` is the keyboard's cursor; it is the same highlight the pointer
       gives, so arrowing through reads exactly like hovering. */
    function mark(i) {
      active = i;
      opts.forEach(function (o, n) { o.classList.toggle('is-active', n === i); });
      if (i >= 0) opts[i].scrollIntoView({ block: 'nearest' });
    }
    function choose(i) {
      var o = opts[i]; if (!o) return;
      opts.forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
      o.setAttribute('aria-selected', 'true');
      value.textContent = o.textContent.trim();
      root.classList.add('has-value');
      if (field) field.value = o.dataset.value || o.textContent.trim();
      close();
      btn.focus();
    }
    function reset() {
      opts.forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
      value.textContent = value.dataset.prompt;
      root.classList.remove('has-value');
      if (field) field.value = '';
      close();
    }

    btn.addEventListener('click', function () {
      list.hidden ? open() : close();
    });

    list.addEventListener('click', function (e) {
      var o = e.target.closest('.pick__opt');
      if (o) choose(opts.indexOf(o));
    });
    list.addEventListener('mousemove', function (e) {
      var o = e.target.closest('.pick__opt');
      if (o) mark(opts.indexOf(o));
    });

    root.addEventListener('keydown', function (e) {
      var open_ = !list.hidden;
      if (e.key === 'Escape' && open_) { e.preventDefault(); close(); btn.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open_) { open(); return; }
        var step = e.key === 'ArrowDown' ? 1 : -1;
        mark((active + step + opts.length) % opts.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && open_) {
        e.preventDefault();
        if (active >= 0) choose(active);
        return;
      }
      if (e.key === 'Home' && open_) { e.preventDefault(); mark(0); }
      if (e.key === 'End' && open_)  { e.preventDefault(); mark(opts.length - 1); }
    });

    /* clicking anywhere else puts it away */
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) close();
    });

    var form = root.closest('form');
    if (form) form.addEventListener('reset', function () { setTimeout(reset, 0); });
    root.addEventListener('pick:reset', reset);
  });
})();
