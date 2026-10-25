// From a wrapped emoji to twemoji image tokens, and from tokens to DOM: plain
// data in between, so nothing that arrived in a video title can become markup.
import twemoji from '@twemoji/api';

const twemojiOptions = {
  /**
   * The twemoji image URL of an emoji code (the 16.0.1 set on cdnjs, which must match
   * @twemoji/api).
   */
  callback: function (icon) {
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/16.0.1/72x72/${icon}.png`;
  }
};

// Cache emoji -> token list, not an HTML string. Tokens are plain data, so
// rendering is createElement + createTextNode with no HTML parser in the loop:
// nothing that arrived in a video title can become markup.
export const parsedTextCache = new Map();
export const MAX_CACHE_SIZE = 500;

/** @returns {Array<{text?: string, src?: string, alt?: string, cls?: string}>} */
export function tokenizeEmoji(cleanEmoji) {
  const scratch = document.createElement('span');
  scratch.textContent = cleanEmoji; // textContent, never innerHTML
  twemoji.parse(scratch, twemojiOptions); // element form: DOM APIs, no HTML

  const tokens = [];
  const kids = scratch.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.nodeType === 1 && n.tagName === 'IMG') {
      tokens.push({
        src: n.getAttribute('src'),
        alt: n.getAttribute('alt') || '',
        cls: n.className || 'emoji'
      });
    } else if (n.nodeValue) {
      tokens.push({ text: n.nodeValue });
    }
  }
  return tokens;
}

/**
 * Fills `target` with the tokens: text as text nodes, each emoji as an <img> with a hidden text
 * twin for search and accessibility.
 */
export function renderTokens(target, tokens) {
  target.textContent = ''; // clears children without touching innerHTML
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text !== undefined) {
      target.appendChild(document.createTextNode(t.text));
      continue;
    }

    const img = document.createElement('img');
    img.className = t.cls;
    img.draggable = false;
    img.src = t.src;
    img.alt = t.alt;
    target.appendChild(img);

    // Hidden-text twin, so the emoji stays readable to search and a11y. The
    // plain emoji, without the sentinels: a rescan of a rendered title then
    // finds nothing wrapped and stops at its text check.
    const hidden = document.createElement('span');
    hidden.className = 'twemoji-hidden-text';
    hidden.appendChild(document.createTextNode(t.alt));
    target.appendChild(hidden);
  }
}
