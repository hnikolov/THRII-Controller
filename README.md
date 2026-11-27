# THR-II Controller

A mobile-first editor and controller for Yamaha THR-II amplifiers: a Progressive Web App (PWA) made for the phone, held upright, next to the amp. It talks to the amp over Bluetooth (Web Bluetooth) or USB (Web MIDI), and it also runs on a desktop browser.

**Open it on your phone: [hnikolov.github.io/THRII-Controller](https://hnikolov.github.io/THRII-Controller/)**

## Install on your phone

1. Open the link above in **Chrome on Android**.
2. Choose **Add to Home screen** (or **Install app**) from Chrome's menu.
3. Start it from its icon: it opens full screen, without the browser bar.

Once installed, the app works offline (everything except Import AI), keeps the screen on while it is open, and updates itself when a new version is published (an update button appears).

Browser support: the app needs Web Bluetooth or Web MIDI. Chrome on Android and Chrome or Edge on a desktop have them; the browsers on iPhone and iPad do not.

## What it does

- Connect to the amp over Bluetooth or USB and mirror its settings: amp model, cabinet, effects, knobs and the active memory.
- Edit live from the phone, or from the amp's own knobs and memory buttons; both stay in sync.
- Keep a list of presets: import and export `.thrl6p` files (THR Remote's format), load one with a tap, save one to any of the amp's five memories.
- Group presets into banks of five, one per amp memory, and save a whole bank to the amp in one go.
- Back up the amp's five memories to a file and restore them.
- Import AI: describe a sound and get a preset from the generator of [amplifier-presets.com](https://amplifier-presets.com).

## Run it locally

From the repository folder, start the plain server and open the app in Chrome:

`python -m http.server 8080`

Then open:

`http://localhost:8080/`.

## Supported models

The app reads the amp's model from its identity reply and uses it in every message it sends.

| Amp | Model code | Status |
|---|---|---|
| THR10II Wireless | `0x01` | Tested with version 1.44.0.a |
| THR30II Wireless | `0x02` | Expected to work; not tested yet |
| THR10II | `0x00` | Expected to work; not tested yet |
| THR30IIA Wireless (acoustic) | unknown | Unknown: its amp and effect models differ, so it likely needs its own symbol table |

If you own one of the untested models, a confirmation if the app works with your amp model is very welcome.

## Credits

- **Martin Zwerschke**, [THRII-direct-USB-pedalboard](https://github.com/martinzw/THRII-direct-USB-pedalboard): many thanks for his great work on reverse-engineering the THR-II SysEx protocol. His document `SYSEX_PROTOCOL_THR30II.pdf`, from that repository, was the starting point for this app's protocol implementation.
- **Alican Erdoğan**, [Reverse engineering Yamaha THR-II](https://alican.codes/blog/reverse-engineering-yamaha-thr-ii/): his findings showed me how to get SysEx communication with the THR-II working over Bluetooth LE, I was lost and almost gave up. His write-up made this app's BLE connection possible.
- **Magnus Bredeli and Ferdinand Hegelstad**, [amplifier-presets.com](https://amplifier-presets.com): the excellent preset generator behind the Import AI feature.
- **AI coding assistants**, [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/claude-code): they helped shape the architecture, plan the work, and write and review much of the code.

## Disclaimer

This is an independent hobby project. It is not affiliated with, endorsed by, or supported by Yamaha Corporation. Yamaha and THR are trademarks of Yamaha Corporation; they are used here only to say which amplifiers the app works with.

The Import AI feature uses the preset generator of [amplifier-presets.com](https://amplifier-presets.com), created by Magnus Bredeli and Ferdinand Hegelstad. That service belongs to its authors and is not part of this project.

The app is provided as is, without warranty of any kind. Use it at your own risk; the author is not responsible for any loss of presets, settings, or other data on your amplifier.
