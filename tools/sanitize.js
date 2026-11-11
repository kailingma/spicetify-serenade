// Replaces personal content in the Spotify UI with invented content for
// promotional screenshots. Run in the xpui page. Returns remaining visible text.
(async () => {
  const NOW = window.__SR_NOW ?? 0;
  const root = document.documentElement;
  const FALLBACK = [255, 179, 107];
  // --- copied verbatim from theme.js so screenshots match real behaviour ---
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
  }

  function extractAccent(img) {
    const size = 40;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Bucket by hue, weighting pixels that are saturated and mid-lightness.
    const buckets = Array.from({ length: 18 }, () => ({ w: 0, h: 0, s: 0 }));
    let totalWeight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.22 || l < 0.12 || l > 0.92) continue;
      const w = s * s * (1 - Math.abs(l - 0.55) * 1.4);
      if (w <= 0) continue;
      const b = buckets[Math.floor(h * 18) % 18];
      b.w += w; b.h += h * w; b.s += s * w;
      totalWeight += w;
    }
    const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
    // Too little colour in the cover (e.g. black & white photos): keep amber.
    if (best.w < 4 || totalWeight < 6) return FALLBACK;

    const h = best.h / best.w;
    const s = Math.min(0.9, Math.max(0.55, best.s / best.w));
    return hslToRgb(h, s, 0.7); // light enough to read on near-black
  }

  // WCAG relative luminance of an sRGB colour given as 0–1 channels.
  function luminance([r, g, b]) {
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Top-bar icons use the subdued text colour (≈ L 0.37). Keeping the backdrop
  // at or below L 0.06 gives them ≥ 3.8:1 (WCAG non-text needs 3:1) and puts
  // primary text above 8:1.
  const MAX_BACKDROP_LUMINANCE = 0.06;
  const MIN_VEIL = 0.22; // never fully clear, so the panels still read as glass
  const ART_BRIGHTNESS = 0.8; // matches filter: brightness() in user.css
  const ART_SATURATE = 1.6; // matches filter: saturate() in user.css

  function computeVeil(img) {
    // Approximate the 90px blur by averaging an 8×8 grid of the cover, then
    // apply the same saturate/brightness filters the backdrop uses.
    const n = 8;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, n, n);
    const data = ctx.getImageData(0, 0, n, n).data;

    const base = [0, 1, 2].map((i) => [12, 11, 16][i] / 255);
    const mainRgb = getComputedStyle(root).getPropertyValue("--spice-rgb-main").split(",").map(Number);
    if (mainRgb.length === 3 && mainRgb.every((v) => !Number.isNaN(v))) {
      for (let i = 0; i < 3; i++) base[i] = mainRgb[i] / 255;
    }

    let alpha = MIN_VEIL;
    for (let i = 0; i < data.length; i += 4) {
      let rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
      // CSS saturate(): move each channel away from the pixel's luma.
      const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      rgb = rgb.map((c) => Math.min(1, Math.max(0, y + (c - y) * ART_SATURATE)) * ART_BRIGHTNESS);

      // Smallest veil alpha that brings this cell under the luminance cap.
      let lo = alpha, hi = 0.97;
      const lum = (a) => luminance(rgb.map((c, k) => c * (1 - a) + base[k] * a));
      if (lum(lo) <= MAX_BACKDROP_LUMINANCE) continue;
      for (let step = 0; step < 18; step++) {
        const mid = (lo + hi) / 2;
        if (lum(mid) > MAX_BACKDROP_LUMINANCE) lo = mid; else hi = mid;
      }
      alpha = hi;
    }
    return alpha;
  }

  // --- end copy ---
  const ART = window.__SR_ART;
  const ORDER = ART.covers.map((_, i) => (i * 7) % ART.covers.length);
 // which fake "now playing" palette to use


  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) ^ Math.imul(seed ^ (seed >>> 13), 3266489909)) >>> 0) / 4294967296;

  // ---- invented names ----
  const TITLES = ["Paper Lanterns", "Slow Tide", "Velvet Hours", "Marigold Static", "Night Swim", "Soft Weather", "Glasshouse", "Low Light Parade", "Honey & Ash", "Quiet Satellites", "Linen Sky", "Moth Hour", "Driftwood Choir", "Amber Line", "Small Fires", "Northbound", "Coral Room", "Halcyon", "Lantern Bay", "Fable Street", "Tin Moon", "Pale Garden", "Second Summer", "Undertow", "Kite Season", "Salt & Sugar", "Blue Hour Radio", "Cinder Waltz", "Willow Tape", "Hollow Bells"];
  const ARTISTS = ["Mira Vale", "The Lantern Society", "Juniper & Co.", "Odessa Bloom", "Northern Hum", "Felix Arden", "Saltwater Choir", "Luna Okafor", "The Quiet Hours", "Ivo Marsh", "Ana Sol", "Westward Kites", "Ruth Calder", "Paper Boats", "Theo Lind", "Sable & Rye", "Nadia Wren", "Orchard Lights", "Hollis Gray", "Copper Fields"];
  const PLAYLISTS = ["Slow Sundays", "Late Night Drive", "Coffee & Rain", "Golden Hour", "Soft Focus", "Road Trip", "Morning Light", "Deep Cuts", "Kitchen Dancing", "Window Seat", "Sunday Reset", "Night Owls", "First Snow", "Long Walks"];
  const MOODS = ["Dreamy", "Mellow", "Late Night", "Acoustic", "Warm", "Focus", "Chill", "Upbeat", "Nostalgic", "Indie", "Soft Pop", "Jazzy"];
  const USER = "Sam";
  // The signed-in display name (read from the profile button), replaced with USER.
  const REAL_NAME = (document.querySelector('[data-testid="user-widget-link"]')?.getAttribute("aria-label") || "").trim();
  const isMe = (t) => !!REAL_NAME && t.trim().toLowerCase() === REAL_NAME.toLowerCase();
  const mentionsMe = (t) => !!REAL_NAME && t.toLowerCase().includes(REAL_NAME.toLowerCase());

  const KEEP = new Set(["Your Library", "Create", "Playlists", "Podcasts", "Albums", "Artists", "Recents", "Playlist", "Public Playlist", "Show all", "All", "Music", "Audiobooks", "Title", "Album", "Date added", "#", "Liked Songs", "Your Episodes", "Artist", "Single", "EP", "Compilation", "Add", "Name & details", "Recently added", "Custom order", "Switch to video", "Lyrics", "Made For", "Jump back in", "Your top mixes", "Recommended Stations", "Your favorite artists", "Good morning", "Good afternoon", "Good evening", "Show more", "Pre-save upcoming releases", "Music video", "Follow", "Following", "About the artist", "Credits", "Next in queue", "Open queue", "Liked Songs", "Daily Mix", "Discover Weekly", "Release Radar", "On Repeat", "Repeat Rewind", "Your Top Songs", "Mix", "Radio", "Video", "Podcast", "Episode", "Show", "Audiobook", "Search", "Home", "Back", "Forward", "Upgrade", "Install App", "Explore Premium", "Related music videos", "Saved & downloaded episodes", "•", "·", ",", "E"]);

  const map = new Map();
  const used = new Map();
  const pick = (pool, key) => {
    const k = pool[0] + "\u0000" + key;
    if (!map.has(k)) { const n = used.get(pool[0]) ?? 0; used.set(pool[0], n + 1); map.set(k, pool[n % pool.length]); }
    return map.get(k);
  };

  const isPlaylistContext = (el) => !!el.closest('#Desktop_LeftSidebar_Id [role="row"], [data-testid="entityTitle"], [data-testid="shortcut-image"]') ||
    !!el.closest('[data-testid="home-page"] section:first-of-type');

  function fakeFor(text, el) {
    const t = text.trim();
    if (!t || KEEP.has(t)) return null;
    if (/^[\d\s:#.,+\-–/()%]+$/.test(t)) return null; // numbers, durations
    if (/\b(ago|songs?|hr|min|sec|likes?|saves?|followers?)\b/i.test(t) && !mentionsMe(t)) return null;
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(t)) return null;
    if (isMe(t)) return USER;
    if (el.closest('[data-testid="user-widget-link"]') && t.length === 1) return USER[0];
    if (/Playing on/i.test(t)) return "Playing on Living Room Speaker";
    let m;
    if ((m = t.match(/^(Based on|Made For|More like|Inspired by|By)\s+(.+)$/))) return m[1] + " " + (isMe(m[2]) ? USER : pick(PLAYLISTS, m[2]));
    if (t.includes(" • ") || t.includes(" · ")) return t.split(/\s[•·]\s/).map((p) => (KEEP.has(p) || /^\d/.test(p) ? p : isMe(p) ? USER : pick(ARTISTS, p))).join(" • ");
    if (el.closest('[data-testid="entityTitle"], [data-testid="shortcut-image"]') || el.closest('#Desktop_LeftSidebar_Id')) {
      // Library rows and page titles: playlist-ish names. Row subtitles ("Playlist • <owner>") handled above.
      return el.closest('#Desktop_LeftSidebar_Id') && el.closest('[class*="subtitle"], [class*="Subtitle"]') ? pick(ARTISTS, t) : pick(PLAYLISTS, t);
    }
    if (el.closest('[role="checkbox"], [data-encore-id="chip"]')) return pick(MOODS, t);
    if (el.closest('[role="gridcell"][aria-colindex="3"]')) return pick(TITLES, "album:" + t);
    const cs = getComputedStyle(el);
    const big = parseFloat(cs.fontSize) >= 16 || parseInt(cs.fontWeight) >= 600;
    if (el.closest('[data-testid="entityHeader"], .main-entityHeader-container') && t.split(",").length > 2) return "Unhurried songs for slow mornings and long, quiet evenings.";
    if (t.split(/,\s*/).length > 1) return t.split(/,\s*/).map((p) => pick(ARTISTS, p)).join(", ");
    return big ? pick(TITLES, t) : pick(ARTISTS, t);
  }

  // ---- hide extension UI that isn't part of the theme ----
  let st = document.getElementById("sr-shot-style");
  if (!st) { st = document.createElement("style"); st.id = "sr-shot-style"; document.head.append(st); }
  st.textContent = `
    #catjam-webm{display:none!important}
    .Root__right-sidebar{display:none!important}
    .Root__top-container{grid-template-columns:auto 1fr!important;grid-template-areas:"top-banner top-banner" "global-nav global-nav" "left-sidebar main-view" "now-playing-bar now-playing-bar"!important}
    [data-testid="home-ads-container"], [aria-label*="Vaping"] { display:none!important }
  `;

  // ---- text ----
  const roots = ["#Desktop_LeftSidebar_Id", "#main-view", ".Root__right-sidebar", "[data-testid='now-playing-bar']", "#global-nav-bar"].map((s) => document.querySelector(s)).filter(Boolean);
  for (const root of roots) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      const el = n.parentElement; if (!el || el.closest("svg, style, script")) continue;
      const f = fakeFor(n.nodeValue, el); if (f !== null) n.nodeValue = f;
    }
  }

  // ---- images ----
  const nowSrc = ART.now[NOW % ART.now.length];
  const artFor = new Map(); let next = 0;
  for (const img of document.querySelectorAll("img")) {
    if (!img.src || img.closest("svg") || /misc\.scdn\.co/.test(img.src) || img.src.startsWith("data:")) continue;
    const inNow = img.closest('[data-testid="now-playing-widget"]');
    if (!artFor.has(img.src)) artFor.set(img.src, ART.covers[ORDER[next++ % ORDER.length]]);
    img.srcset = ""; img.src = inNow ? nowSrc : artFor.get(img.src);
  }
  document.querySelectorAll('[id^="live-region"]').forEach((e) => (e.textContent = ""));
  const entityImg = document.querySelector('.main-entityHeader-container img, [data-testid="entity-image"], [data-testid="playlist-image"] img');
  if (entityImg && entityImg.src.startsWith("data:")) {
    const ei = new Image(); ei.src = entityImg.src; await ei.decode();
    const [er, eg, eb] = extractAccent(ei).map((v) => Math.round(v * 0.42));
    const col = `rgb(${er}, ${eg}, ${eb})`;
    for (const el of document.querySelectorAll('.main-entityHeader-backgroundColor, [class*="actionBarBackground-background"], .main-topBar-background')) {
      el.style.setProperty("--background-base", col);
      if (el.style.backgroundColor) el.style.backgroundColor = col;
    }
  }

  // ---- backdrop + accent, computed with the theme's own functions ----
  const im = new Image(); im.src = nowSrc; await im.decode();
  const arts = document.querySelectorAll(".serenade-art");
  arts.forEach((el, i) => { el.style.transition = "none"; el.style.backgroundImage = `url("${nowSrc}")`; el.classList.toggle("is-visible", i === 0); });
  const [r, g, b] = extractAccent(im);
  const lift = (v) => Math.round(v + (255 - v) * 0.25);
  const rs = root.style;
  rs.setProperty("--spice-button", `rgb(${r}, ${g}, ${b})`); rs.setProperty("--spice-rgb-button", `${r},${g},${b}`);
  rs.setProperty("--spice-button-active", `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`); rs.setProperty("--spice-rgb-button-active", `${lift(r)},${lift(g)},${lift(b)}`);
  const veilEl = document.querySelector(".serenade-veil");
  veilEl.style.transition = "none"; veilEl.style.setProperty("--sr-veil", computeVeil(im).toFixed(3));

  await new Promise((r) => setTimeout(r, 400));
  // ---- audit: every remaining visible string ----
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, el = n.parentElement, t = n.nodeValue.trim();
    if (!t || !el || el.closest("style, script, svg, [aria-hidden='true'] .hidden-visually")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (el.closest(".hidden-visually, .e-10860-visually-hidden, [class*='visually-hidden']")) continue;
    seen.add(t);
  }
  return [...seen].join(" | ");
})();
