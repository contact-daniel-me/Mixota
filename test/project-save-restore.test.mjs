import { describe, it, expect } from 'vitest';
import { AMSSFormat } from '../src/mixota-format.js';

describe('Priority 3: Project Save and Restore (AMSS / Mixota format)', () => {
  const mockApp = {
    engine: {
      wavesurfer: {
        backend: {
          ac: {
            createBuffer(channels, length, rate) {
              const data = [];
              for (let c = 0; c < channels; c++) data.push(new Float32Array(length));
              return {
                numberOfChannels: channels,
                length: length,
                sampleRate: rate,
                getChannelData: (c) => data[c],
              };
            },
          },
        },
      },
    },
  };

  const formatter = new AMSSFormat(mockApp);

  it('validates buffer format magic bytes correctly', () => {
    // Valid AMS v1 magic header: [1, 65, 77, 83] = [1, 'A', 'M', 'S']
    const validHeader = new Uint8Array([1, 65, 77, 83, 0, 0, 0, 0]);
    expect(formatter.IsBuffer(validHeader.buffer)).toBe(true);

    // Invalid header
    const invalidHeader = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(formatter.IsBuffer(invalidHeader.buffer)).toBe(false);

    // Empty or short buffer
    expect(formatter.IsBuffer(new ArrayBuffer(2))).toBe(false);
    expect(formatter.IsBuffer(null)).toBe(false);
  });

  it('serializes and deserializes multitrack tracks and clips structure', () => {
    const dummyBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 1000,
      getChannelData: () => new Float32Array(1000),
    };

    const sessionState = {
      tracks: [
        { id: 'mt1', name: 'Voice Track', vol: 0.8, pan: -0.2, mute: 0, solo: 0 },
        { id: 'mt2', name: 'Music Bed', vol: 0.5, pan: 0.2, mute: 0, solo: 0 },
      ],
      clips: [
        {
          id: 'mc1',
          track: 'mt1',
          start: 0.0,
          in: 0.0,
          out: 1.0,
          fi: 0.05,
          fo: 0.1,
          name: 'Take 1',
          buffer: dummyBuffer,
        },
      ],
      xfades: {},
      selected_track: 'mt1',
      selected_clip: 'mc1',
      beat_bpm: 128,
      beat_sig: '4/4',
    };

    // Build binary array using formatter
    const serializedBuffer = formatter.BuildSessionBuffer(sessionState);
    expect(serializedBuffer).toBeDefined();
    expect(serializedBuffer.byteLength).toBeGreaterThan(16);

    // Check magic byte validation passes
    expect(formatter.IsBuffer(serializedBuffer)).toBe(true);

    // Decode session and verify structure
    const decoded = formatter.DecodeMultitrack(serializedBuffer);
    expect(decoded).toBeDefined();
    expect(decoded.tracks).toHaveLength(2);
    expect(decoded.tracks[0].name).toBe('Voice Track');
    expect(decoded.tracks[0].vol).toBeCloseTo(0.8, 2);
    expect(decoded.tracks[1].name).toBe('Music Bed');
    expect(decoded.tracks[1].pan).toBeCloseTo(0.2, 2);
    expect(decoded.clips).toHaveLength(1);
    expect(decoded.clips[0].name).toBe('Take 1');
  });
});
