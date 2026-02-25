import twemoji from '@twemoji/api';
import { isLegacyWebOS } from './webos-utils.js';
import { configRead, configAddChangeListener } from './config.js';
import './emoji-font.css';

const DEBUG_EMOJI_DOM = false;

// ONLY look for the invisible markers injected by adblock.js
const WRAPPED_EMOJI_RE = /\u200B([^\u200C]+)\u200C/; // Note: Removed global 'g' flag for precise splitText matching
const HAS_WRAPPED_EMOJI_RE = /\u200B[^\u200C]+\u200C/;
const IMG_ALT_RE = /<img([^>]+)alt="([^"]+)"([^>]*)>/g;

const parsedTextCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

const textNodesToProcess = new Set<Node>();
const nodeToSpan = new WeakMap<Node, HTMLElement>();

let frameId: number | null = null;
let isParsing = false;

const twemojiOptions = {
  callback: function(icon: string) {
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/16.0.1/72x72/${icon}.png`;
  }
};

function queueTextNode(node: Node): void {
  const val = node.nodeValue;
  if (!val || !HAS_WRAPPED_EMOJI_RE.test(val)) return;

  const parent = node.parentElement;
  if (!parent || parent.classList.contains('twemoji-injected')) return;

  textNodesToProcess.add(node);
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
  if (!textNode.parentNode) return;

  const parent = textNode.parentNode as HTMLElement;
  if (parent.classList?.contains('twemoji-injected')) return;

  let currentNode = textNode as Text;
  let match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');

  // Using splitText() prevents nuking the surrounding words. 
  // It perfectly isolates the emoji into its own text node, keeping YouTube's Polymer math happy.
  while (match) {
    const startIndex = match.index;
    const emojiLength = match[0].length;
    const cleanEmoji = match[1]; // The emoji without \u200B and \u200C

    // 1. Slice off any normal text BEFORE the emoji
    if (startIndex > 0) {
      currentNode = currentNode.splitText(startIndex);
    }

    // 2. Slice off any normal text AFTER the emoji
    let nextNode: Text | null = null;
    if (currentNode.nodeValue!.length > emojiLength) {
      nextNode = currentNode.splitText(emojiLength);
    }

    // currentNode is now EXACTLY just "\u200B[EMOJI]\u200C"
    
    let parsedHTML = parsedTextCache.get(cleanEmoji);
    if (!parsedHTML) {
      let twemojiHTML = twemoji.parse(cleanEmoji, twemojiOptions);

      if (twemojiHTML !== cleanEmoji) {
        parsedHTML = twemojiHTML.replace(IMG_ALT_RE, (_match, beforeAlt, altText, afterAlt) => {
          const hiddenText = `<span class="twemoji-hidden-text">\u200B${altText}\u200C</span>`;
          return `<img${beforeAlt}alt="${altText}"${afterAlt}>${hiddenText}`;
        });
        
        parsedTextCache.set(cleanEmoji, parsedHTML);
        if (parsedTextCache.size > MAX_CACHE_SIZE) {
          const firstKey = parsedTextCache.keys().next().value;
          if (firstKey) parsedTextCache.delete(firstKey);
        }
      } else {
        parsedHTML = cleanEmoji;
      }
    }

    if (parsedHTML !== cleanEmoji) {
      currentNode.nodeValue = '';

      let existingSpan = nodeToSpan.get(currentNode);

      if (existingSpan && existingSpan.parentNode === parent) {
        existingSpan.innerHTML = parsedHTML;
        if (DEBUG_EMOJI_DOM) console.log('[Emoji-DOM-Debug] Replaced emoji in existing span.');
      } else {
        existingSpan = document.createElement('emoji-render');
        existingSpan.className = 'twemoji-injected';
        existingSpan.innerHTML = parsedHTML;
        
        // Insert right next to the zeroed-out text node
        parent.insertBefore(existingSpan, currentNode.nextSibling);
        nodeToSpan.set(currentNode, existingSpan);
        if (DEBUG_EMOJI_DOM) console.log('[Emoji-DOM-Debug] Injected new emoji-render span for:', cleanEmoji);
      }
    }

    // Move to the next slice of text if there's more in the original string
    if (nextNode && HAS_WRAPPED_EMOJI_RE.test(nextNode.nodeValue || '')) {
      currentNode = nextNode;
      match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');
    } else {
      break; // No more emojis in this block
    }
  }
}

function scanElement(el: Element) {
    const textContent = el.textContent;
    if (!textContent || !HAS_WRAPPED_EMOJI_RE.test(textContent)) return;
    try {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        let tNode: Node | null;
        let queuedCount = 0;
        while ((tNode = walker.nextNode())) {
            queueTextNode(tNode);
            queuedCount++;
        }
        if (DEBUG_EMOJI_DOM && queuedCount > 0) {
            console.log(`[Emoji-DOM-Debug] Found and queued ${queuedCount} text nodes in element:`, el.tagName);
        }
    } catch (err) {
        if (DEBUG_EMOJI_DOM) console.error('[Emoji-DOM-Debug] TreeWalker error:', err);
    }
}

const emojiObs = new MutationObserver((mutations) => {
  if (isParsing) return;

  let addedNodesCount = 0;

  for (let i = 0; i < mutations.length; i++) {
    const mut = mutations[i];

    if (mut.type === 'characterData') {
      queueTextNode(mut.target);
    } else if (mut.type === 'childList') {
      const removedNodes = mut.removedNodes;
      for (let j = 0; j < removedNodes.length; j++) {
        const removed = removedNodes[j];
        if (removed.nodeType === Node.TEXT_NODE) {
          const orphanSpan = nodeToSpan.get(removed);
          if (orphanSpan && orphanSpan.parentNode) {
            orphanSpan.parentNode.removeChild(orphanSpan);
          }
        }
      }

      const addedNodes = mut.addedNodes;
      for (let j = 0; j < addedNodes.length; j++) {
        const node = addedNodes[j];
        addedNodesCount++;
        
        if (node.nodeType === Node.TEXT_NODE) {
          queueTextNode(node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (el.classList?.contains('twemoji-injected')) continue;
          scanElement(el);
        }
      }
    }
  }

  if (DEBUG_EMOJI_DOM && addedNodesCount > 0 && textNodesToProcess.size > 0) {
      console.log(`[Emoji-DOM-Debug] MutationObserver processed added nodes. Text nodes queued: ${textNodesToProcess.size}`);
  }

  if (textNodesToProcess.size > 0 && frameId === null) {
    frameId = window.requestAnimationFrame(processQueue);
  }
});

if (document.characterSet === 'UTF-8' && isLegacyWebOS()) {
  const style = document.createElement('style');
  style.id = 'legacy-webos-font-fix';
  style.styleSheet ? (style.styleSheet.cssText = "") : (style.textContent = `
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
  `);
  document.head.appendChild(style);

  const toggleEmojiObserver = () => {
    if (configRead('enableLegacyEmojiFix')) {
      emojiObs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      scanElement(document.body);
      if (textNodesToProcess.size > 0 && frameId === null) {
        frameId = window.requestAnimationFrame(processQueue);
      }
      
      if (DEBUG_EMOJI_DOM) console.log('[Emoji-Debug] Legacy Emoji fix enabled.');
    } else {
      emojiObs.disconnect();
      textNodesToProcess.clear();
      parsedTextCache.clear();
      if (DEBUG_EMOJI_DOM) console.log('[Emoji-Debug] Legacy Emoji fix disabled.');
    }
  };

  toggleEmojiObserver();
  configAddChangeListener('enableLegacyEmojiFix', toggleEmojiObserver);
}