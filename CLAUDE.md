# Serenade (Spicetify theme)

Read `docs/DEVELOPMENT.md` before changing anything: it records the design
decisions, Spotify/Marketplace internals (selectors, tokens, gotchas) and the
workflows below. If `LOCAL_NOTES.md` exists (gitignored), read it too: it has
machine-specific setup and the owner's preferences.

Quick facts:

- Files: `user.css` (all styling, sectioned), `theme.js` (backdrop, accent,
  adaptive veil), `color.ini` (`Ember`, `Tide`), `manifest.json` (Marketplace).
- The local install is this folder, symlinked as
  `~/.config/spicetify/Themes/Serenade`. Apply edits with `spicetify refresh`.
- Inspect/drive the client: launch `spotify --remote-debugging-port=9229`, then
  `node tools/cdp.mjs eval|evalfile|shot|mouse|click`. Run `spicetify restart`
  afterwards so Spotify isn't left with the debug port open.
- Prefer root-cause fixes: redefine Spotify's encore tokens on a container
  rather than overriding single elements, and never override properties
  Spotify drives inline (e.g. `.main-topBar-background` opacity).
- Keep accents sparing (progress bar, focus, toggles); the play button stays
  light.
- Screenshots for the README/Marketplace must be sanitized with
  `tools/sanitize.js` + `tools/art.js` (public-domain, pre-1930 paintings)
  and the text audit it prints must be checked. Never publish real listening
  data, usernames or device names.
- This repo is public and listed on the Marketplace: pushing changes ships them
  to users. `theme.js` is served via jsDelivr `@main` (purge after changes).
