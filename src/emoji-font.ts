import twemoji from '@twemoji/api';
import { isLegacyWebOS } from './webos-utils.js';
import { configRead, configAddChangeListener } from './config.js';
import './emoji-font.css';

const MAYBE_EMOJI_RE = /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
const CLEAN_TEXT_RE = /[\u200C\u200E\u200F\u202A-\u202E\u2060\uFEFF]/g;
const IMG_ALT_RE = /<img([^>]+)alt="([^"]+)"([^>]*)>/g;
const TARGET_CONTAINER = 'yt-formatted-string';

// Memory Cache for pre-processed text to guarantee instantaneous re-renders
const parsedTextCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

const textNodesToProcess = new Set<Node>();
const nodeToSpan = new WeakMap<Node, HTMLElement>();

let frameId: number | null = null;
let isParsing = false;

const twemojiOptions = {
  callback: function(icon: string) {
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/15.1.0/72x72/${icon}.png`;
  }
};

function queueTextNode(node: Node): void {
  const val = node.nodeValue;
  if (!val || val === '\u200B' || !MAYBE_EMOJI_RE.test(val)) return;

  const parent = node.parentElement;
  if (!parent || parent.classList.contains('twemoji-injected')) return;

  if (parent.closest(TARGET_CONTAINER)) {
    textNodesToProcess.add(node);
  }
}

function processQueue(): void {
  isParsing = true;

  for (const textNode of textNodesToProcess) {
    processTextNode(textNode);
  }

  textNodesToProcess.clear();
  isParsing = false;
  frameId = null;
}

function processTextNode(textNode: Node): void {
  if (!document.body.contains(textNode) || !textNode.parentNode) return;

  const parent = textNode.parentNode as HTMLElement;
  if (parent.classList?.contains('twemoji-injected')) return;

  const originalText = textNode.nodeValue || '';
  if (originalText.trim().length === 0 || originalText === '\u200B' || !MAYBE_EMOJI_RE.test(originalText)) return;

  try {
    const cleanText = originalText.replace(CLEAN_TEXT_RE, '');
    let parsedHTML = parsedTextCache.get(cleanText);

    if (!parsedHTML) {
      let rawHTML = twemoji.parse(cleanText, twemojiOptions);

      if (rawHTML !== cleanText) {
        parsedHTML = rawHTML.replace(IMG_ALT_RE, (_match, beforeAlt, altText, afterAlt) => {
          const hiddenText = `<span style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);border:0;">${altText}</span>`;
          return `<img${beforeAlt}${afterAlt}>${hiddenText}`;
        });

        parsedTextCache.set(cleanText, parsedHTML);
        if (parsedTextCache.size > MAX_CACHE_SIZE) {
          const firstKey = parsedTextCache.keys().next().value;
          if (firstKey) parsedTextCache.delete(firstKey);
        }
      } else {
        parsedTextCache.set(cleanText, cleanText);
        parsedHTML = cleanText;
      }
    }

    if (parsedHTML !== cleanText || cleanText !== originalText) {
      textNode.nodeValue = '\u200B';

      let existingSpan = nodeToSpan.get(textNode);

      const siblings = parent.childNodes;
      for (let i = siblings.length - 1; i >= 0; i--) {
          const child = siblings[i];
          if (child.nodeType === Node.ELEMENT_NODE && (child as Element).classList.contains('twemoji-injected')) {
              const owner = (child as any)._twemojiOwnerNode;
              if (!owner || owner.parentNode !== parent || (owner === textNode && child !== existingSpan)) {
                  parent.removeChild(child);
              }
          }
      }

      if (existingSpan && existingSpan.parentNode === parent) {
        existingSpan.innerHTML = parsedHTML;
      } else {
        // We use a custom <emoji-render> tag instead of <span>. 
        // This makes us completely immune to YouTube's "yt-formatted-string > span" flexbox CSS rules.
        existingSpan = document.createElement('emoji-render');
        existingSpan.className = 'twemoji-injected';
        existingSpan.innerHTML = parsedHTML;
        // Bind this injected element to the specific text node that spawned it
        (existingSpan as any)._twemojiOwnerNode = textNode;
        parent.insertBefore(existingSpan, textNode.nextSibling);
        nodeToSpan.set(textNode, existingSpan);
      }
    }
  } catch (err) {
    console.error('[Emoji-Debug] Error processing text node:', err);
  }
}

const emojiObs = new MutationObserver((mutations) => {
  if (isParsing) return;

  for (let i = 0; i < mutations.length; i++) {
    const mut = mutations[i];

    if (mut.type === 'characterData') {
      queueTextNode(mut.target);
    } else if (mut.type === 'childList') {
      const addedNodes = mut.addedNodes;
      for (let j = 0; j < addedNodes.length; j++) {
        const node = addedNodes[j];

        if (node.nodeType === Node.TEXT_NODE) {
          queueTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (el.classList?.contains('twemoji-injected')) continue;

          const textContent = el.textContent;
          if (!textContent || !MAYBE_EMOJI_RE.test(textContent)) continue;

          try {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            let tNode: Node | null;
            while ((tNode = walker.nextNode())) {
              queueTextNode(tNode);
            }
          } catch (err) {
            console.error('[Emoji-Debug] TreeWalker error:', err);
          }
        }
      }
    }
  }

  if (textNodesToProcess.size > 0 && frameId === null) {
    frameId = window.requestAnimationFrame(processQueue);
  }
});

if (document.characterSet === 'UTF-8' && isLegacyWebOS()) {
  const style = document.createElement('style');
  style.id = 'legacy-webos-font-fix';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Math&display=swap');
    yt-formatted-string, .yt-tv-text, .video-title, .title, #title, .description, #description, .video-title-text, .badge-text {
        font-family: 'Roboto', 'YouTube Noto', 'YouTube Sans', 'Arial', 'Noto Sans Math', sans-serif !important;
    }
    emoji-render.twemoji-injected {
        display: inline !important;
        margin: 0 !important;
        padding: 0 !important;
        vertical-align: baseline !important;
    }
  `;
  document.head.appendChild(style);

  const toggleEmojiObserver = () => {
    if (configRead('enableLegacyEmojiFix')) {
      emojiObs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
      console.log('[Emoji-Debug] Legacy Emoji fix enabled.');
    } else {
      emojiObs.disconnect();
      textNodesToProcess.clear();
      parsedTextCache.clear();
      console.log('[Emoji-Debug] Legacy Emoji fix disabled.');
    }
  };

  toggleEmojiObserver();
  configAddChangeListener('enableLegacyEmojiFix', toggleEmojiObserver);
}