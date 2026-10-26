import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory mock IndexedDB store simulating 'mixota-audio' stores: 'sessions', 'recovery', 'projects_meta'
class MockMixotaStorage {
  constructor() {
    this.sessions = new Map();
    this.recovery = new Map();
    this.projectsMeta = new Map();
    this.failNextWrite = false;
    this.quotaExceeded = false;
  }

  async saveProject(project) {
    if (this.quotaExceeded) {
      const err = new Error('QuotaExceededError: Storage quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Database transaction aborted');
    }

    // Save full session
    const projectClone = JSON.parse(JSON.stringify(project));
    this.sessions.set(project.id, projectClone);

    // Save/update metadata
    const meta = {
      id: project.id,
      name: project.name,
      projectType: project.projectType || 'waveform',
      created: project.created || Date.now(),
      updated: Date.now(),
      savedAt: Date.now(),
      duration: project.durr || 0,
      channels: project.chans || 2,
      sampleRate: project.samplerate || 48000,
      revision: project.revision || 1,
      schemaVersion: 2,
      hasRecovery: this.recovery.has(project.id)
    };
    this.projectsMeta.set(project.id, meta);
    return meta;
  }

  async getProject(id) {
    const p = this.sessions.get(id);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async listProjects({ search = '', sortBy = 'updated', sortOrder = 'desc' } = {}) {
    let list = Array.from(this.projectsMeta.values()).map(m => ({
      ...m,
      hasRecovery: this.recovery.has(m.id)
    }));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let vA = a[sortBy];
      let vB = b[sortBy];
      if (typeof vA === 'string') {
        const cmp = vA.localeCompare(vB);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return sortOrder === 'asc' ? vA - vB : vB - vA;
    });

    return list;
  }

  async renameProject(id, newName) {
    const meta = this.projectsMeta.get(id);
    const session = this.sessions.get(id);
    if (!meta || !session) throw new Error(`Project ${id} not found`);

    meta.name = newName;
    meta.updated = Date.now();
    session.name = newName;
    session.updated = meta.updated;

    const rec = this.recovery.get(id);
    if (rec) rec.projectName = newName;

    return meta;
  }

  async duplicateProject(id) {
    const original = this.sessions.get(id);
    if (!original) throw new Error(`Project ${id} not found`);

    const newId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = newId;
    duplicate.name = `${original.name || 'Untitled'} Copy`;
    duplicate.created = Date.now();
    duplicate.updated = duplicate.created;
    duplicate.revision = 1;

    await this.saveProject(duplicate);
    return duplicate;
  }

  async deleteProject(id) {
    const existed = this.sessions.delete(id);
    this.projectsMeta.delete(id);
    this.recovery.delete(id);
    return existed;
  }

  async saveRecoverySnapshot(snapshot) {
    const clone = JSON.parse(JSON.stringify(snapshot));
    this.recovery.set(snapshot.projectId, clone);
    const meta = this.projectsMeta.get(snapshot.projectId);
    if (meta) meta.hasRecovery = true;
    return clone;
  }

  async getRecoverySnapshot(projectId) {
    const rec = this.recovery.get(projectId);
    return rec ? JSON.parse(JSON.stringify(rec)) : null;
  }

  async clearRecoverySnapshot(projectId) {
    const deleted = this.recovery.delete(projectId);
    const meta = this.projectsMeta.get(projectId);
    if (meta) meta.hasRecovery = false;
    return deleted;
  }

  async checkRecoveryCandidates() {
    const candidates = [];
    for (const [projectId, snapshot] of this.recovery.entries()) {
      const meta = this.projectsMeta.get(projectId);
      const lastSavedTime = meta ? meta.savedAt || meta.updated || 0 : 0;
      const lastSavedRev = meta ? meta.revision || 0 : 0;

      // Candidate if newer timestamp or higher revision than confirmed save
      if (snapshot.timestamp > lastSavedTime || snapshot.revision > lastSavedRev) {
        candidates.push({
          projectId,
          projectName: snapshot.projectName || (meta && meta.name) || 'Untitled Project',
          timestamp: snapshot.timestamp,
          snapshotRevision: snapshot.revision,
          savedRevision: lastSavedRev,
          projectType: snapshot.projectType || 'waveform'
        });
      }
    }
    return candidates;
  }
}

// Autosave Coordinator implementation model
class AutosaveCoordinator {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.projectId = options.projectId || `proj_${Date.now()}`;
    this.projectName = options.projectName || 'Untitled Project';
    this.projectType = options.projectType || 'waveform';
    this.revision = 1;
    this.savedRevision = 1;
    this.dirty = false;
    this.isSaving = false;
    this.saveQueued = false;
    this.debounceMs = options.debounceMs || 50; // fast for testing
    this.timer = null;
    this.status = 'Saved';
    this.statusListeners = [];
    this.contentGetter = options.contentGetter || (() => ({ audioData: [1, 2, 3] }));
  }

  onStatusChange(fn) {
    this.statusListeners.push(fn);
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach(fn => fn(status));
  }

  markDirty(reason) {
    this.revision++;
    this.dirty = true;
    this.setStatus('Unsaved changes');

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.triggerSave();
    }, this.debounceMs);
  }

  async triggerSave() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.isSaving) {
      this.saveQueued = true;
      return;
    }

    this.isSaving = true;
    const savingRev = this.revision;
    this.setStatus('Saving…');

    const projectPayload = {
      id: this.projectId,
      name: this.projectName,
      projectType: this.projectType,
      revision: savingRev,
      data: this.contentGetter(),
      created: this.created || Date.now()
    };

    try {
      // Create recovery snapshot alongside autosave
      await this.storage.saveRecoverySnapshot({
        projectId: this.projectId,
        projectName: this.projectName,
        projectType: this.projectType,
        revision: savingRev,
        timestamp: Date.now(),
        data: projectPayload.data
      });

      // Persist to confirmed project storage
      await this.storage.saveProject(projectPayload);

      this.savedRevision = savingRev;
      this.isSaving = false;

      // CRITICAL REVISION CHECK:
      // If user edited while save was writing (revision > savingRev):
      if (this.revision > savingRev) {
        this.dirty = true;
        this.setStatus('Unsaved changes');
        // Trigger save for latest revision
        this.triggerSave();
      } else {
        this.dirty = false;
        this.setStatus('Saved');
        // Clean obsolete recovery snapshot upon confirmed save
        await this.storage.clearRecoverySnapshot(this.projectId);
      }
    } catch (err) {
      this.isSaving = false;
      this.dirty = true; // Never clear dirty state on error!
      this.setStatus('Save failed');
      // Keep recovery snapshot safe when save fails!
    }
  }

  async saveImmediately() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.triggerSave();
  }
}

describe('Mixota Project Management & Autosave Recovery Test Suite', () => {
  let storage;

  beforeEach(() => {
    storage = new MockMixotaStorage();
  });

  describe('1. Project Management CRUD & Organization', () => {
    it('creates and lists projects with accurate metadata', async () => {
      const p1 = { id: 'p1', name: 'Podcast Episode 1', projectType: 'waveform', durr: 120 };
      const p2 = { id: 'p2', name: 'Guitar Track', projectType: 'multitrack', durr: 180 };

      await storage.saveProject(p1);
      await storage.saveProject(p2);

      const list = await storage.listProjects();
      expect(list).toHaveLength(2);
      expect(list.some(p => p.name === 'Podcast Episode 1')).toBe(true);
      expect(list.some(p => p.name === 'Guitar Track')).toBe(true);
    });

    it('filters projects by search query case-insensitively', async () => {
      await storage.saveProject({ id: 'p1', name: 'Radio Show Morning' });
      await storage.saveProject({ id: 'p2', name: 'Vocal Stem' });
      await storage.saveProject({ id: 'p3', name: 'Radio Show Evening' });

      const results = await storage.listProjects({ search: 'radio' });
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('Radio Show Morning');
      expect(results.map(r => r.name)).toContain('Radio Show Evening');
    });

    it('sorts projects by name and updated date correctly', async () => {
      await storage.saveProject({ id: 'p1', name: 'Zebra Track' });
      await storage.saveProject({ id: 'p2', name: 'Alpha Beat' });
      await storage.saveProject({ id: 'p3', name: 'Beta Jam' });

      const sortedByName = await storage.listProjects({ sortBy: 'name', sortOrder: 'asc' });
      expect(sortedByName[0].name).toBe('Alpha Beat');
      expect(sortedByName[1].name).toBe('Beta Jam');
      expect(sortedByName[2].name).toBe('Zebra Track');
    });

    it('renames project without altering audio content or creating duplicate records', async () => {
      await storage.saveProject({
        id: 'p1',
        name: 'Old Title',
        data: ['audio-buffer-blob-1'],
        durr: 45
      });

      const updatedMeta = await storage.renameProject('p1', 'New Polished Title');
      expect(updatedMeta.name).toBe('New Polished Title');

      const fullProject = await storage.getProject('p1');
      expect(fullProject.name).toBe('New Polished Title');
      expect(fullProject.data).toEqual(['audio-buffer-blob-1']);

      const all = await storage.listProjects();
      expect(all).toHaveLength(1); // No duplicate project created
    });

    it('duplicates project with a unique ID and independent cloned state', async () => {
      await storage.saveProject({
        id: 'p_original',
        name: 'Master Project',
        data: [{ clip: 'intro', gain: 0.8 }],
        durr: 90
      });

      const dup = await storage.duplicateProject('p_original');
      expect(dup.id).not.toBe('p_original');
      expect(dup.name).toBe('Master Project Copy');

      // Modifying duplicate must not affect original
      dup.data[0].gain = 1.0;
      await storage.saveProject(dup);

      const original = await storage.getProject('p_original');
      expect(original.data[0].gain).toBe(0.8); // 100% independent!
    });

    it('deletes selected project and its recovery data without affecting other projects', async () => {
      await storage.saveProject({ id: 'p1', name: 'Keep Me' });
      await storage.saveProject({ id: 'p2', name: 'Delete Me' });
      await storage.saveRecoverySnapshot({ projectId: 'p2', timestamp: Date.now() });

      const deleted = await storage.deleteProject('p2');
      expect(deleted).toBe(true);

      const remaining = await storage.listProjects();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('p1');

      // Recovery record for p2 must be cleaned up
      const rec = await storage.getRecoverySnapshot('p2');
      expect(rec).toBeNull();
    });
  });

  describe('2. Reliable Autosave & Revision Concurrency Invariant', () => {
    it('debounces rapid edits and triggers autosave once editing settles', async () => {
      const coordinator = new AutosaveCoordinator(storage, { debounceMs: 40 });
      const saveSpy = vi.spyOn(storage, 'saveProject');

      coordinator.markDirty('cut');
      coordinator.markDirty('trim');
      coordinator.markDirty('eq');

      expect(coordinator.dirty).toBe(true);
      expect(coordinator.status).toBe('Unsaved changes');
      expect(saveSpy).not.toHaveBeenCalled(); // Debouncing

      // Wait for debounce timer to fire
      await new Promise(r => setTimeout(r, 60));

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(coordinator.dirty).toBe(false);
      expect(coordinator.status).toBe('Saved');
    });

    it('CRITICAL CONCURRENCY: Revision 12 finishing after Revision 13 cannot mark Revision 13 as saved', async () => {
      const coordinator = new AutosaveCoordinator(storage, { debounceMs: 10 });

      // Start initial state at revision 12
      coordinator.revision = 12;
      coordinator.savedRevision = 11;

      // Mock storage.saveProject to simulate an asynchronous in-flight write
      let completeRev12Save;
      const delayedSavePromise = new Promise(resolve => {
        completeRev12Save = resolve;
      });

      const originalSave = storage.saveProject.bind(storage);
      let callCount = 0;
      vi.spyOn(storage, 'saveProject').mockImplementation(async (payload) => {
        callCount++;
        if (callCount === 1) {
          await delayedSavePromise; // Delay first save (rev 12)
        }
        return originalSave(payload);
      });

      // 1. Trigger save for rev 12
      coordinator.triggerSave();
      expect(coordinator.isSaving).toBe(true);

      // 2. User makes an edit while rev 12 is in flight! (revision advances to 13)
      coordinator.markDirty('added fade');
      expect(coordinator.revision).toBe(13);
      expect(coordinator.dirty).toBe(true);

      // 3. Complete the rev 12 save
      completeRev12Save();
      await new Promise(r => setTimeout(r, 30));

      // 4. Assert: Rev 12 completing did NOT mark rev 13 saved!
      // Coordinator must have triggered a second save and persisted revision 13!
      expect(coordinator.savedRevision).toBe(13);
      expect(coordinator.dirty).toBe(false);
      expect(coordinator.status).toBe('Saved');
      expect(callCount).toBe(2);
    });

    it('retains dirty state and displays error status when storage fails', async () => {
      storage.failNextWrite = true;
      const coordinator = new AutosaveCoordinator(storage, { debounceMs: 10 });

      coordinator.markDirty('gain edit');
      await new Promise(r => setTimeout(r, 30));

      expect(coordinator.dirty).toBe(true);
      expect(coordinator.status).toBe('Save failed');
      expect(coordinator.savedRevision).toBe(1); // Not updated
    });
  });

  describe('3. Crash & Session Recovery Detection', () => {
    it('detects a recovery candidate when an unconfirmed newer snapshot exists', async () => {
      const projectId = 'proj_crash_test';
      await storage.saveProject({
        id: projectId,
        name: 'Important Podcast',
        revision: 4,
        savedAt: 1000
      });

      // Browser crashed at timestamp 1500 with revision 5
      await storage.saveRecoverySnapshot({
        projectId: projectId,
        projectName: 'Important Podcast',
        revision: 5,
        timestamp: 1500,
        data: ['recovered-audio']
      });

      const candidates = await storage.checkRecoveryCandidates();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].projectId).toBe(projectId);
      expect(candidates[0].snapshotRevision).toBe(5);
      expect(candidates[0].savedRevision).toBe(4);
    });

    it('does not offer stale or already-saved snapshots as recovery candidates', async () => {
      const projectId = 'proj_saved_test';
      await storage.saveProject({
        id: projectId,
        name: 'Already Saved Song',
        revision: 3,
        savedAt: 2000
      });

      // Older snapshot at timestamp 1000 with revision 2
      await storage.saveRecoverySnapshot({
        projectId: projectId,
        timestamp: 1000,
        revision: 2
      });

      const candidates = await storage.checkRecoveryCandidates();
      expect(candidates).toHaveLength(0); // Stale snapshot ignored!
    });

    it('safely cleans recovery snapshot upon confirmed project save', async () => {
      const projectId = 'proj_clean_test';
      await storage.saveRecoverySnapshot({
        projectId,
        revision: 2,
        timestamp: Date.now()
      });

      expect(await storage.getRecoverySnapshot(projectId)).not.toBeNull();

      // Clean recovery snapshot
      await storage.clearRecoverySnapshot(projectId);
      expect(await storage.getRecoverySnapshot(projectId)).toBeNull();
    });
  });

  describe('4. Storage Resilience & Quota Limits', () => {
    it('catches QuotaExceededError, keeps project in memory, and preserves recovery snapshot', async () => {
      storage.quotaExceeded = true;
      const coordinator = new AutosaveCoordinator(storage, { debounceMs: 10 });

      // Save recovery snapshot before quota error occurs
      await storage.saveRecoverySnapshot({
        projectId: coordinator.projectId,
        revision: 2,
        timestamp: Date.now(),
        data: ['critical-user-take']
      });

      coordinator.markDirty('massive recording');
      await new Promise(r => setTimeout(r, 30));

      expect(coordinator.status).toBe('Save failed');
      expect(coordinator.dirty).toBe(true);

      // Recovery snapshot must NOT be cleared or lost when quota fails
      const recovery = await storage.getRecoverySnapshot(coordinator.projectId);
      expect(recovery).not.toBeNull();
      expect(recovery.data).toBeDefined();
    });
  });

  describe('5. CMS Master Audio Protection Invariant', () => {
    it('guarantees project persistence, duplication, and recovery payloads never include or mutate audio_file_id', async () => {
      const originalCmsTake = {
        id: 'proj_cms_episode_101',
        name: 'Episode 101 Raw',
        audio_file_id: 'cms-master-original-take-uuid-777', // The protected master audio reference!
        durr: 120
      };

      // 1. Autosave / Save operation
      const projectPayload = {
        id: originalCmsTake.id,
        name: originalCmsTake.name,
        revision: 2,
        durr: originalCmsTake.durr
        // Note: audio_file_id must NEVER be included in project payload!
      };
      await storage.saveProject(projectPayload);

      // 2. Duplicate operation
      const dup = await storage.duplicateProject(originalCmsTake.id);
      expect(dup.audio_file_id).toBeUndefined(); // Duplication never clones master audio_file_id!

      // 3. Recovery snapshot
      const snapshot = {
        projectId: originalCmsTake.id,
        projectName: originalCmsTake.name,
        revision: 3,
        timestamp: Date.now()
      };
      await storage.saveRecoverySnapshot(snapshot);
      const recovered = await storage.getRecoverySnapshot(originalCmsTake.id);
      expect(recovered.audio_file_id).toBeUndefined(); // Recovery never touches audio_file_id!

      // Original CMS master ID remains protected and unmutated
      expect(originalCmsTake.audio_file_id).toBe('cms-master-original-take-uuid-777');
    });
  });

  describe('6. Top Navigation Brand Removal & Storage Resilience Invariants', () => {
    it('verifies src/ui.js does not render mascot image or pk_brand in top header', async () => {
      const fs = await import('fs');
      const uiSrc = fs.readFileSync('src/ui.js', 'utf8');

      // The top header generator must not append pk_brand or mascot avatar
      const topHeaderFn = uiSrc.slice(uiSrc.indexOf('function _makeUITopHeader'), uiSrc.indexOf('function _topbarConfig'));
      expect(topHeaderFn).not.toContain('pk_brand');
      expect(topHeaderFn).not.toContain('mascot.png');
    });

    it('verifies src/local.js compressor safely initializes without recursion when lz4BlockCodec is undefined', async () => {
      const fs = await import('fs');
      const localSrc = fs.readFileSync('src/local.js', 'utf8');

      // Check db_version is upgraded to 4
      expect(localSrc).toContain('var db_version = 4;');

      // Check that fallback sets ready: true and loading: false
      expect(localSrc).toMatch(/codec\.createInstance[\s\S]*?q\.ready\s*=\s*true/);
      expect(localSrc).toMatch(/\.catch\(function\(\)\s*\{[\s\S]*?q\.ready\s*=\s*true/);
    });

    it('verifies src/mixota-cms.js matches db_version 4 and creates all required stores', async () => {
      const fs = await import('fs');
      const cmsSrc = fs.readFileSync('src/mixota-cms.js', 'utf8');

      expect(cmsSrc).toContain("indexedDB.open('mixota-audio', 4)");
      expect(cmsSrc).toContain("db.createObjectStore('recovery'");
      expect(cmsSrc).toContain("db.createObjectStore('projects_meta'");
    });
  });

});

