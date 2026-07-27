import { extractLaunchParams, handleLaunch } from './utils';

function main() {
  handleLaunch(extractLaunchParams());
}

main();
