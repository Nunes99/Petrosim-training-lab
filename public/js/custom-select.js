const registry = new Map();

function fieldName(select) {
  const label = select.closest("label");
  if (!label) return "Selecionar opção";
  const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  return textNode?.textContent.trim() || "Selecionar opção";
}

function closeAll(except = null) {
  registry.forEach((component) => {
    if (component !== except) component.close();
  });
}

class CustomSelect {
  constructor(select) {
    this.select = select;
    this.name = fieldName(select);
    this.root = document.createElement("div");
    this.root.className = "im3-select";
    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "im3-select-trigger";
    this.trigger.setAttribute("aria-haspopup", "listbox");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.setAttribute("aria-label", this.name);
    this.valueNode = document.createElement("span");
    this.valueNode.className = "im3-select-value";
    this.arrow = document.createElement("span");
    this.arrow.className = "im3-select-arrow";
    this.arrow.setAttribute("aria-hidden", "true");
    this.menu = document.createElement("div");
    this.menu.className = "im3-select-menu";
    this.menu.hidden = true;
    this.menu.setAttribute("role", "listbox");
    this.menu.setAttribute("aria-label", this.name);
    this.head = document.createElement("div");
    this.head.className = "im3-select-menu-head";
    this.head.innerHTML = "<strong>Selecionar opção</strong><span></span>";
    this.options = document.createElement("div");
    this.options.className = "im3-select-options";
    this.menu.append(this.head, this.options);
    this.trigger.append(this.valueNode, this.arrow);
    this.root.append(this.trigger, this.menu);
    select.classList.add("native-select-enhanced");
    select.tabIndex = -1;
    select.after(this.root);

    this.trigger.addEventListener("click", () => this.toggle());
    this.trigger.addEventListener("keydown", (event) => this.onTriggerKeydown(event));
    this.select.addEventListener("change", () => this.sync());
    this.observer = new MutationObserver(() => this.render());
    this.observer.observe(select, { childList: true, subtree: true, characterData: true });
    this.render();
  }

  render() {
    const fragment = document.createDocumentFragment();
    [...this.select.options].forEach((option, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "im3-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.dataset.value = option.value;
      item.dataset.index = String(index);
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.addEventListener("click", () => this.choose(index));
      item.addEventListener("keydown", (event) => this.onOptionKeydown(event));
      fragment.append(item);
    });
    this.options.replaceChildren(fragment);
    this.head.querySelector("span").textContent = `${this.select.options.length} opções`;
    this.sync();
  }

  sync() {
    const selected = this.select.selectedOptions[0];
    this.valueNode.textContent = selected?.textContent || "Selecionar…";
    this.options.querySelectorAll(".im3-select-option").forEach((item, index) => {
      item.setAttribute("aria-selected", String(index === this.select.selectedIndex));
    });
  }

  toggle() {
    this.menu.hidden ? this.open() : this.close();
  }

  open() {
    closeAll(this);
    this.menu.hidden = false;
    this.root.classList.add("is-open");
    this.trigger.setAttribute("aria-expanded", "true");
    const selected = this.options.querySelector('[aria-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
  }

  close() {
    this.menu.hidden = true;
    this.root.classList.remove("is-open");
    this.trigger.setAttribute("aria-expanded", "false");
  }

  choose(index) {
    const option = this.select.options[index];
    if (!option || option.disabled) return;
    this.select.value = option.value;
    this.select.dispatchEvent(new Event("input", { bubbles: true }));
    this.select.dispatchEvent(new Event("change", { bubbles: true }));
    this.sync();
    this.close();
    this.trigger.focus();
    requestAnimationFrame(syncAll);
  }

  focusOption(index) {
    const items = [...this.options.querySelectorAll(".im3-select-option:not(:disabled)")];
    if (!items.length) return;
    const target = Math.max(0, Math.min(index, items.length - 1));
    items[target].focus();
  }

  onTriggerKeydown(event) {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    this.open();
    const enabled = [...this.options.querySelectorAll(".im3-select-option:not(:disabled)")];
    const selectedIndex = enabled.findIndex((item) => item.getAttribute("aria-selected") === "true");
    this.focusOption(event.key === "ArrowUp" ? enabled.length - 1 : Math.max(selectedIndex, 0));
  }

  onOptionKeydown(event) {
    const enabled = [...this.options.querySelectorAll(".im3-select-option:not(:disabled)")];
    const current = enabled.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? current + 1 : current - 1;
      this.focusOption((next + enabled.length) % enabled.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.focusOption(event.key === "Home" ? 0 : enabled.length - 1);
    } else if (event.key === "Escape" || event.key === "Tab") {
      this.close();
      if (event.key === "Escape") {
        event.preventDefault();
        this.trigger.focus();
      }
    }
  }
}

function syncAll() {
  registry.forEach((component) => component.sync());
}

function initialize() {
  document.querySelectorAll("select").forEach((select) => {
    if (registry.has(select)) return;
    registry.set(select, new CustomSelect(select));
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".im3-select")) closeAll();
  requestAnimationFrame(syncAll);
});
document.addEventListener("change", () => requestAnimationFrame(syncAll));
window.addEventListener("resize", () => closeAll());

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
