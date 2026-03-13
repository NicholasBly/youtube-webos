import twemoji from '@twemoji/api';
import { getWebOSVersion } from './webos-utils.js';
import { configRead, configAddChangeListener } from './config.js';
import './emoji-font.css';

const DEBUG_EMOJI_DOM = false;

const WRAPPED_EMOJI_RE = /\u200B([^\u200C]+)\u200C/; 
const HAS_WRAPPED_EMOJI_RE = /\u200B[^\u200C]+\u200C/;
const IMG_ALT_RE = /<img([^>]+)alt="([^"]+)"([^>]*)>/g;

// Only process text nodes inside elements where emojis actually render
const ALLOWED_EMOJI_TAGS = new Set([
  'YT-FORMATTED-STRING', 'YT-CORE-ATTRIBUTED-STRING', 'SPAN', 'DIV', 'H1', 'H2', 'H3'
]);

const parsedTextCache = new Map();
const MAX_CACHE_SIZE = 500;

const textNodesToProcess = new Set();
const nodeToSpan = new WeakMap();

let frameId = null;
let isParsing = false;

const twemojiOptions = {
  callback: function(icon) {
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/16.0.1/72x72/${icon}.png`;
  }
};

function queueTextNode(node) {
  const val = node.nodeValue;
  if (!val || !HAS_WRAPPED_EMOJI_RE.test(val)) return;

  const parent = node.parentElement;
  if (!parent || parent.classList.contains('twemoji-injected') || !ALLOWED_EMOJI_TAGS.has(parent.tagName)) return;

  textNodesToProcess.add(node);
}

function processQueue() {
  isParsing = true;
  for (const textNode of textNodesToProcess) {
    processTextNode(textNode);
  }
  textNodesToProcess.clear();
  isParsing = false;
  frameId = null;
}

function processTextNode(textNode) {
  if (!textNode.parentNode) return;

  const parent = textNode.parentNode;
  if (parent.classList?.contains('twemoji-injected')) return;

  let currentNode = textNode;
  let match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');

  while (match) {
    const startIndex = match.index;
    const emojiLength = match[0].length;
    const cleanEmoji = match[1]; 

    if (startIndex > 0) {
      currentNode = currentNode.splitText(startIndex);
    }

    let nextNode = null;
    if (currentNode.nodeValue.length > emojiLength) {
      nextNode = currentNode.splitText(emojiLength);
    }
    
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
            // O(1) clear instead of Iterator churning for WebOS garbage collection
            parsedTextCache.clear();
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
        
        parent.insertBefore(existingSpan, currentNode.nextSibling);
        nodeToSpan.set(currentNode, existingSpan);
        if (DEBUG_EMOJI_DOM) console.log('[Emoji-DOM-Debug] Injected new emoji-render span for:', cleanEmoji);
      }
    }

    if (nextNode && HAS_WRAPPED_EMOJI_RE.test(nextNode.nodeValue || '')) {
      currentNode = nextNode;
      match = WRAPPED_EMOJI_RE.exec(currentNode.nodeValue || '');
    } else {
      break; 
    }
  }
}

function scanElement(el) {
    if (!ALLOWED_EMOJI_TAGS.has(el.tagName) && el.tagName !== 'BODY' && el.tagName !== 'YTLR-APP') return;
    
    const textContent = el.textContent;
    if (!textContent || !HAS_WRAPPED_EMOJI_RE.test(textContent)) return;
    try {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        let tNode;
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
          if (node.classList?.contains('twemoji-injected')) continue;
          scanElement(node);
        }
      }
    }
  }

  if (textNodesToProcess.size > 0 && frameId === null) {
    frameId = window.requestAnimationFrame(processQueue);
  }
});

let isObserving = false;

function manageObserverState() {
    // Only turn on if fixing is requested AND we're actively watching content
    const shouldObserve = configRead('enableLegacyEmojiFix');
    
    if (shouldObserve && !isObserving) {
        emojiObs.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        scanElement(document.body);
        if (textNodesToProcess.size > 0 && frameId === null) {
            frameId = window.requestAnimationFrame(processQueue);
        }
        isObserving = true;
        if (DEBUG_EMOJI_DOM) console.log('[Emoji-Debug] Legacy Emoji fix enabled.');
    } else if (!shouldObserve && isObserving) {
        emojiObs.disconnect();
        textNodesToProcess.clear();
        parsedTextCache.clear();
        isObserving = false;
        if (DEBUG_EMOJI_DOM) console.log('[Emoji-Debug] Legacy Emoji fix disabled.');
    }
}

if (document.characterSet === 'UTF-8' && getWebOSVersion() <= 4) {
  const style = document.createElement('style');
  style.id = 'legacy-webos-font-fix';
  style.styleSheet ? (style.styleSheet.cssText = "") : (style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic&family=Noto+Sans+Math&display=swap');
    
    yt-formatted-string, yt-core-attributed-string, .yt-tv-text, .video-title, .title, #title, .description, #description, .video-title-text, .badge-text {
        font-family: 'Roboto', 'YouTube Noto', 'YouTube Sans', 'Noto Sans Arabic', 'Arial', 'Noto Sans Math', sans-serif !important;
        text-rendering: optimizeLegibility !important;
    }
    
    emoji-render.twemoji-injected {
        display: inline !important;
        margin: 0 !important;
        padding: 0 !important;
        vertical-align: baseline !important;
    }
  `);
  document.head.appendChild(style);

  // Hook into configurations
  manageObserverState();
  configAddChangeListener('enableLegacyEmojiFix', manageObserverState);
  
  // Pause scanning immediately on heavy nav states
  window.addEventListener('ytaf-page-update', (e) => {
    if (e.detail.isAccountSelector && isObserving) {
       textNodesToProcess.clear(); // Flush queue on big UI transitions
    }
  });
}