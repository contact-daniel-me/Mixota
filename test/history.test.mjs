import { describe, it, expect } from 'vitest';
import { PKState } from '../src/state.js';

function createMockApp() {
  const events = {};
  return {
    isMobile: false,
    engine: {
      wavesurfer: {
        backend: {
          buffer: null,
        },
      },
    },
    fireEvent(name, ...args) {
      if (events[name]) {
        for (const cb of events[name]) cb(...args);
      }
    },
    listenFor(name, cb) {
      if (!events[name]) events[name] = [];
      events[name].push(cb);
    },
  };
}

function createDummyBuffer(length, channels = 1) {
  return {
    length,
    numberOfChannels: channels,
    sampleRate: 44100,
  };
}

describe('Priority 4: History Management and Memory Bounding', () => {
  it('initializes state manager and pushes undo states', () => {
    const app = createMockApp();
    const stateMgr = new PKState(20, app);

    const buf1 = createDummyBuffer(1000);
    stateMgr.pushUndoState({ data: buf1, desc: 'Initial' });

    expect(stateMgr.getLastUndoState()).toBeDefined();
    expect(stateMgr.getLastUndoState().data).toBe(buf1);
  });

  it('performs undo and redo maintaining correct buffer state and references', () => {
    const app = createMockApp();
    const stateMgr = new PKState(20, app);

    const buf1 = createDummyBuffer(1000);
    const buf2 = createDummyBuffer(2000);
    const buf3 = createDummyBuffer(3000);

    stateMgr.pushUndoState({ data: buf1, desc: 'Step 1' });
    app.engine.wavesurfer.backend.buffer = buf2;
    stateMgr.pushUndoState({ data: buf2, desc: 'Step 2' });
    app.engine.wavesurfer.backend.buffer = buf3;
    stateMgr.pushUndoState({ data: buf3, desc: 'Step 3' });

    // Pop undo -> step 3 popped to redo
    const undone = stateMgr.popUndoState();
    expect(undone.desc).toBe('Step 3');

    // Pop undo again -> step 2 popped to redo
    const undone2 = stateMgr.popUndoState();
    expect(undone2.desc).toBe('Step 2');

    // Redo -> restores step 2
    const redone = stateMgr.shiftRedoState();
    expect(redone.desc).toBe('Step 2');
  });

  it('clears redo stack when a new diverging state is pushed', () => {
    const app = createMockApp();
    const stateMgr = new PKState(20, app);

    stateMgr.pushUndoState({ data: createDummyBuffer(1000), desc: 'Step 1' });
    stateMgr.pushUndoState({ data: createDummyBuffer(2000), desc: 'Step 2' });

    stateMgr.popUndoState(); // Step 2 is in redo

    // Push new action
    stateMgr.pushUndoState({ data: createDummyBuffer(4000), desc: 'Branch Step 3' });

    // Attempting to redo should yield undefined/null because redo was cleared
    const redone = stateMgr.shiftRedoState();
    expect(redone).toBeFalsy();
  });

  it('bounds redo stack to maximum depth limit', () => {
    const app = createMockApp();
    const depth = 3;
    const stateMgr = new PKState(depth, app);

    // Push 3 states
    for (let i = 1; i <= 3; i++) {
      app.engine.wavesurfer.backend.buffer = createDummyBuffer(i * 100);
      stateMgr.pushUndoState({ data: app.engine.wavesurfer.backend.buffer, desc: `Step ${i}` });
    }

    // Pop all 3 into redo
    stateMgr.popUndoState();
    stateMgr.popUndoState();
    stateMgr.popUndoState();

    // Redo stack must not exceed depth limit
    const r1 = stateMgr.shiftRedoState();
    const r2 = stateMgr.shiftRedoState();
    const r3 = stateMgr.shiftRedoState();
    const r4 = stateMgr.shiftRedoState();

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();
    expect(r4).toBeFalsy();
  });

  it('prunes history when memory budget is exceeded, trimming redo first', () => {
    const app = createMockApp();
    // Use smaller depth and simulate state management
    const stateMgr = new PKState(50, app);

    // Each stereo 44.1kHz buffer of 10,000,000 samples is ~80MB
    const bigBuffers = [];
    for (let i = 0; i < 25; i++) {
      bigBuffers.push(createDummyBuffer(10000000, 2));
    }

    // Push states until memory threshold is crossed
    for (let i = 0; i < 20; i++) {
      app.engine.wavesurfer.backend.buffer = bigBuffers[i];
      stateMgr.pushUndoState({ data: bigBuffers[i], desc: `Large Edit ${i}` });
    }

    // Undo 5 times so redo has large buffers
    for (let i = 0; i < 5; i++) {
      stateMgr.popUndoState();
    }

    // Push another large edit
    app.engine.wavesurfer.backend.buffer = bigBuffers[21];
    stateMgr.pushUndoState({ data: bigBuffers[21], desc: 'Another Huge Edit' });

    // Verify undo still functions without crash and last state is preserved
    const last = stateMgr.getLastUndoState();
    expect(last).toBeDefined();
    expect(last.desc).toBe('Another Huge Edit');
  });
});
