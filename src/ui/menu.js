// Overlay screens: loading, main menu, pause, game over.
export class Menu {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      loading: document.getElementById('loading'),
      loadBar: document.getElementById('loadBar'),
      loadText: document.getElementById('loadText'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      pauseStats: document.getElementById('pauseStats'),
      gameover: document.getElementById('gameover'),
      goTitle: document.getElementById('goTitle'),
      goStats: document.getElementById('goStats'),
      start: document.getElementById('startBtn'),
      resume: document.getElementById('resumeBtn'),
      restart: document.getElementById('restartBtn'),
      again: document.getElementById('againBtn'),
    };

    this.el.start.addEventListener('click', () => this.h.onStart());
    this.el.resume.addEventListener('click', () => this.h.onResume());
    this.el.restart.addEventListener('click', () => this.h.onRestart());
    this.el.again.addEventListener('click', () => this.h.onRestart());
  }

  setLoading(p, text) {
    this.el.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadText.textContent = text;
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showMain(v) {
    this.el.menu.classList.toggle('hidden', !v);
  }

  showPause(v, stats) {
    this.el.pause.classList.toggle('hidden', !v);
    if (v && stats) this.el.pauseStats.innerHTML = statsHtml(stats);
  }

  showGameOver(title, stats) {
    this.el.gameover.classList.remove('hidden');
    this.el.goTitle.textContent = title;
    this.el.goStats.innerHTML = statsHtml(stats);
  }

  hideGameOver() {
    this.el.gameover.classList.add('hidden');
  }
}

function statsHtml(stats) {
  const rows = [
    ['SCORE', stats.score],
    ['CHASE TIME', stats.time],
    ['FOOTAGE', stats.footage],
    ['PROBES DEPLOYED', stats.probes],
    ['PROBE INTERCEPTS', stats.intercepts],
    ['PEAK WIND FELT', stats.peakWind],
    ['TORNADOES TRACKED', stats.tornadoes],
  ];
  return rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}
