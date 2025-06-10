import sha256 from 'tiny-sha256';
import { configRead } from './config';
import { showNotification } from './ui';

const css = `
    #previewbar {
        display: block;
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        padding: 0;
        margin: 0;
        pointer-events: none;
    }
    .previewbar {
        position: absolute;
        height: 100%;
        display: block;
    }
`;

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  progressBar = null;
  sliderSegmentsOverlay = null;

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
    this.injectCSS();
  }

  injectCSS() {
      const style = document.createElement('style');
      style.type = 'text/css';
      style.id = 'sponsorblock-style';
      style.textContent = css;
      document.head.appendChild(style);
  }

  async init() {
    const videoHash = sha256(this.videoID).substring(0, 4);
    const categories = [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'music_offtopic',
      'preview'
    ];
    const resp = await fetch(
      `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
        JSON.stringify(categories)
      )}`
    );
    const results = await resp.json();

    const result = results.find((v) => v.videoID === this.videoID);
    console.info(this.videoID, 'SponsorBlock segments:', result);

    if (!result || !result.segments || !result.segments.length) {
      console.info(this.videoID, 'No segments found.');
      return;
    }

    this.segments = result.segments;
    this.skippableCategories = this.getSkippableCategories();

    this.scheduleSkipHandler = () => this.scheduleSkip();
    this.durationChangeHandler = () => this.buildOverlay();

    this.attachVideo();
  }
  
  updatePageElements() {
    // Selector for mobile YouTube progress bar
    this.progressBar = document.querySelector(".ytm-progress-bar");
    if (this.progressBar) {
        console.info("SponsorBlock: Found progress bar", this.progressBar);
    } else {
        console.warn("SponsorBlock: Could not find progress bar element.");
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead('enableSponsorBlockSponsor')) skippableCategories.push('sponsor');
    if (configRead('enableSponsorBlockIntro')) skippableCategories.push('intro');
    if (configRead('enableSponsorBlockOutro')) skippableCategories.push('outro');
    if (configRead('enableSponsorBlockInteraction')) skippableCategories.push('interaction');
    if (configRead('enableSponsorBlockSelfPromo')) skippableCategories.push('selfpromo');
    if (configRead('enableSponsorBlockMusicOfftopic')) skippableCategories.push('music_offtopic');
    if (configRead('enableSponsorBlockPreview')) skippableCategories.push('preview');
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.video = document.querySelector('video');
    
    if (!this.video) {
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 250);
      return;
    }

    console.info(this.videoID, 'Video found, binding events...');
    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    this.video.addEventListener('loadedmetadata', this.durationChangeHandler);
    this.buildOverlay();
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration)) {
        console.info('No video duration yet, retrying overlay build.');
        setTimeout(() => this.buildOverlay(), 250);
        return;
    }

    this.updatePageElements();
    if (!this.progressBar) {
        console.info('No progress bar yet, retrying overlay build.');
        setTimeout(() => this.buildOverlay(), 250);
        return;
    }

    if (!this.sliderSegmentsOverlay) {
        this.sliderSegmentsOverlay = document.createElement('ul');
        this.sliderSegmentsOverlay.id = 'previewbar';
    } else {
        this.sliderSegmentsOverlay.innerHTML = '';
    }

    const videoDuration = this.video.duration;

    this.segments.forEach((segment) => {
        const bar = this.createBar(segment, videoDuration);
        this.sliderSegmentsOverlay.appendChild(bar);
    });

    if (!this.progressBar.contains(this.sliderSegmentsOverlay)) {
        this.progressBar.prepend(this.sliderSegmentsOverlay);
    }
  }
  
  createBar(barSegment, videoDuration) {
    const { category, segment, color } = barSegment;
    const [start, end] = segment;

    const bar = document.createElement('li');
    bar.classList.add('previewbar');
    
    bar.style.backgroundColor = color || '#808080'; // Use color from API or a default
    bar.style.opacity = '0.7';
    bar.style.left = `${(start / videoDuration) * 100}%`;
    bar.style.right = `${100 - (end / videoDuration) * 100}%`;

    return bar;
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);

    if (!this.active || this.video.paused) {
      return;
    }

    const currentTime = this.video.currentTime;
    const nextSegment = this.segments
        .filter(seg => seg.segment[0] > currentTime - 0.25 && this.skippableCategories.includes(seg.category))
        .sort((a, b) => a.segment[0] - b.segment[0])[0];
        
    if (!nextSegment) {
        return;
    }

    const [start, end] = nextSegment.segment;
    const skipIn = (start - currentTime) * 1000;

    this.nextSkipTimeout = setTimeout(() => {
        if (!this.active || this.video.paused) {
          return;
        }
        
        console.info(this.videoID, 'Skipping segment:', nextSegment);
        showNotification(`Skipping ${nextSegment.category.replace("_", " ")}`);
        this.video.currentTime = end;
        this.scheduleSkip(); // Immediately schedule the next check
    }, skipIn);
  }

  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlock handler');
    this.active = false;

    clearTimeout(this.nextSkipTimeout);
    clearTimeout(this.attachVideoTimeout);

    if (this.sliderSegmentsOverlay) {
      this.sliderSegmentsOverlay.remove();
      this.sliderSegmentsOverlay = null;
    }

    const style = document.getElementById('sponsorblock-style');
    if (style) {
        style.remove();
    }

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener('loadedmetadata', this.durationChangeHandler);
    }
  }
}

window.sponsorblock = null;

function uninitializeSponsorblock() {
  if (window.sponsorblock) {
    window.sponsorblock.destroy();
    window.sponsorblock = null;
  }
}

window.addEventListener('hashchange', () => {
    const newURL = new URL(location.hash.substring(1), location.href);
    if (newURL.pathname !== '/watch') {
      uninitializeSponsorblock();
      return;
    }

    const videoID = newURL.searchParams.get('v');
    const needsReload = videoID && (!window.sponsorblock || window.sponsorblock.videoID !== videoID);

    if (needsReload) {
      uninitializeSponsorblock();
      if (configRead('enableSponsorBlock')) {
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
      }
    }
});

// Initial load check
if (location.hash.includes('/watch')) {
    const url = new URL(location.hash.substring(1), location.href);
    const videoID = url.searchParams.get('v');
    if (videoID && configRead('enableSponsorBlock')) {
        uninitializeSponsorblock();
        window.sponsorblock = new SponsorBlockHandler(videoID);
        window.sponsorblock.init();
    }
}
