(() => {
  const storageKey = "petrosim-theme";
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function storedTheme() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === "dark" || value === "light" ? value : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // The selected theme remains active for the current page.
    }
  }

  let activeTheme = storedTheme() || (mediaQuery.matches ? "dark" : "light");
  applyTheme(activeTheme);

  function mountToggle() {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.type = "button";
    button.className = "theme-toggle";
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);

    function updateButton() {
      const dark = activeTheme === "dark";
      const label = dark ? "Ativar modo diurno" : "Ativar modo noturno";
      icon.textContent = dark ? "light_mode" : "dark_mode";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(dark));
    }

    button.addEventListener("click", () => {
      activeTheme = activeTheme === "dark" ? "light" : "dark";
      applyTheme(activeTheme);
      saveTheme(activeTheme);
      updateButton();
    });

    updateButton();
    document.body.append(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle, { once: true });
  } else {
    mountToggle();
  }

  mediaQuery.addEventListener?.("change", (event) => {
    if (storedTheme()) return;
    activeTheme = event.matches ? "dark" : "light";
    applyTheme(activeTheme);
    document.querySelector(".theme-toggle")?.remove();
    mountToggle();
  });
})();
