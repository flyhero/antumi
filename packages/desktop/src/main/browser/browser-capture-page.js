// Runs inside the inspected page; kept separate from Electron main’s Node types.
const captureBrowserPage = async (_root, { mode, key, accent }) => {
  const describe = (element, text) => {
    const clone = element?.cloneNode(true);
    if (clone instanceof Element) {
      for (const node of [clone, ...clone.querySelectorAll("input,textarea,script,style")]) {
        node.removeAttribute("value");
        if (node.matches("textarea,script,style")) node.textContent = "";
      }
    }
    const css = element ? getComputedStyle(element) : null;
    const properties = ["display", "position", "width", "height", "margin", "padding", "gap", "font-family", "font-size", "font-weight", "line-height", "color", "background-color", "border", "border-radius", "align-items", "justify-content"];
    const selector = element ? element.id ? `#${CSS.escape(element.id)}` : `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 4).map((name) => `.${CSS.escape(name)}`).join("")}` : null;
    return { url: location.href.slice(0, 4096), title: document.title.slice(0, 500), text: text.slice(0, 16e3), selector: selector?.slice(0, 2e3) ?? null, html: clone instanceof Element ? clone.outerHTML.slice(0, 16e3) : "", styles: Object.fromEntries(css ? properties.map((name) => [name, css.getPropertyValue(name)]) : []) };
  };
  if (mode === "page") return { context: describe(null, ""), clip: null };
  if (mode === "selection") {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text) return null;
    const node = selection?.anchorNode;
    return { context: describe(node instanceof Element ? node : node?.parentElement ?? null, text), clip: null };
  }
  return await new Promise((resolve) => {
    const glass = document.createElement("div");
    const box = document.createElement("div");
    Object.assign(glass.style, { position: "fixed", inset: "0", zIndex: "2147483647", cursor: mode === "region" ? "crosshair" : "default", touchAction: "none" });
    Object.assign(box.style, { position: "fixed", pointerEvents: "none", border: `2px solid ${accent}`, boxSizing: "border-box" });
    glass.append(box);
    document.documentElement.append(glass);
    let target = null;
    let start = null;
    const finish = (result) => {
      clearTimeout(timer);
      glass.remove();
      document.removeEventListener("keydown", escape, true);
      Reflect.deleteProperty(window, key);
      resolve(result);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(null);
      }
    };
    const timer = setTimeout(() => finish(null), 6e4);
    Reflect.set(window, key, () => finish(null));
    document.addEventListener("keydown", escape, true);
    const rect = (x, y, width, height) => Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    glass.addEventListener("pointermove", (event) => {
      if (mode === "region") {
        if (start) rect(Math.min(start.x, event.clientX), Math.min(start.y, event.clientY), Math.abs(start.x - event.clientX), Math.abs(start.y - event.clientY));
        return;
      }
      glass.style.pointerEvents = "none";
      target = document.elementFromPoint(event.clientX, event.clientY);
      glass.style.pointerEvents = "auto";
      if (target) {
        const b = target.getBoundingClientRect();
        rect(b.x, b.y, b.width, b.height);
      }
    });
    glass.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      start = { x: event.clientX, y: event.clientY };
      glass.setPointerCapture(event.pointerId);
    });
    glass.addEventListener("pointerup", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (mode === "element" && target) {
        const b = target.getBoundingClientRect();
        const x = Math.max(0, b.x), y = Math.max(0, b.y);
        const width = Math.min(innerWidth, b.right) - x, height = Math.min(innerHeight, b.bottom) - y;
        finish({ context: describe(target, target.textContent?.trim() ?? ""), clip: width > 0 && height > 0 ? { x, y, width, height } : null });
      } else if (mode === "region" && start) {
        const x = Math.max(0, Math.min(start.x, event.clientX)), y = Math.max(0, Math.min(start.y, event.clientY));
        const width = Math.min(innerWidth - x, Math.abs(start.x - event.clientX)), height = Math.min(innerHeight - y, Math.abs(start.y - event.clientY));
        finish(width >= 3 && height >= 3 ? { context: describe(null, ""), clip: { x, y, width, height } } : null);
      } else finish(null);
    });
  });
};
export {
  captureBrowserPage
};
