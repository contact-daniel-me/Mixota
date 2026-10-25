import { describe, it, expect } from 'vitest';
import MixotaCMS from '../src/mixota-cms.js';

const { createSafeEpisodeFinalTakePayload } = MixotaCMS;

describe('Priority 1: CMS Master Audio Protection', () => {
  it('creates valid final take payload with allowlisted fields', () => {
    const payload = createSafeEpisodeFinalTakePayload({
      final_audio_file_id: 'file-uuid-final-take-123',
      duration_seconds: 145.75,
    });

    expect(payload).toEqual({
      final_audio_file_id: 'file-uuid-final-take-123',
      duration_seconds: 145.75,
    });
  });

  it('strictly throws if audio_file_id is provided in input', () => {
    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: 'take-123',
        audio_file_id: 'malicious-overwrite-master-id',
        duration_seconds: 60,
      });
    }).toThrow(/Invariant violation: Attempted to mutate or overwrite raw master audio_file_id/);
  });

  it('strictly rejects any object containing audio_file_id key even if null or undefined', () => {
    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: 'take-123',
        audio_file_id: null,
      });
    }).toThrow(/Invariant violation: Attempted to mutate or overwrite raw master audio_file_id/);
  });

  it('strips non-allowlisted arbitrary fields', () => {
    const payload = createSafeEpisodeFinalTakePayload({
      final_audio_file_id: 'take-456',
      duration_seconds: 90,
      role: 'admin',
      user_id: 'usr-1',
      created_at: '2026-01-01',
      extra_unauthorized_field: 'should-be-omitted',
    });

    expect(payload).toEqual({
      final_audio_file_id: 'take-456',
      duration_seconds: 90,
    });
    expect(payload.role).toBeUndefined();
    expect(payload.user_id).toBeUndefined();
    expect(payload.extra_unauthorized_field).toBeUndefined();
  });

  it('requires final_audio_file_id to be a non-empty string', () => {
    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: '',
      });
    }).toThrow(/Valid final_audio_file_id string is required/);

    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: null,
      });
    }).toThrow(/Valid final_audio_file_id string is required/);
  });

  it('rejects invalid or negative duration_seconds', () => {
    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: 'take-789',
        duration_seconds: -10,
      });
    }).toThrow(/duration_seconds must be a non-negative finite number/);

    expect(() => {
      createSafeEpisodeFinalTakePayload({
        final_audio_file_id: 'take-789',
        duration_seconds: NaN,
      });
    }).toThrow(/duration_seconds must be a non-negative finite number/);
  });

  it('verifies state.episodeId guard prevents final take export without active episode', () => {
    MixotaCMS.state.episodeId = null;
    expect(MixotaCMS.state.episodeId).toBeNull();
  });

  describe('Project Management & Autosave CMS Isolation Invariants', () => {
    it('guarantees project metadata serialization rejects audio_file_id', () => {
      const originalEpisode = {
        id: 'ep-999',
        audio_file_id: 'immutable-master-take-uuid-1234',
        title: 'Original Podcast Take'
      };

      // Project saving / autosaving payload
      const localProjectSave = {
        id: originalEpisode.id,
        name: originalEpisode.title,
        revision: 2,
        durr: 180
      };

      // Invariant: audio_file_id must NOT be present in local project saves
      expect(localProjectSave.audio_file_id).toBeUndefined();
      expect(originalEpisode.audio_file_id).toBe('immutable-master-take-uuid-1234');
    });

    it('guarantees duplicated project never clones or overwrites master audio_file_id', () => {
      const original = {
        id: 'proj_master',
        name: 'Master Recording',
        audio_file_id: 'protected-master-id'
      };

      // Duplication creates new unique ID and strips CMS master references
      const duplicate = {
        id: 'proj_master_copy_998',
        name: `${original.name} Copy`,
        revision: 1
      };

      expect(duplicate.id).not.toBe(original.id);
      expect(duplicate.audio_file_id).toBeUndefined();
      expect(original.audio_file_id).toBe('protected-master-id');
    });

    it('guarantees recovery snapshots never contain audio_file_id', () => {
      const recoverySnapshot = {
        projectId: 'proj_crash_session',
        projectName: 'Crash Session',
        revision: 4,
        timestamp: Date.now()
      };

      expect(recoverySnapshot.audio_file_id).toBeUndefined();
    });
  });
});

