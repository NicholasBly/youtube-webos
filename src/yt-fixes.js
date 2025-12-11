/* src/yt-fixes.js */
import { configRead } from './config.js';

let historyCache = false;

export function initYouTubeFixes() {
    console.log('[YT-Fixes] Initializing...');
    // initSignInPromptFix(); // Disabled: Handled via JSON block in adblock.js to prevent nav bugs
    initSearchHistoryFix();
}

function initSearchHistoryFix() {
    if (attemptSearchHistoryFix()) return; 

    const observer = new MutationObserver((mutations, obs) => {
        if (historyCache) {
            obs.disconnect();
            return;
        }
        if (attemptSearchHistoryFix()) {
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function attemptSearchHistoryFix() {
    if (historyCache) return true;
    const suggestionsBox = document.querySelector('ytlr-search-suggestions');
    if (!suggestionsBox) return false;

    if (suggestionsBox.childElementCount > 0) {
        historyCache = true;
        return true;
    }

    if (!suggestionsBox.dataset.historyCheckPending) {
        suggestionsBox.dataset.historyCheckPending = 'true';
        
        // Give the app 500ms to populate the list naturally
        setTimeout(() => {
            // Ensure the box still exists in the DOM
            if (!suggestionsBox.isConnected) return;

            if (suggestionsBox.childElementCount === 0 && !suggestionsBox.dataset.historyFixed) {
                const injected = populateSearchHistory(suggestionsBox);
                if (injected) {
                    historyCache = true;
                }
            } else {
                historyCache = true;
            }
        }, 500); 

        return true; 
    }

    return true; 
}

function populateSearchHistory(container) {
    const storageKey = 'yt.leanback.default.search-history::recent-searches';
    const rawData = window.localStorage.getItem(storageKey);
    if (!rawData) return false;

    try {
        const parsed = JSON.parse(rawData);
        const historyData = parsed.data;
        if (!historyData || !Array.isArray(historyData) || historyData.length === 0) return false;

        container.dataset.historyFixed = 'true';
        container.style.cssText = `display: flex; flex-direction: column; width: 30rem; position: absolute; left: 6.5rem; top: 7.25rem; height: auto; padding: 1rem; box-sizing: border-box; background-color: transparent; z-index: 999;`;

        historyData.slice(0, 8).forEach(item => {
            const searchTerm = item[0];
            const row = document.createElement('div');
            row.className = 'injected-history-item';
            row.setAttribute('tabindex', '0');
            row.setAttribute('role', 'button');
            row.style.cssText = `display: flex; align-items: center; padding: 0.8rem 1rem; margin-bottom: 0.5rem; background-color: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer; color: #f1f1f1; font-family: Roboto, sans-serif; font-size: 1.4rem; transition: background-color 0.2s;`;
            row.innerHTML = `<span style="margin-right: 1rem; opacity: 0.7;">↺</span><span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${searchTerm}</span>`;
            
            row.addEventListener('click', () => {
                window.location.hash = `#/results?search_query=${encodeURIComponent(searchTerm)}`;
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') row.click();
            });

            container.appendChild(row);
        });
        return true;
    } catch (e) {
        return false;
    }
}