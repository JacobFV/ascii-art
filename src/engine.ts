// ---- Types ----

export interface Layer {
  id: string;
  name: string;
  fontSize: number;
  ramp: string;
  algorithm: 'brightness' | 'edges' | 'highpass' | 'detail' | 'stipple';
  dithering: 'none' | 'floyd-steinberg' | 'atkinson' | 'ordered' | 'stucki';
  opacity: number;
  blendMode: string;
  enabled: boolean;
  invert: boolean;
  contrast: number;
  threshold: number;
  edgeSensitivity: number;
  charSpacing: number; // 0-5 extra px between chars
  color: string;       // hex color for characters
  colorMode: boolean;  // tint chars with source pixel color
  fontFamily: string;  // monospace font family
  renderMode: 'dark-on-light' | 'light-on-dark';
}

export interface GlobalSettings {
  contrast: number;
  brightness: number;
  gamma: number;
  invert: boolean;
  highPassRadius: number;
  blackPoint: number;   // 0-100, clip shadows
  whitePoint: number;   // 155-255, clip highlights
  blur: number;         // 0-10 gaussian blur radius
  sharpen: number;      // 0-300 unsharp mask amount
  posterize: number;    // 0=off, 2-16 levels
  backgroundColor: string; // hex color or 'transparent'
}

export const RAMP_PRESETS: Record<string, string> = {
  // Classic
  'Standard': '@%#*+=-:. ',
  'Detailed': "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  'Simple': '#=-. ',
  'Dense': '@#MW&%*+=-:. ',
  'Minimal': '@. ',
  'Binary': '@ ',
  // Specialty
  'Hatching': '#/|\\-. ',
  'Dots': '@o:. ',
  'Alphabetic': 'MWBHAXYVTISJ. ',
  'Alphanumeric': 'MW8B6H9A5X4V3T2IS1J. ',
  'Arrows & Chevrons': '\u25C6\u25C4\u25BA\u25B2\u25BC\u00AB\u00BB><^v. ',
  'Code Page 437': '\u2588\u2593\u2592\u2591\u256C\u2560\u2563\u2566\u2569\u2554\u2557\u255A\u255D\u2551\u2550\u2500\u2502\u253C\u2524\u251C\u2534\u252C\u250C\u2510\u2514\u2518\u00B7. ',
  'Blocks & Shapes': '\u2588\u2593\u2592\u2591\u25A0\u25B0\u2584\u2580\u258C\u2590\u25CF\u25CB\u25AA\u25AB. ',
  'Math & Symbols': '\u2234\u2261\u2248\u00B1\u221E\u2211\u220F\u221A\u00D7\u00F7\u2206\u03C0\u2207\u00B7. ',
};

export const FONT_OPTIONS = [
  'Courier New', 'Consolas', 'Monaco', 'Menlo',
  'Lucida Console', 'monospace',
];

// ---- Character density measurement ----

const densityCache = new Map<string, Map<string, number>>();

function measureCharDensities(chars: string, fontFamily: string, fontSize: number): Map<string, number> {
  const uniqueChars = [...new Set(chars)].sort().join('');
  const cacheKey = `${fontFamily}|${fontSize}|${uniqueChars}`;
  const cached = densityCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px "${fontFamily}", monospace`;
  const cellW = Math.ceil(ctx.measureText('M').width);
  const cellH = Math.ceil(fontSize * 1.2);
  canvas.width = cellW;
  canvas.height = cellH;

  const densities = new Map<string, number>();
  const totalPixels = cellW * cellH;

  for (const ch of uniqueChars) {
    if (ch === ' ') {
      densities.set(ch, 0);
      continue;
    }
    ctx.clearRect(0, 0, cellW, cellH);
    ctx.font = `${fontSize}px "${fontFamily}", monospace`;
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'top';
    ctx.fillText(ch, 0, 0);
    const imgData = ctx.getImageData(0, 0, cellW, cellH).data;
    let filled = 0;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] > 0) filled++;
    }
    densities.set(ch, filled / totalPixels);
  }

  densityCache.set(cacheKey, densities);
  return densities;
}

function buildCharLUT(ramp: string, fontFamily: string, fontSize: number): string[] {
  const densities = measureCharDensities(ramp, fontFamily, fontSize);

  // Get unique chars sorted by ascending density
  const uniqueChars = [...new Set(ramp)];
  uniqueChars.sort((a, b) => (densities.get(a) || 0) - (densities.get(b) || 0));

  const charDensityPairs = uniqueChars.map(ch => ({
    ch,
    density: densities.get(ch) || 0,
  }));

  // Build 256-entry LUT
  const lut: string[] = new Array(256);
  const minD = charDensityPairs[0].density;
  const maxD = charDensityPairs[charDensityPairs.length - 1].density;
  const range = maxD - minD || 1;

  for (let i = 0; i < 256; i++) {
    const targetDensity = minD + (i / 255) * range;
    // Linear scan (typically ~15 chars) to find best match
    let best = charDensityPairs[0];
    let bestDist = Math.abs(best.density - targetDensity);
    for (let j = 1; j < charDensityPairs.length; j++) {
      const dist = Math.abs(charDensityPairs[j].density - targetDensity);
      if (dist < bestDist) {
        best = charDensityPairs[j];
        bestDist = dist;
      }
    }
    lut[i] = best.ch;
  }

  return lut;
}

export function defaultLayer(id?: string): Layer {
  return {
    id: id || crypto.randomUUID(),
    name: 'Layer',
    fontSize: 12,
    ramp: '@%#*+=-:. ',
    algorithm: 'brightness',
    dithering: 'none',
    opacity: 1,
    blendMode: 'darken',
    enabled: true,
    invert: false,
    contrast: 100,
    threshold: 5,
    edgeSensitivity: 100,
    charSpacing: 0,
    color: '#000000',
    colorMode: false,
    fontFamily: 'Courier New',
    renderMode: 'dark-on-light',
  };
}

export function defaultSettings(): GlobalSettings {
  return {
    contrast: 100,
    brightness: 0,
    gamma: 1.0,
    invert: false,
    highPassRadius: 0,
    blackPoint: 0,
    whitePoint: 255,
    blur: 0,
    sharpen: 0,
    posterize: 0,
    backgroundColor: 'transparent',
  };
}

// ---- Auto-optimize image settings ----

export function autoOptimizeSettings(
  sourceImage: HTMLImageElement,
  current: GlobalSettings,
): GlobalSettings {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(sourceImage.naturalWidth, 512);
  const scale = canvas.width / sourceImage.naturalWidth;
  canvas.height = Math.round(sourceImage.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = canvas.width * canvas.height;

  // Build luminance histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < pixels; i++) {
    const lum = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    hist[lum]++;
  }

  // Find black/white points at 0.5% and 99.5% percentiles
  const lo = Math.round(pixels * 0.005);
  const hi = Math.round(pixels * 0.995);
  let cumulative = 0;
  let blackPoint = 0;
  let whitePoint = 255;
  for (let i = 0; i < 256; i++) {
    cumulative += hist[i];
    if (cumulative >= lo && blackPoint === 0) blackPoint = i;
    if (cumulative >= hi) { whitePoint = i; break; }
  }

  // Compute mean luminance within the clipped range
  let sum = 0, count = 0;
  for (let i = blackPoint; i <= whitePoint; i++) {
    sum += i * hist[i];
    count += hist[i];
  }
  const mean = count > 0 ? sum / count : 128;

  // Target: push mean toward 128 (middle grey)
  const brightness = Math.round((128 - mean) * 0.6);

  // Gamma: correct midtone. If image is dark (mean < 128), gamma < 1 brightens;
  // if light (mean > 128), gamma > 1 darkens
  const normalizedMean = (mean - blackPoint) / Math.max(1, whitePoint - blackPoint);
  const gamma = normalizedMean > 0.01
    ? Math.max(0.3, Math.min(2.5, Math.log(0.5) / Math.log(normalizedMean)))
    : 1.0;

  // Contrast: scale based on tonal range utilization
  const range = whitePoint - blackPoint;
  const contrast = range < 180 ? Math.round(100 * (220 / Math.max(1, range))) : 100;

  return {
    ...current,
    blackPoint: Math.max(0, blackPoint - 2),
    whitePoint: Math.min(255, whitePoint + 2),
    brightness: Math.max(-150, Math.min(150, brightness)),
    contrast: Math.max(80, Math.min(200, contrast)),
    gamma: Math.round(gamma * 100) / 100,
  };
}

// ---- Low-level image ops ----

function getGreyscale(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return grey;
}

function greyToCanvas(grey: Float32Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < grey.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(grey[i])));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function resizeCanvas(
  source: HTMLCanvasElement | HTMLImageElement, w: number, h: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

// ---- Blur & Sharpen ----

function boxBlur(data: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return new Float32Array(data);
  const r = Math.round(radius);
  const temp = new Float32Array(data.length);
  // Horizontal
  for (let y = 0; y < h; y++) {
    let sum = 0, count = 0;
    for (let x = 0; x < Math.min(r + 1, w); x++) { sum += data[y * w + x]; count++; }
    for (let x = 0; x < w; x++) {
      temp[y * w + x] = sum / count;
      const add = x + r + 1, rem = x - r;
      if (add < w) { sum += data[y * w + add]; count++; }
      if (rem >= 0) { sum -= data[y * w + rem]; count--; }
    }
  }
  // Vertical
  const result = new Float32Array(data.length);
  for (let x = 0; x < w; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y < Math.min(r + 1, h); y++) { sum += temp[y * w + x]; count++; }
    for (let y = 0; y < h; y++) {
      result[y * w + x] = sum / count;
      const add = y + r + 1, rem = y - r;
      if (add < h) { sum += temp[add * w + x]; count++; }
      if (rem >= 0) { sum -= temp[rem * w + x]; count--; }
    }
  }
  return result;
}

function gaussianBlur(data: Float32Array, w: number, h: number, radius: number): Float32Array {
  // Approximate Gaussian with 3 box blur passes
  let result = data;
  const r = Math.max(1, Math.round(radius / 1.73));
  for (let i = 0; i < 3; i++) result = boxBlur(result, w, h, r);
  return result;
}

function unsharpMask(data: Float32Array, w: number, h: number, amount: number): Float32Array {
  if (amount <= 0) return data;
  const blurred = gaussianBlur(data, w, h, 2);
  const result = new Float32Array(data.length);
  const a = amount / 100;
  for (let i = 0; i < data.length; i++) {
    result[i] = Math.max(0, Math.min(255, data[i] + (data[i] - blurred[i]) * a));
  }
  return result;
}

// ---- Dithering algorithms ----

function ditherNone(intensity: Float32Array, _w: number, _h: number, levels: number): Float32Array {
  const result = new Float32Array(intensity.length);
  const step = 255 / (levels - 1);
  for (let i = 0; i < intensity.length; i++) {
    result[i] = Math.round(intensity[i] / step) * step;
  }
  return result;
}

function ditherFloydSteinberg(intensity: Float32Array, w: number, h: number, levels: number): Float32Array {
  const result = new Float32Array(intensity);
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = result[i];
      const nw = Math.round(old / step) * step;
      result[i] = nw;
      const err = old - nw;
      if (x + 1 < w) result[i + 1] += err * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) result[i + w - 1] += err * 3 / 16;
        result[i + w] += err * 5 / 16;
        if (x + 1 < w) result[i + w + 1] += err * 1 / 16;
      }
    }
  }
  return result;
}

function ditherAtkinson(intensity: Float32Array, w: number, h: number, levels: number): Float32Array {
  const result = new Float32Array(intensity);
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = result[i];
      const nw = Math.round(old / step) * step;
      result[i] = nw;
      const err = (old - nw) / 8; // Atkinson only distributes 6/8
      if (x + 1 < w) result[i + 1] += err;
      if (x + 2 < w) result[i + 2] += err;
      if (y + 1 < h) {
        if (x > 0) result[i + w - 1] += err;
        result[i + w] += err;
        if (x + 1 < w) result[i + w + 1] += err;
      }
      if (y + 2 < h) result[i + 2 * w] += err;
    }
  }
  return result;
}

function ditherStucki(intensity: Float32Array, w: number, h: number, levels: number): Float32Array {
  const result = new Float32Array(intensity);
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = result[i];
      const nw = Math.round(old / step) * step;
      result[i] = nw;
      const err = old - nw;
      // Stucki kernel (divides by 42)
      if (x+1<w) result[i+1] += err*8/42;
      if (x+2<w) result[i+2] += err*4/42;
      if (y+1<h) {
        if (x>1) result[i+w-2] += err*2/42;
        if (x>0) result[i+w-1] += err*4/42;
        result[i+w] += err*8/42;
        if (x+1<w) result[i+w+1] += err*4/42;
        if (x+2<w) result[i+w+2] += err*2/42;
      }
      if (y+2<h) {
        if (x>1) result[i+2*w-2] += err*1/42;
        if (x>0) result[i+2*w-1] += err*2/42;
        result[i+2*w] += err*4/42;
        if (x+1<w) result[i+2*w+1] += err*2/42;
        if (x+2<w) result[i+2*w+2] += err*1/42;
      }
    }
  }
  return result;
}

// Bayer ordered dithering
const BAYER_4 = [
  [ 0, 8, 2,10],
  [12, 4,14, 6],
  [ 3,11, 1, 9],
  [15, 7,13, 5],
];

function ditherOrdered(intensity: Float32Array, w: number, h: number, levels: number): Float32Array {
  const result = new Float32Array(intensity.length);
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const threshold = (BAYER_4[y % 4][x % 4] / 16 - 0.5) * step;
      result[i] = Math.round((intensity[i] + threshold) / step) * step;
    }
  }
  return result;
}

function applyDithering(
  intensity: Float32Array, w: number, h: number,
  mode: Layer['dithering'], rampLength: number
): Float32Array {
  const levels = Math.max(2, rampLength);
  switch (mode) {
    case 'floyd-steinberg': return ditherFloydSteinberg(intensity, w, h, levels);
    case 'atkinson': return ditherAtkinson(intensity, w, h, levels);
    case 'ordered': return ditherOrdered(intensity, w, h, levels);
    case 'stucki': return ditherStucki(intensity, w, h, levels);
    default: return ditherNone(intensity, w, h, levels);
  }
}

// ---- Edge detection ----

function sobelEdges(grey: Float32Array, w: number, h: number, sensitivity: number): Float32Array {
  const edges = new Float32Array(w * h);
  const s = sensitivity / 100;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = grey[(y-1)*w+x-1], tc = grey[(y-1)*w+x], tr = grey[(y-1)*w+x+1];
      const ml = grey[y*w+x-1], mr = grey[y*w+x+1];
      const bl = grey[(y+1)*w+x-1], bc = grey[(y+1)*w+x], br = grey[(y+1)*w+x+1];
      const gx = -tl + tr - 2*ml + 2*mr - bl + br;
      const gy = -tl - 2*tc - tr + bl + 2*bc + br;
      edges[y * w + x] = Math.sqrt(gx*gx + gy*gy) * s;
    }
  }
  return edges;
}

// ---- Stipple (random placement weighted by intensity) ----

function stippleIntensity(grey: Float32Array, w: number, h: number, darkOnLight: boolean): Float32Array {
  const result = new Float32Array(w * h);
  // Use seeded-ish random for consistency
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const darkness = darkOnLight ? 255 - grey[i] : grey[i];
      // Higher darkness = higher probability of placing a character
      result[i] = rand() < (darkness / 255) * (darkness / 255) ? darkness * 1.5 : 0;
    }
  }
  return result;
}

// ---- Compute per-layer intensity ----

function computeIntensity(
  grey: Float32Array, w: number, h: number,
  algorithm: Layer['algorithm'],
  contrast: number, invert: boolean, threshold: number,
  edgeSensitivity: number,
  renderMode: Layer['renderMode'] = 'dark-on-light',
): Float32Array {
  let intensity: Float32Array;
  const darkOnLight = renderMode === 'dark-on-light';

  switch (algorithm) {
    case 'brightness':
      intensity = new Float32Array(grey.length);
      for (let i = 0; i < grey.length; i++) intensity[i] = darkOnLight ? 255 - grey[i] : grey[i];
      break;
    case 'edges':
      intensity = sobelEdges(grey, w, h, edgeSensitivity);
      { let max = 0;
        for (const v of intensity) if (v > max) max = v;
        if (max > 0) for (let i = 0; i < intensity.length; i++) intensity[i] = (intensity[i] / max) * 255;
      }
      break;
    case 'highpass': {
      const blurred = boxBlur(grey, w, h, 3);
      intensity = new Float32Array(grey.length);
      for (let i = 0; i < grey.length; i++) intensity[i] = Math.abs(grey[i] - blurred[i]) * 4;
      break;
    }
    case 'detail': {
      const edges = sobelEdges(grey, w, h, edgeSensitivity);
      const blurred = boxBlur(grey, w, h, 3);
      intensity = new Float32Array(grey.length);
      let max = 0;
      for (const v of edges) if (v > max) max = v;
      for (let i = 0; i < grey.length; i++) {
        const e = max > 0 ? (edges[i] / max) * 255 : 0;
        const hp = Math.abs(grey[i] - blurred[i]) * 3;
        const bright = darkOnLight ? 255 - grey[i] : grey[i];
        intensity[i] = e * 0.5 + hp * 0.3 + bright * 0.2;
      }
      break;
    }
    case 'stipple':
      intensity = stippleIntensity(grey, w, h, darkOnLight);
      break;
  }

  const cf = contrast / 100;
  for (let i = 0; i < intensity.length; i++) {
    let v = intensity[i] * cf;
    if (invert) v = 255 - v;
    if (v < threshold) v = 0;
    intensity[i] = Math.max(0, Math.min(255, v));
  }
  return intensity;
}

// ---- Global image adjustment ----

export function createAdjustedCanvas(
  source: HTMLCanvasElement, settings: GlobalSettings
): HTMLCanvasElement {
  const { width: w, height: h } = source;
  let grey = getGreyscale(source);

  // Blur
  if (settings.blur > 0) {
    grey = gaussianBlur(grey, w, h, settings.blur);
  }

  // High-pass background removal
  if (settings.highPassRadius > 0) {
    const blurred = gaussianBlur(grey, w, h, settings.highPassRadius);
    for (let i = 0; i < grey.length; i++) {
      grey[i] = 128 + (grey[i] - blurred[i]) * 2;
    }
  }

  // Sharpen
  if (settings.sharpen > 0) {
    grey = unsharpMask(grey, w, h, settings.sharpen);
  }

  const cf = settings.contrast / 100;
  const bp = settings.blackPoint;
  const wp = settings.whitePoint;
  const range = Math.max(1, wp - bp);

  for (let i = 0; i < grey.length; i++) {
    let v = grey[i];

    // Levels: remap [blackPoint, whitePoint] → [0, 255]
    v = ((v - bp) / range) * 255;

    // Brightness
    v += settings.brightness;

    // Contrast
    v = (v - 128) * cf + 128;

    // Gamma
    v = Math.max(0, v);
    v = 255 * Math.pow(v / 255, settings.gamma);

    // Posterize
    if (settings.posterize >= 2) {
      const step = 255 / (settings.posterize - 1);
      v = Math.round(v / step) * step;
    }

    // Invert
    if (settings.invert) v = 255 - v;

    grey[i] = Math.max(0, Math.min(255, v));
  }

  return greyToCanvas(grey, w, h);
}

// ---- Render single ASCII layer ----

export function renderAsciiLayer(
  adjustedCanvas: HTMLCanvasElement,
  layer: Layer,
  outW: number,
  outH: number,
  scale: number = 1,
  colorSource?: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  const scaledFontSize = layer.fontSize * scale;
  const fontStr = `${scaledFontSize}px "${layer.fontFamily}", monospace`;
  ctx.font = fontStr;
  const baseAdvance = ctx.measureText('M').width;
  const cellW = baseAdvance + layer.charSpacing * scale;
  const cellH = scaledFontSize * 1.2;

  const cols = Math.floor(outW / cellW);
  const rows = Math.floor(outH / cellH);
  if (cols <= 0 || rows <= 0) return canvas;

  // Sample at grid resolution
  const sampled = resizeCanvas(adjustedCanvas, cols, rows);
  const grey = getGreyscale(sampled);

  // Compute raw intensity
  let intensity = computeIntensity(
    grey, cols, rows, layer.algorithm,
    layer.contrast, layer.invert, layer.threshold,
    layer.edgeSensitivity, layer.renderMode,
  );

  // Apply dithering
  if (layer.dithering !== 'none') {
    intensity = applyDithering(intensity, cols, rows, layer.dithering, layer.ramp.length);
  }

  // Build density-aware character lookup table
  const charLUT = buildCharLUT(layer.ramp, layer.fontFamily, scaledFontSize);

  // Sample color data if colorMode enabled
  let colorData: Uint8ClampedArray | null = null;
  if (layer.colorMode && colorSource) {
    const colorSampled = resizeCanvas(colorSource, cols, rows);
    colorData = colorSampled.getContext('2d')!.getImageData(0, 0, cols, rows).data;
  }

  ctx.fillStyle = layer.color;
  ctx.font = fontStr;
  ctx.textBaseline = 'top';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = Math.max(0, Math.min(255, intensity[r * cols + c]));
      if (val < 3) continue;
      const ch = charLUT[Math.min(255, Math.max(0, Math.round(val)))];
      if (ch === ' ') continue;
      if (colorData) {
        const pi = (r * cols + c) * 4;
        ctx.fillStyle = `rgb(${colorData[pi]},${colorData[pi+1]},${colorData[pi+2]})`;
      }
      ctx.fillText(ch, c * cellW, r * cellH);
    }
  }

  return canvas;
}

// ---- Render ASCII as plain text ----

export function renderAsciiText(
  sourceImage: HTMLImageElement,
  layers: Layer[],
  settings: GlobalSettings,
  cols: number,
): string {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceImage.naturalWidth;
  srcCanvas.height = sourceImage.naturalHeight;
  srcCanvas.getContext('2d')!.drawImage(sourceImage, 0, 0);

  const adjusted = createAdjustedCanvas(srcCanvas, settings);
  const aspect = sourceImage.naturalHeight / sourceImage.naturalWidth;
  // Characters are roughly 2x taller than wide
  const rows = Math.round(cols * aspect * 0.5);

  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '));

  for (const layer of layers) {
    if (!layer.enabled) continue;
    const sampled = resizeCanvas(adjusted, cols, rows);
    const grey = getGreyscale(sampled);
    let intensity = computeIntensity(
      grey, cols, rows, layer.algorithm,
      layer.contrast, layer.invert, layer.threshold,
      layer.edgeSensitivity, layer.renderMode,
    );
    if (layer.dithering !== 'none') {
      intensity = applyDithering(intensity, cols, rows, layer.dithering, layer.ramp.length);
    }
    const charLUT = buildCharLUT(layer.ramp, layer.fontFamily, 12);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = Math.max(0, Math.min(255, intensity[r * cols + c]));
        if (val < 3) continue;
        const ch = charLUT[Math.min(255, Math.max(0, Math.round(val)))];
        if (ch !== ' ') grid[r][c] = ch;
      }
    }
  }

  return grid.map(row => row.join('')).join('\n');
}

// ---- Export as SVG ----

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderAsciiSVG(
  sourceImage: HTMLImageElement,
  layers: Layer[],
  settings: GlobalSettings,
  outW: number,
  outH: number,
): string {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceImage.naturalWidth;
  srcCanvas.height = sourceImage.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(sourceImage, 0, 0);

  const adjusted = createAdjustedCanvas(srcCanvas, settings);
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">`);

  if (settings.backgroundColor !== 'transparent') {
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(settings.backgroundColor)}"/>`);
  }

  for (const layer of layers) {
    if (!layer.enabled) continue;
    const fontSize = layer.fontSize;
    const fontFamily = layer.fontFamily;

    // Measure character width using a temp canvas
    const tmpCtx = document.createElement('canvas').getContext('2d')!;
    tmpCtx.font = `${fontSize}px "${fontFamily}", monospace`;
    const baseAdvance = tmpCtx.measureText('M').width;
    const cellW = baseAdvance + layer.charSpacing;
    const cellH = fontSize * 1.2;

    const cols = Math.floor(outW / cellW);
    const rows = Math.floor(outH / cellH);
    if (cols <= 0 || rows <= 0) continue;

    const sampled = resizeCanvas(adjusted, cols, rows);
    const grey = getGreyscale(sampled);
    let intensity = computeIntensity(
      grey, cols, rows, layer.algorithm,
      layer.contrast, layer.invert, layer.threshold,
      layer.edgeSensitivity, layer.renderMode,
    );
    if (layer.dithering !== 'none') {
      intensity = applyDithering(intensity, cols, rows, layer.dithering, layer.ramp.length);
    }

    // Get color data if needed
    let colorData: Uint8ClampedArray | null = null;
    if (layer.colorMode) {
      const colorSampled = resizeCanvas(srcCanvas, cols, rows);
      colorData = colorSampled.getContext('2d')!.getImageData(0, 0, cols, rows).data;
    }

    const charLUT = buildCharLUT(layer.ramp, fontFamily, fontSize);
    const opacity = layer.opacity < 1 ? ` opacity="${layer.opacity}"` : '';

    parts.push(`<g font-family="'${escapeXml(fontFamily)}', monospace" font-size="${fontSize}"${opacity}>`);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = Math.max(0, Math.min(255, intensity[r * cols + c]));
        if (val < 3) continue;
        const ch = charLUT[Math.min(255, Math.max(0, Math.round(val)))];
        if (ch === ' ') continue;
        let fill = layer.color;
        if (colorData) {
          const pi = (r * cols + c) * 4;
          fill = `rgb(${colorData[pi]},${colorData[pi + 1]},${colorData[pi + 2]})`;
        }
        const x = (c * cellW).toFixed(1);
        const y = (r * cellH + fontSize).toFixed(1);
        parts.push(`<text x="${x}" y="${y}" fill="${escapeXml(fill)}">${escapeXml(ch)}</text>`);
      }
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ---- Composite all layers ----

export function compositeAll(
  sourceImage: HTMLImageElement,
  layers: Layer[],
  settings: GlobalSettings,
  outW: number,
  outH: number,
  scale: number = 1,
): HTMLCanvasElement {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceImage.naturalWidth;
  srcCanvas.height = sourceImage.naturalHeight;
  srcCanvas.getContext('2d')!.drawImage(sourceImage, 0, 0);

  const adjusted = createAdjustedCanvas(srcCanvas, settings);

  const result = document.createElement('canvas');
  result.width = outW;
  result.height = outH;
  const ctx = result.getContext('2d')!;

  if (settings.backgroundColor !== 'transparent') {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, outW, outH);
  }

  for (const layer of layers) {
    if (!layer.enabled) continue;
    const layerCanvas = renderAsciiLayer(adjusted, layer, outW, outH, scale, srcCanvas);
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    ctx.drawImage(layerCanvas, 0, 0);
    ctx.restore();
  }

  return result;
}
