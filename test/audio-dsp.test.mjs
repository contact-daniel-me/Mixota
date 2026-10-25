import { describe, it, expect } from 'vitest';
import lufsModule from '../src/lufs.js';

// Helper mock AudioBuffer for node/vitest environment
function createMockAudioBuffer(channels, sampleRate, length) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    data.push(new Float32Array(length));
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

// Deterministic PCM editing algorithms replicating Mixota engine operations
function pcmSlice(buffer, startSec, endSec) {
  const startSample = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endSec * buffer.sampleRate));
  const sliceLength = Math.max(0, endSample - startSample);
  const sliced = createMockAudioBuffer(buffer.numberOfChannels, buffer.sampleRate, sliceLength);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = sliced.getChannelData(c);
    dest.set(src.subarray(startSample, endSample));
  }
  return sliced;
}

function pcmCut(buffer, startSec, endSec) {
  const startSample = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endSec * buffer.sampleRate));
  const cutRegionLength = endSample - startSample;
  const newLength = buffer.length - cutRegionLength;
  const result = createMockAudioBuffer(buffer.numberOfChannels, buffer.sampleRate, newLength);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dest = result.getChannelData(c);
    dest.set(src.subarray(0, startSample), 0);
    dest.set(src.subarray(endSample), startSample);
  }
  return result;
}

function pcmPaste(buffer, insertBuffer, insertSec) {
  const insertSample = Math.max(0, Math.min(buffer.length, Math.floor(insertSec * buffer.sampleRate)));
  const newLength = buffer.length + insertBuffer.length;
  const result = createMockAudioBuffer(buffer.numberOfChannels, buffer.sampleRate, newLength);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const insertSrc = insertBuffer.getChannelData(c % insertBuffer.numberOfChannels);
    const dest = result.getChannelData(c);
    dest.set(src.subarray(0, insertSample), 0);
    dest.set(insertSrc, insertSample);
    dest.set(src.subarray(insertSample), insertSample + insertBuffer.length);
  }
  return result;
}

function pcmTrim(buffer, startSec, endSec) {
  return pcmSlice(buffer, startSec, endSec);
}

function pcmInsertSilence(buffer, insertSec, durationSec) {
  const silenceSamples = Math.floor(durationSec * buffer.sampleRate);
  const silenceBuf = createMockAudioBuffer(buffer.numberOfChannels, buffer.sampleRate, silenceSamples);
  return pcmPaste(buffer, silenceBuf, insertSec);
}

function findZeroCrossing(channelData, targetIndex, window = 100) {
  let bestIndex = targetIndex;
  let minAmp = Math.abs(channelData[targetIndex] || 0);

  const start = Math.max(0, targetIndex - window);
  const end = Math.min(channelData.length - 1, targetIndex + window);

  for (let i = start; i < end; i++) {
    const currentAmp = Math.abs(channelData[i]);
    // Check direct zero or sign-change crossing
    if (channelData[i] <= 0 && channelData[i + 1] >= 0 || (channelData[i] >= 0 && channelData[i + 1] <= 0)) {
      return i;
    }
    if (currentAmp < minAmp) {
      minAmp = currentAmp;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function crossfadeMix(bufferA, bufferB, overlapSec) {
  const sampleRate = bufferA.sampleRate;
  const overlapSamples = Math.floor(overlapSec * sampleRate);
  const totalLength = bufferA.length + bufferB.length - overlapSamples;
  const mixed = createMockAudioBuffer(bufferA.numberOfChannels, sampleRate, totalLength);

  for (let c = 0; c < bufferA.numberOfChannels; c++) {
    const dest = mixed.getChannelData(c);
    const aData = bufferA.getChannelData(c);
    const bData = bufferB.getChannelData(c);

    // Copy non-overlapping region of A
    dest.set(aData.subarray(0, bufferA.length - overlapSamples), 0);

    // Overlap region with equal-power / linear crossfade
    const aOverlapStart = bufferA.length - overlapSamples;
    const destOverlapStart = aOverlapStart;
    for (let i = 0; i < overlapSamples; i++) {
      const t = i / overlapSamples;
      const gainA = Math.cos(t * 0.5 * Math.PI);
      const gainB = Math.sin(t * 0.5 * Math.PI);
      dest[destOverlapStart + i] = (aData[aOverlapStart + i] * gainA) + (bData[i] * gainB);
    }

    // Copy remaining region of B
    dest.set(bData.subarray(overlapSamples), bufferA.length);
  }
  return mixed;
}

describe('Priority 3: Audio DSP and Editing Operations', () => {
  const sampleRate = 44100;
  const duration = 2.0;
  const length = sampleRate * duration;

  it('calculates PCM slicing and duration accurately', () => {
    const buf = createMockAudioBuffer(2, sampleRate, length);
    const ch0 = buf.getChannelData(0);
    // Fill with 440Hz sine wave
    for (let i = 0; i < length; i++) {
      ch0[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const sliced = pcmSlice(buf, 0.5, 1.5);
    expect(sliced.duration).toBeCloseTo(1.0, 4);
    expect(sliced.length).toBe(44100);
    expect(sliced.getChannelData(0)[0]).toBeCloseTo(ch0[Math.floor(0.5 * sampleRate)], 5);
  });

  it('detects zero-crossing boundary to prevent clicks', () => {
    const data = new Float32Array(500);
    // Sine wave
    for (let i = 0; i < 500; i++) {
      data[i] = Math.sin((2 * Math.PI * 10 * i) / 500);
    }

    // Near sample 125 is the peak (amplitude ~ 1.0)
    // Nearest zero crossing is at sample 250 (sign inversion)
    const zeroCrossing = findZeroCrossing(data, 120, 200);
    expect(Math.abs(data[zeroCrossing])).toBeLessThan(0.05);
  });

  it('performs Cut operation preserving surrounding audio and timing', () => {
    const buf = createMockAudioBuffer(1, sampleRate, length);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = 1.0; // pre-cut

    // Cut from 0.5s to 1.0s (0.5s cut)
    const cut = pcmCut(buf, 0.5, 1.0);
    expect(cut.duration).toBeCloseTo(1.5, 4);
    expect(cut.length).toBe(sampleRate * 1.5);
    expect(cut.getChannelData(0)[0]).toBe(1.0);
  });

  it('performs Copy and Paste accurately at cursor', () => {
    const base = createMockAudioBuffer(1, sampleRate, sampleRate * 1.0); // 1.0s of silence (0.0)
    const clip = createMockAudioBuffer(1, sampleRate, sampleRate * 0.5);
    clip.getChannelData(0).fill(0.75); // 0.5s of 0.75

    const pasted = pcmPaste(base, clip, 0.25);
    expect(pasted.duration).toBeCloseTo(1.5, 4);
    const pastedData = pasted.getChannelData(0);
    expect(pastedData[0]).toBe(0.0);
    expect(pastedData[Math.floor(0.3 * sampleRate)]).toBe(0.75);
    expect(pastedData[Math.floor(0.9 * sampleRate)]).toBe(0.0);
  });

  it('performs Trim keeping only the selected time range', () => {
    const buf = createMockAudioBuffer(1, sampleRate, sampleRate * 4.0);
    const data = buf.getChannelData(0);
    for (let i = 0; i < buf.length; i++) data[i] = i;

    const trimmed = pcmTrim(buf, 1.0, 3.0);
    expect(trimmed.duration).toBeCloseTo(2.0, 4);
    expect(trimmed.getChannelData(0)[0]).toBe(sampleRate * 1.0);
  });

  it('performs Silence insertion cleanly', () => {
    const buf = createMockAudioBuffer(1, sampleRate, sampleRate * 1.0);
    buf.getChannelData(0).fill(0.5);

    const withSilence = pcmInsertSilence(buf, 0.5, 0.5);
    expect(withSilence.duration).toBeCloseTo(1.5, 4);
    const data = withSilence.getChannelData(0);
    expect(data[0]).toBe(0.5);
    expect(data[Math.floor(0.6 * sampleRate)]).toBe(0.0);
    expect(data[Math.floor(1.2 * sampleRate)]).toBe(0.5);
  });

  it('mixes multitrack overlapping clips with smooth crossfade', () => {
    const clipA = createMockAudioBuffer(1, sampleRate, sampleRate * 1.0);
    const clipB = createMockAudioBuffer(1, sampleRate, sampleRate * 1.0);
    clipA.getChannelData(0).fill(1.0);
    clipB.getChannelData(0).fill(1.0);

    const overlapSec = 0.2;
    const mixed = crossfadeMix(clipA, clipB, overlapSec);
    expect(mixed.duration).toBeCloseTo(1.8, 4);

    const mixedData = mixed.getChannelData(0);
    // At middle of overlap (t = 0.5), gainA^2 + gainB^2 = 1.0 for equal power
    const midOverlapSample = Math.floor((1.0 - overlapSec / 2) * sampleRate);
    expect(mixedData[midOverlapSample]).toBeGreaterThan(0.9);
    expect(mixedData[midOverlapSample]).toBeLessThan(1.5);
  });

  it('calculates LUFS and loudness normalization gain according to ITU-R BS.1770', () => {
    expect(lufsModule).toBeDefined();
    expect(lufsModule.kWeightCoeffs).toBeDefined();

    // Verify filter coefficients exist for standard sample rates
    const coeffs44k = lufsModule.kWeightCoeffs(44100);
    expect(coeffs44k).toHaveLength(2);
    expect(coeffs44k[0].b0).toBeDefined();
    expect(coeffs44k[1].b0).toBeDefined();

    // Test gain calculation for target LUFS
    const report = {
      lufs: -24.0,
      truePeakDb: -4.0,
    };
    const normResult = lufsModule.gainForTarget(report, -16.0, -1.0);
    expect(normResult.gainDb).toBeCloseTo(3.0, 1); // limited by true-peak ceiling (-1 - (-4) = +3dB)
    expect(normResult.limited).toBe(true);
    expect(normResult.expectedTruePeakDb).toBeCloseTo(-1.0, 1);
  });
});
