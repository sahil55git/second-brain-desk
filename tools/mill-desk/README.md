# Mill Desk screen source

The Mill Desk (`/mill`) screen is one self-contained page, `public/mill/desk.html`, shown full-screen
inside `app/mill/page.tsx` (which passes it the Bluetooth scale reading and the login).

Edit the parts here, then run `python3 tools/mill-desk/build.py`:

- `base.html` — layout, icons, Worker / Counter screens, slip, Waiting, Jobs, Held, job card
- `app_voice.js` / `voice_engine.js` / `app_voice.css` — settings, mic and speaker buttons, voice assistant
- `app_mill.js` — Our mill tab (crushing runs: seed → machine → oil → tank)
- `app_live.js` / `app_live.css` — live layer: real scale, saving to `/api/mill`, offline cache, printing
- `build.py` — applies the edits to `base.html` and writes `public/mill/desk.html` (and `preview.html`, a demo copy)

Open `public/mill/desk.html?demo=1` (signed in) to try the screen with the demo scale and demo data.
