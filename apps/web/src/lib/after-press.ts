/** Whether a pointer is pressed right now: a blur during a press comes from that press. */
let pressed = false;

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (pressed = true), true);
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, () => (pressed = false), true);
  }
}

/**
 * Runs `change` now, or, when a press moved focus, once that press's click is done. A row that
 * goes away as focus leaves it would otherwise move what was being tapped from under the pointer.
 */
export function afterPress(change: () => void): void {
  if (!pressed) return change();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    // The click comes after `pointerup`, in the same task.
    setTimeout(change, 0);
  };
  window.addEventListener('pointerup', run, { once: true });
  window.addEventListener('pointercancel', run, { once: true });
}
