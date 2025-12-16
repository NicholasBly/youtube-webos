# youtube-webos

An upgraded fork of webosbrew's youtube-webos with extended features and fixes.

## Added Features
- Full support for webOS 3, 4, 5, 6, 22, 23, 24, and 25 (older versions are untested)
- Enhanced Menu UI
- Auto Login - bypasses account selection screen
- Force Max Quality
- Hide Endcards
- Shortcuts - Programmable 0-9 key shortcuts during video playback

- SponsorBlock: Highlight feature added
-- All segment types added (Hook, Tangents, muted segments)
-- Color selector for all segments
-- Segment UI list replicating desktop segment list
-- Jump to highlight segment with blue button on LG remote

- Toggle black screen with red button on LG remote for OLED TVs
- Return YouTube Dislike - added to description tab in video
- Video Playback Shortcut - press 5 key to skip to the start of the next chapter
- Bug fixes, UI fixes
- Specific rules for different YouTube UI layouts

## Improvements
- Rewritten codebase optimized for performance and efficiency to support LG TV hardware

Review changes made since 0.3.8 [here](https://github.com/NicholasBly/youtube-webos/blob/main/CHANGELOG.md)

<img width="537" height="450" alt="webOS_TV_25_Simulator_1 4 3_cNtrOpwkMt" src="https://github.com/user-attachments/assets/ce136794-d27f-4c9c-bcb8-6b0a495e3207" />

<img width="537" height="569" alt="webOS_TV_25_Simulator_1 4 3_g0uM4TjeIc" src="https://github.com/user-attachments/assets/857a939f-80d6-4cc4-9ecd-d07ecd02b552" />

<img width="537" height="507" alt="webOS_TV_25_Simulator_1 4 3_OMUQXUo48c" src="https://github.com/user-attachments/assets/60ab37ee-0322-438b-91b5-09dee100b4bf" />


<!--![Configuration Screen](https://github.com/NicholasBly/youtube-webos/blob/main/screenshots/webOS_TV_24_Simulator_mKe8Gv7zXq.png?raw=true)-->
![Segment Skipped](https://github.com/NicholasBly/youtube-webos/blob/main/screenshots/2_sm_new.png?raw=true)

## Features

- Advertisements blocking
- [SponsorBlock](https://sponsor.ajay.app/) integration
- [Autostart](#autostart)

**Note:** Configuration screen can be opened by pressing 🟩 GREEN button on the remote.

## Pre-requisites

- Official YouTube app needs to be uninstalled before installation.

## Installation

- Use [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) - app is available via repo link: https://raw.githubusercontent.com/NicholasBly/youtube-webos/main/repo.json
- Use [Device Manager app](https://github.com/webosbrew/dev-manager-desktop) - see [Releases](https://github.com/NicholasBly/youtube-webos/releases) for a
  prebuilt `.ipk` binary file
- Use [webOS TV CLI tools](https://webostv.developer.lge.com/develop/tools/cli-installation) -
  `ares-install youtube...ipk` (For more information on configuring the webOS CLI tools, see [below](#development-tv-setup))

## Configuration

Configuration screen can be opened by pressing 🟩 GREEN button on the remote.
Black screen / OLED mode can be toggled by pressing 🟥 RED button on the remote.

### Autostart

In order to autostart an application the following command needs to be executed
via SSH or Telnet:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
```

This will make "YouTube AdFree" display as an eligible input application (next
to HDMI/Live TV, etc...), and, if it was the last selected input, it will be
automatically launched when turning on the TV.

This will also greatly increase startup performance, since it will be runnning
constantly in the background, at the cost of increased idle memory usage.
(so far, relatively unnoticable in normal usage)

In order to disable autostart run this:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/deleteDevice' '{"appId":"youtube.leanback.v4"}'
```

## Building

- Clone the repository

```sh
git clone https://github.com/NicholasBly/youtube-webos.git
```

- Enter the folder and build the App, this will generate a `*.ipk` file.

```sh
cd youtube-webos

# Install dependencies (need to do this only when updating local repository / package.json is changed)
npm install

npm run build && npm run package
```

## Development TV setup

These instructions use the [webOS CLI tools](https://github.com/webos-tools/cli).
See <https://webostv.developer.lge.com/develop/tools/cli-introduction> for more information.

### Configuring webOS CLI tools with Developer Mode App

This is partially based on <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>.

- Install Developer Mode app from Content Store
- Enable Developer Mode
- Enable key server and download TV's private key: `http://TV_IP:9991/webos_rsa`  
  The key must be saved under `~/.ssh` (or `%USERPROFILE%\.ssh` on Windows)
- Configure the device using `ares-setup-device` (`-a` may need to be replaced with `-m` if device named `webos` is already configured)
  - `PASSPHRASE` is the 6-character passphrase printed on screen in developer mode app
  - `privatekey` path is relative to `${HOME}/.ssh` (Windows: `%USERPROFILE%\.ssh`)

```sh
ares-setup-device -a webos -i "username=prisoner" -i "privatekey=webos_rsa" -i "passphrase=PASSPHRASE" -i "host=TV_IP" -i "port=9922"
```

### Configuring webOS CLI tools with Homebrew Channel / root

- Enable SSH in Homebrew Channel app
- Generate SSH key on developer machine (`ssh-keygen -t rsa`)
- Copy the private key (`id_rsa`) to the `~/.ssh` directory (or `%USERPROFILE%\.ssh` on Windows) on the local computer
- Append the public key (`id_rsa.pub`) to the `/home/root/.ssh/authorized_keys` file on the TV
- Configure the device using `ares-setup-device` (`-a` may need to be replaced with `-m` if device named `webos` is already configured)
  - `privatekey` path is relative to `${HOME}/.ssh` (Windows: `%USERPROFILE%\.ssh`)

```sh
ares-setup-device -a webos -i "username=root" -i "privatekey=id_rsa" -i "passphrase=SSH_KEY_PASSPHRASE" -i "host=TV_IP" -i "port=22"
```

## Installation

```sh
npm run deploy
```

## Launching

- The app will be available in the TV's app list. You can also launch it using the webOS CLI tools.

```sh
npm run launch
```

To jump immediately into some specific video use:

```sh
npm run launch -- -p '{"contentTarget":"v=F8PGWLvn1mQ"}'
```
