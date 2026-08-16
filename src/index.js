import { extractLaunchParams, handleLaunch } from './launch.js';

function main() {
  handleLaunch(extractLaunchParams());
}

main();