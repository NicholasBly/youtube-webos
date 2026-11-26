// The app's start page script (index.html): sends the app to YouTube's TV site
// with the parameters webOS launched it with. Everything else runs in
// userScript.js, which webOS injects into that site.
import { extractLaunchParams, handleLaunch } from './core/launch.js';

/** Opens YouTube with the launch parameters webOS started the app with. */
function main() {
  handleLaunch(extractLaunchParams());
}

main();
