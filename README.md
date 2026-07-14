<h1 align="center">
  YouTube Ad-Free
</h1>
<p align="center">
  <img src="https://img.shields.io/github/stars/webosbrew/youtube-webos?style=flat-square&logo=github" alt="GitHub Stars">
  <img src="https://img.shields.io/github/v/release/webosbrew/youtube-webos?style=flat-square" alt="Latest Release">
  <img src="https://img.shields.io/github/contributors/webosbrew/youtube-webos?style=flat-square" alt="Contributors">
  <img src="https://img.shields.io/github/downloads/webosbrew/youtube-webos/total?style=flat-square" alt="Total Downloads">
  <img src="https://img.shields.io/badge/LG-webOS-000000?logo=webos&logoColor=white&style=flat-square" alt="webOS">
</p>

An upgraded fork of webosbrew's youtube-webos with extended features and fixes.

## Added Features
- Full support for webOS 3, 4, 5, 6, 22, 23, 24, and 25 (2016 and newer LG TVs) (webOS 1 and 2 currently not supported)
- Enhanced AdBlock Engine: New schema-based filtering system (cleaner Home, Search, and Shorts)
- Filter out QR code + Shop button overlays during video playback
- Enhanced Menu UI + Themes
- Auto Login - bypasses account selection screen
- Force Max Quality
- Hide Endcards
- Shortcuts - Programmable 0-9 key shortcuts during video playback
- Guest Mode: Hides annoying "Sign in" prompts

- SponsorBlock: Highlight feature added
-- All segment types added (Hook, Tangents, muted segments)
-- Color selector for all segments
-- Segment UI list replicating desktop segment list
-- Jump to highlight segment with blue button on LG remote
-- Per-segment options including auto skip, manual skip, show in progress bar, and disabled
-- Skip Segments Once option

- Toggle display on/off with red button on LG remote for OLED TVs + persistent keepalive
- Return YouTube Dislike - added to description tab in video
- Display Time in UI: Smart clock that hides during fullscreen and when description panel is open
- YouTube app fixes - Full video description panel hack to restore visual elements and enable full navigation
- Customizable YouTube UI fixes such as multiline titles and video shelf opacity for better visibility
- Bug fixes, UI fixes

## Improvements
- Rewritten codebase optimized for performance and efficiency to support LG TV hardware

Review changes made since 0.3.8 [here](https://github.com/NicholasBly/youtube-webos/blob/main/CHANGELOG.md)

<img width="537" height="652" alt="webOS_TV_25_Simulator_1 4 3_wUCf23ToCs" src="https://github.com/user-attachments/assets/dbf9fe00-6205-4a1c-ac13-f43271af3e23" />

<img width="537" height="569" alt="webOS_TV_25_Simulator_1 4 3_g0uM4TjeIc" src="https://github.com/user-attachments/assets/857a939f-80d6-4cc4-9ecd-d07ecd02b552" />

<img width="537" height="507" alt="webOS_TV_25_Simulator_1 4 3_OMUQXUo48c" src="https://github.com/user-attachments/assets/60ab37ee-0322-438b-91b5-09dee100b4bf" />

<img width="1280" height="720" alt="image" src="https://github.com/user-attachments/assets/84c8b6b3-4c82-4a63-9100-b236f2dd3225" />

<!--![Configuration Screen](https://github.com/NicholasBly/youtube-webos/blob/main/screenshots/webOS_TV_24_Simulator_mKe8Gv7zXq.png?raw=true)-->
![Segment Skipped](https://github.com/NicholasBly/youtube-webos/blob/main/screenshots/2_sm_new.png?raw=true)

## Features

- Ad Blocking
- [SponsorBlock](https://sponsor.ajay.app/) Integration
- [Autostart Support](#autostart)
- Force Highest Video Quality
- Audio-Only Mode (🟦 Blue button on remote)
- Full Animation Support
- Shorts Removal
- Higher-Quality Thumbnails
- On-Screen Clock Overlay
- YouTube Logo Removal
- Remove end screens
- Bypass account selector screen

> [!NOTE]
> Press the 🟩 **Green** button on your remote to access the configuration screen.

---

## Requirements

- Uninstall the official YouTube app before installing this one.

---

## Installation

- Use [webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) - app is available via repo link: https://raw.githubusercontent.com/NicholasBly/youtube-webos/main/repo.json
- Use [Device Manager app](https://github.com/webosbrew/dev-manager-desktop) - see [Releases](https://github.com/NicholasBly/youtube-webos/releases) for a
  prebuilt `.ipk` binary file. A webOS22+ .ipk is available for users on 2022+ TVs, supporting webOS22-25. These are lighter, more optimized builds for newer hardware, without translation layers needed for older TVs.
- Use [webOS TV CLI tools](https://webostv.developer.lge.com/develop/tools/cli-installation) -
  `ares-install youtube...ipk` (For more information on configuring the webOS CLI tools, see [below](#development-tv-setup))

- **[webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel):**
  App is available in the official webOS Brew repository.
- **[Device Manager](https://github.com/webosbrew/dev-manager-desktop):**
  Use a pre-built `.ipk` file from the [Releases](https://github.com/webosbrew/youtube-webos/releases) page.
- **Command Line (webOS CLI):** Configure the tools [below](#development-setup)

Configuration screen can be opened by pressing 🟩 GREEN button on the remote.
Black screen / OLED mode can be toggled by pressing 🟥 RED button on the remote.

## Autostart

To enable autostart, run the following command needs to be executed on the TV via **SSH** or **Telnet**:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"youtube.leanback.v4","pigImage":"","mvpdIcon":""}'
```

This allows the app to show up as an input source and launch automatically if it was the last used app. It will remain active in the background for faster startup (minor increase in idle memory usage).

To disable autostart:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/deleteDevice' '{"appId":"youtube.leanback.v4"}'
```

---

## Development Setup

### Pre-requisites

- The latest **Node.js** LTS release. Refer to `devEngines` in [`package.json`](package.json) for the minimum version.
- **pnpm**. If you already have `Node.js`, you can have it automatically setup by running `corepack enable`.
- **git**

### Setup

1. Clone the repository.

   ```sh
   git clone https://github.com/webosbrew/youtube-webos.git
   cd youtube-webos
   ```

2. Install dependencies.

   ```sh
   pnpm install
   ```

### Building an IPK

```sh
pnpm run build:dev
pnpm run package
```

The `.ipk` file will be generated in the project root directory. You can stop here if you're fine with installing the IPK via [the webOS Dev Manager app](https://github.com/webosbrew/dev-manager-desktop). Alternatively, continue below if you want to make it so you can install the IPK on your TV with one command.

### On the TV

> [!IMPORTANT]
> If your TV is rooted, follow [the alternative setup section](#alternate-setup-rooted-tv) instead and then skip to [installing to the TV](#installing-to-the-tv)

1. Create an [LG Developer account](https://webostv.developer.lge.com/login)
2. Install the [**Developer Mode** app](https://in.lgappstv.com/main/tvapp/detail?appId=232503) from the LG Content Store
3. Navigate to the app, Log-in in with LG Developer Credentials and enable:
   - Developer Mode
   - Key Server

### Add the TV to the CLI

```sh
pnpm exec ares-setup-device
```

Follow the prompts:

1. Add device
2. Enter IP from the Developer Mode app
3. Use default values unless needed
4. Enter 6-digit passphrase shown on the TV screen

Verify:

```sh
pnpm exec ares-setup-device --list
```

Sample output:

```log
name            deviceinfo                     connection  profile    passphrase
--------------  -----------------------------  ----------  -------    ----------
mytv (default)  prisoner@192.168.137.102:9922  ssh         tv         EF32E8
```

---

## Installing to the TV

```sh
pnpm run deploy # Installs to the default device selected via `ares-setup-device`.
```

## Debugging

webOS supports the standard Chrome Devtools Protocol which allows you to inspect the app.

```sh
ares-inspect -d <device_name> --app youtube.leanback.v4
```

Or if you've set your TV as the default device:

```sh
pnpm run inspect
```

---

## Alternate Setup (Rooted TV)

1. Enable SSH via Homebrew Channel
2. Generate SSH key:

   ```sh
   ssh-keygen -t rsa
   ```

3. Copy `id_rsa` to `~/.ssh` (Windows: `%USERPROFILE%\.ssh`)
4. Append `id_rsa.pub` to `/home/root/.ssh/authorized_keys` on the TV
5. Set up device:

   ```sh
   ares-setup-device -a webos \
     -i "username=root" \
     -i "privatekey=id_rsa" \
     -i "passphrase=SSH_KEY_PASSPHRASE" \
     -i "host=TV_IP" \
     -i "port=22"
   ```

---

## Quick Commands

### Build, Install, and Launch

```sh
pnpm run build:dev && pnpm run package && pnpm run deploy && pnpm run launch
```

To launch a specific video directly:

```sh
pnpm run launch -- -p '{"contentTarget":"v=F8PGWLvn1mQ"}'
```
