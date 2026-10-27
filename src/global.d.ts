// Globals the app reads but does not own.
declare global {
  // Written by webpack's DefinePlugin (webpack.config.js): the version label
  // (core/version.js).
  const __YTAF_VERSION__: string;

  interface Window {
    // Diagnostics switch read by core/log.js (set from devtools); optional.
    __ytaf_debug__?: boolean;
    // YouTube's own registry, where hooks/resolve-command.ts finds resolveCommand.
    _yttv?: Record<string, unknown>;
  }
}

export {};
