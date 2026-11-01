/* Theme preference is UI state, deliberately separate from image/recipe state. */
(function () {
  const key = "graphicTextureCanvasTheme";
  const root = document.documentElement;
  let theme = "dark";
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (_error) {}
  root.dataset.canvasTheme = theme;

  function bind() {
    const button = document.getElementById("canvasThemeToggle");
    if (!button) return;
    function sync() {
      const light = root.dataset.canvasTheme === "light";
      button.setAttribute("aria-pressed", String(light));
      button.setAttribute("aria-label", light ? "切换为深色画布" : "切换为浅色画布");
      button.title = light ? "Dark canvas" : "Light canvas";
    }
    sync();
    button.addEventListener("click", function () {
      theme = root.dataset.canvasTheme === "light" ? "dark" : "light";
      root.dataset.canvasTheme = theme;
      try { localStorage.setItem(key, theme); } catch (_error) {}
      sync();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
