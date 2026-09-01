/* The thank-you dialog.

   Both forms on the site open the same one. Submission is intercepted rather
   than allowed through: there is no endpoint behind these forms yet, so letting
   the browser navigate would lose the page and show nothing. When a backend is
   added, send the data first and open this on success.

   Closing returns focus to whatever opened the dialog, because a keyboard user
   who submits and then closes should land back where they were, not at the top
   of the document. */
(function () {
  /* Resolved per form rather than by id. The single-file preview inlines every
     page into one document, so more than one of these exists there and an id
     lookup would always answer with the first — the contact form would open the
     home page's copy. Each form asks its own page for its own dialog. */
  function dialogFor(el, kind) {
    var sel = kind === 'err' ? '.thanks--err' : '.thanks:not(.thanks--err)';
    var page = el.closest('.page');
    return (page && page.querySelector(sel)) || document.querySelector(sel);
  }

  /* A form goes nowhere until every one of its fields has something in it. The
     hidden inputs behind the two choosers count as fields — an untouched
     chooser is an empty one, and the design says so with the same message. */
  function firstEmpty(form) {
    var fields = [].slice.call(form.querySelectorAll('input, textarea'));
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].type === 'hidden') {
        if (!fields[i].value) return fields[i];
      } else if (!String(fields[i].value).trim()) {
        return fields[i];
      }
    }
    return null;
  }

  if (!document.querySelector('.thanks')) return;

  /* The illustration is the one piece of this that is artwork rather than
     markup. Until the file is in place the slot removes itself, so the card
     reads as a finished message instead of showing a broken image. Drop the
     export at site/assets/img/thanks-art.webp and it appears on its own. */
  [].forEach.call(document.querySelectorAll('.thanks__art'), function (img) {
    img.addEventListener('error', function () { img.remove(); });
    if (img.complete && !img.naturalWidth) img.remove();
  });

  var dialog = null, card = null, opener = null, pending = null;

  /* Holding the page still. Switching the root's overflow would do it, but this
     layout is sized off `100vw`, and reclaiming the scrollbar's width grows
     every length behind the veil the instant the dialog opens. Refusing the
     input that would scroll leaves the geometry untouched. */
  var SCROLL_KEYS = { ArrowUp:1, ArrowDown:1, PageUp:1, PageDown:1, Home:1, End:1, ' ':1 };
  function refuse(e) { e.preventDefault(); }
  function lockScroll(on) {
    var m = on ? 'addEventListener' : 'removeEventListener';
    window[m]('wheel', refuse, { passive: false });
    window[m]('touchmove', refuse, { passive: false });
  }

  function open(from, dlg) {
    dialog = dlg;
    card = dialog.querySelector('.thanks__card');
    opener = from || document.activeElement;
    dialog.hidden = false;
    lockScroll(true);
    /* the card takes focus so the close button is one tab away and screen
       readers announce the dialog rather than staying in the form behind it */
    card.setAttribute('tabindex', '-1');
    card.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
  }

  function close() {
    dialog.hidden = true;
    lockScroll(false);
    document.removeEventListener('keydown', onKey);
    var back = pending || opener;
    pending = null;
    if (back && back.focus) {
      /* a chooser has no field to focus, so hand it to its button instead */
      var pick = back.type === 'hidden' && back.closest ? back.closest('[data-pick]') : null;
      (pick ? pick.querySelector('.pick__btn') : back).focus({ preventScroll: true });
    }
    opener = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    /* the dialog is not a scrollable thing, so these would move the page */
    if (SCROLL_KEYS[e.key] && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) { e.preventDefault(); return; }
    if (e.key !== 'Tab') return;
    /* keep the tab ring inside the dialog while it is open */
    var focusable = card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) { e.preventDefault(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  document.addEventListener('click', function (e) {
    if (dialog && !dialog.hidden && e.target.closest('[data-thanks-close]')) close();
  });

  [].forEach.call(document.querySelectorAll('form'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var missing = firstEmpty(form);
      if (missing) {
        open(document.activeElement, dialogFor(form, 'err'));
        /* remember what to go back to, so closing the message lands on the
           field that stopped it rather than on the send button */
        pending = missing;
        return;
      }
      open(document.activeElement, dialogFor(form));
      form.reset();
    });
  });
})();
