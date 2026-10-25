// Globals the app reads but does not own.
declare global {
  interface Window {
    // Diagnostics switch read by core/log.js (set from devtools); optional.
    __ytaf_debug__?: boolean;
    // YouTube's own registry, where hooks/resolve-command.ts finds resolveCommand.
    _yttv?: Record<string, unknown>;
  }
}

export {};
