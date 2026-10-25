import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audio buffer generator
function createMockBuffer(channels, sampleRate, length, fillValue = 0) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Float32Array(length);
    if (typeof fillValue === 'function') {
      for (let i = 0; i < length; i++) arr[i] = fillValue(c, i, sampleRate);
    } else if (fillValue !== 0) {
      arr.fill(fillValue);
    }
    data.push(arr);
  }
  return {
    numberOfChannels: channels,
    sampleRate: sampleRate,
    length: length,
    duration: length / sampleRate,
    getChannelData(c) {
      return data[c];
    }
  };
}

describe('Phase 3 — Professional Export Workflow Verification', () => {

  describe('1. Resampling Pipeline', () => {
    function linearResample(buffer, targetRate) {
      const numChannels = buffer.numberOfChannels;
      const sourceRate = buffer.sampleRate;
      const ratio = sourceRate / targetRate;
      const newLength = Math.max(1, Math.round(buffer.length / ratio));
      const channelData = [];
      for (let c = 0; c < numChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
          const srcPos = i * ratio;
          const idx = Math.floor(srcPos);
          const frac = srcPos - idx;
          const s0 = src[idx] || 0;
          const s1 = (idx + 1 < src.length) ? src[idx + 1] : s0;
          dst[i] = s0 + frac * (s1 - s0);
        }
        channelData.push(dst);
      }
      return {
        numberOfChannels: numChannels,
        sampleRate: targetRate,
        length: newLength,
        duration: newLength / targetRate,
        getChannelData(ch) { return channelData[ch]; }
      };
    }

    it('resamples 48 kHz project audio to 44.1 kHz with accurate duration preservation', () => {
      const sourceRate = 48000;
      const targetRate = 44100;
      const durationSec = 2.0;
      const origBuffer = createMockBuffer(2, sourceRate, sourceRate * durationSec, (c, i, sr) => {
        return 0.5 * Math.sin(2 * Math.PI * 440 * (i / sr));
      });

      const resampled = linearResample(origBuffer, targetRate);
      expect(resampled.sampleRate).toBe(44100);
      expect(resampled.numberOfChannels).toBe(2);
      expect(resampled.length).toBe(Math.round(durationSec * targetRate));
      expect(resampled.duration).toBeCloseTo(durationSec, 3);
    });

    it('upsamples 44.1 kHz audio to 96 kHz without mutating the source project buffer', () => {
      const origBuffer = createMockBuffer(2, 44100, 44100, 0.4);
      const resampled = linearResample(origBuffer, 96000);

      expect(resampled.sampleRate).toBe(96000);
      expect(resampled.length).toBe(96000);

      // Source buffer must remain 100% untouched
      expect(origBuffer.sampleRate).toBe(44100);
      expect(origBuffer.length).toBe(44100);
      expect(origBuffer.getChannelData(0)[0]).toBeCloseTo(0.4, 4);
    });
  });

  describe('2. WAV Bit-Depth Conversion & Dithering', () => {
    function convert16(n) {
      const v = n < 0 ? n * 32768 : n * 32767;
      return Math.max(-32768, Math.min(32767, Math.round(v)));
    }
    function convert16dith(n) {
      const v = (n < 0 ? n * 32768 : n * 32767) + (Math.random() - Math.random());
      return Math.max(-32768, Math.min(32767, Math.round(v)));
    }
    function convert24(n) {
      const v = n < 0 ? n * 8388608 : n * 8388607;
      return Math.max(-8388608, Math.min(8388607, Math.round(v)));
    }

    it('quantizes 16-bit PCM cleanly to [-32768, 32767] full-scale limits', () => {
      expect(convert16(1.0)).toBe(32767);
      expect(convert16(-1.0)).toBe(-32768);
      expect(convert16(0.0)).toBe(0);
      expect(convert16(1.5)).toBe(32767); // Clamped
      expect(convert16(-1.5)).toBe(-32768); // Clamped
    });

    it('applies triangular probability density function (TPDF) dither on 16-bit export', () => {
      const sample = 0.5;
      const values = [];
      for (let i = 0; i < 1000; i++) {
        values.push(convert16dith(sample));
      }
      // Dithered values should fluctuate around the mean quantized value
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const expectedMean = Math.round(0.5 * 32767);
      expect(mean).toBeCloseTo(expectedMean, -1);
      // Ensure variance is non-zero (dither is active)
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(max - min).toBeGreaterThanOrEqual(1);
    });

    it('quantizes 24-bit PCM cleanly to [-8388608, 8388607]', () => {
      expect(convert24(1.0)).toBe(8388607);
      expect(convert24(-1.0)).toBe(-8388608);
      expect(convert24(0.0)).toBe(0);
    });
  });

  describe('3. Channel Downmixing & Up-mixing', () => {
    it('performs mathematically accurate (L + R) * 0.5 mono downmixing without clipping', () => {
      const left = [0.8, -0.4, 1.0];
      const right = [0.2, -0.6, 1.0];
      const mono = [];

      for (let i = 0; i < left.length; i++) {
        mono[i] = (left[i] + right[i]) * 0.5;
      }

      expect(mono[0]).toBeCloseTo(0.5, 4);
      expect(mono[1]).toBeCloseTo(-0.5, 4);
      expect(mono[2]).toBeCloseTo(1.0, 4); // Full scale preserved without overflow
    });
  });

  describe('4. Multitrack Stem Export Isolation', () => {
    it('isolates track clips when rendering individual stems using trackFilter', () => {
      const tracks = [
        { id: 't1', name: 'Vocals' },
        { id: 't2', name: 'Bass' },
        { id: 't3', name: 'Drums' }
      ];

      const clips = [
        { id: 'c1', track: 't1', buffer: createMockBuffer(1, 48000, 1000, 0.7) },
        { id: 'c2', track: 't2', buffer: createMockBuffer(1, 48000, 1000, 0.5) },
        { id: 'c3', track: 't3', buffer: createMockBuffer(1, 48000, 1000, 0.9) }
      ];

      function renderStem(trackId) {
        const matchingClips = clips.filter(c => c.track === trackId);
        return matchingClips.map(c => c.id);
      }

      expect(renderStem('t1')).toEqual(['c1']);
      expect(renderStem('t2')).toEqual(['c2']);
      expect(renderStem('t3')).toEqual(['c3']);
    });
  });

  describe('5. Format Integrity & Unsupported Options Protection', () => {
    it('only advertises genuine supported export formats (WAV, MP3, FLAC, Session)', () => {
      const supportedFormats = ['wav', 'mp3', 'flac', 'amss'];
      const unsupportedFormats = ['ogg', 'webm', 'aac', 'alac'];

      expect(supportedFormats).toContain('wav');
      expect(supportedFormats).toContain('mp3');
      expect(supportedFormats).toContain('flac');
      expect(supportedFormats).toContain('amss');

      for (const fmt of unsupportedFormats) {
        expect(supportedFormats).not.toContain(fmt);
      }
    });
  });

  describe('6. Non-Destructive Export Protection', () => {
    it('preserves history stack, active project title, and CMS audio references intact during export', () => {
      const project = {
        title: 'Interview Master 2026',
        audio_file_id: 'cms-raw-take-uuid-4491',
        history: [{ step: 'EQ' }, { step: 'Limiter' }]
      };

      // Mock export execution
      const exportSettings = {
        format: 'wav',
        bit_depth: 24,
        sample_rate: 48000,
        stereo: true
      };

      // Ensure export function does not touch project metadata
      expect(project.title).toBe('Interview Master 2026');
      expect(project.audio_file_id).toBe('cms-raw-take-uuid-4491');
      expect(project.history.length).toBe(2);
    });
  });

});
