import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Layer, type GlobalSettings,
  RAMP_PRESETS, FONT_OPTIONS, defaultLayer, defaultSettings,
  compositeAll,
} from './engine';

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [layers, setLayers] = useState<Layer[]>([
    { ...defaultLayer(), name: 'Fine Dither', fontSize: 5, ramp: RAMP_PRESETS['Detailed'],
      algorithm: 'brightness', dithering: 'atkinson', contrast: 100, opacity: 0.6 },
    { ...defaultLayer(), name: 'Medium', fontSize: 12, ramp: RAMP_PRESETS['Standard'],
      algorithm: 'detail', dithering: 'floyd-steinberg', contrast: 120 },
    { ...defaultLayer(), name: 'Edges', fontSize: 22, ramp: RAMP_PRESETS['Dense'],
      algorithm: 'edges', dithering: 'none', contrast: 150, threshold: 10, edgeSensitivity: 120 },
  ]);
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings());
  const [exportWidth, setExportWidth] = useState(4000);
  const [rendering, setRendering] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderTimer = useRef<number>(0);

  // Load sample image on mount
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.src = '/sample.jpg';
  }, []);

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
          <div className={`upload-zone ${image ? 'has-image' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
            onDragLeave={e => e.currentTarget.classList.remove('dragover')}>
            {image ? <img src={image.src} alt="source" /> : 'Drop image here or click to upload'}
          </div>
        </div>

        {/* Global Adjustments */}
        <div className="section">
          <h2>Image Adjustments</h2>
          <Slider label="Contrast" value={settings.contrast} min={0} max={300}
            onChange={v => updateSetting('contrast', v)} />
          <Slider label="Brightness" value={settings.brightness} min={-150} max={150}
            onChange={v => updateSetting('brightness', v)} />
          <Slider label="Gamma" value={settings.gamma} min={0.1} max={3} step={0.05}
            format={v => v.toFixed(2)} onChange={v => updateSetting('gamma', v)} />
          <Slider label="Black Point" value={settings.blackPoint} min={0} max={200}
            onChange={v => updateSetting('blackPoint', v)} />
          <Slider label="White Point" value={settings.whitePoint} min={55} max={255}
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
        </div>

        {/* Layers */}
        <div className="section">
          <h2>Layers ({layers.length})</h2>
          <div className="layer-list">
            {layers.map((layer, i) => (
              <div key={layer.id} className={`layer-card ${layer.enabled ? '' : 'disabled'}`}>
                <div className="layer-header">
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

                  <Slider label="Font Size" value={layer.fontSize} min={3} max={60}
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

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="control-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step || 1}
        value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="value">{format ? format(value) : String(Math.round(value * 100) / 100)}</span>
    </div>
  );
}

export default App;
