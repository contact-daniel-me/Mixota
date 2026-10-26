(function ( w, d, PKAE ) {
	'use strict';

	var db;
	var db_name    = 'mixota-audio';
	var db_version = 4; // Upgraded for project management & recovery stores
	var db_ready   = false;

	var compressors = {
		'l4z' : {
			ready: false,
			loading: false,
			compress: null,
			decompress: null,
			init : function ( callback ) {

				var q = this;
				if (q.ready) {
					callback && callback ();
					return ;
				}
				q.loading = true;

				var lz4BlockWASM;
				var codec = (typeof lz4BlockCodec !== 'undefined' ? lz4BlockCodec : (w && w.lz4BlockCodec ? w.lz4BlockCodec : null));

				if (codec && codec.createInstance) {
					codec.createInstance('wasm').then(function(instance) {
					    lz4BlockWASM = instance;

					    q.ready = true;
					    q.loading = false;
					    q.compress = function( input, offset ) {
					    	if (!lz4BlockWASM) {
					    		if (input instanceof ArrayBuffer)
					    			return new Uint8Array(input);
					    		else
					    			return input;
					    	}

				    		return lz4BlockWASM.encodeBlock(input, 0);
						};
					    q.decompress = function( input, offset, size ) {
					    	if (!lz4BlockWASM) {
					    		if (input instanceof ArrayBuffer)
					    			return new Uint8Array(input);
					    		else
					    			return input;
					    	}

				    		return lz4BlockWASM.decodeBlock(input, 0, size);
						};

						callback && callback ();
					}).catch(function() {
						q.ready = true;
						q.loading = false;
						callback && callback ();
					});
				} else {
					q.ready = true;
					q.loading = false;
					callback && callback ();
				}
			}
		}
	};

	var compression = 'l4z';

	function SaveLocal ( app ) {
		var q = this;
		q.on = false;
		q.app = app;

		this.Init = function ( callback ) {
			if (q.on && db) {
				callback && callback ();
				return ;
			}

			if (!w.indexedDB) {
				callback && callback ('err');
				return ;
			}

			function onDbSuccess(database) {
				db = database;
				db.onerror = function( err ) {
					console.warn('Mixota IndexedDB runtime error:', err);
				};
				setTimeout(function() {
					db_ready = true;
					q.on = true;
					if (app && !app.autosave) {
						app.autosave = new AutosaveCoordinator(app, q);
					}
					callback && callback ();
					app.fireEvent ('DidOpenDB', q);
				}, 100);
			}

			try {
				var request = indexedDB.open (db_name, db_version);

				request.onerror = function(e) {
					console.warn('Unable to open mixota-audio database with version ' + db_version + ', falling back to existing version:', e);
					try {
						var fallbackReq = indexedDB.open(db_name);
						fallbackReq.onsuccess = function(ev) {
							onDbSuccess(ev.target.result);
						};
						fallbackReq.onerror = function() {
							callback && callback ('err');
						};
					} catch(e2) {
						callback && callback ('err');
					}
				};

				request.onupgradeneeded = function(e) {
					var database = e.target.result;
					if (!database.objectStoreNames.contains('sessions')) {
						database.createObjectStore('sessions', {keyPath:'id'});
					}
					if (!database.objectStoreNames.contains('recovery')) {
						database.createObjectStore('recovery', {keyPath:'projectId'});
					}
					if (!database.objectStoreNames.contains('projects_meta')) {
						database.createObjectStore('projects_meta', {keyPath:'id'});
					}
				};

				request.onsuccess = function(e) {
					onDbSuccess(e.target.result);
				};
			} catch (err) {
				console.warn('IndexedDB initialization failed:', err);
				callback && callback ('err');
			}
		};

		// ---------------------------------------------------------------------
		// Core Project Persistence (Waveform & Multitrack)
		// ---------------------------------------------------------------------
		this.SaveSession = function ( buffer, id, name, callback, quiet, extraProps ) {
			if (!db) {
				q.Init (function () {
					q.SaveSession (buffer, id, name, callback, quiet, extraProps);
				});
				return ;
			}

			var comp = compressors[ compression ];
			if (!comp.loading && !comp.ready) {
				comp.init (function() {
					q.SaveSession (buffer, id, name, callback, quiet, extraProps);
				});
				return ;
			}

			var chans = buffer ? buffer.numberOfChannels : 0;
			var arr_buffs = [];
			var arr_buffs2 = [];
			var sample_rate = buffer ? buffer.sampleRate : 48000;
			var duration = buffer ? (buffer.duration.toFixed(3) / 1) : 0;

			if (buffer && chans > 0) {
				for (var i = 0; i < chans; ++i) {
					var arr = buffer.getChannelData ( i );
					if (comp && comp.compress) {
						try {
							var tmp = comp.compress ( arr.buffer, 0);
							if (tmp && tmp.buffer) {
								arr_buffs.push ( tmp.buffer.slice (tmp.byteOffset, tmp.byteLength + tmp.byteOffset));
							} else {
								arr_buffs.push ( arr.buffer.slice(0) );
							}
						} catch (compErr) {
							arr_buffs.push ( arr.buffer.slice(0) );
						}
					} else {
						arr_buffs.push ( arr.buffer.slice(0) );
					}
				}
			}

			var projectType = (extraProps && extraProps.projectType) ||
				(app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn() ? 'multitrack' : 'waveform');

			var thumb = '';
			try {
				if (buffer && PKAudioEditor.engine && PKAudioEditor.engine.GetWave) {
					thumb = PKAudioEditor.engine.GetWave(buffer);
				}
			} catch (e) {
				console.warn('Could not generate waveform thumbnail:', e);
				thumb = '';
			}
			var now = Date.now();

			var ob = {
				id : id || ('proj_' + now + '_' + Math.random().toString(36).substr(2, 6)),
				name: name || (app.projectTitle || 'Untitled Project'),
				projectType: projectType,
				created: (extraProps && extraProps.created) || now,
				updated: now,
				savedAt: now,
				revision: (extraProps && extraProps.revision) || 1,
				schemaVersion: 2,
				data: arr_buffs,
				data2: arr_buffs2,
				durr: duration,
				chans: chans,
				comp: compression,
				thumb: thumb,
				samplerate: sample_rate,
				markers: app.mrk ? app.mrk.serEd () : [],
				multitrackState: (extraProps && extraProps.multitrackState) || null
			};

			var meta = {
				id: ob.id,
				name: ob.name,
				projectType: ob.projectType,
				created: ob.created,
				updated: ob.updated,
				savedAt: ob.savedAt,
				duration: ob.durr,
				channels: ob.chans,
				sampleRate: ob.samplerate,
				revision: ob.revision,
				schemaVersion: 2,
				thumb: thumb,
				hasRecovery: false
			};

			try {
				if (!db || !db.objectStoreNames.contains('sessions')) {
					callback && callback (ob);
					return ;
				}

				var storeNames = ['sessions'];
				var hasMeta = db.objectStoreNames.contains('projects_meta');
				if (hasMeta) storeNames.push('projects_meta');

				var trans = db.transaction(storeNames, 'readwrite');
				trans.objectStore('sessions').put(ob);
				if (hasMeta) {
					trans.objectStore('projects_meta').put(meta);
				}

				trans.onerror = function(e) {
					console.warn('IndexedDB put error:', e);
					if (e && e.target && e.target.error && e.target.error.name === 'QuotaExceededError') {
						app.fireEvent ('ShowError', 'Storage quota full. Consider downloading a project backup or cleaning up older drafts.');
					}
					callback && callback (null, e);
				};

				trans.oncomplete = function ( e ) {
					// Also clean obsolete recovery snapshot upon confirmed save
					q.ClearRecoverySnapshot(ob.id);
					if (!quiet) app.fireEvent ('DidStoreDB', ob, e );
					callback && callback (ob, e);
				};
			} catch (err) {
				console.warn('SaveSession transaction failed:', err);
				callback && callback (null, err);
			}
		};

		this.GetSession = function ( id, callback ) {
			if (!db) {
				q.Init (function () { q.GetSession (id, callback); });
				return ;
			}

			try {
				var trans = db.transaction(['sessions'], 'readonly');
				var req = trans.objectStore('sessions').get(id);

				req.onsuccess = function(e) {
					var record = e.target.result;
					if (!record) return callback && callback (null);

					if (record && record.comp && record.data && record.data.length > 0) {
						var comp = compressors[ compression ];
						if (!comp.loading && !comp.ready) {
							comp.init (function() {
								decompressRecord(record, comp, callback);
							});
							return ;
						}
						decompressRecord(record, comp, callback);
					} else {
						callback && callback ( record );
					}
				};

				req.onerror = function() {
					callback && callback (null);
				};
			} catch (err) {
				callback && callback (null);
			}
		};

		function decompressRecord ( record, comp, callback ) {
			var data_arr = [];
			for (var i = 0; i < record.data.length; ++i) {
				if (comp && comp.decompress && record.data2 && record.data2[i]) {
					var tmp = comp.decompress (record.data[i], 0, record.data2[i]);
					data_arr.push (tmp.buffer.slice (tmp.byteOffset, tmp.byteLength + tmp.byteOffset));
				} else {
					data_arr.push (record.data[i]);
				}
			}
			record.data = data_arr;
			callback && callback (record);
		}

		this.DelSession = function ( id, callback ) {
			q.DeleteProject(id, callback);
		};

		this.ListSessions = function ( callback ) {
			q.ListProjects({}, function(projects) {
				// Convert to legacy shape expected by older code
				var list = (projects || []).map(function(p) {
					return {
						id: p.id,
						name: p.name,
						created: p.updated || p.created,
						durr: p.duration,
						chans: p.channels,
						thumb: p.thumb,
						projectType: p.projectType,
						hasRecovery: p.hasRecovery
					};
				});
				callback && callback (list);
			});
		};

		// ---------------------------------------------------------------------
		// Enhanced Project Management Operations
		// ---------------------------------------------------------------------
		this.ListProjects = function ( options, callback ) {
			if (typeof options === 'function') {
				callback = options;
				options = {};
			}
			options = options || {};
			var search = (options.search || '').trim().toLowerCase();
			var sortBy = options.sortBy || 'updated'; // 'updated', 'name', 'created'
			var sortOrder = options.sortOrder || 'desc';

			if (!db) {
				q.Init (function () { q.ListProjects (options, callback); });
				return ;
			}

			if (!db.objectStoreNames.contains('projects_meta')) {
				scanLegacySessions(search, new Set(), sortBy, sortOrder, callback);
				return ;
			}

			try {
				var stores = ['projects_meta'];
				var hasRec = db.objectStoreNames.contains('recovery');
				if (hasRec) stores.push('recovery');

				var trans = db.transaction(stores, 'readonly');
				var metaStore = trans.objectStore('projects_meta');

				var ret = [];
				var recoveryIds = new Set();

				var startReadMeta = function () {
					var metaReq = metaStore.openCursor();
					metaReq.onsuccess = function(e2) {
						var c2 = e2.target.result;
						if (c2) {
							var item = c2.value;
							item.hasRecovery = recoveryIds.has(item.id);
							if (!search || (item.name && item.name.toLowerCase().indexOf(search) !== -1)) {
								ret.push(item);
							}
							c2.continue();
						} else {
							// If projects_meta was empty, fallback to legacy sessions store
							if (ret.length === 0) {
								scanLegacySessions(search, recoveryIds, sortBy, sortOrder, callback);
								return ;
							}
							sortAndReturn(ret, sortBy, sortOrder, callback);
						}
					};
					metaReq.onerror = function() {
						scanLegacySessions(search, recoveryIds, sortBy, sortOrder, callback);
					};
				};

				if (hasRec) {
					var recoveryStore = trans.objectStore('recovery');
					var recReq = recoveryStore.openCursor();
					recReq.onsuccess = function(ev) {
						var cursor = ev.target.result;
						if (cursor) {
							recoveryIds.add(cursor.primaryKey);
							cursor.continue();
						} else {
							startReadMeta();
						}
					};
					recReq.onerror = function() {
						startReadMeta();
					};
				} else {
					startReadMeta();
				}
			} catch (e) {
				callback && callback ([]);
			}
		};

		function scanLegacySessions ( search, recoveryIds, sortBy, sortOrder, callback ) {
			try {
				if (!db || !db.objectStoreNames.contains('sessions')) {
					callback && callback ([]);
					return ;
				}
				var stores = ['sessions'];
				var hasMeta = db.objectStoreNames.contains('projects_meta');
				if (hasMeta) stores.push('projects_meta');

				var trans = db.transaction(stores, hasMeta ? 'readwrite' : 'readonly');
				var sessStore = trans.objectStore('sessions');
				var metaStore = hasMeta ? trans.objectStore('projects_meta') : null;
				var req = sessStore.openCursor();
				var list = [];

				req.onsuccess = function(ev) {
					var c = ev.target.result;
					if (c) {
						var v = c.value;
						var meta = {
							id: v.id,
							name: v.name || 'Untitled Project',
							projectType: v.projectType || 'waveform',
							created: v.created || Date.now(),
							updated: v.updated || v.created || Date.now(),
							savedAt: v.savedAt || v.updated || Date.now(),
							duration: v.durr || 0,
							channels: v.chans || 2,
							sampleRate: v.samplerate || 48000,
							revision: v.revision || 1,
							schemaVersion: 2,
							thumb: v.thumb || '',
							hasRecovery: recoveryIds.has(v.id)
						};
						if (metaStore) {
							try { metaStore.put(meta); } catch (err) {}
						}
						if (!search || meta.name.toLowerCase().indexOf(search) !== -1) {
							list.push(meta);
						}
						c.continue();
					} else {
						sortAndReturn(list, sortBy, sortOrder, callback);
					}
				};
			} catch (err) {
				callback && callback ([]);
			}
		}

		function sortAndReturn ( list, sortBy, sortOrder, callback ) {
			list.sort(function(a, b) {
				var vA = a[sortBy] !== undefined ? a[sortBy] : 0;
				var vB = b[sortBy] !== undefined ? b[sortBy] : 0;
				if (typeof vA === 'string') {
					var cmp = vA.localeCompare(vB);
					return sortOrder === 'asc' ? cmp : -cmp;
				}
				return sortOrder === 'asc' ? vA - vB : vB - vA;
			});
			callback && callback (list);
		}

		this.RenameProject = function ( id, newName, callback ) {
			newName = (newName || '').trim();
			if (!newName) return callback && callback (null, 'Name cannot be empty');

			if (!db) {
				q.Init (function () { q.RenameProject(id, newName, callback); });
				return ;
			}

			try {
				var trans = db.transaction(['sessions', 'projects_meta', 'recovery'], 'readwrite');
				var sessStore = trans.objectStore('sessions');
				var metaStore = trans.objectStore('projects_meta');
				var recStore = trans.objectStore('recovery');

				var sessReq = sessStore.get(id);
				sessReq.onsuccess = function() {
					var sess = sessReq.result;
					if (sess) {
						sess.name = newName;
						sess.updated = Date.now();
						sessStore.put(sess);
					}
				};

				var metaReq = metaStore.get(id);
				metaReq.onsuccess = function() {
					var meta = metaReq.result;
					if (meta) {
						meta.name = newName;
						meta.updated = Date.now();
						metaStore.put(meta);
					}
				};

				var recReq = recStore.get(id);
				recReq.onsuccess = function() {
					var rec = recReq.result;
					if (rec) {
						rec.projectName = newName;
						recStore.put(rec);
					}
				};

				trans.oncomplete = function() {
					callback && callback ({ id: id, name: newName });
				};
				trans.onerror = function(err) {
					callback && callback (null, err);
				};
			} catch (err) {
				callback && callback (null, err);
			}
		};

		this.DuplicateProject = function ( id, callback ) {
			q.GetSession(id, function(original) {
				if (!original) return callback && callback (null, 'Project not found');

				var newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
				var copyName = (original.name || 'Untitled') + ' Copy';

				// Deep clone buffer arrays so duplicate is 100% independent
				var clonedData = [];
				if (original.data && original.data.length) {
					for (var i = 0; i < original.data.length; i++) {
						clonedData.push(original.data[i].slice(0));
					}
				}

				var duplicateOb = {
					id: newId,
					name: copyName,
					projectType: original.projectType || 'waveform',
					created: Date.now(),
					updated: Date.now(),
					savedAt: Date.now(),
					revision: 1,
					schemaVersion: 2,
					data: clonedData,
					data2: original.data2 ? original.data2.slice(0) : [],
					durr: original.durr,
					chans: original.chans,
					comp: original.comp,
					thumb: original.thumb,
					samplerate: original.samplerate,
					markers: original.markers ? JSON.parse(JSON.stringify(original.markers)) : [],
					multitrackState: original.multitrackState ? JSON.parse(JSON.stringify(original.multitrackState)) : null
				};

				var duplicateMeta = {
					id: newId,
					name: copyName,
					projectType: duplicateOb.projectType,
					created: duplicateOb.created,
					updated: duplicateOb.updated,
					savedAt: duplicateOb.savedAt,
					duration: duplicateOb.durr,
					channels: duplicateOb.chans,
					sampleRate: duplicateOb.samplerate,
					revision: 1,
					schemaVersion: 2,
					thumb: duplicateOb.thumb,
					hasRecovery: false
				};

				try {
					var stores = ['sessions'];
					var hasMeta = db.objectStoreNames.contains('projects_meta');
					if (hasMeta) stores.push('projects_meta');

					var trans = db.transaction(stores, 'readwrite');
					trans.objectStore('sessions').put(duplicateOb);
					if (hasMeta) {
						trans.objectStore('projects_meta').put(duplicateMeta);
					}

					trans.oncomplete = function() {
						callback && callback (duplicateMeta);
					};
					trans.onerror = function(e) {
						callback && callback (null, e);
					};
				} catch (err) {
					callback && callback (null, err);
				}
			});
		};

		this.DeleteProject = function ( id, callback ) {
			if (!db) {
				q.Init (function () { q.DeleteProject(id, callback); });
				return ;
			}

			try {
				var stores = ['sessions'];
				if (db.objectStoreNames.contains('projects_meta')) stores.push('projects_meta');
				if (db.objectStoreNames.contains('recovery')) stores.push('recovery');

				var trans = db.transaction(stores, 'readwrite');
				trans.objectStore('sessions').delete(id);
				if (stores.indexOf('projects_meta') !== -1) trans.objectStore('projects_meta').delete(id);
				if (stores.indexOf('recovery') !== -1) trans.objectStore('recovery').delete(id);

				trans.oncomplete = function() {
					callback && callback (true);
				};
				trans.onerror = function(err) {
					callback && callback (false, err);
				};
			} catch (err) {
				callback && callback (false, err);
			}
		};

		// ---------------------------------------------------------------------
		// Recovery Snapshots & Crash Detection
		// ---------------------------------------------------------------------
		this.SaveRecoverySnapshot = function ( snapshot, callback ) {
			if (!db) {
				q.Init (function () { q.SaveRecoverySnapshot(snapshot, callback); });
				return ;
			}

			if (!db.objectStoreNames.contains('recovery')) {
				callback && callback (false);
				return ;
			}

			try {
				var stores = ['recovery'];
				var hasMeta = db.objectStoreNames.contains('projects_meta');
				if (hasMeta) stores.push('projects_meta');

				var trans = db.transaction(stores, 'readwrite');
				trans.objectStore('recovery').put(snapshot);

				if (hasMeta) {
					var metaStore = trans.objectStore('projects_meta');
					var metaReq = metaStore.get(snapshot.projectId);
					metaReq.onsuccess = function() {
						var meta = metaReq.result;
						if (meta) {
							meta.hasRecovery = true;
							metaStore.put(meta);
						}
					};
				}

				trans.oncomplete = function() {
					callback && callback (true);
				};
				trans.onerror = function() {
					callback && callback (false);
				};
			} catch (e) {
				callback && callback (false);
			}
		};

		this.GetRecoverySnapshot = function ( projectId, callback ) {
			if (!db) {
				q.Init (function () { q.GetRecoverySnapshot(projectId, callback); });
				return ;
			}

			if (!db.objectStoreNames.contains('recovery')) {
				callback && callback (null);
				return ;
			}

			try {
				var trans = db.transaction(['recovery'], 'readonly');
				var req = trans.objectStore('recovery').get(projectId);
				req.onsuccess = function() {
					callback && callback (req.result || null);
				};
				req.onerror = function() {
					callback && callback (null);
				};
			} catch (e) {
				callback && callback (null);
			}
		};

		this.ClearRecoverySnapshot = function ( projectId, callback ) {
			if (!db) {
				q.Init (function () { q.ClearRecoverySnapshot(projectId, callback); });
				return ;
			}

			if (!db.objectStoreNames.contains('recovery')) {
				callback && callback (true);
				return ;
			}

			try {
				var stores = ['recovery'];
				var hasMeta = db.objectStoreNames.contains('projects_meta');
				if (hasMeta) stores.push('projects_meta');

				var trans = db.transaction(stores, 'readwrite');
				trans.objectStore('recovery').delete(projectId);

				if (hasMeta) {
					var metaStore = trans.objectStore('projects_meta');
					var metaReq = metaStore.get(projectId);
					metaReq.onsuccess = function() {
						var meta = metaReq.result;
						if (meta) {
							meta.hasRecovery = false;
							metaStore.put(meta);
						}
					};
				}

				trans.oncomplete = function() {
					callback && callback (true);
				};
			} catch (e) {
				callback && callback (false);
			}
		};

		this.CheckRecoveryCandidates = function ( callback ) {
			if (!db) {
				q.Init (function () { q.CheckRecoveryCandidates(callback); });
				return ;
			}

			if (!db.objectStoreNames.contains('recovery')) {
				callback && callback ([]);
				return ;
			}

			try {
				var stores = ['recovery'];
				var hasMeta = db.objectStoreNames.contains('projects_meta');
				if (hasMeta) stores.push('projects_meta');

				var trans = db.transaction(stores, 'readonly');
				var recStore = trans.objectStore('recovery');
				var metaStore = hasMeta ? trans.objectStore('projects_meta') : null;
				var candidates = [];

				var recReq = recStore.openCursor();
				recReq.onsuccess = function(ev) {
					var cursor = ev.target.result;
					if (cursor) {
						var snap = cursor.value;
						if (metaStore) {
							var metaReq = metaStore.get(snap.projectId);
							metaReq.onsuccess = function() {
								var meta = metaReq.result;
								var savedAt = meta ? (meta.savedAt || meta.updated || 0) : 0;
								var savedRev = meta ? (meta.revision || 0) : 0;

								// Offer recovery if snapshot timestamp is newer or revision is higher
								if (snap.timestamp > savedAt || snap.revision > savedRev) {
									candidates.push({
										projectId: snap.projectId,
										projectName: snap.projectName || (meta && meta.name) || 'Untitled Project',
										timestamp: snap.timestamp,
										snapshotRevision: snap.revision || 1,
										savedRevision: savedRev,
										projectType: snap.projectType || 'waveform',
										data: snap.data,
										durr: snap.durr
									});
								}
							};
						} else {
							candidates.push({
								projectId: snap.projectId,
								projectName: snap.projectName || 'Untitled Project',
								timestamp: snap.timestamp,
								snapshotRevision: snap.revision || 1,
								savedRevision: 0,
								projectType: snap.projectType || 'waveform',
								data: snap.data,
								durr: snap.durr
							});
						}
						cursor.continue();
					} else {
						setTimeout(function() {
							callback && callback (candidates);
						}, 30);
					}
				};
				recReq.onerror = function() {
					callback && callback ([]);
				};
			} catch (e) {
				callback && callback ([]);
			}
		};
	}

	// -------------------------------------------------------------------------
	// Autosave Coordinator Class
	// -------------------------------------------------------------------------
	function AutosaveCoordinator ( app, storage ) {
		var self = this;
		this.app = app;
		this.storage = storage;

		this.projectId = (w.localStorage && w.localStorage.getItem('pk_active_project_id')) ||
			('proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
		this.projectName = (w.localStorage && w.localStorage.getItem('pk_project_title')) || 'Untitled Project';
		this.projectType = 'waveform';
		this.revision = 1;
		this.savedRevision = 1;
		this.dirty = false;
		this.isSaving = false;
		this.saveQueued = false;
		this.debounceMs = 1500;
		this.timer = null;
		this.status = 'Saved';

		try {
			if (w.localStorage) w.localStorage.setItem('pk_active_project_id', this.projectId);
		} catch (e) {}

		this.setProject = function ( id, name, type, revision ) {
			self.projectId = id;
			self.projectName = name || 'Untitled Project';
			self.projectType = type || 'waveform';
			self.revision = revision || 1;
			self.savedRevision = self.revision;
			self.dirty = false;
			try {
				if (w.localStorage) {
					w.localStorage.setItem('pk_active_project_id', self.projectId);
					w.localStorage.setItem('pk_project_title', self.projectName);
				}
			} catch (e) {}
			self.updateUIStatus('Saved');
		};

		this.setProjectName = function ( newName ) {
			self.projectName = (newName || '').trim() || 'Untitled Project';
			self.markDirty('rename');
		};

		this.updateUIStatus = function ( status, label ) {
			self.status = status;
			var statusEl = d.getElementById('pk_hdr_save_status');
			if (!statusEl) return ;

			statusEl.classList.remove('pk_status_clean', 'pk_status_dirty', 'pk_status_saving', 'pk_status_error', 'pk_status_recovery');

			if (status === 'Saved') {
				statusEl.classList.add('pk_status_clean');
				statusEl.innerHTML = '<span class="pk_save_dot"></span>Saved';
				statusEl.title = 'All edits saved locally';
			} else if (status === 'Unsaved') {
				statusEl.classList.add('pk_status_dirty');
				statusEl.innerHTML = '<span class="pk_save_dot"></span>Unsaved edits';
				statusEl.title = 'Unsaved changes pending autosave';
			} else if (status === 'Saving') {
				statusEl.classList.add('pk_status_saving');
				statusEl.innerHTML = '<span class="pk_save_dot"></span>Saving…';
				statusEl.title = 'Writing to local storage';
			} else if (status === 'Error') {
				statusEl.classList.add('pk_status_dirty');
				statusEl.innerHTML = '<span class="pk_save_dot"></span>Unsaved edits';
				statusEl.title = 'Click to retry saving';
				statusEl.onclick = function() { self.saveImmediately(); };
			} else if (status === 'Recovery') {
				statusEl.classList.add('pk_status_recovery');
				statusEl.innerHTML = '<span class="pk_save_dot"></span>Recovery available';
				statusEl.title = 'Unsaved work detected from a previous session';
			}
		};

		this.markDirty = function ( reason ) {
			self.revision++;
			self.dirty = true;
			self.updateUIStatus('Unsaved');

			clearTimeout(self.timer);
			self.timer = setTimeout(function() {
				self.triggerAutosave();
			}, self.debounceMs);
		};

		this.triggerAutosave = function () {
			clearTimeout(self.timer);
			self.timer = null;

			if (self.isSaving) {
				self.saveQueued = true;
				return ;
			}

			// Verify there is active project content to persist
			var ws = app.engine && app.engine.wavesurfer;
			var buf = ws && ws.backend && ws.backend.buffer;
			var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();

			if (!buf && !isMt) {
				self.dirty = false;
				self.updateUIStatus('Saved');
				return ;
			}

			self.isSaving = true;
			var savingRev = self.revision;
			self.updateUIStatus('Saving');

			// Save Recovery Snapshot immediately alongside autosave
			var snapshot = {
				projectId: self.projectId,
				projectName: self.projectName,
				projectType: isMt ? 'multitrack' : 'waveform',
				revision: savingRev,
				timestamp: Date.now(),
				schemaVersion: 2,
				durr: buf ? buf.duration : 0
			};
			storage.SaveRecoverySnapshot(snapshot);

			// Save confirmed project session
			storage.SaveSession(buf, self.projectId, self.projectName, function(res, err) {
				self.isSaving = false;

				if (err) {
					self.dirty = true;
					self.updateUIStatus('Unsaved');
					clearTimeout(self.timer);
					self.timer = setTimeout(function() {
						self.triggerAutosave();
					}, 4000);
					return ;
				}

				self.savedRevision = savingRev;

				// Revision check: if user made new edits while save was in progress
				if (self.revision > savingRev) {
					self.dirty = true;
					self.updateUIStatus('Unsaved');
					self.triggerAutosave();
				} else {
					self.dirty = false;
					self.updateUIStatus('Saved');
				}
			}, true, {
				projectType: isMt ? 'multitrack' : 'waveform',
				revision: savingRev
			});
		};

		this.saveImmediately = function ( callback ) {
			clearTimeout(self.timer);
			self.timer = null;
			self.triggerAutosave();
			if (callback) setTimeout(callback, 200);
		};

		// Event Bindings
		app.listenFor('DidStateChange', function() {
			self.markDirty('state_change');
		});

		app.listenFor('DidUpdateMultitrack', function() {
			self.markDirty('multitrack_edit');
		});

		app.listenFor('DidProjectTitleChange', function(title) {
			self.projectName = title;
			self.markDirty('title_change');
		});

		app.listenFor('DidLoadFile', function() {
			self.markDirty('file_loaded');
		});

		// Page lifecycle best-effort save
		if (typeof w !== 'undefined') {
			w.addEventListener('visibilitychange', function() {
				if (d.visibilityState === 'hidden' && self.dirty) {
					self.saveImmediately();
				}
			});
			w.addEventListener('pagehide', function() {
				if (self.dirty) {
					self.saveImmediately();
				}
			});
		}
	}

	PKAudioEditor._deps.fls = SaveLocal;
	PKAudioEditor._deps.AutosaveCoordinator = AutosaveCoordinator;

})( window, document, PKAudioEditor );
