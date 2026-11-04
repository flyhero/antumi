(() => {
  const config = JSON.parse(document.getElementById('antumi-visualization-config').textContent);
  const bridge = config.bridgeId;
  const pending = new Map();
  const panels = new Map();
  let sequence = 0;
  let heightFrame = 0;
  const emit = (kind, data = {}) => parent.postMessage({ antumiVisualization: bridge, kind, ...data }, '*');
  const request = (kind, data) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Visualization request timed out')); }, 60_000);
    pending.set(id, { resolve, reject, timeout });
    emit(kind, { ...data, id });
  });
  function theme(value) {
    document.documentElement.style.colorScheme = value.scheme;
    for (const [name, color] of Object.entries(value.variables)) if (name.startsWith('--') && typeof color === 'string') document.documentElement.style.setProperty(name, color);
  }
  theme(config.theme);
  globalThis.openai = {
    widgetState: config.state ?? null,
    theme: config.theme.scheme,
    displayMode: 'inline',
    setWidgetState: async (state) => {
      const normalized = JSON.parse(JSON.stringify(state));
      if (JSON.stringify(normalized).length > 16_384) throw new Error('Visualization state is too large');
      await request('state', { state: normalized });
      globalThis.openai.widgetState = normalized;
    },
    sendFollowUpMessage: ({ prompt, title }) => request('followup', { prompt, title }),
    requestDisplayMode: ({ mode }) => request('display', { mode }),
    callTool: () => Promise.reject(new Error('Inline visualizations cannot call tools'))
  };
  function publishPanels() {
    emit('controls', { panels: [...panels.values()].filter(panel => panel.element.isConnected && !panel.element.closest('[hidden]')).map(panel => ({ id: panel.id, label: panel.element.getAttribute('aria-label') || '', controls: panel.controls.map(({ object, property, ...control }) => ({ ...control, value: object[property] })) })) });
  }
  globalThis.Tweak = class {
    constructor({ container, onChange }) {
      if (!(container instanceof Element) || container.ownerDocument !== document) throw new TypeError('Tweak requires an element');
      this.id = String(++sequence);
      panels.set(this.id, { id: this.id, element: container, onChange, controls: [] });
    }
    get supported() { return true; }
    add(propertyType, object, property, options) {
      const panel = panels.get(this.id);
      if (!panel || [...panels.values()].reduce((sum, p) => sum + p.controls.length, 0) >= 36) return this;
      const normalized = propertyType === 'select' ? { ...options, options: options.options.map(option => typeof option === 'string' ? { value: option, label: option } : option) } : options;
      panel.controls.push({ ...normalized, id: String(++sequence), type: propertyType, object, property, label: options.label || property });
      queueMicrotask(publishPanels);
      return this;
    }
    addSlider(object, property, options) { return this.add('range', object, property, options); }
    addColorPicker(object, property, options) { return this.add('color', object, property, options); }
    addToggle(object, property, options) { return this.add('toggle', object, property, options); }
    addSelect(object, property, options) { return this.add('select', object, property, options); }
    dispose() { panels.delete(this.id); publishPanels(); }
  };
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || !data || data.antumiVisualization !== bridge) return;
    if (data.kind === 'response') {
      const wait = pending.get(data.id);
      if (wait) { clearTimeout(wait.timeout); pending.delete(data.id); data.error ? wait.reject(new Error(data.error)) : wait.resolve(data.result); }
    } else if (data.kind === 'theme') {
      theme(data.theme);
      globalThis.openai.theme = data.theme.scheme;
      window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: { theme: data.theme.scheme, visualizationTheme: data.theme.scheme, visualizationStyleVariables: data.theme.variables } } }));
    } else if (data.kind === 'control') {
      const panel = panels.get(data.panel);
      const control = panel?.controls.find(control => control.id === data.control);
      if (!control) return;
      const value = data.value;
      const valid = control.type === 'range' ? Number.isFinite(value) && value >= control.min && value <= control.max : control.type === 'toggle' ? typeof value === 'boolean' : control.type === 'color' ? typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) : control.options.some(option => option.value === value);
      if (!valid) return;
      control.object[control.property] = value;
      try { panel.onChange?.(); } catch (error) { emit('error', { message: String(error) }); }
      publishPanels();
    }
  });
  window.addEventListener('error', event => { if (event.message) emit('error', { message: event.message }); });
  window.addEventListener('unhandledrejection', event => emit('error', { message: String(event.reason) }));
  // Navigation and follow-up messages go through the host; no page can open the user's browser.
  document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault(); }, true);
  document.addEventListener('submit', event => event.preventDefault(), true);
  function reportHeight() {
    cancelAnimationFrame(heightFrame);
    heightFrame = requestAnimationFrame(() => emit('height', { height: Math.min(10_000, Math.max(document.body?.scrollHeight || 0, document.body?.getBoundingClientRect().height || 0)) }));
  }
  function initialize() {
    globalThis.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
    for (const root of document.querySelectorAll('.viz-carousel')) {
      const variants = [...root.children].filter(child => child.hasAttribute('data-variant'));
      if (variants.length < 2) continue;
      const controls = document.createElement('div'); controls.className = 'viz-carousel-controls';
      const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹'; previous.setAttribute('aria-label', root.dataset.previousLabel || 'Previous design');
      const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', root.dataset.nextLabel || 'Next design');
      const count = document.createElement('span'); count.className = 'viz-carousel-count'; count.setAttribute('aria-live', 'polite');
      const picker = document.createElement('select'); picker.setAttribute('aria-label', root.getAttribute('aria-label') || 'Design');
      variants.forEach((variant, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = variant.dataset.variant; picker.append(option); });
      let current = 0;
      const select = index => { current = (index + variants.length) % variants.length; variants.forEach((variant, i) => { variant.hidden = i !== current; }); picker.value = String(current); count.textContent = `${current + 1} / ${variants.length}`; publishPanels(); reportHeight(); };
      previous.addEventListener('click', () => select(current - 1)); next.addEventListener('click', () => select(current + 1)); picker.addEventListener('change', () => select(Number(picker.value)));
      controls.append(previous, count, picker, next); root.append(controls); select(0);
    }
    for (const tablist of document.querySelectorAll('[role="tablist"]')) {
      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const select = target => {
        const selectedPanel = document.getElementById(target.getAttribute('aria-controls'));
        for (const tab of tabs) {
          const active = tab === target; tab.setAttribute('aria-selected', String(active)); tab.classList.toggle('active', active); tab.tabIndex = active ? 0 : -1;
          const panel = document.getElementById(tab.getAttribute('aria-controls')); if (panel) panel.hidden = panel !== selectedPanel;
        }
        reportHeight();
      };
      tabs.forEach((tab, index) => { tab.addEventListener('click', () => select(tab)); tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]; select(next); next.focus(); }); });
    }
    let tooltip = null;
    function hideTooltip() { tooltip?.remove(); tooltip = null; }
    document.addEventListener('pointerover', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
      if (!target) return;
      hideTooltip(); tooltip = document.createElement('div'); tooltip.className = 'viz-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = target.dataset.tooltip; document.body.append(tooltip);
      const box = target.getBoundingClientRect(); tooltip.style.top = `${window.scrollY + box.bottom + 4}px`; tooltip.style.left = `${Math.max(0, Math.min(box.left, innerWidth - tooltip.offsetWidth))}px`;
    });
    document.addEventListener('pointerout', hideTooltip);
    const resize = new ResizeObserver(reportHeight); resize.observe(document.body);
    const mutation = new MutationObserver(() => { publishPanels(); reportHeight(); }); mutation.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    reportHeight(); publishPanels(); emit('ready');
  }
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
