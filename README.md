# Hamro Patro — GNOME Shell extension

हाम्रो पात्रो in your GNOME top bar: today's Nepali (B.S.) date and tithi, with a
full month calendar, festivals and public holidays one click away.

## Features

- **Top-bar pill** showing the Nepali date and tithi, e.g. `१८ असोज • षष्ठी`.
- **Full B.S. month calendar**
  - Nepali day numbers with the English date underneath.
  - Today highlighted; Saturdays and public holidays in red.
  - An amber dot on days that have a festival or event.
  - Month navigation and an **आज** (today) button.
- **Day details**: click any date to see its tithi, English date and every event on it.
- **Quick launch** of the Hamro Patro web app, also added to GNOME's clock menu.
- **Kalimati** for all Nepali text; English text stays in the system UI font.

Calendar data covers B.S. 2081–2085.

## Requirements

- GNOME Shell 46–50
- [Kalimati](https://github.com/mhnpd/nepali-font/raw/master/fonts/Kalimati.ttf)
  font. Falls back to Noto Sans Devanagari if it isn't installed.
- Google Chrome, for the quick-launch button.

## Install

```sh
git clone https://github.com/dikshantpandey-dev/hamro-patro.git
cd hamro-patro
./install.sh
```

`install.sh` does four things:

- symlinks the clone into `~/.local/share/gnome-shell/extensions/hamro-patro@dikshantpandey-dev`
- compiles the settings schema
- installs Kalimati for your user if it's missing
- enables the extension

Log out and back in to load it. Wayland can't reload shell code in place.

Pull updates with `git pull`, then log out and back in.

## Uninstall

```sh
gnome-extensions disable hamro-patro@dikshantpandey-dev
rm ~/.local/share/gnome-shell/extensions/hamro-patro@dikshantpandey-dev
```

## Credits and license

Licensed under the [GNU GPL v3](LICENSE).

This is a derivative of
[nepali-calendar-gs-extension](https://github.com/PublisherName/nepali-calendar-gs-extension),
© Subash Ghimire, GPL-3.0. Its date converter and B.S. calendar data are reused
here. The GPL requires keeping this notice.

"Hamro Patro" and its logo are trademarks of their respective owner. This
project is not affiliated with or endorsed by Hamro Patro.
