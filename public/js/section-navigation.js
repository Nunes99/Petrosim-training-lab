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

  const observer = new IntersectionObserver((observed) => {
    const visible = observed
      .filter((item) => item.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    const entry = entries.find((item) => item.section === visible?.target);
    if (entry) setActive(entry.link);
  }, { rootMargin: "-18% 0px -58% 0px", threshold: [0, .15, .35, .6] });

  entries.forEach(({ section }) => observer.observe(section));
  if (entries[0]) setActive(entries[0].link);
}
