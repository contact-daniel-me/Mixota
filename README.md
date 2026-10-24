# mixota

> **Your sound. Your creativity.**  
> *A product by **growiota***

**Mixota** is a fast, modern, browser-based audio editing workstation. Designed for creators, musicians, and audio engineers who need rapid, precise waveform editing and multitrack arrangement directly inside the browser — completely client-side with 100% privacy and zero installation.

---

## Highlights

- **Pure Client-Side Processing**: 100% in-browser audio engine using Web Audio API, WebAssembly, and Web Workers. No files are uploaded to any server.
- **Precision Waveform Editing**: Sample-accurate zooming, panning, zero-crossing snapping, region selection, cutting, trimming, and unlimited undo/redo.
- **Multitrack Studio**: Arrange clips across multiple tracks, crossfade overlapping clips, set per-track volume/pan/solo/mute, and bounce mixdown to a single file.
- **Studio-Grade DSP**: Equalization (Parametric & Graphic), Dynamic Compression, Reverb, Delay, Distortion, Normalization, Pitch Shift, and Doppler-style speed profiles.
- **Noise Reduction & Repair**: RNNoise AI noise reduction, 50/60Hz mains hum elimination, click removal, and edit-point smoothing.
- **Broad Format Support**: Export and import MP3, WAV, FLAC, OGG, WebM, and custom `.mixota` / `.amss` session files.
- **Lightweight & Offline-Ready**: Under 100KB compressed core runtime with offline caching and PWA support.

---

## Quick Start (Run Locally)

1. Clone or download this repository.
2. Navigate to the `src` directory:
   ```bash
   cd src
   ```
3. Start the local server:
   ```bash
   python mixota-server.py
   # or with Go: go run mixota-server.go
   # or: python server.py
   ```
4. Open your browser and navigate to:
   ```
   http://localhost:5055/
   ```

Or run via npm:
```bash
npm start
```

---

## Production Build

To assemble the minified JavaScript bundle for production delivery:

```bash
cat dist/wavesurfer.js dist/plugin/wavesurfer.regions.js oneup.js app.js keys.js contextmenu.js lufs.js ui-fx.js ui.js modal.js state.js engine.js actions.js drag.js recorder.js multitrack.js welcome.js fx-pg-eq.js fx-auto.js local.js id3.js lzma.js mixota-format.js | uglifyjs -c -m -o all.build.js
```

---

## License & Attribution

- **Mixota**: Branding, visual design system, customizations, and adaptations &copy; 2026 **growiota**.
- **AudioMass**: Mixota is built upon the open-source **[AudioMass](https://github.com/pkalogiros/audiomass)** project by **Pantelis Kalogiros**, licensed under the **MIT License**. We gratefully preserve and honor the original license obligations.

Bundled third-party libraries retain their respective open-source licenses:
- **WaveSurfer.js**: BSD-3-Clause
- **lamejs / LAME MP3 encoder**: LGPL
- **libFLAC 1.3.3**: Xiph / New BSD
- **RNNoise**: BSD-3-Clause
- **lz4-wasm**: BSD-2-Clause

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE) for full legal text.
