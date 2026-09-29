# Hypereel

Landing page for Hypereel, a demo coin launchpad where trading fees pay for AI-made promo reels.

Plain HTML, CSS and JavaScript with no build step. [Matter.js](https://brm.io/matter-js/) is loaded from cdnjs for the reel jar physics; the page still works without it.

## What works

- A live coin dashboard in the hero with Overview, Reels, Trades, Payouts and Settings views, a range-switchable fee chart with hover readouts, a coin switcher, Boost and Withdraw actions, and saved settings.
- Header dropdown menus and a demo log-in dialog with email validation.

- Quick ticker launch in the hero, plus a full launch dialog with name, ticker, pitch line and image, including validation, drag and drop, and downscaling.
- Launched coins are saved in `localStorage` and appear at the top of the feed.
- A live fee split (30% launcher, 50% reels, 20% house, out of a 1% fee) and a daily-volume calculator.
- The reel jar: trades drop physics coins, and every $25 of reel fees funds a reel.
- Eight reel formats with a rotation picker that never repeats the last format.
- A simulated live feed with search, three sort orders, buy buttons and "last reel" timers.
- A light and dark theme toggle, a scroll reveal, reduced-motion support, keyboard-accessible dialogs, and an MIT license dialog.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`build-preview.sh` inlines everything into `dist/preview.html`, a single-file preview.

This is a demo: it creates no real tokens and moves no money.
