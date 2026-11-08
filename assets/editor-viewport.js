/* iPad only: keep rails inside Safari's visible viewport, not its large vh. */
(() => {
  const isIPad = /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIPad) return;
  const root = document.documentElement;
  let frame = 0;
  function sync() {
    frame = 0;
    if (window.innerWidth <= 640) {
      root.style.removeProperty('--desktop-viewport-height');
      return;
    }
    const viewport = window.visualViewport;
    // Browser pinch zoom must not resize/reflow the underlying application.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = Math.max(1, Math.round(viewport ? viewport.height : window.innerHeight));
    const value = height + 'px';
    if (root.style.getPropertyValue('--desktop-viewport-height') === value) return;
    root.style.setProperty('--desktop-viewport-height', value);
    window.dispatchEvent(new Event('editorviewportchange'));
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }
  sync();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.addEventListener('pageshow', schedule, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
})();
