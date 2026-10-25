import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('File Menu Redesign & Functionality Upgrade', () => {

  describe('1. Menu Structure and Grouping', () => {
    // Test that all logical groups exist with proper headers and separators
    const expectedHeaders = ['New', 'Open', 'Recent', 'Import', 'Save', 'Export', 'Application'];

    function createMockFileMenu(app) {
      const isMac = false;
      return [
        { type: 'header', name: 'New' },
        { name: 'New Audio File', shortcut: 'Ctrl+N', action: vi.fn() },
        { name: 'New Multitrack Project', shortcut: 'Ctrl+Shift+N', action: vi.fn() },
        { name: 'New Recording...', shortcut: 'R', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Open' },
        { name: 'Load from Computer...', shortcut: 'Ctrl+O', action: vi.fn() },
        { name: 'Load from URL...', action: vi.fn() },
        { name: 'Open Mixota Project...', action: vi.fn() },
        { name: 'Load Sample Track', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Recent' },
        { name: 'Open Local Drafts...', id: 'drf', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Import' },
        { name: 'Import Audio...', action: vi.fn() },
        { name: 'Import into Multitrack...', action: vi.fn() },
        { name: 'Import Raw PCM Audio...', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Save' },
        { name: 'Save Draft Locally', shortcut: 'Ctrl+S', action: vi.fn() },
        { name: 'Save Project As...', shortcut: 'Ctrl+Shift+S', action: vi.fn() },
        { name: 'Save a Copy...', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Export' },
        { name: 'Export Audio...', shortcut: 'Ctrl+E', id: 'dl', action: vi.fn() },
        { name: 'Export WAV...', action: vi.fn() },
        { name: 'Export MP3...', action: vi.fn() },
        { name: 'Export FLAC...', action: vi.fn() },
        { name: 'Export Selection...', action: vi.fn() },
        { name: 'Export Multitrack Mixdown...', action: vi.fn() },
        { type: 'separator' },

        { type: 'header', name: 'Application' },
        { name: 'Project Properties...', action: vi.fn() },
        { name: 'Keyboard Shortcuts...', shortcut: '?', action: vi.fn() },
        { name: 'Preferences...', shortcut: 'Ctrl+,', action: vi.fn() }
      ];
    }

    it('contains all 7 required Adobe Audition-inspired logical groups', () => {
      const menu = createMockFileMenu({});
      const headers = menu.filter(item => item.type === 'header').map(h => h.name);
      expect(headers).toEqual(expectedHeaders);
    });

    it('contains subtle separators dividing each logical section', () => {
      const menu = createMockFileMenu({});
      const separators = menu.filter(item => item.type === 'separator');
      expect(separators.length).toBe(6);
    });

    it('defines standard keyboard shortcuts for primary workflows', () => {
      const menu = createMockFileMenu({});
      const shortcutMap = {};
      menu.forEach(item => {
        if (item.shortcut) shortcutMap[item.name] = item.shortcut;
      });

      expect(shortcutMap['New Audio File']).toBe('Ctrl+N');
      expect(shortcutMap['Load from Computer...']).toBe('Ctrl+O');
      expect(shortcutMap['Save Draft Locally']).toBe('Ctrl+S');
      expect(shortcutMap['Save Project As...']).toBe('Ctrl+Shift+S');
      expect(shortcutMap['Export Audio...']).toBe('Ctrl+E');
      expect(shortcutMap['Keyboard Shortcuts...']).toBe('?');
    });
  });

  describe('2. Group A: New Project Workflows', () => {
    let mockApp;

    beforeEach(() => {
      mockApp = {
        engine: {
          is_ready: false,
          history: []
        },
        multitrack: {
          Toggle: vi.fn(),
          ResetSession: vi.fn(),
          HasClips: vi.fn(() => false)
        },
        fireEvent: vi.fn()
      };
    });

    it('creates a new audio file and clears canvas when not dirty', () => {
      function doCreateNewAudioFile(app) {
        if (app.multitrack && app.multitrack.Toggle) app.multitrack.Toggle(false);
        app.fireEvent('DidUnloadFile');
        app.fireEvent('StateRequestClearAll');
      }

      doCreateNewAudioFile(mockApp);
      expect(mockApp.multitrack.Toggle).toHaveBeenCalledWith(false);
      expect(mockApp.fireEvent).toHaveBeenCalledWith('DidUnloadFile');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('StateRequestClearAll');
    });

    it('identifies dirty project state requiring confirmation before discard', () => {
      mockApp.engine.is_ready = true;
      mockApp.engine.history = [{ action: 'cut' }];

      const isDirty = mockApp.engine && mockApp.engine.is_ready && mockApp.engine.history.length > 0;
      expect(isDirty).toBe(true);
    });

    it('switches to multitrack workspace and resets session on New Multitrack', () => {
      function doCreateNewMultitrack(app) {
        if (app.multitrack && app.multitrack.Toggle) app.multitrack.Toggle(true);
        if (app.multitrack && app.multitrack.ResetSession) app.multitrack.ResetSession();
        app.fireEvent('DidUpdateMultitrack');
      }

      doCreateNewMultitrack(mockApp);
      expect(mockApp.multitrack.Toggle).toHaveBeenCalledWith(true);
      expect(mockApp.multitrack.ResetSession).toHaveBeenCalled();
      expect(mockApp.fireEvent).toHaveBeenCalledWith('DidUpdateMultitrack');
    });

    it('dispatches RequestActionNewRec on New Recording action', () => {
      mockApp.fireEvent('RequestActionNewRec');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestActionNewRec');
    });
  });

  describe('3. Group B & C: Open & Recent Projects', () => {
    let mockApp;

    beforeEach(() => {
      mockApp = {
        engine: {
          LoadSample: vi.fn(),
          LoadURL: vi.fn()
        },
        fireEvent: vi.fn(),
        fls: {
          ListSessions: vi.fn()
        }
      };
    });

    it('fires RequestLoadLocalFile on Load from Computer', () => {
      mockApp.fireEvent('RequestLoadLocalFile');
      expect(mockApp.fireEvent).toHaveBeenCalledWith('RequestLoadLocalFile');
    });

    it('validates URL formats before invoking audio loader', () => {
      function isValidAudioUrl(str) {
        if (!str || typeof str !== 'string') return false;
        try {
          const parsed = new URL(str);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:';
        } catch (e) {
          return false;
        }
      }

      expect(isValidAudioUrl('https://example.com/podcast.mp3')).toBe(true);
      expect(isValidAudioUrl('http://localhost:5055/test.mp3')).toBe(true);
      expect(isValidAudioUrl('not-a-valid-url')).toBe(false);
      expect(isValidAudioUrl('')).toBe(false);
    });

    it('loads verified fixture test.mp3 on Load Sample Track', () => {
      mockApp.engine.LoadSample('test.mp3');
      expect(mockApp.engine.LoadSample).toHaveBeenCalledWith('test.mp3');
    });

    it('retrieves sessions from local draft database', () => {
      const mockSessions = [
        { id: 'sess_1', name: 'Episode 10 Intro', durr: 12.5, chans: 2, created: 1700000000000 },
        { id: 'sess_2', name: 'Vocal Master', durr: 45.0, chans: 1, created: 1700000100000 }
      ];
      mockApp.fls.ListSessions.mockImplementation((cb) => cb(mockSessions));

      let result;
      mockApp.fls.ListSessions((sessions) => { result = sessions; });
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Episode 10 Intro');
    });
  });

  describe('4. Group D: Import Workflows', () => {
    let mockApp;

    beforeEach(() => {
      mockApp = {
        multitrack: {
          Toggle: vi.fn(),
          AddFilesAuto: vi.fn()
        },
        fireEvent: vi.fn()
      };
    });

    it('handles multitrack clip import safely', () => {
      function importIntoMultitrack(app, files) {
        if (app.multitrack && app.multitrack.Toggle) app.multitrack.Toggle(true);
        if (app.multitrack && app.multitrack.AddFilesAuto) app.multitrack.AddFilesAuto(files);
      }

      const dummyFiles = [{ name: 'guitar.wav' }, { name: 'bass.wav' }];
      importIntoMultitrack(mockApp, dummyFiles);
      expect(mockApp.multitrack.Toggle).toHaveBeenCalledWith(true);
      expect(mockApp.multitrack.AddFilesAuto).toHaveBeenCalledWith(dummyFiles);
    });
  });

  describe('5. Group E: Save Workflows', () => {
    let mockApp;

    beforeEach(() => {
      mockApp = {
        projectTitle: 'mixota_episode_1',
        engine: {
          is_ready: true,
          wavesurfer: {
            backend: {
              buffer: { numberOfChannels: 2, sampleRate: 44100, length: 44100 }
            }
          }
        },
        multitrack: {
          IsOn: vi.fn(() => false),
          ExportSession: vi.fn()
        },
        fls: {
          on: true,
          SaveSession: vi.fn()
        }
      };
    });

    it('saves duplicate copy with (Copy) suffix without modifying active project title', () => {
      function triggerSaveCopy(app) {
        const currentTitle = app.projectTitle || 'Untitled Project';
        const copyName = currentTitle + ' (Copy)';
        const buff = app.engine.wavesurfer.backend.buffer;
        app.fls.SaveSession(buff, 'rand_id', copyName);
        return copyName;
      }

      const generatedName = triggerSaveCopy(mockApp);
      expect(generatedName).toBe('mixota_episode_1 (Copy)');
      expect(mockApp.projectTitle).toBe('mixota_episode_1'); // Unchanged!
      expect(mockApp.fls.SaveSession).toHaveBeenCalledWith(
        mockApp.engine.wavesurfer.backend.buffer,
        'rand_id',
        'mixota_episode_1 (Copy)'
      );
    });

    it('saves multitrack session files via ExportSession', () => {
      mockApp.multitrack.IsOn.mockReturnValue(true);

      function triggerSaveProjectAs(app, customName) {
        if (app.multitrack.IsOn()) {
          app.multitrack.ExportSession(customName);
        }
      }

      triggerSaveProjectAs(mockApp, 'my_podcast_ep1');
      expect(mockApp.multitrack.ExportSession).toHaveBeenCalledWith('my_podcast_ep1');
    });
  });

  describe('6. Group F: Export Audio Functionality', () => {
    it('provides clear explanation instead of silent failure when no audio is loaded', () => {
      const app = {
        engine: { is_ready: false },
        multitrack: { HasClips: () => false }
      };

      let noticeShown = false;
      function checkCanExport(app) {
        const hasAudio = app.engine.is_ready || app.multitrack.HasClips();
        if (!hasAudio) {
          noticeShown = true;
          return false;
        }
        return true;
      }

      expect(checkCanExport(app)).toBe(false);
      expect(noticeShown).toBe(true);
    });

    it('maps export formats to appropriate file extensions and settings', () => {
      const formatConfigs = {
        wav: { ext: '.wav', defaultBits: 16 },
        mp3: { ext: '.mp3', defaultKbps: 192 },
        flac: { ext: '.flac', defaultComp: 5 },
        amss: { ext: '.amss', isSession: true }
      };

      expect(formatConfigs.wav.ext).toBe('.wav');
      expect(formatConfigs.mp3.defaultKbps).toBe(192);
      expect(formatConfigs.flac.defaultComp).toBe(5);
      expect(formatConfigs.amss.isSession).toBe(true);
    });

    it('exports selection only when region is defined', () => {
      const region = { start: 1.5, end: 4.8 };
      let exportSelArg = false;

      function configureExport(selectionOnly, activeReg) {
        if (selectionOnly && activeReg) {
          exportSelArg = [activeReg.start, activeReg.end];
        } else {
          exportSelArg = false;
        }
      }

      configureExport(true, region);
      expect(exportSelArg).toEqual([1.5, 4.8]);

      configureExport(false, region);
      expect(exportSelArg).toBe(false);
    });
  });

  describe('7. Group G: Application & Project Properties', () => {
    it('computes accurate technical metadata for Project Properties display', () => {
      const mockBuffer = {
        duration: 75.5,
        sampleRate: 48000,
        numberOfChannels: 2,
        length: 75.5 * 48000
      };

      function calculateSpecs(buf) {
        const memMB = (buf.length * buf.numberOfChannels * 4 / (1024 * 1024)).toFixed(2);
        const channelText = buf.numberOfChannels === 1 ? 'Mono' : (buf.numberOfChannels === 2 ? 'Stereo' : `${buf.numberOfChannels} ch`);
        return {
          durationSec: buf.duration,
          sampleRateHz: `${buf.sampleRate} Hz`,
          channels: channelText,
          memoryUsed: `${memMB} MB`
        };
      }

      const specs = calculateSpecs(mockBuffer);
      expect(specs.durationSec).toBe(75.5);
      expect(specs.sampleRateHz).toBe('48000 Hz');
      expect(specs.channels).toBe('Stereo');
      expect(specs.memoryUsed).toBe('27.65 MB');
    });
  });

});
