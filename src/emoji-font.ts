import twemoji from '@twemoji/api';
import { isLegacyWebOS } from './webos-utils.js';
import { configRead, configAddChangeListener } from './config.js';
import './emoji-font.css';

// We now track raw Node objects instead of Elements
const textNodesToProcess = new Set<Node>();
let timeoutId: number | null = null;
let isParsing = false; 

const twemojiOptions = {
  callback: function(icon: string, options: any, variant: any) {
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/15.1.0/72x72/${icon}.png`;
  }
};

const emojiObs = new MutationObserver((mutations) => {
  if (isParsing) return;
  let shouldParse = false;

  for (let i = 0; i < mutations.length; i++) {
    const mut = mutations[i];

    if (mut.type === 'characterData') {
      // Intercept Polymer updating an existing text node
      if (mut.target.nodeValue && mut.target.nodeValue !== '\u200B') {
        textNodesToProcess.add(mut.target);
        shouldParse = true;
      }
    } else if (mut.type === 'childList') {
      for (let j = 0; j < mut.addedNodes.length; j++) {
        const node = mut.addedNodes[j];
        
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.nodeValue && node.nodeValue !== '\u200B') {
            textNodesToProcess.add(node);
            shouldParse = true;
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          try {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
            let tNode;
            while ((tNode = walker.nextNode())) {
              // Ignore empty nodes and our zero-width spaces
              if (tNode.nodeValue && tNode.nodeValue.trim().length > 0 && tNode.nodeValue !== '\u200B') {
                textNodesToProcess.add(tNode);
                shouldParse = true;
              }
            }
          } catch (err) {
            console.error('[Emoji-Debug] TreeWalker error:', err);
          }
        }
      }
    }
  }

  if (shouldParse && timeoutId === null) {
    timeoutId = window.setTimeout(() => {
      isParsing = true; 
      
      textNodesToProcess.forEach((textNode) => {
        if (document.body.contains(textNode) && textNode.parentNode) {
          
          const parent = textNode.parentNode as HTMLElement;
          // Ignore text nodes that are already inside our injected span
          if (parent.classList && parent.classList.contains('twemoji-injected')) {
            return;
          }

          const originalText = textNode.nodeValue || '';
          if (originalText.trim().length === 0 || originalText === '\u200B') return;

          try {
			  const cleanText = originalText.replace(/[\u200C\u200E\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
			  let parsedHTML = twemoji.parse(cleanText, twemojiOptions);
			  
			  if (parsedHTML !== cleanText || cleanText !== originalText) {
				parsedHTML = parsedHTML.replace(/<img[^>]+alt="([^"]+)"[^>]*>/g, (match, altText) => {
				  const imgWithoutAlt = match.replace(/\s?alt="[^"]+"/, '');
				  const hiddenText = `<span style="position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); border:0;">${altText}</span>`;
				  return imgWithoutAlt + hiddenText;
				});
				
				textNode.nodeValue = '\u200B';
				
				let existingSpan = null;
				for (let i = 0; i < parent.childNodes.length; i++) {
					const child = parent.childNodes[i] as HTMLElement;
					if (child.nodeType === Node.ELEMENT_NODE && child.classList && child.classList.contains('twemoji-injected')) {
						existingSpan = child;
						break;
					}
				}

				if (existingSpan) {
				  existingSpan.innerHTML = parsedHTML;
				} else {
				  const span = document.createElement('span');
				  span.className = 'twemoji-injected';
				  span.innerHTML = parsedHTML;
				  parent.insertBefore(span, textNode.nextSibling);
				}
			  }
			} catch (err) {
			  console.error('[Emoji-Debug] Error processing text node:', err);
			}
        }
      });

      textNodesToProcess.clear();
      isParsing = false; 
      timeoutId = null;
    }, 250); 
  }
});

if (document.characterSet === 'UTF-8') {
  if (isLegacyWebOS()) {
    const style = document.createElement('style');
    style.id = 'legacy-webos-font-fix';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Math&display=swap');
      yt-formatted-string, .yt-tv-text, .video-title, .title, #title, .description, #description, .video-title-text, .badge-text {
          font-family: 'Roboto', 'YouTube Noto', 'YouTube Sans', 'Arial', 'Noto Sans Math', sans-serif !important;
      }
      span.twemoji-injected {
          display: inline;
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
        console.log('[Emoji-Debug] Legacy Emoji fix enabled and observing.');
      } else {
        emojiObs.disconnect();
        textNodesToProcess.clear();
        console.log('[Emoji-Debug] Legacy Emoji fix disabled. Observer disconnected.');
      }
    };

    toggleEmojiObserver();

    configAddChangeListener('enableLegacyEmojiFix', toggleEmojiObserver);
  }
}