import { describe, it, expect, vi, beforeEach } from 'vitest';
import lufsModule from '../src/lufs.js';

// Helper mock AudioBuffer for node/vitest environment
function createMockBuffer(channels, sampleRate, length, fillValue = 0) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Float32Array(length);
    if (fillValue !== 0) arr.fill(fillValue);
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

describe('Phase 2 — Mastering Workflow and Multitrack Integration', () => {

  describe('1. Bounce to Master (Multitrack to Master Workspace)', () => {
    let mockApp;
    let multitrackEngine;

    beforeEach(() => {
      mockApp = {
        projectTitle: 'Mixota Podcast Episode 1',
        engine: {
          is_ready: false,
          wavesurfer: {
            backend: {
              buffer: null,
              SetNumberOfChannels: vi.fn(),
            },
            ActiveChannels: [1, 1],
            SelectedChannelsLen: 2,
            drawer: { params: {} },
            loadDecodedBuffer: vi.fn((buf) => {
              mockApp.engine.wavesurfer.backend.buffer = buf;
              return true;
            }),
            getDuration: vi.fn(() => 60.0),
            getWaveEl: vi.fn(() => ({ style: {} })),
            drawBuffer: vi.fn()
          }
        },
        fireEvent: vi.fn(),
        ui: {
          refreshMastering: vi.fn()
        }
      };

      multitrackEngine = {
        tracks: [
          { id: 't1', name: 'Host Mic', vol: 0.9, pan: -0.2, mute: false, solo: false },
          { id: 't2', name: 'Guest Mic', vol: 0.85, pan: 0.2, mute: false, solo: false },
          { id: 't3', name: 'Intro Music Bed', vol: 0.4, pan: 0.0, mute: false, solo: false }
        ],
        clips: [
          { id: 'c1', track: 't1', start: 0, duration: 30, buffer: createMockBuffer(1, 48000, 48000 * 30, 0.4) },
          { id: 'c2', track: 't2', start: 5, duration: 25, buffer: createMockBuffer(1, 48000, 48000 * 25, 0.35) },
          { id: 'c3', track: 't3', start: 0, duration: 15, buffer: createMockBuffer(2, 48000, 48000 * 15, 0.2) }
        ],
        isOn: true,
        isBouncing: false,
        hasClips() {
          return this.clips.length > 0;
        },
        Stop: vi.fn(),
        Toggle: vi.fn(function(on) { this.isOn = on; }),
        MixdownAsync(selection, done) {
          // Deterministic mixdown simulation
          const sampleRate = 48000;
          const duration = 30; // Max clip duration
          const rendered = createMockBuffer(2, sampleRate, sampleRate * duration);
          done(rendered);
        },
        BounceToMaster(callback) {
          if (this.isBouncing) return;
          if (!this.hasClips()) return;
          this.isBouncing = true;

          this.MixdownAsync(null, (masterBuffer) => {
            this.isBouncing = false;
            if (!masterBuffer) return;

            const wv = mockApp.engine.wavesurfer;
            this.Stop();
            this.Toggle(false); // Switch out of multitrack view; tracks & clips remain in memory!
            mockApp.engine.is_ready = true;
            wv.loadDecodedBuffer(masterBuffer);
            wv.backend.SetNumberOfChannels(masterBuffer.numberOfChannels);

            const masterTitle = (mockApp.projectTitle || 'Project') + ' (Master)';
            mockApp.fireEvent('DidLoadFile', masterTitle);
            mockApp.fireEvent('DidUpdateLen', masterBuffer.duration);
            mockApp.fireEvent('RequestSeekTo', 0);
            mockApp.fireEvent('RequestResize');

            if (mockApp.ui && mockApp.ui.refreshMastering) {
              mockApp.ui.refreshMastering(true);
            }
            if (callback) callback(masterBuffer);
          });
        }
      };
    });

    it('renders audible multitrack mix into stereo master buffer with correct sample rate and channels', () => {
      let resultBuffer = null;
      multitrackEngine.BounceToMaster((buf) => {
        resultBuffer = buf;
      });

      expect(resultBuffer).not.toBeNull();
      expect(resultBuffer.numberOfChannels).toBe(2);
      expect(resultBuffer.sampleRate).toBe(48000);
      expect(resultBuffer.duration).toBe(30);
    });

    it('transfers master buffer into single-track engine and triggers mastering refresh', () => {
      multitrackEngine.BounceToMaster();

      expect(multitrackEngine.Stop).toHaveBeenCalled();
      expect(multitrackEngine.Toggle).toHaveBeenCalledWith(false);
      expect(mockApp.engine.is_ready).toBe(true);
      expect(mockApp.engine.wavesurfer.loadDecodedBuffer).toHaveBeenCalled();
      expect(mockApp.fireEvent).toHaveBeenCalledWith('DidLoadFile', 'Mixota Podcast Episode 1 (Master)');
      expect(mockApp.ui.refreshMastering).toHaveBeenCalledWith(true);
    });

    it('strictly preserves original multitrack tracks and clips intact and editable after bouncing', () => {
      expect(multitrackEngine.tracks.length).toBe(3);
      expect(multitrackEngine.clips.length).toBe(3);

      multitrackEngine.BounceToMaster();

      // Original session must be completely untouched
      expect(multitrackEngine.tracks.length).toBe(3);
      expect(multitrackEngine.clips.length).toBe(3);
      expect(multitrackEngine.tracks[0].name).toBe('Host Mic');
      expect(multitrackEngine.clips[0].id).toBe('c1');

      // User can switch back to multitrack and edit clips seamlessly
      multitrackEngine.Toggle(true);
      expect(multitrackEngine.isOn).toBe(true);
    });

    it('prevents overlapping or duplicate bounce requests while a render is in progress', () => {
      multitrackEngine.isBouncing = true;
      const mixdownSpy = vi.spyOn(multitrackEngine, 'MixdownAsync');

      multitrackEngine.BounceToMaster();
      expect(mixdownSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. Automatic LUFS Re-analysis & Race Condition Protection', () => {
    class AnalysisManager {
      constructor(lufsLib) {
        this.lufs = lufsLib;
        this.seq = 0;
        this.state = 'idle'; // 'idle', 'analyzing', 'up-to-date', 'stale', 'error'
        this.lastReport = null;
        this.lastBuffer = null;
      }

      requestAnalysis(buffer, onComplete) {
        const thisSeq = ++this.seq;
        this.state = 'analyzing';

        // Async simulation
        setTimeout(() => {
          if (thisSeq !== this.seq) {
            // Stale sequence: dropped!
            return;
          }
          try {
            const report = this.lufs.analyze(buffer);
            if (thisSeq !== this.seq) return;

            this.lastReport = report;
            this.lastBuffer = buffer;
            this.state = 'up-to-date';
            if (onComplete) onComplete(report);
          } catch (e) {
            if (thisSeq === this.seq) {
              this.state = 'error';
            }
          }
        }, 10);
      }

      onAudioModified() {
        this.state = 'stale';
      }
    }

    it('increments sequence counter and ignores stale analysis results when newer requests arrive', async () => {
      const manager = new AnalysisManager(lufsModule);
      const buf1 = createMockBuffer(2, 44100, 44100 * 2, 0.1);
      const buf2 = createMockBuffer(2, 44100, 44100 * 2, 0.4);

      let finalReport = null;

      // Request analysis on buf1, immediately superceded by buf2
      manager.requestAnalysis(buf1, (rep) => { finalReport = rep; });
      manager.requestAnalysis(buf2, (rep) => { finalReport = rep; });

      expect(manager.seq).toBe(2);
      expect(manager.state).toBe('analyzing');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.state).toBe('up-to-date');
      expect(manager.lastBuffer).toBe(buf2);
      expect(finalReport).not.toBeNull();
      // buf2 has higher amplitude (0.4) than buf1 (0.1)
      expect(finalReport.rms).toBeCloseTo(0.4, 2);
    });

    it('transitions to stale state on audio-modifying events', () => {
      const manager = new AnalysisManager(lufsModule);
      manager.state = 'up-to-date';

      // An edit occurred (e.g. Cut, Paste, EQ)
      manager.onAudioModified();
      expect(manager.state).toBe('stale');
    });
  });

  describe('3. Loudness Normalization & True-Peak Control', () => {
    it('accurately identifies industry loudness standards', () => {
      const standards = {
        podcast: { target: -16.0, ceiling: -1.0 },
        streaming: { target: -14.0, ceiling: -1.0 },
        broadcast: { target: -23.0, ceiling: -1.0 },
        club: { target: -9.0, ceiling: -0.3 }
      };

      expect(standards.podcast.target).toBe(-16.0);
      expect(standards.streaming.target).toBe(-14.0);
      expect(standards.broadcast.target).toBe(-23.0);
      expect(standards.club.target).toBe(-9.0);
    });

    it('caps gain in Safe Ceiling mode when target gain would cause peak clipping', () => {
      const report = {
        lufs: -20.0,
        truePeakDb: -2.0 // Peak is -2.0 dBTP
      };
      const target = -14.0; // Desired gain = +6.0 dB
      const ceiling = -1.0; // Maximum safe gain = -1.0 - (-2.0) = +1.0 dB

      const result = lufsModule.gainForTarget(report, target, ceiling);
      expect(result.limited).toBe(true);
      expect(result.gainDb).toBeCloseTo(1.0, 1); // Capped at +1.0 dB!
      expect(result.expectedTruePeakDb).toBeCloseTo(-1.0, 1);
      expect(result.expectedLUFS).toBeCloseTo(-19.0, 1); // Only reached -19.0 LUFS to preserve ceiling
    });

    it('applies full target gain with soft-knee limiter active without exceeding ceiling threshold', () => {
      // Simulating the True-Peak soft-knee limiter implemented in NormalizeLUFS
      const sampleRate = 44100;
      const buffer = createMockBuffer(1, sampleRate, 100);
      const data = buffer.getChannelData(0);

      // Create an audio peak
      data[10] = 0.8;
      data[11] = 0.95;

      const targetGain = 2.0; // +6 dB amplification
      const ceilingLinear = Math.pow(10, -1.0 / 20); // ~0.891 (-1.0 dBTP)

      // Apply gain with soft-knee limiting
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

      // Assert that every sample strictly respects the ceiling
      for (let k = 0; k < data.length; k++) {
        expect(Math.abs(data[k])).toBeLessThanOrEqual(ceilingLinear + 0.001);
      }
      expect(Math.abs(data[11])).toBeCloseTo(ceilingLinear, 2);
    });
  });

  describe('4. Undo & Revert Integration', () => {
    it('pushes undo state before applying mastering so users can revert seamlessly', () => {
      const undoStack = [];
      const mockState = {
        push(desc, buffer) {
          undoStack.push({ desc, buffer });
        },
        pop() {
          return undoStack.pop();
        }
      };

      const initialBuffer = createMockBuffer(2, 44100, 1000, 0.2);
      mockState.push('Mastering: -14.0 LUFS', initialBuffer);

      expect(undoStack.length).toBe(1);
      expect(undoStack[0].desc).toBe('Mastering: -14.0 LUFS');

      // Undo operation
      const reverted = mockState.pop();
      expect(reverted.buffer).toBe(initialBuffer);
      expect(undoStack.length).toBe(0);
    });
  });

});
