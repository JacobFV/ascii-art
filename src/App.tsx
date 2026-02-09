import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Layer, type GlobalSettings, type CurvePoint,
  RAMP_PRESETS, FONT_OPTIONS, defaultLayer, defaultSettings,
  compositeAll, renderAsciiText, renderAsciiSVG, createAdjustedCanvas,
  autoOptimizeSettings, getHistogram, buildToneCurveLUT,
} from './engine';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface Preset {
  name: string;
  layers: Layer[];
  settings: GlobalSettings;
}

const BUILT_IN_PRESETS: Record<string, Preset> = {
  'Default': {
    name: 'Default',
    layers: [
      { ...defaultLayer(), name: 'Fine Dither', fontSize: 5, ramp: RAMP_PRESETS['Detailed'],
        algorithm: 'brightness', dithering: 'atkinson', contrast: 100, opacity: 0.6 },
      { ...defaultLayer(), name: 'Medium', fontSize: 12, ramp: RAMP_PRESETS['Standard'],
        algorithm: 'detail', dithering: 'floyd-steinberg', contrast: 120 },
      { ...defaultLayer(), name: 'Edges', fontSize: 22, ramp: RAMP_PRESETS['Dense'],
        algorithm: 'edges', dithering: 'none', contrast: 150, threshold: 10, edgeSensitivity: 120 },
    ],
    settings: defaultSettings(),
  },
  'Sketch': {
    name: 'Sketch',
    layers: [
      { ...defaultLayer(), name: 'Hatching', fontSize: 10, ramp: RAMP_PRESETS['Hatching'],
        algorithm: 'edges', dithering: 'none', contrast: 200, edgeSensitivity: 150 },
      { ...defaultLayer(), name: 'Detail', fontSize: 6, ramp: '/|\\-. ',
        algorithm: 'detail', dithering: 'atkinson', contrast: 80, opacity: 0.5 },
    ],
    settings: { ...defaultSettings(), sharpen: 100 },
  },
  'Halftone': {
    name: 'Halftone',
    layers: [
      { ...defaultLayer(), name: 'Dots', fontSize: 8, ramp: RAMP_PRESETS['Dots'],
        algorithm: 'brightness', dithering: 'ordered', contrast: 120 },
    ],
    settings: defaultSettings(),
  },
  'Matrix': {
    name: 'Matrix',
    layers: [
      { ...defaultLayer(), name: 'Code', fontSize: 10, ramp: '01 ', color: '#00ff41',
        algorithm: 'brightness', dithering: 'floyd-steinberg', contrast: 150, renderMode: 'light-on-dark' },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#000000' },
  },
  'Typewriter': {
    name: 'Typewriter',
    layers: [
      { ...defaultLayer(), name: 'Type', fontSize: 14, ramp: RAMP_PRESETS['Standard'],
        algorithm: 'brightness', dithering: 'none', contrast: 140, fontFamily: 'Courier New' },
    ],
    settings: { ...defaultSettings(), posterize: 4 },
  },
  'Blueprint': {
    name: 'Blueprint',
    layers: [
      { ...defaultLayer(), name: 'Lines', fontSize: 8, ramp: RAMP_PRESETS['Dense'], color: '#ffffff',
        algorithm: 'edges', dithering: 'none', contrast: 200, edgeSensitivity: 180, renderMode: 'light-on-dark' },
      { ...defaultLayer(), name: 'Fill', fontSize: 6, ramp: RAMP_PRESETS['Simple'], color: '#88bbff',
        algorithm: 'brightness', dithering: 'atkinson', contrast: 60, opacity: 0.4, renderMode: 'light-on-dark' },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#1a3a5c' },
  },
  'Retro Terminal': {
    name: 'Retro Terminal',
    layers: [
      { ...defaultLayer(), name: 'CP437', fontSize: 8, ramp: RAMP_PRESETS['Code Page 437'], color: '#33ff33',
        algorithm: 'brightness', dithering: 'ordered', contrast: 130, renderMode: 'light-on-dark' },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#0a0a0a', posterize: 6 },
  },
  'Neon': {
    name: 'Neon',
    layers: [
      { ...defaultLayer(), name: 'Glow', fontSize: 10, ramp: RAMP_PRESETS['Blocks & Shapes'], colorMode: true,
        algorithm: 'brightness', dithering: 'floyd-steinberg', contrast: 160, renderMode: 'light-on-dark' },
      { ...defaultLayer(), name: 'Edges', fontSize: 14, ramp: RAMP_PRESETS['Blocks & Shapes'], color: '#ff00ff',
        algorithm: 'edges', dithering: 'none', contrast: 250, edgeSensitivity: 200, opacity: 0.7 },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#0d0d0d', sharpen: 80 },
  },
  'Stencil': {
    name: 'Stencil',
    layers: [
      { ...defaultLayer(), name: 'Fill', fontSize: 16, ramp: RAMP_PRESETS['Alphabetic'],
        algorithm: 'brightness', dithering: 'atkinson', contrast: 200, threshold: 40 },
    ],
    settings: { ...defaultSettings(), posterize: 3 },
  },
  'Mosaic': {
    name: 'Mosaic',
    layers: [
      { ...defaultLayer(), name: 'Blocks', fontSize: 12, ramp: RAMP_PRESETS['Blocks & Shapes'], colorMode: true,
        algorithm: 'brightness', dithering: 'ordered', contrast: 100 },
    ],
    settings: defaultSettings(),
  },
  'Math Art': {
    name: 'Math Art',
    layers: [
      { ...defaultLayer(), name: 'Symbols', fontSize: 10, ramp: RAMP_PRESETS['Math & Symbols'],
        algorithm: 'detail', dithering: 'floyd-steinberg', contrast: 130, edgeSensitivity: 120 },
    ],
    settings: { ...defaultSettings(), sharpen: 60 },
  },
  'High Contrast': {
    name: 'High Contrast',
    layers: [
      { ...defaultLayer(), name: 'Bold', fontSize: 10, ramp: RAMP_PRESETS['Binary'],
        algorithm: 'brightness', dithering: 'floyd-steinberg', contrast: 200 },
      { ...defaultLayer(), name: 'Edges', fontSize: 20, ramp: '#. ',
        algorithm: 'edges', dithering: 'none', contrast: 300, edgeSensitivity: 200, opacity: 0.8 },
    ],
    settings: { ...defaultSettings(), blackPoint: 30, whitePoint: 220 },
  },
  'Newspaper': {
    name: 'Newspaper',
    layers: [
      { ...defaultLayer(), name: 'Halftone', fontSize: 6, ramp: RAMP_PRESETS['Dots'],
        algorithm: 'brightness', dithering: 'ordered', contrast: 110 },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#f5f0e8', posterize: 8 },
  },
  'Arrows': {
    name: 'Arrows',
    layers: [
      { ...defaultLayer(), name: 'Flow', fontSize: 12, ramp: RAMP_PRESETS['Arrows & Chevrons'],
        algorithm: 'detail', dithering: 'atkinson', contrast: 140, edgeSensitivity: 130 },
    ],
    settings: { ...defaultSettings(), sharpen: 50 },
  },
  'Color Photo': {
    name: 'Color Photo',
    layers: [
      { ...defaultLayer(), name: 'Fine', fontSize: 4, ramp: RAMP_PRESETS['Detailed'], colorMode: true,
        algorithm: 'brightness', dithering: 'atkinson', contrast: 100 },
      { ...defaultLayer(), name: 'Detail', fontSize: 10, ramp: RAMP_PRESETS['Dense'], colorMode: true,
        algorithm: 'detail', dithering: 'floyd-steinberg', contrast: 120, opacity: 0.6, edgeSensitivity: 100 },
    ],
    settings: { ...defaultSettings(), backgroundColor: '#ffffff' },
  },
};

function loadSavedPresets(): Record<string, Preset> {
  try {
    const raw = localStorage.getItem('ascii-art-presets');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSavedPresets(presets: Record<string, Preset>) {
  localStorage.setItem('ascii-art-presets', JSON.stringify(presets));
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [layers, setLayers] = useState<Layer[]>(BUILT_IN_PRESETS['Default'].layers);
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings());
  const [savedPresets, setSavedPresets] = useState<Record<string, Preset>>(loadSavedPresets);
  const [exportWidth, setExportWidth] = useState(16000);
  const [rendering, setRendering] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [histogram, setHistogram] = useState<Uint32Array | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [gifProgress, setGifProgress] = useState<string | null>(null);
  const [gifFps, setGifFps] = useState(10);
  const [gifWidth, setGifWidth] = useState(400);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const adjustedCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const renderTimer = useRef<number>(0);
  const webcamStream = useRef<MediaStream | null>(null);
  const webcamVideo = useRef<HTMLVideoElement | null>(null);
  const webcamInterval = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load sample image on mount
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = '/sample.jpg';
  }, []);

  // Compute histogram when image changes
  useEffect(() => {
    if (image) setHistogram(getHistogram(image));
    else setHistogram(null);
  }, [image]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const stopWebcam = useCallback(() => {
    clearInterval(webcamInterval.current);
    if (webcamStream.current) {
      webcamStream.current.getTracks().forEach(t => t.stop());
      webcamStream.current = null;
    }
    if (webcamVideo.current) {
      webcamVideo.current.remove();
      webcamVideo.current = null;
    }
    setWebcamActive(false);
  }, []);

  const startWebcam = useCallback(async () => {
    stopWebcam();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      webcamStream.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      webcamVideo.current = video;
      setWebcamActive(true);

      // Capture frames as images at ~10fps
      webcamInterval.current = window.setInterval(() => {
        if (!video.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d')!.drawImage(video, 0, 0);
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = c.toDataURL();
      }, 100);
    } catch (e) {
      console.error('Webcam error:', e);
    }
  }, [stopWebcam]);

  const loadPreset = useCallback((preset: Preset) => {
    setLayers(preset.layers.map(l => ({ ...l, id: crypto.randomUUID() })));
    setSettings(preset.settings);
  }, []);

  const savePreset = useCallback((name: string) => {
    const preset: Preset = { name, layers, settings };
    setSavedPresets(prev => {
      const next = { ...prev, [name]: preset };
      saveSavedPresets(next);
      return next;
    });
  }, [layers, settings]);

  const deletePreset = useCallback((name: string) => {
    setSavedPresets(prev => {
      const next = { ...prev };
      delete next[name];
      saveSavedPresets(next);
      return next;
    });
  }, []);

  // Debounced preview render
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(() => {
      setRendering(true);
      requestAnimationFrame(() => {
        const aspect = image.naturalHeight / image.naturalWidth;
        const previewW = Math.min(1000, window.innerWidth - 420);
        const previewH = Math.round(previewW * aspect);
        const result = compositeAll(image, layers, settings, previewW, previewH);
        const canvas = canvasRef.current!;
        canvas.width = result.width;
        canvas.height = result.height;
        canvas.getContext('2d')!.drawImage(result, 0, 0);
        setRendering(false);
      });
    }, 120);
  }, [image, layers, settings]);

  // Render adjusted image preview
  useEffect(() => {
    if (!image || !adjustedCanvasRef.current) return;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = image.naturalWidth;
    srcCanvas.height = image.naturalHeight;
    srcCanvas.getContext('2d')!.drawImage(image, 0, 0);
    const adjusted = createAdjustedCanvas(srcCanvas, settings);
    const c = adjustedCanvasRef.current;
    c.width = adjusted.width;
    c.height = adjusted.height;
    c.getContext('2d')!.drawImage(adjusted, 0, 0);
  }, [image, settings]);

  const handleExport = useCallback(() => {
    if (!image) return;
    setRendering(true);
    setTimeout(() => {
      const aspect = image.naturalHeight / image.naturalWidth;
      const previewW = Math.min(1000, window.innerWidth - 420);
      const scale = exportWidth / previewW;
      const h = Math.round(exportWidth * aspect);
      const result = compositeAll(image, layers, settings, exportWidth, h, scale);
      const link = document.createElement('a');
      link.download = 'ascii-art.png';
      link.href = result.toDataURL('image/png');
      link.click();
      setRendering(false);
    }, 50);
  }, [image, layers, settings, exportWidth]);

  const handleCopyText = useCallback(() => {
    if (!image) return;
    const text = renderAsciiText(image, layers, settings, 120);
    navigator.clipboard.writeText(text);
  }, [image, layers, settings]);

  const handleExportSVG = useCallback(() => {
    if (!image) return;
    const aspect = image.naturalHeight / image.naturalWidth;
    const previewW = Math.min(1000, window.innerWidth - 420);
    const h = Math.round(previewW * aspect);
    const svg = renderAsciiSVG(image, layers, settings, previewW, h);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = 'ascii-art.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [image, layers, settings]);

  const handleVideoFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.onloadedmetadata = () => {
      videoRef.current = video;
      // Show first frame as preview
      video.currentTime = 0;
      video.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d')!.drawImage(video, 0, 0);
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = c.toDataURL();
        video.onseeked = null;
      };
    };
  }, []);

  const handleExportGIF = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setGifProgress('Preparing...');
    const duration = video.duration;
    const frameDelay = Math.round(1000 / gifFps);
    const totalFrames = Math.floor(duration * gifFps);
    const w = gifWidth;
    const aspect = video.videoHeight / video.videoWidth;
    const h = Math.round(w * aspect);

    const gif = GIFEncoder();

    const seekTo = (time: number): Promise<void> =>
      new Promise(resolve => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(time, duration);
      });

    for (let i = 0; i < totalFrames; i++) {
      setGifProgress(`Frame ${i + 1}/${totalFrames}`);
      await seekTo(i / gifFps);

      // Draw video frame to canvas
      const vc = document.createElement('canvas');
      vc.width = video.videoWidth;
      vc.height = video.videoHeight;
      vc.getContext('2d')!.drawImage(video, 0, 0);
      const frameImg = new Image();
      await new Promise<void>(resolve => {
        frameImg.onload = () => resolve();
        frameImg.src = vc.toDataURL();
      });

      // Render through ASCII pipeline
      const result = compositeAll(frameImg, layers, settings, w, h);
      const ctx = result.getContext('2d')!;
      const imageData = ctx.getImageData(0, 0, w, h);

      // Quantize and encode
      const palette = quantize(imageData.data, 256);
      const index = applyPalette(imageData.data, palette);
      gif.writeFrame(index, w, h, {
        palette,
        delay: frameDelay,
        ...(i === 0 ? { repeat: 0 } : {}),
      });

      // Yield to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }

    setGifProgress('Encoding...');
    gif.finish();

    const blob = new Blob([gif.bytes()], { type: 'image/gif' });
    const link = document.createElement('a');
    link.download = 'ascii-art.gif';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    setGifProgress(null);
  }, [layers, settings, gifFps, gifWidth]);

  const updateLayer = (id: string, patch: Partial<Layer>) =>
    setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const removeLayer = (id: string) =>
    setLayers(ls => ls.filter(l => l.id !== id));
  const addLayer = () => {
    const l = defaultLayer();
    l.name = `Layer ${layers.length + 1}`;
    setLayers(ls => [...ls, l]);
  };
  const duplicateLayer = (layer: Layer) =>
    setLayers(ls => [...ls, { ...layer, id: crypto.randomUUID(), name: layer.name + ' copy' }]);
  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers(ls => {
      const idx = ls.findIndex(l => l.id === id);
      const ni = idx + dir;
      if (idx < 0 || ni < 0 || ni >= ls.length) return ls;
      const copy = [...ls];
      [copy[idx], copy[ni]] = [copy[ni], copy[idx]];
      return copy;
    });
  };
  const updateSetting = <K extends keyof GlobalSettings>(k: K, v: GlobalSettings[K]) =>
    setSettings(s => ({ ...s, [k]: v }));
  const toggleCollapse = (id: string) =>
    setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const getRampPresetName = (ramp: string) => {
    for (const [name, val] of Object.entries(RAMP_PRESETS)) if (val === ramp) return name;
    return 'Custom';
  };

  return (
    <div className="app">
      <div className="sidebar">
        <h1>ASCII ART STUDIO</h1>

        {/* Upload */}
        <div className="section">
          <h2>Source Image</h2>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <input ref={videoInputRef} type="file" accept="video/*,.gif" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleVideoFile(e.target.files[0])} />
          <div className={`upload-zone ${image ? 'has-image' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
            onDragLeave={e => e.currentTarget.classList.remove('dragover')}>
            {image ? <img src={image.src} alt="source" /> : 'Drop image here or click to upload'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="add-layer-btn" style={{ flex: 1 }}
              onClick={() => videoInputRef.current?.click()}>
              Load Video
            </button>
            <button className="add-layer-btn" style={{ flex: 1 }}
              onClick={webcamActive ? stopWebcam : startWebcam}>
              {webcamActive ? '\u23F9 Stop Webcam' : '\u25CF Webcam'}
            </button>
          </div>
        </div>

        {/* Global Adjustments */}
        <div className="section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ marginBottom: 0 }}>Image Adjustments</h2>
            <button className="auto-btn" onClick={() => {
              if (image) setSettings(autoOptimizeSettings(image, settings));
            }} disabled={!image}>Auto</button>
          </div>
          <Slider label="Contrast" value={settings.contrast} min={0} max={300} step={0.5}
            onChange={v => updateSetting('contrast', v)} />
          <Slider label="Brightness" value={settings.brightness} min={-150} max={150} step={0.5}
            onChange={v => updateSetting('brightness', v)} />
          <Slider label="Gamma" value={settings.gamma} min={0.1} max={3} step={0.01}
            format={v => v.toFixed(2)} onChange={v => updateSetting('gamma', v)} />
          <Slider label="Black Point" value={settings.blackPoint} min={0} max={200} step={0.5}
            onChange={v => updateSetting('blackPoint', v)} />
          <Slider label="White Point" value={settings.whitePoint} min={55} max={255} step={0.5}
            onChange={v => updateSetting('whitePoint', v)} />
          <Slider label="Blur" value={settings.blur} min={0} max={10} step={0.5}
            format={v => v.toFixed(1)} onChange={v => updateSetting('blur', v)} />
          <Slider label="Sharpen" value={settings.sharpen} min={0} max={300}
            onChange={v => updateSetting('sharpen', v)} />
          <Slider label="Posterize" value={settings.posterize} min={0} max={16}
            onChange={v => updateSetting('posterize', v)} />
          <Slider label="BG Removal" value={settings.highPassRadius} min={0} max={50}
            onChange={v => updateSetting('highPassRadius', v)} />
          <div className="control-row">
            <label>Invert</label>
            <input type="checkbox" checked={settings.invert}
              onChange={e => updateSetting('invert', e.target.checked)} />
          </div>
          <div className="control-row">
            <label>Background</label>
            <input type="color" value={settings.backgroundColor === 'transparent' ? '#ffffff' : settings.backgroundColor}
              onChange={e => updateSetting('backgroundColor', e.target.value)}
              disabled={settings.backgroundColor === 'transparent'} />
            <label style={{ minWidth: 'auto', marginLeft: 4 }}>
              <input type="checkbox" checked={settings.backgroundColor === 'transparent'}
                onChange={e => updateSetting('backgroundColor', e.target.checked ? 'transparent' : '#ffffff')} />
              {' '}None
            </label>
          </div>
          {image && <canvas ref={adjustedCanvasRef} className="adjusted-preview" />}
          <ToneCurveEditor
            points={settings.toneCurve}
            histogram={histogram}
            onChange={pts => updateSetting('toneCurve', pts)}
          />
        </div>

        {/* Presets */}
        <div className="section">
          <h2>Presets</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {Object.values(BUILT_IN_PRESETS).map(p => (
              <button key={p.name} className="preset-btn" onClick={() => loadPreset(p)}>{p.name}</button>
            ))}
          </div>
          {Object.keys(savedPresets).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Saved</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.values(savedPresets).map(p => (
                  <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <button className="preset-btn" onClick={() => loadPreset(p)}>{p.name}</button>
                    <button className="preset-btn-del" onClick={() => deletePreset(p.name)}>&times;</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button className="add-layer-btn" onClick={() => {
            const name = prompt('Preset name:');
            if (name) savePreset(name);
          }}>+ Save Current</button>
        </div>

        {/* Layers */}
        <div className="section">
          <h2>Layers ({layers.length})</h2>
          <div className="layer-list">
            {layers.map((layer, i) => (
              <div key={layer.id}
                className={`layer-card ${layer.enabled ? '' : 'disabled'}${dragOverIdx === i ? ' drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== i) {
                    setLayers(ls => {
                      const copy = [...ls];
                      const [moved] = copy.splice(dragIdx, 1);
                      copy.splice(i, 0, moved);
                      return copy;
                    });
                  }
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                style={{ opacity: dragIdx === i ? 0.4 : 1 }}>
                <div className="layer-header">
                  <span className="drag-handle" draggable
                    onDragStart={() => setDragIdx(i)}>&#x2630;</span>
                  <input type="checkbox" checked={layer.enabled}
                    onChange={e => updateLayer(layer.id, { enabled: e.target.checked })} />
                  <span className="layer-name" onClick={() => toggleCollapse(layer.id)}
                    style={{ cursor: 'pointer' }}>
                    {collapsed[layer.id] ? '\u25B6' : '\u25BC'} {layer.name}
                  </span>
                  <button title="Up" onClick={() => moveLayer(layer.id, -1)} disabled={i === 0}>&uarr;</button>
                  <button title="Down" onClick={() => moveLayer(layer.id, 1)} disabled={i === layers.length - 1}>&darr;</button>
                  <button title="Duplicate" onClick={() => duplicateLayer(layer)}>&#x2398;</button>
                  <button title="Remove" onClick={() => removeLayer(layer.id)}>&times;</button>
                </div>

                {!collapsed[layer.id] && <>
                  <div className="control-row">
                    <label>Name</label>
                    <input type="text" value={layer.name}
                      onChange={e => updateLayer(layer.id, { name: e.target.value })} />
                  </div>

                  <Slider label="Font Size" value={layer.fontSize} min={1} max={60}
                    onChange={v => updateLayer(layer.id, { fontSize: v })} />
                  <Slider label="Char Space" value={layer.charSpacing} min={0} max={10}
                    onChange={v => updateLayer(layer.id, { charSpacing: v })} />

                  <div className="control-row">
                    <label>Font</label>
                    <select value={layer.fontFamily}
                      onChange={e => updateLayer(layer.id, { fontFamily: e.target.value })}>
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>

                  <div className="control-row">
                    <label>Algorithm</label>
                    <select value={layer.algorithm}
                      onChange={e => updateLayer(layer.id, { algorithm: e.target.value as Layer['algorithm'] })}>
                      <option value="brightness">Brightness</option>
                      <option value="edges">Edges (Sobel)</option>
                      <option value="highpass">High-Pass</option>
                      <option value="detail">Detail (mixed)</option>
                      <option value="stipple">Stipple (random)</option>
                    </select>
                  </div>

                  {(layer.algorithm === 'edges' || layer.algorithm === 'detail') &&
                    <Slider label="Edge Sens." value={layer.edgeSensitivity} min={10} max={400}
                      onChange={v => updateLayer(layer.id, { edgeSensitivity: v })} />
                  }

                  <div className="control-row">
                    <label>Dithering</label>
                    <select value={layer.dithering}
                      onChange={e => updateLayer(layer.id, { dithering: e.target.value as Layer['dithering'] })}>
                      <option value="none">None</option>
                      <option value="floyd-steinberg">Floyd-Steinberg</option>
                      <option value="atkinson">Atkinson</option>
                      <option value="ordered">Ordered (Bayer)</option>
                      <option value="stucki">Stucki</option>
                    </select>
                  </div>

                  <div className="control-row">
                    <label>Char Ramp</label>
                    <select value={getRampPresetName(layer.ramp)}
                      onChange={e => {
                        const val = e.target.value;
                        if (val !== 'Custom' && RAMP_PRESETS[val]) updateLayer(layer.id, { ramp: RAMP_PRESETS[val] });
                      }}>
                      {Object.keys(RAMP_PRESETS).map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div className="control-row">
                    <label></label>
                    <input type="text" value={layer.ramp}
                      onChange={e => updateLayer(layer.id, { ramp: e.target.value || ' ' })}
                      style={{ fontFamily: 'monospace', fontSize: 11 }} />
                  </div>

                  <div className="control-row">
                    <label>Color</label>
                    <input type="color" value={layer.color}
                      onChange={e => updateLayer(layer.id, { color: e.target.value })}
                      disabled={layer.colorMode} />
                    <label style={{ minWidth: 'auto', marginLeft: 4 }}>
                      <input type="checkbox" checked={layer.colorMode}
                        onChange={e => updateLayer(layer.id, { colorMode: e.target.checked })} />
                      {' '}Source
                    </label>
                  </div>

                  <div className="control-row">
                    <label>Mode</label>
                    <select value={layer.renderMode}
                      onChange={e => updateLayer(layer.id, { renderMode: e.target.value as Layer['renderMode'] })}>
                      <option value="dark-on-light">Dark chars</option>
                      <option value="light-on-dark">Light chars</option>
                    </select>
                  </div>

                  <Slider label="Contrast" value={layer.contrast} min={0} max={400}
                    onChange={v => updateLayer(layer.id, { contrast: v })} />
                  <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.05}
                    format={v => (v * 100).toFixed(0) + '%'}
                    onChange={v => updateLayer(layer.id, { opacity: v })} />
                  <Slider label="Threshold" value={layer.threshold} min={0} max={128}
                    onChange={v => updateLayer(layer.id, { threshold: v })} />

                  <div className="control-row">
                    <label>Blend</label>
                    <select value={layer.blendMode}
                      onChange={e => updateLayer(layer.id, { blendMode: e.target.value })}>
                      <option value="darken">Darken</option>
                      <option value="multiply">Multiply</option>
                      <option value="source-over">Normal</option>
                      <option value="overlay">Overlay</option>
                      <option value="screen">Screen</option>
                      <option value="color-burn">Color Burn</option>
                      <option value="hard-light">Hard Light</option>
                    </select>
                  </div>

                  <div className="control-row">
                    <label>Invert</label>
                    <input type="checkbox" checked={layer.invert}
                      onChange={e => updateLayer(layer.id, { invert: e.target.checked })} />
                  </div>
                </>}
              </div>
            ))}
          </div>
          <button className="add-layer-btn" onClick={addLayer}>+ Add Layer</button>
        </div>

        {/* Export */}
        <div className="section">
          <h2>Export</h2>
          <div className="export-row">
            <input type="number" value={exportWidth}
              onChange={e => setExportWidth(parseInt(e.target.value) || 800)} />
            <span style={{ fontSize: 12, color: '#666' }}>px wide</span>
            <button className="export-btn" onClick={handleExport} disabled={!image || rendering}>
              Export PNG
            </button>
          </div>
          <div className="export-row" style={{ marginTop: 8 }}>
            <button className="export-btn" onClick={handleExportSVG} disabled={!image || rendering}
              style={{ background: '#0f3460' }}>
              Export SVG
            </button>
            <button className="export-btn" onClick={handleCopyText} disabled={!image}
              style={{ background: '#0f3460' }}>
              Copy Text
            </button>
          </div>

          {videoRef.current && (
            <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Animated GIF</div>
              <div className="export-row">
                <input type="number" value={gifWidth}
                  onChange={e => setGifWidth(parseInt(e.target.value) || 200)} />
                <span style={{ fontSize: 12, color: '#666' }}>px</span>
                <input type="number" value={gifFps} style={{ width: 50 }}
                  onChange={e => setGifFps(Math.max(1, Math.min(30, parseInt(e.target.value) || 10)))} />
                <span style={{ fontSize: 12, color: '#666' }}>fps</span>
              </div>
              <div className="export-row" style={{ marginTop: 6 }}>
                <button className="export-btn" onClick={handleExportGIF}
                  disabled={!!gifProgress}
                  style={{ background: gifProgress ? '#555' : '#e94560' }}>
                  {gifProgress || 'Export GIF'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="preview-area">
        {rendering && <div className="rendering-indicator">Rendering...</div>}
        {image
          ? <canvas ref={canvasRef} />
          : <div className="preview-placeholder">Upload an image to get started</div>}
      </div>
    </div>
  );
}

function ToneCurveEditor({ points, histogram, onChange }: {
  points: CurvePoint[];
  histogram: Uint32Array | null;
  onChange: (pts: CurvePoint[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const W = 280, H = 180, PAD = 8;
  const iw = W - PAD * 2, ih = H - PAD * 2;

  const toScreen = (p: CurvePoint) => ({ sx: PAD + p.x * iw, sy: PAD + (1 - p.y) * ih });
  const fromScreen = (sx: number, sy: number): CurvePoint => ({
    x: Math.max(0, Math.min(1, (sx - PAD) / iw)),
    y: Math.max(0, Math.min(1, 1 - (sy - PAD) / ih)),
  });

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1a2a40';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const x = PAD + (i / 4) * iw;
      const y = PAD + (i / 4) * ih;
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, PAD + ih); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + iw, y); ctx.stroke();
    }

    // Identity line
    ctx.strokeStyle = '#2a3a50';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + ih);
    ctx.lineTo(PAD + iw, PAD);
    ctx.stroke();
    ctx.setLineDash([]);

    // Histogram
    if (histogram) {
      let maxH = 0;
      for (let i = 0; i < 256; i++) if (histogram[i] > maxH) maxH = histogram[i];
      if (maxH > 0) {
        ctx.fillStyle = 'rgba(100, 100, 180, 0.25)';
        for (let i = 0; i < 256; i++) {
          const bx = PAD + (i / 255) * iw;
          const bh = (histogram[i] / maxH) * ih * 0.9;
          ctx.fillRect(bx, PAD + ih - bh, Math.max(1, iw / 256), bh);
        }
      }
    }

    // Curve (evaluated via LUT)
    const lut = buildToneCurveLUT(points);
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const sx = PAD + (i / 255) * iw;
      const sy = PAD + (1 - lut[i] / 255) * ih;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Control points
    const sorted = [...points].sort((a, b) => a.x - b.x);
    sorted.forEach((p, i) => {
      const { sx, sy } = toScreen(p);
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = i === dragging ? '#ff6b8a' : '#e94560';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [points, histogram, dragging]);

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const findPoint = (mx: number, my: number): number | null => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const { sx, sy } = toScreen(sorted[i]);
      if (Math.hypot(mx - sx, my - sy) < 10) {
        // Return index in original array
        return points.indexOf(sorted[i]);
      }
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { mx, my } = getPos(e);
    const idx = findPoint(mx, my);
    if (idx !== null) {
      setDragging(idx);
    } else {
      // Add new point
      const p = fromScreen(mx, my);
      const newPts = [...points, p];
      onChange(newPts);
      setDragging(newPts.length - 1);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const { mx, my } = getPos(e);
    const p = fromScreen(mx, my);
    const newPts = [...points];
    newPts[dragging] = p;
    onChange(newPts);
  };

  const onMouseUp = () => setDragging(null);

  const onDoubleClick = (e: React.MouseEvent) => {
    const { mx, my } = getPos(e);
    const idx = findPoint(mx, my);
    if (idx !== null && points.length > 2) {
      onChange(points.filter((_, i) => i !== idx));
    }
  };

  return (
    <div className="tone-curve-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>Tone Curve</span>
        <button className="auto-btn" style={{ fontSize: 10, padding: '2px 8px' }}
          onClick={() => onChange([{ x: 0, y: 0 }, { x: 1, y: 1 }])}>Reset</button>
      </div>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        className="tone-curve-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
      />
      <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
        Click to add points. Drag to adjust. Double-click to remove.
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const s = step || 1;
  return (
    <div className="control-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={s}
        value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <input type="number" className="slider-num" min={min} max={max} step={s}
        value={format ? format(value) : String(Math.round(value * 100) / 100)}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }} />
    </div>
  );
}

export default App;
