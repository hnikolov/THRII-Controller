# THR-II Controller

A browser-based editor and controller for Yamaha THR-II amplifiers, over USB (Web MIDI) and Bluetooth (Web Bluetooth).

The app can be run online [here](https://hnikolov.github.io/THRII-Controller/).

To run the app locally, from the repository folder, start the plain server and open the app in Chrome:

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
