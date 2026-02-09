#!/usr/bin/env node
// ASCII Art CLI — mirrors src/engine.ts pipeline using node-canvas
import { createCanvas, loadImage, registerFont } from 'canvas';
import { writeFileSync, readFileSync } from 'fs';
import { basename } from 'path';

// ---- Defaults & config ----
const defaults = {
  // Global image settings
  contrast: 100,
  brightness: 0,
  gamma: 1.0,
  invert: false,
  blackPoint: 0,
  whitePoint: 255,
  blur: 0,
  sharpen: 0,
  posterize: 0,
  backgroundColor: 'transparent',
  // Layer settings
  fontSize: 12,
  ramp: '@%#*+=-:. ',
  algorithm: 'brightness',
  dithering: 'none',
  layerContrast: 100,
  layerInvert: false,
  threshold: 5,
  edgeSensitivity: 100,
  charSpacing: 0,
  color: '#000000',
  fontFamily: 'Courier New',
  renderMode: 'dark-on-light',
  // Output
  outputWidth: 1000,
};

const RAMPS = {
  'standard': '@%#*+=-:. ',
  'detailed': "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  'simple': '#=-. ',
  'dense': '@#MW&%*+=-:. ',
  'minimal': '@. ',
  'binary': '@ ',
  'dots': '@o:. ',
  'hatching': '#/|\\-. ',
};

function parseArgs(argv) {
  const cfg = { ...defaults };
  cfg.input = null;
  cfg.output = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '-i': case '--input': cfg.input = next(); break;
      case '-o': case '--output': cfg.output = next(); break;
      case '--contrast': cfg.contrast = parseFloat(next()); break;
      case '--brightness': cfg.brightness = parseFloat(next()); break;
      case '--gamma': cfg.gamma = parseFloat(next()); break;
      case '--invert': cfg.invert = true; break;
      case '--black-point': cfg.blackPoint = parseFloat(next()); break;
      case '--white-point': cfg.whitePoint = parseFloat(next()); break;
      case '--blur': cfg.blur = parseFloat(next()); break;
      case '--sharpen': cfg.sharpen = parseFloat(next()); break;
      case '--posterize': cfg.posterize = parseInt(next()); break;
      case '--bg': cfg.backgroundColor = next(); break;
      case '--font-size': cfg.fontSize = parseFloat(next()); break;
      case '--ramp': {
        const v = next();
        cfg.ramp = RAMPS[v.toLowerCase()] || v;
        break;
      }
      case '--algorithm': cfg.algorithm = next(); break;
      case '--dithering': cfg.dithering = next(); break;
      case '--layer-contrast': cfg.layerContrast = parseFloat(next()); break;
      case '--layer-invert': cfg.layerInvert = true; break;
      case '--threshold': cfg.threshold = parseFloat(next()); break;
      case '--edge-sens': cfg.edgeSensitivity = parseFloat(next()); break;
      case '--char-spacing': cfg.charSpacing = parseFloat(next()); break;
      case '--color': cfg.color = next(); break;
      case '--font': cfg.fontFamily = next(); break;
      case '--render-mode': cfg.renderMode = next(); break;
      case '--width': cfg.outputWidth = parseInt(next()); break;
      case '--text': cfg.textMode = true; break;
      case '--cols': cfg.textCols = parseInt(next()); break;
      case '--auto': cfg.auto = true; break;
      default:
        if (!cfg.input && !arg.startsWith('-')) cfg.input = arg;
        break;
    }
  }
  if (!cfg.output && cfg.input) {
    cfg.output = cfg.input.replace(/\.[^.]+$/, '-ascii.png');
  }
  return cfg;
}

// ---- Image processing (mirrors engine.ts) ----

function getGreyscale(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return grey;
}

function boxBlur(data, w, h, radius) {
  if (radius < 1) return new Float32Array(data);
  const r = Math.round(radius);
  const temp = new Float32Array(data.length);
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

function gaussianBlur(data, w, h, radius) {
  let result = data;
  const r = Math.max(1, Math.round(radius / 1.73));
  for (let i = 0; i < 3; i++) result = boxBlur(result, w, h, r);
  return result;
}

function unsharpMask(data, w, h, amount) {
  if (amount <= 0) return data;
  const blurred = gaussianBlur(data, w, h, 2);
  const result = new Float32Array(data.length);
  const a = amount / 100;
  for (let i = 0; i < data.length; i++) {
    result[i] = Math.max(0, Math.min(255, data[i] + (data[i] - blurred[i]) * a));
  }
  return result;
}

function sobelEdges(grey, w, h, sensitivity) {
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

function stippleIntensity(grey, w, h, darkOnLight) {
  const result = new Float32Array(w * h);
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const darkness = darkOnLight ? 255 - grey[i] : grey[i];
      result[i] = rand() < (darkness / 255) * (darkness / 255) ? darkness * 1.5 : 0;
    }
  }
  return result;
}

// Dithering
function ditherFloydSteinberg(intensity, w, h, levels) {
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

function ditherAtkinson(intensity, w, h, levels) {
  const result = new Float32Array(intensity);
  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = result[i];
      const nw = Math.round(old / step) * step;
      result[i] = nw;
      const err = (old - nw) / 8;
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

const BAYER_4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
function ditherOrdered(intensity, w, h, levels) {
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

function applyDithering(intensity, w, h, mode, rampLen) {
  const levels = Math.max(2, rampLen);
  switch (mode) {
    case 'floyd-steinberg': return ditherFloydSteinberg(intensity, w, h, levels);
    case 'atkinson': return ditherAtkinson(intensity, w, h, levels);
    case 'ordered': return ditherOrdered(intensity, w, h, levels);
    default: return intensity;
  }
}

function computeIntensity(grey, w, h, algorithm, contrast, invert, threshold, edgeSens, renderMode) {
  let intensity;
  const darkOnLight = renderMode === 'dark-on-light';
  switch (algorithm) {
    case 'brightness':
      intensity = new Float32Array(grey.length);
      for (let i = 0; i < grey.length; i++) intensity[i] = darkOnLight ? 255 - grey[i] : grey[i];
      break;
    case 'edges':
      intensity = sobelEdges(grey, w, h, edgeSens);
      { let max = 0; for (const v of intensity) if (v > max) max = v;
        if (max > 0) for (let i = 0; i < intensity.length; i++) intensity[i] = (intensity[i] / max) * 255; }
      break;
    case 'highpass': {
      const blurred = boxBlur(grey, w, h, 3);
      intensity = new Float32Array(grey.length);
      for (let i = 0; i < grey.length; i++) intensity[i] = Math.abs(grey[i] - blurred[i]) * 4;
      break;
    }
    case 'detail': {
      const edges = sobelEdges(grey, w, h, edgeSens);
      const blurred = boxBlur(grey, w, h, 3);
      intensity = new Float32Array(grey.length);
      let max = 0; for (const v of edges) if (v > max) max = v;
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
    default:
      intensity = new Float32Array(grey.length);
      for (let i = 0; i < grey.length; i++) intensity[i] = darkOnLight ? 255 - grey[i] : grey[i];
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

function adjustGreyscale(grey, cfg) {
  let g = new Float32Array(grey);
  const w = cfg._w, h = cfg._h;

  if (cfg.blur > 0) g = gaussianBlur(g, w, h, cfg.blur);

  if (cfg.highPassRadius > 0) {
    const blurred = gaussianBlur(g, w, h, cfg.highPassRadius);
    for (let i = 0; i < g.length; i++) g[i] = 128 + (g[i] - blurred[i]) * 2;
  }

  if (cfg.sharpen > 0) g = unsharpMask(g, w, h, cfg.sharpen);

  const cf = cfg.contrast / 100;
  const bp = cfg.blackPoint;
  const wp = cfg.whitePoint;
  const range = Math.max(1, wp - bp);

  for (let i = 0; i < g.length; i++) {
    let v = g[i];
    v = ((v - bp) / range) * 255;
    v += cfg.brightness;
    v = (v - 128) * cf + 128;
    v = Math.max(0, v);
    v = 255 * Math.pow(v / 255, cfg.gamma);
    if (cfg.posterize >= 2) {
      const step = 255 / (cfg.posterize - 1);
      v = Math.round(v / step) * step;
    }
    if (cfg.invert) v = 255 - v;
    g[i] = Math.max(0, Math.min(255, v));
  }
  return g;
}

// Char density measurement
function measureCharDensities(chars, fontFamily, fontSize) {
  const uniqueChars = [...new Set(chars)].sort().join('');
  const tmpCanvas = createCanvas(100, 100);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = `${fontSize}px "${fontFamily}", monospace`;
  const cellW = Math.ceil(tmpCtx.measureText('M').width);
  const cellH = Math.ceil(fontSize * 1.2);
  const canvas = createCanvas(cellW, cellH);
  const ctx = canvas.getContext('2d');
  const totalPixels = cellW * cellH;
  const densities = new Map();

  for (const ch of uniqueChars) {
    if (ch === ' ') { densities.set(ch, 0); continue; }
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
  return densities;
}

function buildCharLUT(ramp, fontFamily, fontSize) {
  const densities = measureCharDensities(ramp, fontFamily, fontSize);
  const uniqueChars = [...new Set(ramp)];
  uniqueChars.sort((a, b) => (densities.get(a) || 0) - (densities.get(b) || 0));
  const pairs = uniqueChars.map(ch => ({ ch, density: densities.get(ch) || 0 }));
  const lut = new Array(256);
  const minD = pairs[0].density;
  const maxD = pairs[pairs.length - 1].density;
  const range = maxD - minD || 1;
  for (let i = 0; i < 256; i++) {
    const target = minD + (i / 255) * range;
    let best = pairs[0], bestDist = Math.abs(best.density - target);
    for (let j = 1; j < pairs.length; j++) {
      const dist = Math.abs(pairs[j].density - target);
      if (dist < bestDist) { best = pairs[j]; bestDist = dist; }
    }
    lut[i] = best.ch;
  }
  return lut;
}

// Auto-optimize
function autoOptimize(grey, cfg) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < grey.length; i++) hist[Math.round(Math.max(0, Math.min(255, grey[i])))]++;
  const pixels = grey.length;
  const lo = Math.round(pixels * 0.005);
  const hi = Math.round(pixels * 0.995);
  let cum = 0, bp = 0, wp = 255;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= lo && bp === 0) bp = i;
    if (cum >= hi) { wp = i; break; }
  }
  let sum = 0, count = 0;
  for (let i = bp; i <= wp; i++) { sum += i * hist[i]; count += hist[i]; }
  const mean = count > 0 ? sum / count : 128;
  const brightness = Math.round((128 - mean) * 0.6);
  const norm = (mean - bp) / Math.max(1, wp - bp);
  const gamma = norm > 0.01 ? Math.max(0.3, Math.min(2.5, Math.log(0.5) / Math.log(norm))) : 1.0;
  const rng = wp - bp;
  const contrast = rng < 180 ? Math.round(100 * (220 / Math.max(1, rng))) : 100;
  return {
    ...cfg,
    blackPoint: Math.max(0, bp - 2),
    whitePoint: Math.min(255, wp + 2),
    brightness: Math.max(-150, Math.min(150, brightness)),
    contrast: Math.max(80, Math.min(200, contrast)),
    gamma: Math.round(gamma * 100) / 100,
  };
}

// ---- Main ----
async function main() {
  const cfg = parseArgs(process.argv);
  if (!cfg.input) {
    console.log(`Usage: node cli.mjs [options] <input-image>
Options:
  -i, --input <file>       Input image
  -o, --output <file>      Output file (default: <input>-ascii.png)
  --width <px>             Output width (default: 1000)
  --contrast <n>           Global contrast 0-300 (default: 100)
  --brightness <n>         Global brightness -150 to 150 (default: 0)
  --gamma <n>              Gamma 0.1-3.0 (default: 1.0)
  --black-point <n>        Black point 0-200 (default: 0)
  --white-point <n>        White point 55-255 (default: 255)
  --blur <n>               Blur radius (default: 0)
  --sharpen <n>            Sharpen amount 0-300 (default: 0)
  --posterize <n>          Posterize levels 0-16 (default: 0)
  --invert                 Invert image
  --bg <color>             Background color (default: transparent)
  --font-size <n>          Character size (default: 12)
  --ramp <name|chars>      Character ramp (default: standard)
  --algorithm <name>       brightness|edges|highpass|detail|stipple
  --dithering <name>       none|floyd-steinberg|atkinson|ordered
  --layer-contrast <n>     Layer contrast (default: 100)
  --layer-invert           Invert layer intensity
  --threshold <n>          Min intensity threshold (default: 5)
  --edge-sens <n>          Edge sensitivity (default: 100)
  --color <hex>            Character color (default: #000000)
  --font <name>            Font family (default: Courier New)
  --render-mode <mode>     dark-on-light|light-on-dark (default: dark-on-light)
  --auto                   Auto-optimize levels/contrast/gamma
  --text                   Output as text instead of PNG
  --cols <n>               Text columns (default: 120)
`);
    process.exit(1);
  }

  console.log(`Loading ${cfg.input}...`);
  const img = await loadImage(cfg.input);
  const outW = cfg.outputWidth;
  const aspect = img.height / img.width;
  const outH = Math.round(outW * aspect);

  // Draw source to canvas
  const srcCanvas = createCanvas(img.width, img.height);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0);

  // Get greyscale
  let grey = getGreyscale(srcCtx, img.width, img.height);
  cfg._w = img.width;
  cfg._h = img.height;

  // Auto-optimize
  if (cfg.auto) {
    const before = { contrast: cfg.contrast, brightness: cfg.brightness, gamma: cfg.gamma, blackPoint: cfg.blackPoint, whitePoint: cfg.whitePoint };
    const opt = autoOptimize(grey, cfg);
    cfg.contrast = opt.contrast;
    cfg.brightness = opt.brightness;
    cfg.gamma = opt.gamma;
    cfg.blackPoint = opt.blackPoint;
    cfg.whitePoint = opt.whitePoint;
    console.log(`Auto-optimized: contrast=${cfg.contrast} brightness=${cfg.brightness} gamma=${cfg.gamma} blackPoint=${cfg.blackPoint} whitePoint=${cfg.whitePoint}`);
  }

  // Text mode
  if (cfg.textMode) {
    const cols = cfg.textCols || 120;
    const rows = Math.round(cols * aspect * 0.5);
    const sampledCanvas = createCanvas(cols, rows);
    sampledCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, cols, rows);
    const sampledGrey = getGreyscale(sampledCanvas.getContext('2d'), cols, rows);
    cfg._w = cols; cfg._h = rows;
    const adjusted = adjustGreyscale(sampledGrey, cfg);
    let intensity = computeIntensity(adjusted, cols, rows, cfg.algorithm, cfg.layerContrast, cfg.layerInvert, cfg.threshold, cfg.edgeSensitivity, cfg.renderMode);
    if (cfg.dithering !== 'none') intensity = applyDithering(intensity, cols, rows, cfg.dithering, cfg.ramp.length);
    const charLUT = buildCharLUT(cfg.ramp, cfg.fontFamily, 12);
    const lines = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const val = Math.max(0, Math.min(255, intensity[r * cols + c]));
        line += val < 3 ? ' ' : charLUT[Math.min(255, Math.max(0, Math.round(val)))];
      }
      lines.push(line);
    }
    const text = lines.join('\n');
    const outFile = cfg.output.replace(/\.png$/, '.txt');
    writeFileSync(outFile, text);
    console.log(`Text output: ${outFile} (${cols}x${rows})`);
    return;
  }

  // PNG mode
  const fontSize = cfg.fontSize;
  const fontFamily = cfg.fontFamily;

  // Measure cell size
  const measureCanvas = createCanvas(200, 200);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px "${fontFamily}", monospace`;
  const baseAdvance = measureCtx.measureText('M').width;
  const cellW = baseAdvance + cfg.charSpacing;
  const cellH = fontSize * 1.2;

  const cols = Math.floor(outW / cellW);
  const rows = Math.floor(outH / cellH);
  console.log(`Grid: ${cols}x${rows} chars, cell: ${cellW.toFixed(1)}x${cellH.toFixed(1)}px`);

  // Sample source at grid resolution
  const sampledCanvas = createCanvas(cols, rows);
  sampledCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, cols, rows);
  const sampledGrey = getGreyscale(sampledCanvas.getContext('2d'), cols, rows);
  cfg._w = cols; cfg._h = rows;
  const adjusted = adjustGreyscale(sampledGrey, cfg);

  let intensity = computeIntensity(adjusted, cols, rows, cfg.algorithm, cfg.layerContrast, cfg.layerInvert, cfg.threshold, cfg.edgeSensitivity, cfg.renderMode);
  if (cfg.dithering !== 'none') intensity = applyDithering(intensity, cols, rows, cfg.dithering, cfg.ramp.length);

  const charLUT = buildCharLUT(cfg.ramp, fontFamily, fontSize);

  // Render
  const outCanvas = createCanvas(outW, outH);
  const ctx = outCanvas.getContext('2d');

  if (cfg.backgroundColor !== 'transparent') {
    ctx.fillStyle = cfg.backgroundColor;
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.fillStyle = cfg.color;
  ctx.font = `${fontSize}px "${fontFamily}", monospace`;
  ctx.textBaseline = 'top';

  let charCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = Math.max(0, Math.min(255, intensity[r * cols + c]));
      if (val < 3) continue;
      const ch = charLUT[Math.min(255, Math.max(0, Math.round(val)))];
      if (ch === ' ') continue;
      ctx.fillText(ch, c * cellW, r * cellH);
      charCount++;
    }
  }

  const buf = outCanvas.toBuffer('image/png');
  writeFileSync(cfg.output, buf);
  console.log(`Output: ${cfg.output} (${outW}x${outH}, ${charCount} chars)`);
}

main().catch(e => { console.error(e); process.exit(1); });
