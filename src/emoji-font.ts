import twemoji from '@twemoji/api';
import { WebOSVersion } from './webos-utils.js';
import './emoji-font.css';

const nodesToParse = new Set<HTMLElement>();
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

    if (mut.type === 'characterData' && mut.target.parentNode) {
      nodesToParse.add(mut.target.parentNode as HTMLElement);
      shouldParse = true;
    } else if (mut.type === 'childList') {
      for (let j = 0; j < mut.addedNodes.length; j++) {
        const node = mut.addedNodes[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          nodesToParse.add(node as HTMLElement);
          shouldParse = true;
        } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
          nodesToParse.add(node.parentNode as HTMLElement);
          shouldParse = true;
        }
      }
    }
  }

  if (shouldParse && timeoutId === null) {
    timeoutId = window.setTimeout(() => {
      isParsing = true; 
      
      nodesToParse.forEach((elem) => {
        if (document.body.contains(elem)) {
          
          const currentText = elem.textContent || '';
          if (elem.dataset.lastParsedText !== currentText) {
            elem.dataset.lastParsedText = currentText;
            twemoji.parse(elem, twemojiOptions);
          }
          
          if (elem.querySelectorAll) {
            const children = elem.querySelectorAll('yt-formatted-string, span, div');
            for (let k = 0; k < children.length; k++) {
              const child = children[k] as HTMLElement;
              const childText = child.textContent || '';
              
              if (child.dataset.lastParsedText !== childText) {
                child.dataset.lastParsedText = childText;
                twemoji.parse(child, twemojiOptions);
              }
            }
          }
        }
      });

      nodesToParse.clear();
      isParsing = false; 
      timeoutId = null;
    }, 250); 
  }
});

if (document.characterSet === 'UTF-8') {
  if (WebOSVersion() === 5) {
	const style = document.createElement('style');
    style.id = 'legacy-webos-font-fix';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Math&display=swap');
      yt-formatted-string, .yt-tv-text, .video-title, .title, #title, .description, #description, .video-title-text, .badge-text {
          font-family: 'Roboto', 'YouTube Noto', 'YouTube Sans', 'Arial', 'Noto Sans Math', sans-serif !important;
      }
    `;
    document.head.appendChild(style);
	
    emojiObs.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true 
    });
    console.log('[Emoji-Font] Cloudflare SSL-safe Twemoji observer initialized.');
  }
}