import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Mixota Default Experience & Empty State Regression Tests', () => {
  const uiJsPath = path.resolve(process.cwd(), 'src/ui.js');
  const multitrackJsPath = path.resolve(process.cwd(), 'src/multitrack.js');
  const engineJsPath = path.resolve(process.cwd(), 'src/engine.js');
  const appJsPath = path.resolve(process.cwd(), 'src/app.js');

  const uiJs = fs.readFileSync(uiJsPath, 'utf8');
  const multitrackJs = fs.readFileSync(multitrackJsPath, 'utf8');
  const engineJs = fs.readFileSync(engineJsPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  describe('1. Absence of Auto-Loaded Demo / Sample Audio', () => {
    it('does not load default sample audio in app.js on startup', () => {
      // Ensure app.js does not auto-call LoadSample or load test audio
      expect(appJs).not.toMatch(/LoadSample\s*\(\s*['"]test\.mp3['"]\s*\)/);
      expect(appJs).not.toMatch(/LoadSample\s*\(\s*['"]piano-sample\.mp3['"]\s*\)/);
    });

    it('LoadSample in engine.js does not fall back to piano-sample.mp3', () => {
      expect(engineJs).not.toContain("file || 'piano-sample.mp3'");
      expect(engineJs).toContain('if (!file) return;');
    });

    it('multitrack.js does not have hardcoded demo sample files loaded', () => {
      expect(multitrackJs).toContain('var multi_sample_files = [];');
      expect(multitrackJs).not.toContain("'guitar-lead.mp3'");
      expect(multitrackJs).not.toContain("'drums.mp3'");
      expect(multitrackJs).not.toContain("'bass.mp3'");
    });

    it('multitrack.js guards loadMultiSample when multi_sample_files is empty', () => {
      expect(multitrackJs).toContain('if (sample_loading || !multi_sample_files.length) return;');
    });
  });

  describe('2. Professional Emerald Carbon Empty State in Waveform Editor', () => {
    it('includes "Ready to create?" heading and required supporting text', () => {
      expect(uiJs).toContain('Ready to create?');
      expect(uiJs).toContain('Import an audio file or record directly to start editing.');
      expect(uiJs).toContain('Drop an audio file here to get started.');
    });

    it('includes Import Audio and Record Audio actions in pk_ed_empty', () => {
      expect(uiJs).toContain('Import Audio');
      expect(uiJs).toContain('Record Audio');
      expect(uiJs).toContain('pk_empty_btn_import');
      expect(uiJs).toContain('pk_empty_btn_record');
    });

    it('wires Import Audio to RequestLoadLocalFile and Record to RequestActionNewRec', () => {
      expect(uiJs).toMatch(/emptyImport\.onclick\s*=\s*function\s*\(\)\s*\{\s*app\.fireEvent\s*\(\s*'RequestLoadLocalFile'\s*\);/);
      expect(uiJs).toMatch(/emptyRecord\.onclick\s*=\s*function\s*\(\)\s*\{\s*app\.fireEvent\s*\(\s*'RequestActionNewRec'\s*\);/);
    });

    it('does not include demo audio links in pk_ed_empty', () => {
      const edEmptyMatch = uiJs.match(/pk_tmpMsg pk_ed_empty[\s\S]*?main_audio_view\.appendChild/);
      expect(edEmptyMatch).not.toBeNull();
      const edEmptyHtml = edEmptyMatch[0];
      expect(edEmptyHtml).not.toContain('test.mp3');
      expect(edEmptyHtml).not.toContain('Try Demo Track');
      expect(edEmptyHtml).not.toContain('sample');
    });
  });

  describe('3. Professional Emerald Carbon Empty State in Multitrack Workspace', () => {
    it('includes "Ready to create?" heading and required supporting text in multitrack empty state', () => {
      expect(multitrackJs).toContain('Ready to create?');
      expect(multitrackJs).toContain('Import an audio file or record directly to start editing.');
      expect(multitrackJs).toContain('Drop an audio file here to get started.');
    });

    it('includes Import Audio and Record Audio actions in pk_mt_empty', () => {
      expect(multitrackJs).toContain('pk_mt_empty_btn_import');
      expect(multitrackJs).toContain('pk_mt_empty_btn_record');
      expect(multitrackJs).toMatch(/mtImport\.onclick\s*=\s*function[\s\S]*?RequestLoadLocalFile/);
      expect(multitrackJs).toMatch(/mtRecord\.onclick\s*=\s*function[\s\S]*?RequestActionNewRec/);
    });

    it('does not contain hardcoded demo track link in pk_mt_empty', () => {
      const mtEmptyMatch = multitrackJs.match(/pk_tmpMsg pk_mt_empty[\s\S]*?pk_mt_region/);
      expect(mtEmptyMatch).not.toBeNull();
      const mtEmptyHtml = mtEmptyMatch[0];
      expect(mtEmptyHtml).not.toContain('loadMultiSample');
      expect(mtEmptyHtml).not.toContain('sample');
    });
  });

  describe('4. Creator Launchpad Empty State', () => {
    it('shows "Ready to create?" and excludes demo button', () => {
      const launchpadMatch = uiJs.match(/launchpad\.className\s*=\s*'pk_launchpad'[\s\S]*?audio_container\.appendChild\s*\(\s*launchpad\s*\)/);
      expect(launchpadMatch).not.toBeNull();
      const launchpadHtml = launchpadMatch[0];
      expect(launchpadHtml).toContain('Ready to create?');
      expect(launchpadHtml).toContain('Import an audio file or record directly to start editing.');
      expect(launchpadHtml).toContain('Drop an audio file here to get started.');
      expect(launchpadHtml).not.toContain('pk_lp_btn_demo');
      expect(launchpadHtml).not.toContain('Try Demo');
    });
  });

  describe('5. Mastering Workspace Empty State', () => {
    it('excludes "Try Demo Track" button', () => {
      const mstEmptyMatch = uiJs.match(/pk_mst_empty[\s\S]*?pk_mst_load_btn/);
      expect(mstEmptyMatch).not.toBeNull();
      const mstEmptyHtml = mstEmptyMatch[0];
      expect(mstEmptyHtml).not.toContain('pk_mst_demo_btn');
      expect(mstEmptyHtml).not.toContain('Try Demo Track');
    });
  });
});
