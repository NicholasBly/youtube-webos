// What an instance registers and must undo on destroy, in one bag: listeners,
// observers, timers and any other undo. dispose() runs them in reverse order of
// registration.
export function createDisposables() {
  const undo = [];
  return {
    /** Adds an event listener, and its removal to the undo list. */
    listen(target, type, handler, capture) {
      target.addEventListener(type, handler, capture);
      undo.push(() => target.removeEventListener(type, handler, capture));
    },
    /** Starts `observer` on `target`, and its disconnect to the undo list. */
    observe(observer, target, options) {
      observer.observe(target, options);
      undo.push(() => observer.disconnect());
    },
    /** Starts a timer, and its clearTimeout to the undo list. */
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      undo.push(() => clearTimeout(id));
    },
    /** Any other undo, such as removing a config listener. */
    add(fn) {
      undo.push(fn);
    },
    /** Undoes everything added, newest first. */
    dispose() {
      while (undo.length) undo.pop()();
    }
  };
}
