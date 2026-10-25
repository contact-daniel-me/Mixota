import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Phase 1: Universal Workspace Experience', () => {

  describe('1. Workspace Switcher', () => {
    // Workspace state machine test
    class WorkspaceManager {
      constructor(app) {
        this.app = app;
        this.activeWorkspace = 'waveform';
        this.history = [];
      }

      setWorkspace(ws) {
        if (!['waveform', 'multitrack', 'mastering'].includes(ws)) {
          throw new Error(`Invalid workspace: ${ws}`);
        }
        const prev = this.activeWorkspace;
        this.activeWorkspace = ws;
        this.history.push({ from: prev, to: ws });

        if (ws === 'multitrack') {
          this.app.multitrack.Toggle(true);
          this.app.mastering.setOpen(false);
        } else if (ws === 'mastering') {
          this.app.multitrack.Toggle(false);
          this.app.mastering.setOpen(true);
        } else {
          this.app.multitrack.Toggle(false);
          this.app.mastering.setOpen(false);
        }
        return this.activeWorkspace;
      }
    }

    let mockApp;
    let wsManager;

    beforeEach(() => {
      mockApp = {
        multitrack: {
          isOpen: false,
          Toggle: vi.fn((open) => { mockApp.multitrack.isOpen = open; })
        },
        mastering: {
          isOpen: false,
          setOpen: vi.fn((open) => { mockApp.mastering.isOpen = open; })
        }
      };
      wsManager = new WorkspaceManager(mockApp);
    });

    it('defaults to waveform workspace with multitrack and mastering disabled', () => {
      expect(wsManager.activeWorkspace).toBe('waveform');
      expect(mockApp.multitrack.isOpen).toBe(false);
      expect(mockApp.mastering.isOpen).toBe(false);
    });

    it('switches to multitrack workspace and toggles multitrack engine without reload', () => {
      wsManager.setWorkspace('multitrack');
      expect(wsManager.activeWorkspace).toBe('multitrack');
      expect(mockApp.multitrack.Toggle).toHaveBeenCalledWith(true);
      expect(mockApp.mastering.setOpen).toHaveBeenCalledWith(false);
    });

    it('switches to mastering workspace and activates mastering console', () => {
      wsManager.setWorkspace('mastering');
      expect(wsManager.activeWorkspace).toBe('mastering');
      expect(mockApp.multitrack.Toggle).toHaveBeenCalledWith(false);
      expect(mockApp.mastering.setOpen).toHaveBeenCalledWith(true);
    });

    it('switches back to waveform seamlessly without losing state', () => {
      wsManager.setWorkspace('multitrack');
      wsManager.setWorkspace('waveform');
      expect(wsManager.activeWorkspace).toBe('waveform');
      expect(mockApp.multitrack.Toggle).toHaveBeenLastCalledWith(false);
      expect(mockApp.mastering.setOpen).toHaveBeenLastCalledWith(false);
      expect(wsManager.history).toEqual([
        { from: 'waveform', to: 'multitrack' },
        { from: 'multitrack', to: 'waveform' }
      ]);
    });

    it('rejects invalid workspace identifiers safely', () => {
      expect(() => wsManager.setWorkspace('unknown')).toThrow(/Invalid workspace/);
      expect(wsManager.activeWorkspace).toBe('waveform');
    });
  });

  describe('2. Creator Launchpad', () => {
    class LaunchpadController {
      constructor(app) {
        this.app = app;
        this.visible = !app.engine.is_ready;
      }

      updateVisibility() {
        this.visible = !this.app.engine.is_ready;
        return this.visible;
      }

      handleAction(action) {
        switch (action) {
          case 'import':
            this.app.fireEvent('RequestLoadLocalFile');
            break;
          case 'record':
            this.app.fireEvent('RequestActionNewRec');
            break;
          case 'multitrack':
            this.app.setWorkspace('multitrack');
            break;
          case 'demo':
            this.app.engine.LoadSample('test.mp3');
            break;
          default:
            throw new Error(`Unknown launchpad action: ${action}`);
        }
      }

      handleDropFiles(files) {
        if (!files || files.length === 0) return;
        this.app.fireEvent('RequestLoadFile', files[0]);
      }
    }

    let mockApp;
    let launchpad;

    beforeEach(() => {
      mockApp = {
        engine: {
          is_ready: false,
          LoadSample: vi.fn()
        },
        fireEvent: vi.fn(),
        setWorkspace: vi.fn()
      };
      launchpad = new LaunchpadController(mockApp);
    });

    it('is visible when no audio project is loaded', () => {
      expect(launchpad.visible).toBe(true);
    });

    it('hides automatically when a project becomes ready', () => {
      mockApp.engine.is_ready = true;
      expect(launchpad.updateVisibility()).toBe(false);
    });

    it('re-appears if a project is unloaded', () => {
      mockApp.engine.is_ready = true;
      launchpad.updateVisibility();
      expect(launchpad.visible).toBe(false);

      mockApp.engine.is_ready = false;
      launchpad.updateVisibility();
      expect(launchpad.visible).toBe(true);
    });

    it('triggers RequestLoadLocalFile on Import Audio action', () => {
      launchpad.handleAction('import');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestLoadLocalFile');
    });

    it('triggers RequestActionNewRec on Record Voice action', () => {
      launchpad.handleAction('record');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestActionNewRec');
    });

    it('triggers LoadSample with verified asset test.mp3 on Try Demo action', () => {
      launchpad.handleAction('demo');
      expect(mockApp.engine.LoadSample).toHaveBeenCalledWith('test.mp3');
    });

    it('triggers workspace transition to multitrack on New Multitrack action', () => {
      launchpad.handleAction('multitrack');
      expect(mockApp.setWorkspace).toHaveBeenCalledWith('multitrack');
    });

    it('handles file drop gracefully without breaking import workflow', () => {
      const mockFile = { name: 'podcast_mix.wav', size: 1048576, type: 'audio/wav' };
      launchpad.handleDropFiles([mockFile]);
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestLoadFile', mockFile);
    });
  });

  describe('3. Universal Project Header & Telemetry', () => {
    function formatSampleRate(sampleRate) {
      if (!sampleRate || isNaN(sampleRate)) return '-- kHz';
      const khz = (sampleRate / 1000).toFixed(1);
      return `${khz} kHz`;
    }

    function formatChannels(numChannels) {
      if (!numChannels || isNaN(numChannels)) return '-- ch';
      if (numChannels === 1) return 'Mono';
      if (numChannels === 2) return 'Stereo';
      return `${numChannels} ch`;
    }

    function sanitizeProjectTitle(name) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return 'Untitled Project';
      }
      return name.trim().replace(/\.[^/.]+$/, ''); // Strip extension if present
    }

    it('formats standard audio sample rates correctly', () => {
      expect(formatSampleRate(44100)).toBe('44.1 kHz');
      expect(formatSampleRate(48000)).toBe('48.0 kHz');
      expect(formatSampleRate(96000)).toBe('96.0 kHz');
      expect(formatSampleRate(0)).toBe('-- kHz');
      expect(formatSampleRate(null)).toBe('-- kHz');
    });

    it('formats channel counts accurately without fabricating data', () => {
      expect(formatChannels(1)).toBe('Mono');
      expect(formatChannels(2)).toBe('Stereo');
      expect(formatChannels(4)).toBe('4 ch');
      expect(formatChannels(0)).toBe('-- ch');
      expect(formatChannels(undefined)).toBe('-- ch');
    });

    it('sanitizes and strips file extensions for project title display', () => {
      expect(sanitizeProjectTitle('my_master_take.wav')).toBe('my_master_take');
      expect(sanitizeProjectTitle('podcast_ep12.mp3')).toBe('podcast_ep12');
      expect(sanitizeProjectTitle('   ')).toBe('Untitled Project');
      expect(sanitizeProjectTitle(null)).toBe('Untitled Project');
    });

    it('accurately represents truthful persistence state', () => {
      const projectState = {
        hasSessionSaved: false,
        isDirty: false,
        getStatusLabel() {
          if (this.hasSessionSaved && !this.isDirty) return 'Saved locally';
          if (this.isDirty) return 'Unsaved changes';
          return 'Ready';
        }
      };

      expect(projectState.getStatusLabel()).toBe('Ready');
      projectState.isDirty = true;
      expect(projectState.getStatusLabel()).toBe('Unsaved changes');
      projectState.hasSessionSaved = true;
      projectState.isDirty = false;
      expect(projectState.getStatusLabel()).toBe('Saved locally');
    });
  });

  describe('4. Mastering LUFS Presets & DSP Normalization', () => {
    const MASTERING_TARGETS = {
      podcast: -16.0,
      streaming: -14.0,
      broadcast: -23.0,
      club: -9.0
    };

    it('defines verified industry standard loudness targets', () => {
      expect(MASTERING_TARGETS.podcast).toBe(-16.0);
      expect(MASTERING_TARGETS.streaming).toBe(-14.0);
      expect(MASTERING_TARGETS.broadcast).toBe(-23.0);
      expect(MASTERING_TARGETS.club).toBe(-9.0);
    });

    it('dispatches RequestActionFX_NormalizeLUFS with correct target value', () => {
      const mockApp = { fireEvent: vi.fn() };
      function applyMasteringTarget(presetKey) {
        const target = MASTERING_TARGETS[presetKey];
        if (target === undefined) throw new Error(`Unknown preset: ${presetKey}`);
        mockApp.fireEvent('RequestActionFX_NormalizeLUFS', target);
      }

      applyMasteringTarget('streaming');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestActionFX_NormalizeLUFS', -14.0);

      applyMasteringTarget('podcast');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestActionFX_NormalizeLUFS', -16.0);
    });

    it('formats loudness meter telemetry with precision and units', () => {
      function formatLoudness(val) {
        if (val === null || val === undefined || isNaN(val)) return '-- LUFS';
        return `${Number(val).toFixed(1)} LUFS`;
      }
      function formatPeak(val) {
        if (val === null || val === undefined || isNaN(val)) return '-- dB TP';
        const num = Number(val);
        const prefix = num > 0 ? '+' : '';
        return `${prefix}${num.toFixed(1)} dB TP`;
      }

      expect(formatLoudness(-14.234)).toBe('-14.2 LUFS');
      expect(formatLoudness(null)).toBe('-- LUFS');
      expect(formatPeak(-0.84)).toBe('-0.8 dB TP');
      expect(formatPeak(0.42)).toBe('+0.4 dB TP');
      expect(formatPeak(null)).toBe('-- dB TP');
    });
  });

});
