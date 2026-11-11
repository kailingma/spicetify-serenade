// Serenade — ambient album-art backdrop + accent color pulled from the cover.
(function serenade() {
  if (!document.body || !document.querySelector(".Root")) {
    setTimeout(serenade, 300);
    return;
  }

  const root = document.documentElement;
  const FALLBACK = [255, 179, 107]; // warm amber, used for greyscale covers

  // ---------- ambient backdrop (two layers so covers crossfade) ----------
  const ambient = document.createElement("div");
  ambient.id = "serenade-ambient";
  const layerA = document.createElement("div");
  const layerB = document.createElement("div");
  layerA.className = layerB.className = "serenade-art";
  const veil = document.createElement("div");
  veil.className = "serenade-veil";
  ambient.append(layerA, layerB, veil);
  document.body.prepend(ambient);

  let front = layerA;
  let back = layerB;
  let currentSrc = "";

  function showArt(src) {
    const pre = new Image();
    pre.onload = () => {
      back.style.backgroundImage = `url("${src}")`;
      back.classList.add("is-visible");
      front.classList.remove("is-visible");
      [front, back] = [back, front];
    };
    pre.src = src;
  }

  // ---------- accent extraction ----------
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

  function setAccent([r, g, b]) {
    const lift = (v) => Math.round(v + (255 - v) * 0.25);
    const style = root.style;
    style.setProperty("--spice-button", `rgb(${r}, ${g}, ${b})`);
    style.setProperty("--spice-rgb-button", `${r},${g},${b}`);
    style.setProperty("--spice-button-active", `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`);
    style.setProperty("--spice-rgb-button-active", `${lift(r)},${lift(g)},${lift(b)}`);
    style.setProperty("--spice-notification", `rgb(${r}, ${g}, ${b})`);
    style.setProperty("--spice-rgb-notification", `${r},${g},${b}`);
  }

  // Same cover comes in different sizes (…b273…, …e1a3…); compare the image hash.
  const artKey = (src) => src.split("/").pop().slice(-24);

  // ---------- adaptive veil ----------
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

  function setVeil(value) {
    veil.style.setProperty("--sr-veil", value.toFixed(3));
  }

  function update(src) {
    if (!src || artKey(src) === currentSrc) return;
    currentSrc = artKey(src);
    showArt(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try { setAccent(extractAccent(img)); } catch (e) { setAccent(FALLBACK); }
      try { setVeil(computeVeil(img)); } catch (e) { setVeil(0.6); }
    };
    img.onerror = () => {
      setAccent(FALLBACK);
      setVeil(0.6);
    };
    img.src = src;
  }

  // Read the cover straight from the now-playing widget. This works for local
  // playback and when controlling another device over Spotify Connect.
  function fromPlayer() {
    try {
      const m = Spicetify.Player.data.item.metadata;
      const uri = m.image_xlarge_url || m.image_large_url || m.image_url;
      if (uri && uri.startsWith("spotify:image:")) {
        return "https://i.scdn.co/image/" + uri.slice("spotify:image:".length);
      }
      return uri;
    } catch (e) {
      return null;
    }
  }

  function poll() {
    const cover = document.querySelector(
      '[data-testid="now-playing-widget"] img, [data-testid="now-playing-bar"] [data-testid="cover-art-button"] img'
    );
    update(fromPlayer() || (cover && cover.src));
  }

  poll();
  setInterval(poll, 1000);
  try {
    Spicetify.Player.addEventListener("songchange", () => setTimeout(poll, 150));
  } catch (e) { /* polling covers it */ }
})();
