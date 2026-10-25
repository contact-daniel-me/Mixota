/**
 * VIT Community Radio CMS Integration for Mixota Audio Editor
 * Connects Mixota directly with Supabase Cloud storage and CMS metadata
 * Handles secure authentication, private signed URL downloads, project draft persistence,
 * and safe non-destructive MP3 export back to CMS episodes.
 */

(function (w, d) {
  'use strict';

  // Config: Shared Supabase Project
  var SUPABASE_URL = 'https://qqoybhevvnkycepujosm.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxb3liaGV2dm5reWNlcHVqb3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4OTUwMDksImV4cCI6MjEwNDQ3MTAwOX0.30mKrw-kXCaohKcU2S81yzeiNt4PXwlrXiGar84Cq94';
  var AUDIO_BUCKET = 'radio-audio';

  // Parse query parameters
  var searchParams = new URLSearchParams(w.location.search);
  var recordingId = searchParams.get('recordingId');
  var episodeId = searchParams.get('episodeId');
  var fileName = searchParams.get('fileName') || '';
  var projectTitle = searchParams.get('title') || '';
  var targetField = searchParams.get('target') || 'final_audio_file_id';
  var cmsOrigin = searchParams.get('cmsOrigin') || '';

  // Only activate integration if recordingId is passed
  if (!recordingId) {
    return;
  }

  // Initialize Supabase Client
  var supabase = null;
  if (w.supabase && typeof w.supabase.createClient === 'function') {
    supabase = w.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else if (w.createClient) {
    supabase = w.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // Integration State
  var state = {
    recordingId: recordingId,
    episodeId: episodeId,
    fileName: fileName,
    title: projectTitle,
    targetField: targetField,
    cmsOrigin: cmsOrigin,
    audioRow: null,
    episodeRow: null,
    session: null,
    audioBuffer: null,
    hasUnsavedEdits: false,
    barEl: null,
  };

  // Helper to reliably retrieve the PKAudioEditor / editor instance
  function getEditor() {
    return (
      w.editor ||
      w.PKAudioEditor ||
      (w.PKAudioList && w.PKAudioList[0]) ||
      null
    );
  }

  // Helper to reliably get active AudioBuffer from Wavesurfer backend or state
  function getAudioBuffer() {
    var ed = getEditor();
    if (
      ed &&
      ed.engine &&
      ed.engine.wavesurfer &&
      ed.engine.wavesurfer.backend &&
      ed.engine.wavesurfer.backend.buffer
    ) {
      return ed.engine.wavesurfer.backend.buffer;
    }
    return state.audioBuffer || null;
  }

  // UI Status update
  function updateStatus(text, statusType) {
    var dot = d.getElementById('mixota-cms-status-dot');
    var statusText = d.getElementById('mixota-cms-status-text');
    if (!dot || !statusText) return;

    dot.className = 'mixota-cms-status-dot ' + (statusType || '');
    statusText.textContent = text;
  }

  // Show non-blocking toast notification
  function showToast(message, duration) {
    var toast = d.createElement('div');
    toast.className = 'mixota-cms-toast';
    toast.textContent = message;
    d.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, duration || 2500);
  }

  // Render top CMS bar
  function renderCmsBar() {
    if (state.barEl) return;

    var bar = d.createElement('div');
    bar.className = 'mixota-cms-bar';
    bar.id = 'mixota-cms-bar';

    bar.innerHTML =
      '<div class="mixota-cms-brand">' +
      '  <span class="mixota-cms-badge">VIT Radio 90.8 FM</span>' +
      '  <div class="mixota-cms-info">' +
      '    <span class="mixota-cms-title" id="mixota-cms-display-title">' +
      (state.title || 'Loading Recording...') +
      '</span>' +
      '    <span class="mixota-cms-filename" id="mixota-cms-display-file">' +
      (state.fileName || '') +
      '</span>' +
      '  </div>' +
      '</div>' +
      '<div class="mixota-cms-status">' +
      '  <div class="mixota-cms-status-dot loading" id="mixota-cms-status-dot"></div>' +
      '  <span id="mixota-cms-status-text">Connecting to CMS...</span>' +
      '</div>' +
      '<div class="mixota-cms-actions">' +
      '  <button type="button" class="mixota-cms-btn mixota-cms-btn-outline" id="mixota-cms-save-btn" title="Save in-progress project locally">' +
      '    💾 Save Project' +
      '  </button>' +
      '  <button type="button" class="mixota-cms-btn mixota-cms-btn-primary" id="mixota-cms-export-btn" title="Export finished audio to CMS">' +
      '    ⬆ Export &amp; Return to CMS' +
      '  </button>' +
      '  <button type="button" class="mixota-cms-btn" id="mixota-cms-return-btn" title="Return to CMS">' +
      '    ↩ Return to CMS' +
      '  </button>' +
      '</div>';

    var appContainer = d.getElementById('app');
    if (appContainer && appContainer.parentNode) {
      appContainer.parentNode.insertBefore(bar, appContainer);
    } else {
      d.body.insertBefore(bar, d.body.firstChild);
    }

    state.barEl = bar;

    // Attach button listeners
    d.getElementById('mixota-cms-save-btn').onclick = saveProjectLocally;
    d.getElementById('mixota-cms-export-btn').onclick = showExportModal;
    d.getElementById('mixota-cms-return-btn').onclick = function () {
      returnToCms(false);
    };
  }

  // Generic modal builder
  function createModal(title, bodyHtml, buttons) {
    var existing = d.getElementById('mixota-cms-modal-wrap');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var backdrop = d.createElement('div');
    backdrop.className = 'mixota-cms-modal-backdrop';
    backdrop.id = 'mixota-cms-modal-wrap';

    var modal = d.createElement('div');
    modal.className = 'mixota-cms-modal';

    var head = d.createElement('div');
    head.className = 'mixota-cms-modal-head';
    head.innerHTML =
      '<h3 class="mixota-cms-modal-title">' +
      title +
      '</h3>' +
      '<button class="mixota-cms-modal-close" id="mixota-cms-modal-x">&times;</button>';

    var body = d.createElement('div');
    body.className = 'mixota-cms-modal-body';
    body.innerHTML = bodyHtml;

    var foot = d.createElement('div');
    foot.className = 'mixota-cms-modal-foot';

    (buttons || []).forEach(function (btn) {
      var b = d.createElement('button');
      b.className = 'mixota-cms-btn ' + (btn.primary ? 'mixota-cms-btn-primary' : '');
      b.textContent = btn.label;
      b.onclick = function () {
        if (btn.onClick) btn.onClick(closeModal);
        else closeModal();
      };
      foot.appendChild(b);
    });

    modal.appendChild(head);
    modal.appendChild(body);
    modal.appendChild(foot);
    backdrop.appendChild(modal);
    d.body.appendChild(backdrop);

    function closeModal() {
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
    }

    d.getElementById('mixota-cms-modal-x').onclick = closeModal;

    return {
      close: closeModal,
      body: body,
    };
  }

  // Display authentication modal if user has no session
  function showAuthModal(onSuccess) {
    var formHtml =
      '<div class="mixota-cms-alert mixota-cms-alert-info">' +
      'Sign in with your VIT Community Radio CMS credentials to access this recording.' +
      '</div>' +
      '<div class="mixota-cms-field">' +
      '  <label for="mixota-auth-email">Station Email</label>' +
      '  <input type="email" id="mixota-auth-email" class="mixota-cms-input" placeholder="user@vit.ac.in" />' +
      '</div>' +
      '<div class="mixota-cms-field">' +
      '  <label for="mixota-auth-pass">Password</label>' +
      '  <input type="password" id="mixota-auth-pass" class="mixota-cms-input" placeholder="Password" />' +
      '</div>' +
      '<div id="mixota-auth-error" class="mixota-cms-alert mixota-cms-alert-error" style="display:none"></div>';

    var modalObj = createModal('VIT Community Radio Sign-In', formHtml, [
      {
        label: 'Cancel',
        onClick: function (close) {
          close();
          updateStatus('Authentication required', 'error');
        },
      },
      {
        label: 'Sign In',
        primary: true,
        onClick: async function (close) {
          var email = (d.getElementById('mixota-auth-email').value || '').trim();
          var pass = d.getElementById('mixota-auth-pass').value || '';
          var errEl = d.getElementById('mixota-auth-error');

          if (!email || !pass) {
            errEl.textContent = 'Please enter both email and password.';
            errEl.style.display = 'block';
            return;
          }

          errEl.style.display = 'none';
          updateStatus('Signing in...', 'loading');

          try {
            var authRes = await supabase.auth.signInWithPassword({
              email: email,
              password: pass,
            });

            if (authRes.error) {
              errEl.textContent = authRes.error.message || 'Invalid credentials.';
              errEl.style.display = 'block';
              updateStatus('Sign-in failed', 'error');
              return;
            }

            state.session = authRes.data.session;
            close();
            onSuccess();
          } catch (e) {
            errEl.textContent = 'Sign-in error. Please try again.';
            errEl.style.display = 'block';
            updateStatus('Sign-in failed', 'error');
          }
        },
      },
    ]);
  }

  // Retrieve recording metadata and download signed URL from Supabase
  async function fetchRecordingAndSignedUrl() {
    updateStatus('Verifying permissions...', 'loading');

    // Query audio_files table (Row Level Security validates permissions)
    var res = await supabase
      .from('audio_files')
      .select('id, episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by, created_at')
      .eq('id', state.recordingId)
      .maybeSingle();

    if (res.error) {
      console.error('[Mixota CMS] Query error:', res.error);
      if (/row-level security|permission|unauthorized/i.test(res.error.message)) {
        throw new Error(
          'Permission denied: You do not have permission to view or edit this recording.',
        );
      }
      throw new Error(res.error.message || 'Could not fetch recording details.');
    }

    if (!res.data) {
      throw new Error('Recording not found. It may have been removed or deleted.');
    }

    state.audioRow = res.data;
    state.fileName = res.data.file_name;
    if (res.data.episode_id) {
      state.episodeId = res.data.episode_id;
      // Explicit column selection avoids PostgREST relationship ambiguity errors
      var epRes = await supabase
        .from('episodes')
        .select('id, title, audio_file_id, final_audio_file_id, status')
        .eq('id', res.data.episode_id)
        .maybeSingle();
      if (epRes.data) {
        state.episodeRow = epRes.data;
        if (epRes.data.title) {
          state.title = epRes.data.title;
        }
      }
    }

    // Update banner UI with resolved metadata
    var titleEl = d.getElementById('mixota-cms-display-title');
    var fileEl = d.getElementById('mixota-cms-display-file');
    if (titleEl) titleEl.textContent = state.title;
    if (fileEl) fileEl.textContent = state.fileName;
    d.title = 'Mixota - ' + state.fileName;

    // Create short-lived signed URL for audio download from private radio-audio bucket
    updateStatus('Requesting secure audio stream...', 'loading');
    var storageRes = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(res.data.storage_path, 3600);

    if (storageRes.error || !storageRes.data?.signedUrl) {
      throw new Error(
        'Could not generate secure audio download link: ' +
          (storageRes.error?.message || 'Unknown error'),
      );
    }

    return storageRes.data.signedUrl;
  }

  // Self-healing IndexedDB helper that auto-creates the 'sessions' store if missing
  function openSessionStore(mode, callback) {
    try {
      var req = indexedDB.open('mixota-audio', 2);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.close();
          var nextVer = (db.version || 2) + 1;
          var upReq = indexedDB.open('mixota-audio', nextVer);
          upReq.onupgradeneeded = function (ev) {
            var udb = ev.target.result;
            if (!udb.objectStoreNames.contains('sessions')) {
              udb.createObjectStore('sessions', { keyPath: 'id' });
            }
          };
          upReq.onsuccess = function (ev) {
            var udb = ev.target.result;
            try {
              var trans = udb.transaction(['sessions'], mode);
              callback(null, trans.objectStore('sessions'), udb);
            } catch (transErr) {
              callback(transErr);
            }
          };
          upReq.onerror = function (err) {
            callback(err);
          };
          return;
        }

        try {
          var trans = db.transaction(['sessions'], mode);
          callback(null, trans.objectStore('sessions'), db);
        } catch (transErr) {
          callback(transErr);
        }
      };
      req.onerror = function (err) {
        callback(err);
      };
    } catch (e) {
      callback(e);
    }
  }

  // Check if a saved project draft exists in IndexedDB for this recording
  function checkSavedDraft(callback) {
    openSessionStore('readonly', function (err, store) {
      if (err || !store) {
        callback(null);
        return;
      }
      try {
        var draftReq = store.get('cms_' + state.recordingId);
        draftReq.onsuccess = function () {
          callback(draftReq.result || null);
        };
        draftReq.onerror = function () {
          callback(null);
        };
      } catch (e) {
        callback(null);
      }
    });
  }

  // Load audio buffer into Mixota editor engine
  async function loadAudioIntoEditor(signedUrl) {
    updateStatus('Downloading audio...', 'loading');

    var response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(
        'Audio download failed with status HTTP ' +
          response.status +
          '. The link may have expired.',
      );
    }

    var contentLength = response.headers.get('content-length');
    var totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    var loadedBytes = 0;

    var reader = response.body.getReader();
    var chunks = [];

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      loadedBytes += chunk.value.length;
      if (totalBytes > 0) {
        var pct = Math.round((loadedBytes / totalBytes) * 100);
        updateStatus('Downloading audio (' + pct + '%)...', 'loading');
      }
    }

    var combined = new Uint8Array(loadedBytes);
    var offset = 0;
    for (var i = 0; i < chunks.length; i++) {
      combined.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    updateStatus('Decoding audio waveform...', 'loading');

    var blob = new Blob([combined], { type: 'audio/mpeg' });
    var editor = getEditor();

    // Hide empty placeholder
    var dirtymsg = d.getElementsByClassName('pk_ed_empty');
    if (dirtymsg && dirtymsg.length) {
      dirtymsg[0].style.display = 'none';
    }

    if (editor && editor.engine) {
      if (typeof editor.engine.LoadArrayBuffer === 'function') {
        editor.engine.LoadArrayBuffer(blob);
      } else if (editor.engine.wavesurfer) {
        editor.engine.wavesurfer.loadBlob(blob);
      }
    }

    if (editor && editor.engine && editor.engine.wavesurfer) {
      editor.engine.wavesurfer.on('ready', function () {
        state.audioBuffer = editor.engine.wavesurfer.backend.buffer;
        updateStatus('Ready to edit', '');
        showToast('Loaded ' + (state.fileName || 'recording') + ' from CMS', 2500);
      });
    }

    setTimeout(function () {
      var buf = getAudioBuffer();
      if (buf) {
        state.audioBuffer = buf;
      }
      updateStatus('Ready to edit', '');
    }, 1500);

    // Track modifications to warn on unsaved close
    if (w.PKAudioEditor && typeof w.PKAudioEditor.listenFor === 'function') {
      w.PKAudioEditor.listenFor('StatePush', function () {
        state.hasUnsavedEdits = true;
        updateStatus('Unsaved edits', 'loading');
      });
    }
  }

  // Save current project state in IndexedDB associated with recording ID
  function saveProjectLocally() {
    var editor = getEditor();
    var buffer = getAudioBuffer();

    if (!buffer) {
      showToast('No audio loaded to save.', 2000);
      return;
    }

    updateStatus('Saving project locally...', 'loading');

    function onSaveSuccess() {
      state.hasUnsavedEdits = false;
      updateStatus('Project saved', '');
      showToast('Project saved! You can resume editing anytime.', 2500);
    }

    function onSaveError(msg) {
      console.warn('[Mixota CMS] Save error:', msg);
      updateStatus('Local save failed', 'error');
      showToast(msg || 'Could not save project locally.', 2500);
    }

    try {
      var chans = buffer.numberOfChannels;
      var chanBuffers = [];
      for (var i = 0; i < chans; i++) {
        var data = buffer.getChannelData(i);
        chanBuffers.push(data.buffer.slice(0));
      }

      var ob = {
        id: 'cms_' + state.recordingId,
        name: state.fileName || 'CMS Recording',
        created: Date.now(),
        durr: buffer.duration,
        chans: chans,
        samplerate: buffer.sampleRate,
        data: chanBuffers,
        markers: (editor && editor.mrk && typeof editor.mrk.serEd === 'function') ? editor.mrk.serEd() : []
      };

      openSessionStore('readwrite', function (err, store) {
        if (err || !store) {
          onSaveError('IndexedDB access error.');
          return;
        }

        try {
          var putReq = store.put(ob);
          putReq.onsuccess = function () {
            onSaveSuccess();
          };
          putReq.onerror = function (e) {
            onSaveError('Failed to store project draft.');
          };
        } catch (e) {
          onSaveError('Database write error.');
        }
      });
    } catch (e) {
      onSaveError('Save failed: ' + (e.message || 'Unknown error'));
    }
  }

  // Show Export & Return modal
  function showExportModal() {
    var buffer = getAudioBuffer();

    if (!buffer) {
      showToast('No audio loaded to export.', 2000);
      return;
    }

    var defaultOutputName = (state.fileName || 'edited-audio.mp3')
      .replace(/\.[^/.]+$/, '')
      .replace(/-mixota-final$/, '') + '-mixota-final.mp3';

    var modalHtml =
      '<div class="mixota-cms-alert mixota-cms-alert-info">' +
      '  <strong>Preserves Raw Recording:</strong> Your edits will be exported as the new ' +
      '  <strong>Final Audio</strong> for QC review. The original raw recording in the CMS remains untouched.' +
      '</div>' +
      '<div class="mixota-cms-field">' +
      '  <label for="mixota-export-filename">Export Filename (.mp3)</label>' +
      '  <input type="text" id="mixota-export-filename" class="mixota-cms-input" value="' +
      defaultOutputName +
      '" />' +
      '</div>' +
      '<div class="mixota-cms-field">' +
      '  <label>Bitrate Quality</label>' +
      '  <div class="mixota-cms-options">' +
      '    <label class="mixota-cms-opt"><input type="radio" name="mixota-kbps" value="128" /> 128 kbps</label>' +
      '    <label class="mixota-cms-opt"><input type="radio" name="mixota-kbps" value="192" checked /> 192 kbps (Recommended)</label>' +
      '    <label class="mixota-cms-opt"><input type="radio" name="mixota-kbps" value="256" /> 256 kbps</label>' +
      '  </div>' +
      '</div>' +
      '<div class="mixota-cms-field" style="margin-top:12px">' +
      '  <label class="mixota-cms-opt">' +
      '    <input type="checkbox" id="mixota-export-confirm" checked />' +
      '    <span>Attach as Final Audio take for: <strong>' +
      (state.title || 'this episode') +
      '</strong></span>' +
      '  </label>' +
      '</div>' +
      '<div id="mixota-export-progress-wrap" style="display:none">' +
      '  <p id="mixota-export-status-label" style="font-size:12px; margin-bottom:4px">Rendering audio...</p>' +
      '  <div class="mixota-cms-progress-wrap"><div class="mixota-cms-progress-bar" id="mixota-export-progress-bar"></div></div>' +
      '</div>' +
      '<div id="mixota-export-error" class="mixota-cms-alert mixota-cms-alert-error" style="display:none"></div>';

    var modalObj = createModal('Export & Return to VIT Radio CMS', modalHtml, [
      {
        label: 'Cancel',
        onClick: function (close) {
          close();
        },
      },
      {
        label: 'Export & Upload to CMS',
        primary: true,
        onClick: function (close) {
          var filename = (d.getElementById('mixota-export-filename').value || '').trim();
          if (!filename) filename = defaultOutputName;
          if (!/\.mp3$/i.test(filename)) filename += '.mp3';

          var kbps = 192;
          var radios = d.getElementsByName('mixota-kbps');
          for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) kbps = parseInt(radios[i].value, 10);
          }

          var progressWrap = d.getElementById('mixota-export-progress-wrap');
          var progressBar = d.getElementById('mixota-export-progress-bar');
          var statusLabel = d.getElementById('mixota-export-status-label');
          var errorEl = d.getElementById('mixota-export-error');

          progressWrap.style.display = 'block';
          errorEl.style.display = 'none';

          // Perform MP3 encoding using Web Worker (lame.js)
          renderMp3Blob(
            buffer,
            kbps,
            function (progressPct) {
              progressBar.style.width = progressPct + '%';
              statusLabel.textContent = 'Encoding MP3: ' + Math.round(progressPct) + '%';
            },
            async function (err, mp3Blob) {
              if (err || !mp3Blob) {
                errorEl.textContent = 'MP3 encoding failed: ' + (err || 'Unknown error');
                errorEl.style.display = 'block';
                return;
              }

              statusLabel.textContent = 'Uploading to VIT Community Radio Storage...';
              progressBar.style.width = '95%';

              try {
                await uploadFinalAudioToCms(mp3Blob, filename, buffer.duration);
                close();
                showExportSuccessModal(filename);
              } catch (uploadErr) {
                errorEl.textContent = uploadErr.message || 'Upload failed.';
                errorEl.style.display = 'block';
              }
            },
          );
        },
      },
    ]);
  }

  // Renders buffer to MP3 Blob using Worker
  function renderMp3Blob(buffer, kbps, onProgress, onDone) {
    try {
      var worker = new Worker('lame.js');
      var sampleRate = buffer.sampleRate;
      var channels = buffer.numberOfChannels;
      var dataLeft = buffer.getChannelData(0);
      var dataRight = channels > 1 ? buffer.getChannelData(1) : null;
      var len = dataLeft.length;

      var arrType = Int16Array;
      var dataArrLeft = new arrType(len);
      var dataArrRight = dataRight ? new arrType(len) : null;

      function convert16(n) {
        var v = n < 0 ? n * 32768 : n * 32767;
        return Math.max(-32768, Math.min(32767, v));
      }

      for (var i = 0; i < len; i++) {
        dataArrLeft[i] = convert16(dataLeft[i]);
        if (dataRight) {
          dataArrRight[i] = convert16(dataRight[i]);
        }
      }

      worker.onmessage = function (ev) {
        if (!ev.data) return;

        if (ev.data.percentage) {
          onProgress(ev.data.percentage);
          return;
        }

        // Received encoded blob
        onProgress(100);
        worker.terminate();
        onDone(null, ev.data);
      };

      worker.onerror = function (e) {
        worker.terminate();
        onDone(e.message || 'Worker error');
      };

      worker.postMessage({
        sample_rate: sampleRate,
        kbps: kbps,
        channels: channels,
        bit_depth: 16,
        samples: len,
      });

      worker.postMessage(dataArrLeft.buffer, [dataArrLeft.buffer]);
      if (dataRight) {
        worker.postMessage(dataArrRight.buffer, [dataArrRight.buffer]);
      }
    } catch (e) {
      onDone(e.message || 'Worker initialization failed');
    }
  }

  // Upload exported audio to Supabase Storage and update episode final_audio_file_id
  async function uploadFinalAudioToCms(blob, filename, durationSeconds) {
    updateStatus('Uploading finished audio to CMS...', 'loading');

    var safeName = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-80);

    var storagePath = 'episodes/' + state.episodeId + '/' + Date.now() + '-' + safeName;

    // 1. Upload to Supabase Storage
    var uploadRes = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, blob, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

    if (uploadRes.error) {
      console.error('[Mixota CMS] Storage upload error:', uploadRes.error);
      throw new Error('Storage upload failed: ' + uploadRes.error.message);
    }

    // 2. Insert row in audio_files table
    var sessionRes = await supabase.auth.getSession();
    var currentUserId = sessionRes.data?.session?.user?.id || null;

    var insertRes = await supabase
      .from('audio_files')
      .insert({
        episode_id: state.episodeId,
        file_name: filename,
        storage_path: storagePath,
        mime_type: 'audio/mpeg',
        file_size: blob.size,
        duration_seconds: Math.round(durationSeconds),
        uploaded_by: currentUserId,
      })
      .select('id, episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by, created_at')
      .single();

    if (insertRes.error) {
      console.error('[Mixota CMS] audio_files insert error:', insertRes.error);
      // Clean up orphaned object
      await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
      throw new Error('Database insert failed: ' + insertRes.error.message);
    }

    var newAudioFile = insertRes.data;

    // 3. Update episodes table: assign final_audio_file_id (leaving raw audio_file_id unchanged!)
    var updateRes = await supabase
      .from('episodes')
      .update({
        final_audio_file_id: newAudioFile.id,
        duration_seconds: Math.round(durationSeconds),
      })
      .eq('id', state.episodeId);

    if (updateRes.error) {
      console.warn('[Mixota CMS] episodes update error, trying RPC:', updateRes.error);
      try {
        await supabase.rpc('admin_attach_audio', {
          p_episode_id: state.episodeId,
          p_audio_file_id: newAudioFile.id,
          p_target_column: 'final_audio_file_id',
        });
      } catch (rpcErr) {
        console.warn('[Mixota CMS] RPC fallback notice:', rpcErr);
      }
    }

    state.hasUnsavedEdits = false;
    updateStatus('Saved to CMS', '');

    // Notify opener if open
    if (w.opener && !w.opener.closed) {
      try {
        w.opener.postMessage(
          {
            type: 'MIXOTA_EXPORT_COMPLETE',
            episodeId: state.episodeId,
            audioFileId: newAudioFile.id,
            fileName: filename,
          },
          state.cmsOrigin || '*',
        );
      } catch (e) {
        console.warn('[Mixota CMS] Opener notify warning:', e);
      }
    }

    return newAudioFile;
  }

  // Display success modal after export
  function showExportSuccessModal(filename) {
    var bodyHtml =
      '<div class="mixota-cms-alert mixota-cms-alert-success">' +
      '  <strong>Export Succeeded!</strong> Your audio has been saved to the CMS as <strong>' +
      filename +
      '</strong> and attached as the Final Audio take for <strong>' +
      (state.title || 'this episode') +
      '</strong>.' +
      '</div>' +
      '<p>The original raw recording has been completely preserved. The episode is ready for QC review in the CMS.</p>';

    createModal('Export Successful', bodyHtml, [
      {
        label: 'Keep Editing in Mixota',
        onClick: function (close) {
          close();
        },
      },
      {
        label: 'Return to CMS',
        primary: true,
        onClick: function (close) {
          close();
          returnToCms(true);
        },
      },
    ]);
  }

  // Return to CMS tab
  function returnToCms(force) {
    if (state.hasUnsavedEdits && !force) {
      createModal(
        'Unsaved Changes',
        '<p>You have unsaved edits in your Mixota project.</p><p>Would you like to save your project before returning to the CMS?</p>',
        [
          {
            label: 'Discard & Return',
            onClick: function (close) {
              close();
              state.hasUnsavedEdits = false;
              returnToCms(true);
            },
          },
          {
            label: 'Save & Return',
            primary: true,
            onClick: function (close) {
              close();
              saveProjectLocally();
              setTimeout(function () {
                returnToCms(true);
              }, 400);
            },
          },
        ],
      );
      return;
    }

    var targetUrl =
      (state.cmsOrigin || 'https://vitradio.growiota.in') +
      (state.episodeId ? '/admin/episodes/' + state.episodeId : '/admin/episodes');

    // If opener exists, post message so CMS knows editor finished
    if (w.opener && !w.opener.closed) {
      try {
        w.opener.postMessage(
          {
            type: 'MIXOTA_RETURN_TO_CMS',
            episodeId: state.episodeId,
          },
          state.cmsOrigin || '*',
        );
        w.opener.focus();
      } catch (e) {}
    }

    // Try closing window first
    try {
      w.close();
    } catch (e) {}

    // If window.close() didn't close the tab (browser popup restriction or opened directly), navigate
    setTimeout(function () {
      w.location.href = targetUrl;
    }, 150);
  }

  // Main initialization sequence
  async function init() {
    renderCmsBar();

    // Check if opener is available for instant handshake
    var handledViaOpener = false;

    if (w.opener && !w.opener.closed) {
      updateStatus('Connecting to CMS...', 'loading');

      var timeoutTimer = null;

      function onHandoffMessage(event) {
        var msg = event.data;
        if (!msg || msg.type !== 'MIXOTA_SESSION_RESPONSE') return;

        w.removeEventListener('message', onHandoffMessage);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        handledViaOpener = true;

        if (msg.session && supabase) {
          supabase.auth.setSession(msg.session).then(function () {
            state.session = msg.session;
          });
        }
        if (msg.fileName) state.fileName = msg.fileName;
        if (msg.title) state.title = msg.title;
        if (msg.targetField) state.targetField = msg.targetField;

        var titleEl = d.getElementById('mixota-cms-display-title');
        var fileEl = d.getElementById('mixota-cms-display-file');
        if (titleEl) titleEl.textContent = state.title;
        if (fileEl) fileEl.textContent = state.fileName;

        proceedWithLoading(msg.signedUrl);
      }

      w.addEventListener('message', onHandoffMessage);

      // Send request to opener
      w.opener.postMessage(
        {
          type: 'MIXOTA_SESSION_REQUEST',
          recordingId: state.recordingId,
          episodeId: state.episodeId,
        },
        state.cmsOrigin || '*',
      );

      // Set timeout fallback if opener doesn't respond within 1.5s
      timeoutTimer = setTimeout(function () {
        if (!handledViaOpener) {
          w.removeEventListener('message', onHandoffMessage);
          fallbackDirectAuth();
        }
      }, 1500);
    } else {
      fallbackDirectAuth();
    }
  }

  // Fallback direct authentication when opener is not present
  async function fallbackDirectAuth() {
    if (!supabase) {
      updateStatus('Supabase client unavailable', 'error');
      return;
    }

    var sessionRes = await supabase.auth.getSession();
    if (sessionRes.data?.session) {
      state.session = sessionRes.data.session;
      proceedWithLoading();
    } else {
      showAuthModal(function () {
        proceedWithLoading();
      });
    }
  }

  // Proceed to check drafts and load audio
  function proceedWithLoading(providedSignedUrl) {
    var existingBuffer = getAudioBuffer();
    if (existingBuffer && state.hasUnsavedEdits) {
      createModal(
        'Existing Active Session',
        '<p>You have an active editing session in Mixota with unsaved work.</p><p>Loading this CMS recording will replace your current workspace. Would you like to save your current work first, or proceed?</p>',
        [
          {
            label: 'Save Current Work First',
            onClick: function (close) {
              close();
              saveProjectLocally();
              checkDraftAndLoad(providedSignedUrl);
            },
          },
          {
            label: 'Replace Workspace',
            primary: true,
            onClick: function (close) {
              close();
              checkDraftAndLoad(providedSignedUrl);
            },
          },
        ],
      );
      return;
    }

    checkDraftAndLoad(providedSignedUrl);
  }

  function checkDraftAndLoad(providedSignedUrl) {
    checkSavedDraft(function (draft) {
      if (draft) {
        var draftDate = new Date(draft.created).toLocaleString();
        var confirmHtml =
          '<p>Found a previously saved Mixota project draft for this recording from <strong>' +
          draftDate +
          '</strong>.</p>' +
          '<p>Would you like to resume your saved draft or reload the original audio from the CMS?</p>';

        createModal('Resume Saved Project?', confirmHtml, [
          {
            label: 'Reload Original from CMS',
            onClick: function (close) {
              close();
              loadFromCms(providedSignedUrl);
            },
          },
          {
            label: 'Resume Saved Draft',
            primary: true,
            onClick: function (close) {
              close();
              loadFromDraft(draft);
            },
          },
        ]);
      } else {
        loadFromCms(providedSignedUrl);
      }
    });
  }

  // Resume draft from IndexedDB
  function loadFromDraft(draft) {
    updateStatus('Loading saved draft...', 'loading');
    var editor = getEditor();
    if (editor && editor.engine && typeof editor.engine.LoadDB === 'function') {
      editor.engine.LoadDB(draft);
      updateStatus('Draft resumed', '');
      showToast('Resumed saved draft', 2000);
    } else {
      loadFromCms();
    }
  }

  // Load from CMS (fetching signed URL if needed)
  async function loadFromCms(providedSignedUrl) {
    try {
      var signedUrl = providedSignedUrl;
      if (!signedUrl) {
        signedUrl = await fetchRecordingAndSignedUrl();
      }
      await loadAudioIntoEditor(signedUrl);
    } catch (err) {
      console.error('[Mixota CMS] Load error:', err);
      updateStatus('Load failed', 'error');

      var isPermission = /permission/i.test(err.message);
      var isNotFound = /not found/i.test(err.message);

      var errorHtml =
        '<div class="mixota-cms-alert mixota-cms-alert-error">' +
        '  <strong>' +
        (isPermission
          ? 'Access Denied'
          : isNotFound
          ? 'Recording Not Found'
          : 'Could Not Load Audio') +
        ':</strong> ' +
        err.message +
        '</div>' +
        '<p>Please verify that you are signed in with the correct account or return to the CMS.</p>';

      createModal('Recording Load Failed', errorHtml, [
        {
          label: 'Retry',
          onClick: function (close) {
            close();
            init();
          },
        },
        {
          label: 'Return to CMS',
          primary: true,
          onClick: function (close) {
            close();
            returnToCms(true);
          },
        },
      ]);
    }
  }

  // Wait for DOM and PKAudioEditor to initialize
  function onReady() {
    var editor = getEditor();
    if (editor && editor.engine) {
      init();
    } else if (w.PKAudioEditor && typeof w.PKAudioEditor.listenFor === 'function') {
      w.PKAudioEditor.listenFor('DidReadyFire', function () {
        init();
      });
      setTimeout(function () {
        if (!state.barEl) init();
      }, 500);
    } else {
      setTimeout(function () {
        if (!state.barEl) init();
      }, 300);
    }
  }

  if (d.readyState === 'complete' || d.readyState === 'interactive') {
    setTimeout(onReady, 100);
  } else {
    d.addEventListener('DOMContentLoaded', onReady);
  }
})(window, document);
