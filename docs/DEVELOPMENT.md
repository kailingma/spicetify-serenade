# Serenade: development notes

Everything that was decided, discovered or worked around while building
Serenade, so it doesn't have to be rediscovered. Written against
**Spotify 1.3.4.258** and **Spicetify 2.46.4** (Marketplace 1.0.9 / v1.0.12 header).
Spotify renames things often; when something breaks after an update, start at
[When Spotify updates](#when-spotify-updates).

- [Files](#files)
- [Design decisions](#design-decisions)
- [How the dynamic parts work](#how-the-dynamic-parts-work)
- [Spotify internals reference](#spotify-internals-reference)
- [Marketplace internals reference](#marketplace-internals-reference)
- [Workflows](#workflows)
- [Publishing and the Marketplace](#publishing-and-the-marketplace)
- [Linux / GNOME notes](#linux--gnome-notes)
- [Rejected approaches and lessons](#rejected-approaches-and-lessons)

---

## Files

| Path | What |
|---|---|
| `user.css` | All styling. Sections in order: tokens → ambient backdrop → layout shell → search & top bar → typography → cards → track lists → Home order → header colour wash → now playing bar → Spicetify Marketplace → Spicetify popups → menus → scrollbars → resizers → reduced motion. |
| `theme.js` | Ambient backdrop layers, accent extraction, adaptive veil. One IIFE, no globals. |
| `color.ini` | Schemes `Ember` (default, warm) and `Tide` (cool). The `button`/`notification` values are only fallbacks; `theme.js` overrides them at runtime. |
| `manifest.json` | Marketplace listing. `include` points at jsDelivr (see [Publishing](#publishing-and-the-marketplace)). |
| `assets/` | README and Marketplace images (all sanitized, see [Screenshots](#promotional-screenshots)). |
| `CREDITS.md` | The public-domain paintings used as fake covers in screenshots. |
| `tools/` | Dev/inspection/screenshot scripts (see [Workflows](#workflows)). `art.js`, `banner.js` are generated and gitignored. |
| `shots/` | Raw captures (gitignored). |

CSS custom properties owned by the theme are prefixed `--sr-`
(`--sr-radius`, `--sr-hairline`, `--sr-serif`, `--sr-veil`, …). DOM nodes it
creates are `#serenade-ambient`, `.serenade-art`, `.serenade-veil`.

## Design decisions

**Name.** "Serenade": soft, musical, and starts like *serif*. Checked free on
the Marketplace and GitHub before publishing. (Working name was "Nocturne".)

**Look.** Ink-dark glass panels over a heavily blurred wash of the current
cover. Panels are `rgba(main, .56)` with a 1px `rgba(255,255,255,.07)` hairline
and 14px radius. No `backdrop-filter` on the big panels: the backdrop is
already blurred, so plain translucency looks the same and is far cheaper.
`backdrop-filter` is only used on small floating things (menus, popups).

**Type.** Page titles (`[data-testid=entityTitle] h1`), Home shelf headings,
Marketplace section headings, README h1/h2 and popup titles use
**Instrument Serif** (Google Fonts `@import`, falls back to a system serif).
Everything else stays on Spotify's own UI font. A serif *body* was not tried;
the contrast between serif display and sans UI is the point.

**Accent.** Taken from the cover (see below). Used deliberately sparingly:
progress-bar fill, focus rings, toggles, "external JS" tag outline, active
Marketplace card border, the speaker icon in "Playing on…". The main
play/pause button is **plain light**, not accent. An earlier version used an
accent-filled glowing play button, accent volume bar and progress glow; the
user found the controls "too accented", so those were removed.

**Player bar.** A floating rounded bar, one step lighter than the panels
(`highlight-elevated` @ .8 plus a faint top-lit gradient), soft shadow. An
experiment that wrapped the bar *and* the "Playing on…" line in one boxed card
with a darker footer was rejected as "boxed in"; keep them separate. "Playing
on…" sits under the bar, right-aligned with the fullscreen button (18px inline
padding), 6px gap above, subtext colour.

**Contrast.** The top bar has no panel behind it, so its icons sit straight on
the backdrop. Rather than brightening icons (a band-aid), the backdrop is
capped: the veil is computed per cover so the brightest backdrop point stays
at relative luminance ≤ 0.06. That gives the subdued top-bar icons ≥ 3.8:1
(WCAG non-text needs 3:1) and primary text > 8:1. Verified by sampling
screenshot pixels (`tools/lum.py`).

**Header colour wash.** Playlist/album headers keep Spotify's per-playlist
colour, but as one even layer at 50% that fades out under the action row,
instead of Spotify's stack of shade layers (which leaves seams on glass).

**Home order.** Greeting/shortcuts → Recents → Made For &lt;you&gt; → everything
else. A user preference that shipped in the public theme; it matches
Spotify's *English* section labels and is a no-op in other languages.

**Top-bar buttons.** Round Home / Marketplace / profile buttons are glass, not
solid, and don't grow on hover (they're clipped by fixed 48px boxes); they
brighten instead.

**Marketplace.** Restyled to match: chip tabs, glass toolbar, glass cards with
title → author · ★ → description hierarchy, quiet pill tags, serif headings,
README pages and settings popup in the theme's language.

**Third-party extensions.** Cat Jam's video is sized into the bar
(`#catjam-webm`, 52px, centred). Spicy Lyrics replaces the right-hand Now
Playing view; the theme doesn't fight it.

## How the dynamic parts work

All in `theme.js`.

**Finding the cover.** `Spicetify.Player.data.item.metadata.image_xlarge_url`
(`spotify:image:<id>` → `https://i.scdn.co/image/<id>`) when available;
otherwise the `<img>` inside `[data-testid="now-playing-widget"]`.
`Player.data` is **undefined while controlling another device over Spotify
Connect**, which is why the DOM fallback exists. Polled every 1s plus the
`songchange` event. The same cover arrives at different sizes
(`ab67616d0000b273…` vs `…0000e1a3…`), so covers are compared by the **last 24
characters of the image id**, not the URL, or the crossfade re-fires.

**Backdrop.** Two `.serenade-art` layers (crossfade 1.4s), each
`filter: blur(90px) saturate(1.6) brightness(0.8)`, `inset:-15%`,
`scale(1.15)`. Above them `.serenade-veil` (the adaptive darkening) with a
6%-opacity SVG grain to stop banding. `#main` is lifted to `z-index:1`.

**Accent extraction.** Draw the cover to a 40×40 canvas (i.scdn.co sends
CORS headers, so `getImageData` works), bucket pixels into 18 hue bins weighted
by `s² × (1 − |l − .55| × 1.4)`, skipping s < .22 and very dark/light pixels.
Take the heaviest bin's mean hue and saturation (clamped .55–.9) at lightness
.7. Too little colour (best bin weight < 4 or total < 6) → amber fallback
`255,179,107`. Written to `--spice-button`, `--spice-rgb-button`,
`--spice-button-active` (+25% towards white), `--spice-notification` on
`<html style>`, which overrides Spicetify's `:root` colours.

**Adaptive veil.** Average the cover into an 8×8 grid (approximates the 90px
blur), apply the same saturate/brightness maths, then binary-search the
smallest veil alpha (floor .22) that keeps every cell under the luminance cap.
`--sr-veil` is registered with `@property` (`<number>`) so it animates with the
crossfade. Constants: `MAX_BACKDROP_LUMINANCE = 0.06`, `MIN_VEIL = 0.22`,
`ART_BRIGHTNESS = 0.8`, `ART_SATURATE = 1.6` (must match `user.css`).

## Spotify internals reference

Stable hooks (good to target): `#main`, `.Root`, `#global-nav-bar`,
`#Desktop_LeftSidebar_Id`, `#main-view`, `.main-view-container`,
`[data-testid=now-playing-bar]`, `[data-testid=now-playing-widget]`,
`[data-testid=control-button-playpause]`, `[data-testid=progress-bar]`,
`[data-testid=playback-progressbar]`, `[data-testid=volume-bar]`,
`[data-testid=entityTitle]`, `[data-testid=tracklist-row]`,
`[data-testid=home-button]` (sometimes absent; use `aria-label`),
`[data-testid=user-widget-link]` (its `aria-label` is the display name),
`.LayoutResizer__resize-bar`, `.os-theme-spotify` scrollbars.

Readable `main-*` / `Root__*` class names only exist when Spicetify's CSS map
matches the Spotify build. If the DOM shows hashed classes (`zXqmJUq4…`)
instead of `Root__top-container`, the preprocessing is stale; see
[When Spotify updates](#when-spotify-updates).

Right sidebar container: `.Root > div:first-child > div:has(> .LayoutResizer__inline-start) > div`.

**Colour tokens.** Spotify's encore tokens are wired to Spicetify colours in
`xpui-snapshot.css`, e.g. `.encore-dark-theme{--background-base:var(--spice-main);--background-highlight:var(--spice-main-elevated);--background-elevated-base:var(--spice-main-elevated);--background-elevated-highlight:var(--spice-highlight-elevated);…}`.
Redefining these tokens on a container is the clean way to restyle
everything inside it. Examples in the theme:

- Panels set `--background-base: transparent` so inner surfaces stay glass.
- `#global-nav-bar` redefines `--background-elevated-base/-highlight/-press`,
  `--background-highlight`, `--background-press`, `--background-base:
  transparent` and `--essential-subdued`. That one block fixed the solid
  round buttons and the Ctrl+L key caps.

**Gotchas found the hard way**

| Symptom | Cause | Fix in theme |
|---|---|---|
| Solid black band behind/below the floating player bar | `.Root__now-playing-bar` wrapper paints `--spice-player` | `background: transparent` on it |
| Strip above playlist titles | `.main-topBar-background` opacity is set **inline** by Spotify (0 at top, fades in on scroll); forcing it with `!important` made it always visible | Never touch its opacity |
| Seams between header and action row | Different page types build the header colour differently: Liked Songs gives an inline `background-color` on `.main-entityHeader-backgroundColor` and `.main-actionBarBackground-background`; playlists give an inline `--background-base` and use `.playlist-playlist-actionBarBackground-background` with a 70% gradient; there's also an extra shade layer `.main-entityHeader-backgroundColor + .main-entityHeader-backgroundColor` | Strip `background-image`, opacity .5 on all colour layers, paint `background-color: var(--background-base)` **only** on `[style*="--background-base"]` (inline `background-color` must keep winning), hide the shade layer, mask the action-bar layer to fade out |
| Home `order` ignored | Spicetify's Home-config feature injects `:is(.main-gridContainer-homepageContent,.main-home-content) section{order:0 !important}` (specificity 0,1,1) | `!important` plus a specificity bump: `.main-home-content > :not(.sr-x)` |
| Round top-bar buttons clip on hover | Encore buttons scale on hover via `--encore-button-hover-scale`; the Marketplace/Home buttons sit in fixed 48px boxes (`.spicetify-sc-contentArea` has `overflow:hidden`) | `#global-nav-bar button{--encore-button-hover-scale:1}` + `filter:brightness()` |
| Smudges around the Ctrl+L hint | `.main-globalNav-searchInputKBDWrapper` hides placeholder text by painting a band of `--background-elevated-highlight` over it (only works on an opaque box); key caps use `0 1px 0 var(--background-base)` and `--essential-subdued` | Drop the band's background; redefine those tokens in the nav |
| Progress bar colours | `[data-testid=progress-bar]` reads `--fg-color`, `--bg-color`, `--is-active-fg-color`, `--progress-bar-height`, `--progress-bar-radius` | Set those vars (accent for playback, text colour for volume) |
| "Playing on…" strip styling | It's `[data-testid=now-playing-bar] > .encore-bright-accent-set` and inherits bright-accent tokens | Override background/colour, `--text-base` |
| Cat Jam pokes out of the bar | Extension sets 65px and `margin-top:-25px` | Size and centre `#catjam-webm` |

`Spicetify.Platform.History.push(path)` navigates (`/`, `/collection/tracks`,
`/playlist/<id>`, `/marketplace`). It can be missing until Spicetify finishes
loading, and some `/playlist/<id>` pushes for Spotify-generated playlists are
ignored; clicking a library row works.

## Marketplace internals reference

Readable classes, safe to target: `.marketplace-tabBar-headerItemLink`
(+ `.marketplace-tabBar-active`), `.marketplace-header` (toolbar *and* README
title bar), `.marketplace-header__label`, `#marketplace-update`,
`.marketplace-header-icon-button`, `#marketplace-settings-button`,
`.Dropdown-control/-menu/-option` (react-dropdown), `.searchbar-bar`,
`.marketplace-card-type-heading`, `.marketplace-grid .main-card-card`
(+ `.marketplace-card--installed`), `.main-cardHeader-text`,
`.marketplace-cardSubHeader` (it's `flex-direction:column` by default),
`.marketplace-card__author(s)`, `.marketplace-card-desc` (falls back to
**Arial** unless you set `font-family`), `.marketplace-card__bottom-meta`,
`li.marketplace-card__tag[data-tag="…"]` (Marketplace colours `external JS`
red, `dark` black, `light` white via very specific selectors, so `!important`),
`.marketplace-card__tags-more-btn`, `.marketplace-footer button` (the "Load more"
button uses **inline** styles and a 100px `»` `<p>`), `#marketplace-readme`
(its own reset stylesheet: system-ui, blue links, black `code`, `kbd`,
`details`, `summary`, `tr`).

Hashed CSS-module classes (`button-module__button___hf2qg_marketplace`,
`toggle-module__toggle-indicator___nCxwE_marketplace`, …) change between
Marketplace builds, so they're matched with `[class*="toggle-module__toggle-indicator___"]`
etc. Toggle markup: `label > input[type=checkbox] + span(wrapper) > span(indicator)`.

The settings dialog is Spicetify's shared popup:
`generic-modal > .GenericModal.spicetify-popup > .spicetify-popup-container`
with `.spicetify-popup-title`; other extensions' popups use the same, so
styling it is global on purpose.

**Data loading.** The Marketplace calls
`api.github.com/search/repositories?per_page=100&q=topic:spicetify-themes`
(GitHub's default best-match order), loads further pages only on "Load more",
and sorts/filters **client-side** over what's loaded. Unauthenticated search
is limited to 10 requests/minute; reloading the Marketplace a few times in a
row leaves it spinning forever. Check with
`fetch('https://api.github.com/rate_limit')` in the page. To iterate on
Marketplace CSS without burning the quota, hot-swap the stylesheet instead of
reloading (see below).

## Workflows

### Local dev loop

The repo is the installed theme: `~/.config/spicetify/Themes/Serenade` is a
symlink to the clone (Spicetify follows symlinks).

```bash
spicetify config current_theme Serenade color_scheme Ember inject_theme_js 1
spicetify apply        # first time / after Spicetify or Spotify updates
spicetify refresh      # after editing user.css / theme.js / color.ini
```

`spicetify refresh` rewrites the files but the open client keeps the old CSS
until it reloads. Either reload the page via CDP (below) or hot-swap only the
stylesheet, which keeps state and avoids Marketplace API calls:

```bash
node tools/cdp.mjs eval "(()=>{const l=[...document.querySelectorAll('link[rel=stylesheet]')].find(l=>/user\.css/.test(l.href)); l.href=l.href.split('?')[0]+'?t='+Date.now(); return 'swapped'})()"
```

### Inspecting the live client (CDP)

Spotify is Chromium Embedded; start it with a debugging port and drive it
from Node 22+ (built-in `WebSocket`):

```bash
pkill -x spotify; spotify --remote-debugging-port=9229 &
node tools/cdp.mjs eval "location.pathname"            # run JS in the xpui page
node tools/cdp.mjs evalfile tools/opaque.js            # run a JS file
node tools/cdp.mjs shot shots/x.png                    # full screenshot (device pixels, 2x)
node tools/cdp.mjs shot shots/x.png 0,0,1500,750       # clipped, CSS px
node tools/cdp.mjs mouse 1200,600                      # hover (CSS px)
node tools/cdp.mjs click 137,376                       # click (CSS px)
spicetify restart                                      # back to a normal launch when done
```

Screenshot pixels are **2× CSS pixels** on a HiDPI display; divide by 2 to get
coordinates for `mouse`/`click`. Clicking a link with an external `href` (e.g.
a Marketplace card title) opens the system browser.

Useful one-offs:

- `tools/opaque.js` lists every element in `#main-view` with an opaque
  background (how the Marketplace and README black boxes were found).
- `document.elementsFromPoint(x, y)` with computed `backgroundColor` finds what
  is painting a given pixel (how the black band was traced).
- To find which rule sets a property, walk `document.styleSheets`, filter
  `r.style.<prop>` and `el.matches(r.selectorText)` (how the Home-config
  `order` rule and the hover-scale rule were found).
- `tools/lum.py shot.png` reports WCAG luminance of the top and bottom pixel
  rows and the resulting contrast for the subdued icon colour.

### Promotional screenshots

Rule: **no real listening data**: no real song, artist, album or playlist
names, no username, no device name, no real cover art. The pipeline:

1. `python3 -I tools/build_art.py` builds `tools/art.js` from
   `tools/art-sources.json`: public-domain paintings on Wikimedia Commons,
   centre-cropped to squares.
2. In the client: `node tools/cdp.mjs evalfile tools/art.js`, set
   `window.__SR_NOW = 0..3` (which painting is "now playing": 0 warm, 1 teal,
   2 orange, 3 amber fallback), then `node tools/cdp.mjs evalfile tools/sanitize.js`.
   It:
   - replaces all text in the library, main view, now-playing bar and top bar
     with invented names, mapped consistently (the same playlist gets the same
     name everywhere);
   - replaces the signed-in display name (read from the profile button) with
     "Sam" and "Playing on …" with "Living Room Speaker";
   - swaps every cover `<img>` for a painting, keeping Spotify's generic Liked
     Songs and Your Episodes art;
   - retints playlist headers from the fake cover;
   - hides the third-party right panel and Cat Jam;
   - sets the backdrop/accent/veil from the fake cover using **verbatim copies
     of the theme.js functions**. If you change the algorithm in `theme.js`,
     re-copy `rgbToHsl…extractAccent` and `luminance…computeVeil` into
     `sanitize.js`.
   - returns every remaining visible string. **Read that list before using a
     capture.** The only non-visible leak found was a 1×1 screen-reader live
     region (`[id^=live-region]`), which it now blanks.
3. Capture right away (React re-renders and track changes undo the swap; don't
   reload between sanitize and shot). Move the mouse off-UI first.
4. Banner: `python3 -I tools/make_banner.py shots/home_0.png`, then
   `evalfile tools/banner.js`, `shot shots/banner_raw.png 0,0,1500,750`, and
   remove `#sr-banner`. It's laid out in Spotify's own window because Instrument
   Serif is already loaded there.
5. `python3 -I tools/export_assets.py` writes `assets/` (JPEG q88, no EXIF).
   Re-running on the same captures is byte-identical.

**Art licensing.** Paintings must be public domain **in the US too**: works by
artists who died long ago can still be US-copyrighted if first published 1930
or later (URAA restoration, 95-year term). So the set is limited to pre-1930
works (Kandinsky's *Composition IX/X*, 1930s Mondrians and Delaunay's *Rythmes*
were dropped for this). The Art Institute of Chicago's image server and The
Met's API both sit behind bot protection; don't try to bypass it, use
Wikimedia Commons (send a descriptive User-Agent, keep volume low; it
rate-limits with HTTP 429).

## Publishing and the Marketplace

Requirements (from the Marketplace wiki): public repo, topic
`spicetify-themes`, `manifest.json` at the root with `name`, `description`,
`preview`, `readme`, `usercss`, `schemes` (paths relative to the root), and
optionally `include`, `authors`, `tags`, `branch`.

- `include` must be **URLs**, and raw.githubusercontent links don't work for
  scripts. Use jsDelivr: `https://cdn.jsdelivr.net/gh/kailingma/spicetify-serenade@main/theme.js`.
  jsDelivr caches `@main` for up to 12h; after changing `theme.js`, purge with
  `curl https://purge.jsdelivr.net/gh/kailingma/spicetify-serenade@main/theme.js`.
  (`user.css`, `color.ini`, `README.md` are fetched fresh from GitHub.)
- The card shows `preview` cropped to a square, plus `tags` as chips, and adds
  an "external JS" chip automatically when `include` is set.
- Discovery depends on GitHub's search index (a minute or two after adding the
  topic). Check with
  `gh api -X GET search/repositories -f q='topic:spicetify-themes' -f per_page=100 -f page=N`.
  A new 0-star theme landed on page 2, so in the client it appears only after
  one "Load more".
- Commits use the GitHub noreply address; keep it that way in this public repo.
- Don't install Serenade from the Marketplace on a machine that also has the
  local symlinked theme; the two would stack.

## When Spotify updates

1. `spicetify apply` (or `spicetify restore backup apply` if it says
   "Preprocessed Spotify data is outdated"). That refreshes the CSS map; until
   then the DOM has hashed class names and many `main-*`/`Root__*` selectors
   silently stop matching.
2. Launch with `--remote-debugging-port=9229` and run `tools/opaque.js` on Home,
   a playlist, Liked Songs, the Marketplace grid and a README. Anything solid
   that appears is a new surface to glass over.
3. Re-check the gotchas table; the `data-testid` hooks are the most stable,
   hashed `e-10860-*` encore classes the least (don't target those).

## Linux / GNOME notes

Spotify runs under XWayland with a GNOME-drawn title bar and square corners;
the theme can't round the window (CEF has no transparent window). The
[Rounded Window Corners Reborn](https://extensions.gnome.org/extension/7048/rounded-window-corners-reborn/)
extension can. With **fractional scaling** its shader effect re-renders native
Wayland Chromium/Electron windows off-screen at a non-native size (blurry) and
its white-backed shadow layer peeks out 1px. The fix is not a blacklist
patch but limiting the extension to the windows that need it: whitelist mode
with only `Spotify`/`spotify`:

```bash
S=~/.local/share/gnome-shell/extensions/rounded-window-corners@fxgn/schemas
K=org.gnome.shell.extensions.rounded-window-corners-reborn
gsettings --schemadir $S set $K blacklist "['Spotify', 'spotify']"
gsettings --schemadir $S set $K whitelist true
gnome-extensions disable rounded-window-corners@fxgn && gnome-extensions enable rounded-window-corners@fxgn
```

GNOME extensions can be installed without a logout through
`gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.InstallRemoteExtension '<uuid>'`
(GNOME shows its own confirmation dialog).

## Rejected approaches and lessons

- **Overriding opacity Spotify sets inline** (sticky top bar): breaks its
  scroll behaviour. Style around inline-driven properties, never over them.
- **Per-layer opacity on header colour stacks**: different page types compose
  differently, so seams appear. Normalise to one layer.
- **Brightening icons for contrast**: treats the symptom; cap the backdrop
  instead.
- **Painting over content to hide it** (Spotify's KBD band): impossible on
  translucent surfaces; remove the paint.
- **Generated abstract "covers"**: looked cheap; real public-domain paintings
  read as album art.
- **A uniform veil gradient (clear top, dark bottom)**: made the top bar
  unreadable on bright covers and the bottom nearly black.
- **Boxed player card / accented play button / accent volume**: too heavy;
  the user preferred the lighter floating bar with accent only on progress.
