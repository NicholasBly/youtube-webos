// The version the options panel shows in its heading: "0.8.5" for a release,
// "0.8.5 b2" for test build 2. webpack's DefinePlugin writes the label at build time
// (webpack.config.js: package.json's version, the build number from
// `--env build=N` or YTAF_BUILD); a source loaded without webpack (the unit
// tests) shows "dev".

/** The version label of this build, as the panel heading shows it. */
export const VERSION_LABEL = typeof __YTAF_VERSION__ === 'string' ? __YTAF_VERSION__ : 'dev';
