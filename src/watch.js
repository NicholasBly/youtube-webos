import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import './watch.css';
import { requireElement } from './screensaver-fix.ts';

class Watch {
  #watch;
  #timer;
  #attrChanges;
  #videoListener;
  #PLAYER_SELECTOR = 'ytlr-watch-default';

  constructor() {
    this.createElement();
    this.startClock();
    this.playerEvents();
    this.videoEvents();
    
    this.onOledChange = this.onOledChange.bind(this);
    this.applyOledMode(configRead('enableOledCareMode'));
    configAddChangeListener('enableOledCareMode', this.onOledChange);
  }

  onOledChange(evt) {
    this.applyOledMode(evt.detail.newValue);
  }

  applyOledMode(enabled) {
    if (this.#watch) {
      if (enabled) this.#watch.classList.add('oled-mode');
      else this.#watch.classList.remove('oled-mode');
    }
  }

  createElement() {
    this.#watch = document.createElement('div');
    this.#watch.className = 'webOs-watch';
    if (configRead('enableOledCareMode')) this.#watch.classList.add('oled-mode');
    document.body.appendChild(this.#watch);
  }

  startClock() {
    const nextSeg = (60 - new Date().getSeconds()) * 1000;

    const formatter = new Intl.DateTimeFormat(navigator.language, {
      hour: 'numeric',
      minute: 'numeric'
    });

    const setTime = () => {
      this.#watch.innerText = formatter.format(new Date());
    };

    setTime();
    setTimeout(() => {
      setTime();
      this.#timer = setInterval(setTime, 60000);
    }, nextSeg);
  }

  playerAppear(video) {
    this.changeVisibility(video);
    this.playerObserver(video);
  }

  changeVisibility(video) {
    const focused = video.getAttribute('hybridnavfocusable') === 'true';
    this.#watch.style.display = focused ? 'none' : 'block';
  }

  async playerEvents() {
    const player = await requireElement(this.#PLAYER_SELECTOR, HTMLElement);
    this.playerAppear(player);
  }

  playerObserver(node) {
    this.#attrChanges = new MutationObserver(() => {
      this.changeVisibility(node);
    });

    this.#attrChanges.observe(node, {
      attributes: true,
      attributeFilter: ['hybridnavfocusable']
    });
  }

  videoEvents() {
    this.#videoListener = async () => {
      const player = document.querySelector(this.#PLAYER_SELECTOR);
      if (player) {
        this.changeVisibility(player);
      }
    };

    document.addEventListener('play', this.#videoListener, true);
    document.addEventListener('loadeddata', this.#videoListener, true);
  }

  destroy() {
    clearInterval(this.#timer);
    configRemoveChangeListener('enableOledCareMode', this.onOledChange);
    
    if (this.#videoListener) {
      document.removeEventListener('play', this.#videoListener, true);
      document.removeEventListener('loadeddata', this.#videoListener, true);
    }
    
    this.#watch?.remove();
    this.#attrChanges?.disconnect();
  }
}

let watchInstance = null;

function toggleWatch(show) {
  if (show) {
    watchInstance = watchInstance ? watchInstance : new Watch();
  } else {
    watchInstance?.destroy();
    watchInstance = null;
  }
}

toggleWatch(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  toggleWatch(evt.detail.newValue);
});