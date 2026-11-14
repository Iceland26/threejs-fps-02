// Keyboard and mouse. The game owns pointer lock: while the canvas holds it, mouse movement
// accumulates into look deltas the player controller consumes each step, and the left button
// is the trigger. Everything else is a key set the simulation reads by code, plus a queue of
// one-shot key presses (buy menu, weapon slots, grenade throws) that must not be missed
// between steps.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = [];
  const state = {
    keys,
    pressed,
    locked: false,
    firing: false,
    aiming: false,
    lookX: 0,
    lookY: 0,
  };

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.push(event.code);
    keys.add(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    lock() { canvas.requestPointerLock(); },
    // Drain the one-shot presses since the last call (buy keys, slots, throws).
    takePressed() {
      const out = pressed.slice();
      pressed.length = 0;
      return out;
    },
    // Consume the accumulated mouse movement.
    takeLook() {
      const x = state.lookX, y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
  };
}
