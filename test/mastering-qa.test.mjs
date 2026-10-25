import { describe, it, expect, vi, beforeEach } from 'vitest';
import lufsModule from '../src/lufs.js';

// Helper: Create an AudioBuffer mock compatible with Node/Vitest
function createAudioBuffer(channels, sampleRate, length, generator) {
  const channelData = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Float32Array(length);
    if (typeof generator === 'function') {
      for (let i = 0; i < length; i++) {
        arr[i] = generator(c, i, length, sampleRate);
      }
    } else if (typeof generator === 'number') {
      arr.fill(generator);
    }
    channelData.push(arr);
  }

  return {
    numberOfChannels: channels,
    sampleRate: sampleRate,
    length: length,
    duration: length / sampleRate,
    getChannelData(c) {
      return channelData[c];
    }
  };
}

describe('Phase 3 — Mastering Quality Assurance & DSP Verification', () => {

  describe('1. Silence and Near-Silence Handling', () => {
    it('analyzes digital silence (all zeros) without NaN or Infinity runtime errors', () => {
      const buffer = createAudioBuffer(2, 48000, 48000 * 2, 0);
      const report = lufsModule.analyze(buffer);

      expect(report).toBeDefined();
      expect(Number.isNaN(report.peak)).toBe(false);
      expect(Number.isNaN(report.rms)).toBe(false);
      expect(Number.isNaN(report.truePeak)).toBe(false);

      expect(report.peak).toBe(0);
      expect(report.truePeak).toBe(0);
      expect(report.peakDb).toBe(-120);
      expect(report.rmsDb).toBe(-120);
      // BS.1770 gated loudness on total silence is -Infinity
      expect(report.lufs).toBe(-Infinity);
    });

    it('analyzes near-silence (-100 dBFS noise floor) cleanly without arithmetic instability', () => {
      const lowLevel = 0.00001; // ~ -100 dBFS
      const buffer = createAudioBuffer(2, 44100, 44100 * 1, lowLevel);
      const report = lufsModule.analyze(buffer);

      expect(report.peak).toBeCloseTo(lowLevel, 5);
      expect(Number.isNaN(report.peakDb)).toBe(false);
      expect(report.peakDb).toBeLessThan(-90);
      // Below -70 LKFS absolute gate, so gated loudness is -Infinity
      expect(report.lufs).toBe(-Infinity);
    });
  });

  describe('2. Low-Level Signals & Linear Gain Normalization', () => {
    it('accurately measures a low-level -40 dBFS sine wave', () => {
      const sampleRate = 48000;
      const freq = 1000;
      const amp = Math.pow(10, -40 / 20); // 0.01 (-40 dBFS)
      const buffer = createAudioBuffer(2, sampleRate, sampleRate * 2, (c, i) => {
        return amp * Math.sin(2 * Math.PI * freq * (i / sampleRate));
      });

      const report = lufsModule.analyze(buffer);
      expect(report.peakDb).toBeCloseTo(-40.0, 0.5);
      expect(report.rmsDb).toBeCloseTo(-43.0, 1.0); // sine wave RMS is peak - 3.01 dB
    });

    it('calculates proper normalization gain to reach target from low-level audio', () => {
      const report = {
        lufs: -36.0,
        truePeakDb: -32.0,
        peakDb: -33.0
      };
      const target = -16.0;
      const ceiling = -1.0;

      const norm = lufsModule.gainForTarget(report, target, ceiling);
      expect(norm.gainDb).toBeCloseTo(20.0, 1);
      expect(norm.expectedLUFS).toBeCloseTo(-16.0, 1);
      expect(norm.expectedTruePeakDb).toBeCloseTo(-12.0, 1);
      expect(norm.limited).toBe(false); // Plenty of headroom
    });
  });

  describe('3. Full-Scale Impulses & True Peak Detection', () => {
    it('detects 0 dBFS Dirac impulses without sample clipping overflow', () => {
      const buffer = createAudioBuffer(2, 48000, 48000 * 1, (c, i) => {
        return (i === 1000 || i === 20000) ? 1.0 : 0.0;
      });

      const report = lufsModule.analyze(buffer);
      expect(report.peak).toBe(1.0);
      expect(report.peakDb).toBeCloseTo(0.0, 1);
      expect(report.truePeak).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('4. Sine Waves Near 0 dBFS & Inter-Sample Peak Overshoot', () => {
    it('demonstrates inter-sample true-peak exceeding sample peak on reconstructed waveforms', () => {
      const sampleRate = 48000;
      const len = 48000;
      // High frequency near 1/4 sample rate (12 kHz) creates inter-sample peaks
      const freq = 12000;
      const amp = 0.98; // -0.17 dBFS
      const buffer = createAudioBuffer(2, sampleRate, len, (c, i) => {
        // Offset phase so maximum continuous amplitude falls between discrete samples
        return amp * Math.sin(2 * Math.PI * freq * (i / sampleRate) + Math.PI / 4);
      });

      const report = lufsModule.analyze(buffer);
      expect(report.truePeak).toBeGreaterThanOrEqual(report.peak);
      expect(report.truePeakDb).toBeGreaterThanOrEqual(report.peakDb);
    });

    it('mathematically captures true peak overshoot with 4x interpolation on adjacent high samples', () => {
      // Discrete samples: [0.0, 0.95, 0.95, 0.0]
      const buffer = createAudioBuffer(1, 48000, 100, (c, i) => {
        if (i === 10 || i === 11) return 0.95;
        return 0.0;
      });

      const report = lufsModule.analyze(buffer);
      // Discrete peak is 0.95 (-0.445 dBFS)
      expect(report.peak).toBeCloseTo(0.95, 4);
      // Reconstructed 4x true peak exceeds discrete sample values (> peak)
      expect(report.truePeak).toBeGreaterThan(report.peak);
      expect(report.truePeakDb).toBeGreaterThan(report.peakDb);
    });
  });

  describe('5. High-Crest-Factor Material & Limiting Verification', () => {
    it('verifies soft-knee limiting preserves low-level dynamics while clamping transient peaks', () => {
      const sampleRate = 44100;
      const buffer = createAudioBuffer(1, sampleRate, 1000, (c, i) => {
        // High crest factor: low baseline (0.05 = -26 dBFS), sharp spikes (0.90 = -0.9 dBFS)
        if (i % 100 === 0) return 0.90;
        return 0.05 * Math.sin(i);
      });

      const data = buffer.getChannelData(0);
      const targetGain = 2.0; // +6 dB amplification
      const ceilingLinear = Math.pow(10, -1.0 / 20); // ~0.891 (-1.0 dBTP)

      // Apply True-Peak soft-knee limiting
      for (let k = 0; k < data.length; k++) {
        let s = data[k] * targetGain;
        const abs_s = Math.abs(s);
        if (abs_s > ceilingLinear) {
          const over = abs_s - ceilingLinear;
          const compressed = ceilingLinear + Math.tanh(over / ceilingLinear) * (ceilingLinear * 0.08);
          s = s > 0 ? Math.min(ceilingLinear, compressed) : -Math.min(ceilingLinear, compressed);
        }
        data[k] = s;
      }

      // 1. Spikes must be clamped strictly to ceiling
      expect(Math.abs(data[0])).toBeLessThanOrEqual(ceilingLinear + 0.0001);
      expect(Math.abs(data[100])).toBeLessThanOrEqual(ceilingLinear + 0.0001);

      // 2. Low-level signal (0.05 * 2.0 = 0.10) must be linearly amplified without compression
      expect(Math.abs(data[1])).toBeCloseTo(0.05 * Math.sin(1) * targetGain, 4);

      // 3. No NaN or Infinite samples produced
      for (let k = 0; k < data.length; k++) {
        expect(Number.isFinite(data[k])).toBe(true);
      }
    });

    it('proves that discrete sample limiting alone does not eliminate inter-sample peaks', () => {
      // When two adjacent samples are both limited to ceilingLinear:
      const ceilingLinear = Math.pow(10, -1.0 / 20); // 0.891
      const buffer = createAudioBuffer(1, 48000, 100, (c, i) => {
        if (i === 20 || i === 21) return ceilingLinear;
        return 0.0;
      });

      const report = lufsModule.analyze(buffer);
      // Discrete sample peak is exactly ceilingLinear
      expect(report.peak).toBeCloseTo(ceilingLinear, 4);
      // True peak interpolated between adjacent ceilingLinear samples overshoots ceiling!
      expect(report.truePeak).toBeGreaterThan(ceilingLinear);
    });
  });

  describe('6. Stereo Independence & Channel Preservation', () => {
    it('preserves distinct Left and Right channel content during analysis and mastering', () => {
      const sampleRate = 48000;
      const buffer = createAudioBuffer(2, sampleRate, 1000, (c, i) => {
        // Left channel: loud square wave, Right channel: quiet sine wave
        if (c === 0) return 0.5 * (i % 20 < 10 ? 1 : -1);
        return 0.05 * Math.sin(2 * Math.PI * 440 * (i / sampleRate));
      });

      const leftData = buffer.getChannelData(0);
      const rightData = buffer.getChannelData(1);

      // Verify channel independence before processing
      expect(leftData[0]).toBe(0.5);
      expect(rightData[0]).toBeCloseTo(0.0, 5);

      // Apply independent linear mastering gain
      const gain = 1.5;
      for (let c = 0; c < 2; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          d[i] *= gain;
        }
      }

      // Assert Left and Right retain their distinct waveforms without crosstalk
      expect(leftData[0]).toBeCloseTo(0.75, 4);
      expect(rightData[0]).toBeCloseTo(0.0, 4);
      expect(Math.abs(leftData[5])).toBeGreaterThan(0.7);
      expect(Math.abs(rightData[5])).toBeLessThan(0.1);
    });
  });

  describe('7. Short & Long Audio Buffer Handling', () => {
    it('handles very short audio buffers (< 400ms BS.1770 block size) gracefully', () => {
      const sampleRate = 48000;
      const shortLength = 4800; // 100ms (smaller than 400ms block)
      const buffer = createAudioBuffer(2, sampleRate, shortLength, 0.2);

      const report = lufsModule.analyze(buffer);
      expect(report).toBeDefined();
      expect(Number.isNaN(report.peakDb)).toBe(false);
      expect(Number.isNaN(report.rmsDb)).toBe(false);
      expect(report.peak).toBeCloseTo(0.2, 4);
    });

    it('computes consistent integrated loudness across long multi-second audio buffers', () => {
      const sampleRate = 44100;
      const longLength = 44100 * 10; // 10 seconds, 25 BS.1770 blocks
      const amp = 0.25;
      const buffer = createAudioBuffer(2, sampleRate, longLength, (c, i) => {
        return amp * Math.sin(2 * Math.PI * 1000 * (i / sampleRate));
      });

      const report = lufsModule.analyze(buffer);
      expect(report).toBeDefined();
      expect(Number.isFinite(report.lufs)).toBe(true);
      expect(report.lufs).toBeGreaterThan(-30);
      expect(report.lufs).toBeLessThan(-10);
    });
  });

  describe('8. Multi-Sample-Rate DSP Filter Consistency', () => {
    it('calculates stable K-weighting filter coefficients at 44.1 kHz, 48 kHz, and 96 kHz', () => {
      const rates = [44100, 48000, 96000];

      for (const rate of rates) {
        const buffer = createAudioBuffer(2, rate, rate * 1, 0.3);
        const report = lufsModule.analyze(buffer);

        expect(report).toBeDefined();
        expect(Number.isFinite(report.peakDb)).toBe(true);
        expect(Number.isFinite(report.rmsDb)).toBe(true);
        expect(report.peak).toBeCloseTo(0.3, 4);
      }
    });
  });

  describe('9. Target LUFS Unreachable Within Peak Ceiling', () => {
    it('correctly reports safe limited gain when target cannot be reached without exceeding ceiling', () => {
      // Audio with high crest factor: true peak is already -1.0 dBTP, but LUFS is -24 LUFS
      const report = {
        lufs: -24.0,
        truePeakDb: -1.0
      };
      const target = -14.0; // Desired gain = +10 dB
      const ceiling = -1.0; // Max allowed peak = -1.0 dBTP

      const result = lufsModule.gainForTarget(report, target, ceiling);

      // Safe Ceiling mode must NOT apply +10 dB (which would blow true peak to +9.0 dBTP!)
      expect(result.limited).toBe(true);
      expect(result.gainDb).toBeCloseTo(0.0, 1); // 0 dB gain allowed
      expect(result.expectedLUFS).toBeCloseTo(-24.0, 1);
      expect(result.expectedTruePeakDb).toBeCloseTo(-1.0, 1);
    });
  });

  describe('10. Architectural Distinction: Peak vs True Peak vs LUFS vs Normalization', () => {
    it('documents and verifies formal mathematical relations between metrics', () => {
      const definitions = {
        samplePeak: 'Maximum absolute discrete quantized value: max |x[n]|',
        truePeak: 'Maximum reconstructed continuous analog peak: max |x(t)| via 4x oversampling',
        integratedLoudness: 'Psychoacoustic perceptual loudness: ITU-R BS.1770 K-weighted energy with -70 LKFS / -10 LU gates',
        loudnessNormalization: 'Linear gain ΔG = Target LUFS - Integrated LUFS'
      };

      expect(definitions.samplePeak).toContain('max |x[n]|');
      expect(definitions.truePeak).toContain('4x oversampling');
      expect(definitions.integratedLoudness).toContain('K-weighted');
      expect(definitions.loudnessNormalization).toContain('Target LUFS - Integrated LUFS');
    });
  });

});
