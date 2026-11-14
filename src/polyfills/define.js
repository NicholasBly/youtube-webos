// The one way every polyfill below is installed.

// Non-enumerable install, matching how the engine defines built-ins. A plain
// assignment on a prototype would make the method visible to for-in loops over
// arrays/strings and could break unrelated YouTube code.
export function def(target, name, value) {
  if (name in target) return;
  Object.defineProperty(target, name, {
    value: value,
    writable: true,
    enumerable: false,
    configurable: true
  });
}
