/* Every coordinate on the artboard is a multiple of `--u`, and `--u` comes from
   `100vw`, so the column is only centred if `100vw` is the width the document
   can actually use. Whether it is comes down to the scrollbar.

   main.css sets `overflow-y: scroll` on the root, and the spec says viewport
   units then resolve against a viewport whose scrollbars are assumed to exist
   — so `100vw` already excludes the gutter and no correction is needed. That
   is why `--sbw` defaults to 0px: on a conforming browser this file changes
   nothing and there is no reflow.

   It exists for the browser that does not do that, and it does not guess at
   which one that is: it measures a real `100vw` box against the width the
   document actually has and publishes the difference, which is zero when the
   two already agree and exactly one scrollbar when they do not. */
(function () {
  var root = document.documentElement;

  function correct() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:-9999px;left:0;width:100vw;' +
                          'height:0;visibility:hidden;pointer-events:none';
    root.appendChild(probe);
    var drift = probe.getBoundingClientRect().width - root.clientWidth;
    root.removeChild(probe);
    root.style.setProperty('--sbw', Math.max(0, Math.round(drift)) + 'px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', correct);
  } else {
    correct();
  }
  /* the gutter can change with zoom, and on Windows with the pointer type */
  addEventListener('resize', correct);
})();
