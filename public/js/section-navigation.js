const navigation = document.querySelector(".site-section-nav");

if (navigation) {
  const localLinks = [...navigation.querySelectorAll('a[href^="#"]')];
  const entries = localLinks
    .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
    .filter((entry) => entry.section);

  function setActive(link) {
    localLinks.forEach((item) => {
      const active = item === link;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    });
  }

  localLinks.forEach((link) => link.addEventListener("click", () => setActive(link)));

  let scheduled = false;
  function updateFromScroll() {
    scheduled = false;
    const marker = 170;
    const visible = entries
      .filter(({ section }) => !section.classList.contains("hidden"))
      .filter(({ section }) => section.getBoundingClientRect().top <= marker)
      .at(-1) || entries.find(({ section }) => !section.classList.contains("hidden"));
    if (visible) setActive(visible.link);
  }
  window.addEventListener("scroll", () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateFromScroll);
    }
  }, { passive: true });
  window.addEventListener("hashchange", updateFromScroll);
  requestAnimationFrame(updateFromScroll);
}
