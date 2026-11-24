# Guitar2Lute

A web app that converts guitar chord boxes and guitar tab into lute chord boxes and lute tablature (French, Italian or modern notation) for a chosen lute tuning. It runs entirely in the browser, keeps your pieces in the browser's local storage, and can be installed as an app that works offline.

Each side has a **Tune…** panel that plays its open courses, and a pitch standard (A = 440, 415, 392 or your own) used for all its sound.

## Requirements

- Node.js 22.12 or later, and npm

## Install

```bash
npm install
```

## Run it

### While developing

```bash
npm run dev
```

Open the address it prints (normally http://localhost:5173). The page reloads as you edit the code. Offline support and app install are switched off in this mode.

### The built app

```bash
npm run build
npm run preview
```

Open http://localhost:4173. This is the same app you would deploy, including offline support and the install prompt.

## Use it on an Android phone

Android only offers to install the app, and the app only works offline, when it is served over HTTPS or from `localhost`. Two ways to get that:

- **From your computer over USB:** run `npm run build && npm run preview`, connect the phone with USB debugging on, then run `adb reverse tcp:4173 tcp:4173`. Open http://localhost:4173 in Chrome on the phone and choose **Install app** (or **Add to Home screen**) from the menu.
- **Over HTTPS on your home network:** run `scripts/make-https-cert.sh <your computer's IP>` once. On the phone, install `~/.config/guitar2lute/https/guitar2lute-ca.crt` as a CA certificate (Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate). Then run `npm run preview:https`, let port 4173 through the firewall if you have one (`sudo ufw allow from 192.168.1.0/24 to any port 4173 proto tcp`), open `https://<your computer's IP>:4173` in Chrome on the phone and choose **Install app**. The certificate authority the script makes can only vouch for addresses on your home network, and its key is deleted once the server certificate is signed. Run the script again if your computer's IP changes.
- **From a web host:** `npm run build` writes a static site to `dist/`. Upload that folder to any static host that serves HTTPS (GitHub Pages, Netlify, Cloudflare Pages and so on), at the root of the domain, then open it in Chrome on the phone and install it.

`npm run preview -- --host` also makes the app reachable from other devices on your network. Over plain HTTP it still works in the browser there, but it can't be installed or used offline.

## Your pieces

Pieces are saved automatically in the browser you use, so they stay on that device and in that browser profile. Clearing the site's data deletes them. To back them up, use the **Export…** menu at the top (**This piece (JSON)** or **All pieces (JSON)**), and **Import JSON** to load a backup into another browser or device.

## Importing tab

Besides pasted text and PDFs of plain-text tab, **Import tab…** opens MusicXML files (`.musicxml`, `.mxl`) that have a tab staff, and plain-text files.

## Tests

```bash
npm test             # unit and component tests (Vitest)
npm run typecheck    # TypeScript check
npm run e2e          # browser tests (Playwright); builds the app and serves it on port 4173
```

Before running the browser tests for the first time, install Playwright's Chromium:

```bash
npx playwright install chromium
```

## Project layout

- `src/core/`: the model, tab and PDF parsing, the guitar-to-lute converter, notation, and storage
- `src/ui/`: React components
- `src/audio/`: playback
- `tests/`: unit and component tests; `e2e/`: browser tests
- `docs/superpowers/specs/`: the design spec
