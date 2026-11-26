// The element factory the UI builds with: the options panel and its pages,
// the toasts, the OLED overlay and the SponsorBlock popup.

/**
 * Builds an element: `props` sets attributes and properties, with `class`, `text`, `style` (an
 * object) and `events` (type to listener) handled specially; strings among `children` become text
 * nodes.
 */
export const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);

  // Object.keys and index loops, not for...of over Object.entries: in the
  // legacy build that was the Object.entries polyfill (Chromium 38 has none),
  // an array per property and a destructuring helper call, for every
  // property of every element the panel builds.
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = props[key];
    if (key === 'style' && typeof val === 'object') {
      const names = Object.keys(val);
      for (let j = 0; j < names.length; j++) el.style[names[j]] = val[names[j]];
    } else if (key === 'class') el.className = val;
    else if (key === 'events' && typeof val === 'object') {
      const types = Object.keys(val);
      for (let j = 0; j < types.length; j++) el.addEventListener(types[j], val[types[j]]);
    } else if (key === 'text') el.textContent = val;
    else el[key] = val;
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
};
