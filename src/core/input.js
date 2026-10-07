// Keyboard + mouse input with edge-triggered actions and drag-to-look.
export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.pressedThisFrame = new Set();
    this.releasedThisFrame = new Set();
    this.mouse = { dx: 0, dy: 0, down: false, buttons: 0 };
    this.wheel = 0;
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
      this.releasedThisFrame.add(e.code);
    };
    this._onBlur = () => this.down.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    const el = target || window;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.buttons = e.buttons;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
      this.mouse.buttons = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.mouse.down) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  pressed(...codes) {
    return codes.some((c) => this.pressedThisFrame.has(c));
  }

  axis(neg, pos) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.wheel = 0;
  }
}
