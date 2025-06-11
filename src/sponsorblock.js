// fix.js - SponsorBlock Overlay Fix with Persistent Attachment & DOM Replacement Detection

import sha256 from 'tiny-sha256';
import { configRead } from './config';
import { showNotification } from './ui';

const barTypes = {
  sponsor: { color: '#00d400', opacity: '0.7', name: 'sponsored segment' },
  intro: { color: '#00ffff', opacity: '0.7', name: 'intro' },
  outro: { color: '#0202ed', opacity: '0.7', name: 'outro' },
  interaction: { color: '#cc00ff', opacity: '0.7', name: 'interaction reminder' },
  selfpromo: { color: '#ffff00', opacity: '0.7', name: 'self-promotion' },
  music_offtopic: { color: '#ff9900', opacity: '0.7', name: 'non-music part' },
  preview: { color: '#008fd6', opacity: '0.7', name: 'recap or preview' },
  chapter: { color: 'rgba(128, 128, 128, 0.5)', opacity: '0.5', name: 'chapter' }
};

class SponsorBlockHandler {
  constructor(videoID) {
    this.videoID = videoID;
    this.segments = [];
    this.video = null;
    this.overlay = null;
    this.progressBar = null;
    this.observer = null;
  }

  async init() {
    const hash = sha256(this.videoID).substring(0, 4);
    const categories = Object.keys(barTypes);
    const res = await fetch(`https://sponsorblock.inf.re/api/skipSegments/${hash}?categories=${encodeURIComponent(JSON.stringify(categories))}&videoID=${this.videoID}`);
    const data = await res.json();
    const segments = Array.isArray(data) ? (data.find(v => v.videoID === this.videoID)?.segments || []) : data?.segments || [];
    if (!segments.length) return;
    this.segments = segments;
    this.waitForVideo();
  }

  waitForVideo() {
    const tryFind = () => {
      this.video = document.querySelector('video');
      if (this.video && isFinite(this.video.duration)) {
        this.setupProgressBarWatcher();
      } else {
        setTimeout(tryFind, 300);
      }
    };
    tryFind();
  }

  setupProgressBarWatcher() {
    const container = document.querySelector('.ytLrWatchDefaultControlsContainer, .html5-video-player');
    if (!container) return;

    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver(() => {
      const newProgressBar = document.querySelector('.ytlr-progress-bar, .ytLrProgressBarSlider');
      if (newProgressBar && newProgressBar !== this.progressBar) {
        this.progressBar = newProgressBar;
        this.buildOverlay();
      }
    });

    this.observer.observe(container, { childList: true, subtree: true });
    const initialProgressBar = document.querySelector('.ytlr-progress-bar, .ytLrProgressBarSlider');
    if (initialProgressBar) {
      this.progressBar = initialProgressBar;
      this.buildOverlay();
    }
  }

  buildOverlay() {
    if (!this.video || !this.progressBar || !this.segments.length || !isFinite(this.video.duration)) return;

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.remove();
    }

    const duration = this.video.duration;
    const overlay = document.createElement('div');
    overlay.id = 'sponsorblock-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:10;';

    this.segments.forEach(({ segment, category }) => {
      const [start, end] = segment;
      if (end <= start || end > duration) return;
      const bar = barTypes[category] || barTypes.sponsor;
      const div = document.createElement('div');
      div.style.cssText = `position:absolute;height:100%;background:${bar.color};opacity:${bar.opacity};left:${(start / duration) * 100}%;width:${((end - start) / duration) * 100}%;border-radius:inherit;`;
      div.title = `${bar.name}: ${start.toFixed(1)}s - ${end.toFixed(1)}s`;
      overlay.appendChild(div);
    });

    const style = getComputedStyle(this.progressBar);
    if (style.position === 'static') this.progressBar.style.position = 'relative';

    this.overlay = overlay;
    this.progressBar.appendChild(overlay);
  }

  destroy() {
    if (this.overlay && this.overlay.parentNode) this.overlay.remove();
    if (this.observer) this.observer.disconnect();
  }
}

if (typeof window !== 'undefined') {
  let currentVideoID = null;

  const initSponsorBlock = () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1]);
    const id = params.get('v');

    if (id && id !== currentVideoID) {
      currentVideoID = id;
      if (window.sponsorblock) window.sponsorblock.destroy();
      window.sponsorblock = new SponsorBlockHandler(id);
      window.sponsorblock.init();
    }
  };

  window.addEventListener('hashchange', initSponsorBlock);
  window.addEventListener('load', () => setTimeout(initSponsorBlock, 500));
}
