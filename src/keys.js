(function( w, d, PKAE ) {
	'use strict';

	var isMac = /mac|iphone|ipad|ipod/.test ((navigator.platform || navigator.userAgent || '').toLowerCase ());
	var STORAGE_KEY = 'mixota_shortcuts_v1';
	var SETTINGS_VERSION = 1;

	// Normalize modifier naming and display
	var MOD_NAME = isMac ? 'Cmd' : 'Ctrl';
	var ALT_NAME = isMac ? 'Option' : 'Alt';

	function formatKeyDisplay( key ) {
		if (!key) return '';
		var parts = key.split('+').map(function(p) { return p.trim(); });
		return parts.map(function(part) {
			if (part === 'Mod' || part === 'Cmd' || part === 'Ctrl') {
				return '<kbd class="pk_kbd">' + MOD_NAME + '</kbd>';
			} else if (part === 'Alt' || part === 'Option') {
				return '<kbd class="pk_kbd">' + ALT_NAME + '</kbd>';
			} else if (part === 'Shift') {
				return '<kbd class="pk_kbd">Shift</kbd>';
			}
			return '<kbd class="pk_kbd">' + escapeHtml(part) + '</kbd>';
		}).join(' <span class="pk_kbd_plus">+</span> ');
	}

	function escapeHtml( str ) {
		if (!str) return '';
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function normalizeComboString( str ) {
		if (!str || typeof str !== 'string') return '';
		var raw = str.split('+').map(function(s) { return s.trim(); }).filter(Boolean);
		var ctrl = false, alt = false, shift = false, meta = false;
		var key = '';

		for (var i = 0; i < raw.length; i++) {
			var p = raw[i].toLowerCase();
			if (p === 'ctrl' || p === 'control') ctrl = true;
			else if (p === 'cmd' || p === 'meta' || p === 'command') meta = true;
			else if (p === 'mod') {
				if (isMac) meta = true;
				else ctrl = true;
			}
			else if (p === 'alt' || p === 'option') alt = true;
			else if (p === 'shift') shift = true;
			else {
				key = raw[i];
			}
		}

		if (!key && (ctrl || alt || shift || meta)) return ''; // modifier only

		// Normalize key representation
		var keyUpper = key.length === 1 ? key.toUpperCase() : key;
		if (keyUpper === ' ') keyUpper = 'Space';

		var res = [];
		if (isMac) {
			if (meta) res.push('Cmd');
			if (alt) res.push('Option');
			if (shift) res.push('Shift');
			if (ctrl) res.push('Ctrl');
		} else {
			if (ctrl || meta) res.push('Ctrl');
			if (alt) res.push('Alt');
			if (shift) res.push('Shift');
		}

		if (keyUpper) res.push(keyUpper);
		return res.join(' + ');
	}

	function eventToComboString( e ) {
		if (!e) return '';
		var isCtrl = e.ctrlKey;
		var isAlt = e.altKey;
		var isShift = e.shiftKey;
		var isMeta = e.metaKey;

		var key = e.key || '';
		var code = e.code || '';

		// Detect modifier-only presses
		if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') {
			return { isModifierOnly: true, partial: getModifierPrefix(isCtrl, isAlt, isShift, isMeta) };
		}

		// Normalize special keys
		var normKey = key;
		if (normKey === ' ' || normKey === 'Space' || code === 'Space') normKey = 'Space';
		else if (normKey.indexOf('Key') === 0 && normKey.length === 4) normKey = normKey.substr(3).toUpperCase();
		else if (code.indexOf('Key') === 0 && code.length === 4) normKey = code.substr(3).toUpperCase();
		else if (normKey.indexOf('Digit') === 0 && normKey.length === 6) normKey = normKey.substr(5);
		else if (code.indexOf('Digit') === 0 && code.length === 6) normKey = code.substr(5);
		else if (code === 'Delete' || normKey === 'Delete') normKey = 'Delete';
		else if (code === 'Backspace' || normKey === 'Backspace') normKey = 'Backspace';
		else if (code === 'Enter' || normKey === 'Enter') normKey = 'Enter';
		else if (code === 'Tab' || normKey === 'Tab') normKey = 'Tab';
		else if (code === 'Escape' || normKey === 'Escape') normKey = 'Escape';
		else if (code === 'Home' || normKey === 'Home') normKey = 'Home';
		else if (code === 'End' || normKey === 'End') normKey = 'End';
		else if (code === 'ArrowLeft' || normKey === 'ArrowLeft') normKey = 'Left Arrow';
		else if (code === 'ArrowRight' || normKey === 'ArrowRight') normKey = 'Right Arrow';
		else if (code === 'ArrowUp' || normKey === 'ArrowUp') normKey = 'Up Arrow';
		else if (code === 'ArrowDown' || normKey === 'ArrowDown') normKey = 'Down Arrow';
		else if (normKey === '+' || (code === 'Equal' && isShift)) normKey = '+';
		else if (normKey === '=' || code === 'Equal') normKey = '=';
		else if (normKey === '-' || code === 'Minus') normKey = '-';
		else if (normKey === '[' || code === 'BracketLeft') normKey = '[';
		else if (normKey === ']' || code === 'BracketRight') normKey = ']';
		else if (normKey === '?' || (code === 'Slash' && isShift)) normKey = '?';
		else if (normKey === '/' || code === 'Slash') normKey = '/';
		else if (normKey === '~' || (code === 'Backquote' && isShift)) normKey = '~';
		else if (normKey.length === 1) normKey = normKey.toUpperCase();

		var res = [];
		if (isMac) {
			if (isMeta) res.push('Cmd');
			if (isAlt) res.push('Option');
			if (isShift && normKey !== '+' && normKey !== '?') res.push('Shift');
			if (isCtrl) res.push('Ctrl');
		} else {
			if (isCtrl || isMeta) res.push('Ctrl');
			if (isAlt) res.push('Alt');
			if (isShift && normKey !== '+' && normKey !== '?') res.push('Shift');
		}

		if (normKey) res.push(normKey);
		return { isModifierOnly: false, combo: res.join(' + ') };
	}

	function getModifierPrefix( isCtrl, isAlt, isShift, isMeta ) {
		var res = [];
		if (isMac) {
			if (isMeta) res.push('Cmd');
			if (isAlt) res.push('Option');
			if (isShift) res.push('Shift');
			if (isCtrl) res.push('Ctrl');
		} else {
			if (isCtrl || isMeta) res.push('Ctrl');
			if (isAlt) res.push('Alt');
			if (isShift) res.push('Shift');
		}
		return res.length ? res.join(' + ') + ' + …' : 'Press key…';
	}

	// Categories definition
	var CATEGORIES = [
		{ id: 'file', name: 'File and Project', icon: '📁' },
		{ id: 'playback', name: 'Playback and Navigation', icon: '▶' },
		{ id: 'editing', name: 'Audio Editing', icon: '✂' },
		{ id: 'multitrack', name: 'Multitrack and Effects', icon: '🎛' }
	];

	// Action registry
	var ACTIONS = [
		// File and Project
		{
			id: 'file_new',
			category: 'file',
			name: 'New Project',
			description: 'Clear current workspace and start a fresh audio or multitrack session',
			defaultKey: isMac ? 'Cmd + Option + N' : 'Ctrl + Alt + N',
			handler: function( app ) {
				var confirmed = confirm('Start a new project? Any unsaved changes in the current session will be lost.');
				if (!confirmed) return;
				if (app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn()) {
					app.fireEvent('StateRequestClearAll');
					if (app.multitrack.clearRegion) app.multitrack.clearRegion();
					if (app.multitrack.ResetSession) app.multitrack.ResetSession();
					app.fireEvent('DidUpdateMultitrack');
					w.OneUp && w.OneUp('New Multitrack Project started', 900);
				} else {
					app.fireEvent('DidUnloadFile');
					app.fireEvent('StateRequestClearAll');
					w.OneUp && w.OneUp('New Waveform Project started', 900);
				}
			}
		},
		{
			id: 'file_open',
			category: 'file',
			name: 'Open Project',
			description: 'Open saved project or local draft from browser storage',
			defaultKey: isMac ? 'Cmd + O' : 'Ctrl + O',
			handler: function( app ) {
				var draftOpt = d.querySelector('.pk_opt[data-id="drf"]');
				if (draftOpt) {
					draftOpt.click();
				} else if (app.ui && app.ui.openDraftsModal) {
					app.ui.openDraftsModal();
				} else {
					var btns = d.querySelectorAll('.pk_menu_el button');
					var found = false;
					for (var i = 0; i < btns.length; i++) {
						if (btns[i].textContent.indexOf('Open Local Drafts') !== -1) {
							btns[i].click();
							found = true;
							break;
						}
					}
					if (!found) w.OneUp && w.OneUp('Opening local drafts...', 800);
				}
			}
		},
		{
			id: 'file_save',
			category: 'file',
			name: 'Save Project',
			description: 'Save current project to local drafts or session file',
			defaultKey: isMac ? 'Cmd + S' : 'Ctrl + S',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt && app.multitrack.ExportSession) {
					app.multitrack.ExportSession('mixota-session');
				} else {
					var btns = d.querySelectorAll('.pk_menu_el button');
					var found = false;
					for (var i = 0; i < btns.length; i++) {
						if (btns[i].textContent.indexOf('Save Draft Locally') !== -1) {
							btns[i].click();
							found = true;
							break;
						}
					}
					if (!found) {
						var dl = d.querySelector('.pk_opt[data-id="dl"]');
						if (dl) dl.click();
					}
				}
			}
		},
		{
			id: 'file_save_as',
			category: 'file',
			name: 'Save Project As',
			description: 'Save current project with custom session name or format',
			defaultKey: isMac ? 'Cmd + Shift + S' : 'Ctrl + Shift + S',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt && app.multitrack.ExportSession) {
					var name = prompt('Save Session As (.amss):', 'mixota-session');
					if (name) app.multitrack.ExportSession(name.trim());
				} else {
					var dl = d.querySelector('.pk_opt[data-id="dl"]');
					if (dl) dl.click();
				}
			}
		},
		{
			id: 'file_export',
			category: 'file',
			name: 'Export Audio',
			description: 'Render and download master audio (MP3, WAV, FLAC, AMSS)',
			defaultKey: isMac ? 'Cmd + E' : 'Ctrl + E',
			handler: function() {
				var dl = d.querySelector('.pk_opt[data-id="dl"]');
				if (dl) dl.click();
				else w.OneUp && w.OneUp('Opening Export dialog...', 800);
			}
		},
		{
			id: 'file_import',
			category: 'file',
			name: 'Import Audio',
			description: 'Import audio files from computer into the editor or timeline',
			defaultKey: isMac ? 'Cmd + I' : 'Ctrl + I',
			handler: function( app ) {
				app.fireEvent('RequestLoadLocalFile');
			}
		},
		{
			id: 'file_undo',
			category: 'file',
			name: 'Undo',
			description: 'Undo the last editing or multitrack action',
			defaultKey: isMac ? 'Cmd + Z' : 'Ctrl + Z',
			handler: function( app ) {
				app.fireEvent('StateRequestUndo');
			}
		},
		{
			id: 'file_redo',
			category: 'file',
			name: 'Redo',
			description: 'Redo the previously undone action',
			defaultKey: isMac ? 'Cmd + Shift + Z' : 'Ctrl + Shift + Z',
			handler: function( app ) {
				app.fireEvent('StateRequestRedo');
			}
		},

		// Playback and Navigation
		{
			id: 'play_toggle',
			category: 'playback',
			name: 'Play / Pause',
			description: 'Toggle playback or pause at current playhead position',
			defaultKey: 'Space',
			handler: function( app ) {
				app.fireEvent('RequestTransportToggle', 'stop');
			}
		},
		{
			id: 'play_stop',
			category: 'playback',
			name: 'Stop',
			description: 'Stop playback and return playhead',
			defaultKey: 'Shift + Space',
			handler: function( app ) {
				app.fireEvent('RequestStop');
			}
		},
		{
			id: 'play_from_start',
			category: 'playback',
			name: 'Play from Beginning',
			description: 'Seek to beginning of timeline and start playback',
			defaultKey: 'Home',
			handler: function( app ) {
				app.fireEvent('RequestSeekTo', 0);
				setTimeout(function() {
					app.fireEvent('RequestPlay');
				}, 20);
			}
		},
		{
			id: 'nav_jump_start',
			category: 'playback',
			name: 'Jump to Start',
			description: 'Jump playhead directly to start of timeline or region',
			defaultKey: '[',
			handler: function( app ) {
				app.fireEvent('RequestSeekTo', 0);
			}
		},
		{
			id: 'nav_jump_end',
			category: 'playback',
			name: 'Jump to End',
			description: 'Jump playhead directly to end of timeline or region',
			defaultKey: ']',
			handler: function( app ) {
				app.fireEvent('RequestSeekTo', 1);
			}
		},
		{
			id: 'play_loop',
			category: 'playback',
			name: 'Toggle Loop Playback',
			description: 'Toggle continuous loop playback for selection or timeline',
			defaultKey: 'L',
			handler: function( app ) {
				app.fireEvent('RequestSetLoop');
			}
		},
		{
			id: 'nav_metronome',
			category: 'playback',
			name: 'Toggle Metronome',
			description: 'Toggle metronome beat grid and tempo tools',
			defaultKey: 'B',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var btn = d.querySelector('.pk_mtbeat_btn');
					if (btn) btn.click();
					else w.OneUp && w.OneUp('Beat markers toggled', 800);
				} else {
					app.fireEvent('RequestActionTempo');
				}
			}
		},
		{
			id: 'nav_zoom_in',
			category: 'playback',
			name: 'Zoom In',
			description: 'Zoom in horizontally to reveal waveform details',
			defaultKey: '+',
			handler: function( app ) {
				app.fireEvent('RequestZoomUI', 'h', -1);
			}
		},
		{
			id: 'nav_zoom_out',
			category: 'playback',
			name: 'Zoom Out',
			description: 'Zoom out horizontally to view more of timeline',
			defaultKey: '-',
			handler: function( app ) {
				app.fireEvent('RequestZoomUI', 'h', 1);
			}
		},
		{
			id: 'nav_zoom_fit',
			category: 'playback',
			name: 'Fit Timeline to Window',
			description: 'Reset zoom factor and fit full session into view',
			defaultKey: '0',
			handler: function( app ) {
				app.fireEvent('RequestZoomUI', 0);
			}
		},

		// Audio Editing
		{
			id: 'edit_split',
			category: 'editing',
			name: 'Split Clip at Playhead',
			description: 'Split selected audio clip into two segments at cursor',
			defaultKey: 'S',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt && app.multitrack.splitSelectedClip) {
					app.multitrack.splitSelectedClip();
				} else {
					app.fireEvent('RequestActionCut', 1);
				}
			}
		},
		{
			id: 'edit_cut',
			category: 'editing',
			name: 'Cut',
			description: 'Cut selected audio or clip and place it on clipboard',
			defaultKey: isMac ? 'Cmd + X' : 'Ctrl + X',
			handler: function( app ) {
				app.fireEvent('RequestActionCut', 1);
			}
		},
		{
			id: 'edit_copy',
			category: 'editing',
			name: 'Copy',
			description: 'Copy selected audio or clip to clipboard',
			defaultKey: isMac ? 'Cmd + C' : 'Ctrl + C',
			handler: function( app ) {
				app.fireEvent('RequestActionCopy');
			}
		},
		{
			id: 'edit_paste',
			category: 'editing',
			name: 'Paste',
			description: 'Paste audio or clip from clipboard at cursor position',
			defaultKey: isMac ? 'Cmd + V' : 'Ctrl + V',
			handler: function( app ) {
				app.fireEvent('RequestActionPaste');
			}
		},
		{
			id: 'edit_duplicate',
			category: 'editing',
			name: 'Duplicate Clip',
			description: 'Duplicate the currently selected audio clip',
			defaultKey: isMac ? 'Cmd + D' : 'Ctrl + D',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt && app.multitrack.duplicateSelectedClip) {
					app.multitrack.duplicateSelectedClip();
				} else {
					app.fireEvent('RequestActionCopy');
					setTimeout(function() {
						app.fireEvent('RequestActionPaste');
					}, 20);
				}
			}
		},
		{
			id: 'edit_delete',
			category: 'editing',
			name: 'Delete Selected Clip',
			description: 'Delete the selected clip, region, or active selection',
			defaultKey: 'Delete',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt && app.multitrack.deleteSelectedClip) {
					app.multitrack.deleteSelectedClip();
				} else {
					app.fireEvent('RequestActionCut');
				}
			}
		},
		{
			id: 'edit_select_all',
			category: 'editing',
			name: 'Select All',
			description: 'Select the entire audio track or multitrack timeline',
			defaultKey: isMac ? 'Cmd + A' : 'Ctrl + A',
			handler: function( app ) {
				app.fireEvent('RequestSelect');
			}
		},
		{
			id: 'edit_select_none',
			category: 'editing',
			name: 'Select None',
			description: 'Deselect active selection or clip',
			defaultKey: isMac ? 'Cmd + Shift + A' : 'Ctrl + Shift + A',
			handler: function( app ) {
				app.fireEvent('RequestDeselect');
				app.fireEvent('RequestRegionClear');
			}
		},
		{
			id: 'nav_prev_marker',
			category: 'editing',
			name: 'Move Playhead to Previous Marker',
			description: 'Jump playhead backwards to the previous timeline marker',
			defaultKey: isMac ? 'Option + [' : 'Alt + [',
			handler: function( app ) {
				app.fireEvent('MrkrPrv', 0);
			}
		},
		{
			id: 'nav_next_marker',
			category: 'editing',
			name: 'Move Playhead to Next Marker',
			description: 'Jump playhead forwards to the next timeline marker',
			defaultKey: isMac ? 'Option + ]' : 'Alt + ]',
			handler: function( app ) {
				app.fireEvent('MrkrNxt', 0);
			}
		},
		{
			id: 'edit_add_marker',
			category: 'editing',
			name: 'Add Marker',
			description: 'Create a new cue or time marker at the current playhead',
			defaultKey: 'M',
			handler: function( app ) {
				app.fireEvent('MrkrAdd');
			}
		},
		{
			id: 'edit_toggle_snap',
			category: 'editing',
			name: 'Toggle Snap',
			description: 'Toggle snap to grid, zero crossings, or beat markers',
			defaultKey: 'N',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var snap = d.querySelector('.pk_mtbeat_snap');
					if (snap) snap.click();
					else w.OneUp && w.OneUp('Snap toggled', 800);
				} else {
					app.fireEvent('RequestSnapSelDrag');
				}
			}
		},
		{
			id: 'edit_mute_track',
			category: 'editing',
			name: 'Mute Selected Track',
			description: 'Mute or unmute the currently focused track or channel',
			defaultKey: isMac ? 'Option + M' : 'Alt + M',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var m = d.querySelector('.pk_mt_track_sel .pk_mt_mute, .pk_mt_track:first-child .pk_mt_mute, .pk_mt_mute');
					if (m) m.click();
				} else {
					app.fireEvent('RequestChanToggle', 0);
				}
			}
		},
		{
			id: 'edit_solo_track',
			category: 'editing',
			name: 'Solo Selected Track',
			description: 'Solo or unsolo the currently focused track or channel',
			defaultKey: isMac ? 'Option + S' : 'Alt + S',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var s = d.querySelector('.pk_mt_track_sel .pk_mt_solo, .pk_mt_track:first-child .pk_mt_solo, .pk_mt_solo');
					if (s) s.click();
				} else {
					app.fireEvent('RequestChanToggle', 1);
				}
			}
		},

		// Multitrack and Effects
		{
			id: 'mt_add_track',
			category: 'multitrack',
			name: 'Add Track',
			description: 'Add a new audio channel / track to the multitrack session',
			defaultKey: isMac ? 'Cmd + Shift + T' : 'Ctrl + Shift + T',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (!isMt && app.multitrack) {
					app.multitrack.Toggle(true);
				}
				if (app.multitrack && app.multitrack.addTrack) {
					app.multitrack.addTrack();
				} else {
					var add = d.querySelector('.pk_mt_add');
					if (add) add.click();
				}
			}
		},
		{
			id: 'mt_toggle_mute',
			category: 'multitrack',
			name: 'Toggle Track Mute',
			description: 'Toggle mute state on master channels or clear all mutes',
			defaultKey: isMac ? 'Cmd + M' : 'Ctrl + M',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var cm = d.querySelector('.pk_mt_clear.pk_mt_mute');
					if (cm) cm.click();
				} else {
					app.fireEvent('RequestChanToggle', 0);
				}
			}
		},
		{
			id: 'mt_toggle_solo',
			category: 'multitrack',
			name: 'Toggle Track Solo',
			description: 'Toggle solo state on master channels or clear all solos',
			defaultKey: isMac ? 'Cmd + Option + S' : 'Ctrl + Alt + S',
			handler: function( app ) {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn();
				if (isMt) {
					var cs = d.querySelector('.pk_mt_clear.pk_mt_solo');
					if (cs) cs.click();
				} else {
					app.fireEvent('RequestChanToggle', 1);
				}
			}
		},
		{
			id: 'fx_open',
			category: 'multitrack',
			name: 'Open Effects',
			description: 'Open the Effects menu and audio processing suite',
			defaultKey: 'E',
			handler: function( app ) {
				if (app.ui && app.ui.TopHeader && app.ui.TopHeader.openMenu) {
					app.ui.TopHeader.openMenu(2);
				}
			}
		},
		{
			id: 'mt_toggle_mixer',
			category: 'multitrack',
			name: 'Toggle Mixer',
			description: 'Toggle multitrack mixing console and channel meters',
			defaultKey: 'X',
			handler: function( app ) {
				app.fireEvent('RequestMixerToggle');
			}
		},
		{
			id: 'mt_toggle_view',
			category: 'multitrack',
			name: 'Toggle Multitrack View',
			description: 'Switch between Waveform editor and Multitrack DAW view',
			defaultKey: 'Tab',
			handler: function( app ) {
				if (app.multitrack) app.multitrack.Toggle();
			}
		},
		{
			id: 'view_fullscreen',
			category: 'multitrack',
			name: 'Toggle Fullscreen',
			description: 'Toggle browser fullscreen mode for focused workstation workflow',
			defaultKey: 'F11',
			handler: function() {
				if (!d.fullscreenElement) {
					d.documentElement.requestFullscreen().catch(function(){});
				} else {
					if (d.exitFullscreen) d.exitFullscreen().catch(function(){});
				}
			}
		},
		{
			id: 'help_shortcuts',
			category: 'multitrack',
			name: 'Keyboard Shortcuts',
			description: 'Open the Keyboard Shortcuts configuration panel',
			defaultKey: '?',
			handler: function( app ) {
				if (app.ui && app.ui.openSettingsModal) {
					app.ui.openSettingsModal('shortcuts');
				} else if (app.ui && app.ui.openShortcutsModal) {
					app.ui.openShortcutsModal();
				}
			}
		}
	];

	// Action lookup map by ID
	var ACTION_MAP = {};
	for (var a = 0; a < ACTIONS.length; a++) {
		ACTION_MAP[ACTIONS[a].id] = ACTIONS[a];
	}

	function ShortcutManager() {
		var q = this;
		q.app = null;
		q.customShortcuts = {};
		q.activeShortcuts = {}; // comboString -> actionId
		q.recordingActionId = null;
		q.recordingCallback = null;
		q.activeModal = null;

		q.init = function( appInstance ) {
			q.app = appInstance;
			q.loadSettings();
			q.bindGlobalKeyboardListener();
			return q;
		};

		q.getActions = function() {
			return ACTIONS;
		};

		q.getCategories = function() {
			return CATEGORIES;
		};

		q.getActionById = function( id ) {
			return ACTION_MAP[id] || null;
		};

		q.getDefaultShortcut = function( id ) {
			var a = ACTION_MAP[id];
			return a ? a.defaultKey : '';
		};

		q.getEffectiveShortcut = function( id ) {
			if (q.customShortcuts && q.customShortcuts.hasOwnProperty(id)) {
				return q.customShortcuts[id];
			}
			return q.getDefaultShortcut(id);
		};

		q.isCustomized = function( id ) {
			if (!q.customShortcuts || !q.customShortcuts.hasOwnProperty(id)) return false;
			return normalizeComboString(q.customShortcuts[id]) !== normalizeComboString(q.getDefaultShortcut(id));
		};

		q.rebuildActiveMap = function() {
			q.activeShortcuts = {};
			for (var i = 0; i < ACTIONS.length; i++) {
				var actionId = ACTIONS[i].id;
				var combo = q.getEffectiveShortcut(actionId);
				if (combo) {
					var norm = normalizeComboString(combo);
					if (norm) {
						q.activeShortcuts[norm] = actionId;
					}
				}
			}
		};

		q.loadSettings = function() {
			q.customShortcuts = {};
			try {
				if (w.localStorage) {
					var raw = w.localStorage.getItem(STORAGE_KEY);
					if (raw) {
						var parsed = JSON.parse(raw);
						if (parsed && typeof parsed.shortcuts === 'object') {
							for (var key in parsed.shortcuts) {
								if (ACTION_MAP[key] && typeof parsed.shortcuts[key] === 'string') {
									var norm = normalizeComboString(parsed.shortcuts[key]);
									if (norm) {
										q.customShortcuts[key] = norm;
									}
								}
							}
						}
					}
				}
			} catch (e) {
				console.warn('Mixota: could not load custom keyboard shortcuts', e);
			}
			q.rebuildActiveMap();
		};

		q.saveSettings = function() {
			try {
				if (w.localStorage) {
					var payload = {
						version: SETTINGS_VERSION,
						updatedAt: new Date().toISOString(),
						platform: isMac ? 'mac' : 'windows',
						shortcuts: q.customShortcuts
					};
					w.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
				}
			} catch (e) {
				console.warn('Mixota: could not save keyboard shortcuts to localStorage', e);
			}
			q.rebuildActiveMap();
		};

		q.setShortcut = function( actionId, comboString, force ) {
			if (!ACTION_MAP[actionId]) return { error: 'Unknown action' };
			var norm = normalizeComboString(comboString);
			if (!norm) return { error: 'Invalid key combination' };

			// Check for conflicts
			var conflict = q.checkConflict(actionId, norm);
			if (conflict && !force) {
				return { conflict: true, conflictingAction: conflict };
			}

			if (conflict && force) {
				// Remove assignment from conflicting action
				delete q.customShortcuts[conflict.id];
			}

			// If it matches default, remove custom override
			if (norm === normalizeComboString(q.getDefaultShortcut(actionId))) {
				delete q.customShortcuts[actionId];
			} else {
				q.customShortcuts[actionId] = norm;
			}

			q.saveSettings();
			return { success: true, combo: norm };
		};

		q.resetShortcut = function( actionId ) {
			if (q.customShortcuts.hasOwnProperty(actionId)) {
				delete q.customShortcuts[actionId];
				q.saveSettings();
			}
			return q.getDefaultShortcut(actionId);
		};

		q.resetAll = function() {
			q.customShortcuts = {};
			q.saveSettings();
		};

		q.checkConflict = function( targetActionId, comboString ) {
			var norm = normalizeComboString(comboString);
			if (!norm) return null;
			for (var i = 0; i < ACTIONS.length; i++) {
				var a = ACTIONS[i];
				if (a.id === targetActionId) continue;
				var eff = normalizeComboString(q.getEffectiveShortcut(a.id));
				if (eff === norm) {
					return a;
				}
			}
			return null;
		};

		q.getConflicts = function() {
			var seen = {};
			var conflicts = [];
			for (var i = 0; i < ACTIONS.length; i++) {
				var a = ACTIONS[i];
				var eff = normalizeComboString(q.getEffectiveShortcut(a.id));
				if (!eff) continue;
				if (seen[eff]) {
					conflicts.push({ combo: eff, actions: [seen[eff], a] });
				} else {
					seen[eff] = a;
				}
			}
			return conflicts;
		};

		q.exportJSON = function() {
			var payload = {
				application: 'Mixota by growiota',
				version: SETTINGS_VERSION,
				exportedAt: new Date().toISOString(),
				platform: isMac ? 'mac' : 'windows',
				shortcuts: {}
			};
			for (var i = 0; i < ACTIONS.length; i++) {
				var id = ACTIONS[i].id;
				payload.shortcuts[id] = q.getEffectiveShortcut(id);
			}

			var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
			var url = URL.createObjectURL(blob);
			var a = d.createElement('a');
			a.href = url;
			a.download = 'mixota-keyboard-shortcuts.json';
			d.body.appendChild(a);
			a.click();
			setTimeout(function() {
				d.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 100);

			if (w.OneUp) w.OneUp('Shortcuts exported to JSON', 900);
		};

		q.importJSON = function( jsonString ) {
			try {
				var data = JSON.parse(jsonString);
				if (!data || typeof data !== 'object' || !data.shortcuts) {
					return { error: 'Invalid configuration file. Expected a JSON object with a "shortcuts" property.' };
				}

				// Check internal file conflicts
				var seenCombos = {};
				var importMap = {};
				var importedCount = 0;

				for (var actId in data.shortcuts) {
					if (!ACTION_MAP[actId]) continue;
					var val = data.shortcuts[actId];
					if (typeof val !== 'string') continue;
					var norm = normalizeComboString(val);
					if (!norm) continue;

					if (seenCombos[norm] && seenCombos[norm] !== actId) {
						return { error: 'Import rejected: duplicate shortcut "' + norm + '" assigned to multiple actions in file.' };
					}
					seenCombos[norm] = actId;
					importMap[actId] = norm;
					importedCount++;
				}

				if (importedCount === 0) {
					return { error: 'No recognizable shortcut assignments found in file.' };
				}

				for (var id in importMap) {
					var combo = importMap[id];
					if (combo === normalizeComboString(q.getDefaultShortcut(id))) {
						delete q.customShortcuts[id];
					} else {
						q.customShortcuts[id] = combo;
					}
				}

				q.saveSettings();
				if (w.OneUp) w.OneUp('Imported ' + importedCount + ' shortcuts successfully', 1100);
				return { success: true, count: importedCount };
			} catch (err) {
				return { error: 'Malformed JSON file: ' + err.message };
			}
		};

		q.isEditTarget = function( e ) {
			var t = e && (e.target || e.srcElement);
			if (!t) return false;
			var tag = (t.tagName || '').toUpperCase();
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
			if (t.isContentEditable || (t.getAttribute && t.getAttribute('contenteditable') === 'true')) return true;
			return false;
		};

		q.isModalOpen = function() {
			var modals = d.querySelectorAll('.pk_modal');
			for (var i = 0; i < modals.length; i++) {
				if (!modals[i].classList.contains('pk_settings_modal')) {
					return true;
				}
			}
			return false;
		};

		q.startRecording = function( actionId, callback ) {
			q.recordingActionId = actionId;
			q.recordingCallback = callback;
		};

		q.stopRecording = function() {
			q.recordingActionId = null;
			q.recordingCallback = null;
		};

		q.bindGlobalKeyboardListener = function() {
			var handleKeyDown = function( e ) {
				// 1. Shortcut recording mode takes absolute precedence
				if (q.recordingActionId) {
					e.preventDefault();
					e.stopPropagation();

					if (e.key === 'Escape' || e.code === 'Escape') {
						var cbCancel = q.recordingCallback;
						q.stopRecording();
						cbCancel && cbCancel({ cancelled: true });
						return;
					}

					var parsed = eventToComboString(e);
					if (parsed.isModifierOnly) {
						if (q.recordingCallback) {
							q.recordingCallback({ modifierOnly: true, partial: parsed.partial });
						}
						return;
					}

					var combo = parsed.combo;
					var actId = q.recordingActionId;
					var cb = q.recordingCallback;
					q.stopRecording();
					cb && cb({ combo: combo, actionId: actId });
					return;
				}

				// 2. Do not fire editor shortcuts inside text fields
				if (q.isEditTarget(e)) return;

				// 3. Do not fire editor shortcuts when another modal is active
				if (q.isModalOpen()) return;

				// 4. Check matching action
				var eventParsed = eventToComboString(e);
				if (eventParsed.isModifierOnly || !eventParsed.combo) return;

				var actionId = q.activeShortcuts[eventParsed.combo];
				if (actionId && ACTION_MAP[actionId]) {
					var action = ACTION_MAP[actionId];
					if (action && action.handler) {
						e.preventDefault();
						e.stopPropagation();
						action.handler(q.app, e);
					}
				}
			};

			w.addEventListener('keydown', handleKeyDown, true);
			d.addEventListener('keydown', handleKeyDown, true);
		};

		// UI: Settings & Keyboard Shortcuts Modal
		q.openSettingsModal = function( initialCategory ) {
			if (q.activeModal) {
				try { q.activeModal.Destroy(); } catch (e) {}
			}

			var validFilters = ['all', 'custom', 'conflicts', 'file', 'playback', 'editing', 'multitrack'];
			var activeFilter = (initialCategory && validFilters.indexOf(initialCategory) !== -1) ? initialCategory : 'all';
			var searchQuery = '';
			var collapsedCategories = {};

			var modalEl = null;

			function renderPillsHtml() {
				var actions = ACTIONS;
				var customCount = 0;
				for (var c = 0; c < actions.length; c++) {
					if (q.isCustomized(actions[c].id)) customCount++;
				}
				var conflicts = q.getConflicts();

				var html = '';
				html += '<button class="pk_sc_pill' + (activeFilter === 'all' ? ' pk_sc_pill_act' : '') + '" data-filter="all">All (' + actions.length + ')</button>';
				html += '<button class="pk_sc_pill' + (activeFilter === 'custom' ? ' pk_sc_pill_act' : '') + '" data-filter="custom">Customized (' + customCount + ')</button>';
				html += '<button class="pk_sc_pill' + (activeFilter === 'conflicts' ? ' pk_sc_pill_act' : '') + (conflicts.length ? ' pk_sc_pill_warn' : '') + '" data-filter="conflicts">Conflicts (' + conflicts.length + ')</button>';

				for (var k = 0; k < CATEGORIES.length; k++) {
					var cat = CATEGORIES[k];
					var count = 0;
					for (var a = 0; a < actions.length; a++) {
						if (actions[a].category === cat.id) count++;
					}
					html += '<button class="pk_sc_pill' + (activeFilter === cat.id ? ' pk_sc_pill_act' : '') + '" data-filter="' + cat.id + '">' + cat.icon + ' ' + cat.name + ' (' + count + ')</button>';
				}
				return html;
			}

			function renderListHtml() {
				var actions = ACTIONS;
				var conflicts = q.getConflicts();
				var html = '';
				var totalVisible = 0;

				for (var ci = 0; ci < CATEGORIES.length; ci++) {
					var currCat = CATEGORIES[ci];
					if (activeFilter !== 'all' && activeFilter !== 'custom' && activeFilter !== 'conflicts' && activeFilter !== currCat.id) {
						continue;
					}

					var catActions = actions.filter(function(item) {
						if (item.category !== currCat.id) return false;
						if (activeFilter === 'custom' && !q.isCustomized(item.id)) return false;
						if (activeFilter === 'conflicts') {
							var eff = normalizeComboString(q.getEffectiveShortcut(item.id));
							var hasConf = conflicts.some(function(cf) { return cf.combo === eff; });
							if (!hasConf) return false;
						}
						if (searchQuery) {
							var qLow = searchQuery.toLowerCase();
							var effCombo = q.getEffectiveShortcut(item.id).toLowerCase();
							var match = item.name.toLowerCase().indexOf(qLow) !== -1 ||
								item.description.toLowerCase().indexOf(qLow) !== -1 ||
								effCombo.indexOf(qLow) !== -1 ||
								currCat.name.toLowerCase().indexOf(qLow) !== -1;
							if (!match) return false;
						}
						return true;
					});

					if (catActions.length === 0) continue;
					totalVisible += catActions.length;

					var isCollapsed = !!collapsedCategories[currCat.id];

					html += '<div class="pk_sc_category" data-cat="' + currCat.id + '">';
					html += '<div class="pk_sc_category_hdr" data-cat="' + currCat.id + '">' +
						'<span class="pk_sc_cat_title"><span class="pk_sc_cat_icon">' + currCat.icon + '</span> ' + currCat.name + '</span>' +
						'<span class="pk_sc_cat_count">' + catActions.length + ' action' + (catActions.length === 1 ? '' : 's') + '</span>' +
						'<span class="pk_sc_cat_chevron' + (isCollapsed ? ' pk_sc_collapsed' : '') + '">▼</span>' +
						'</div>';

					if (!isCollapsed) {
						html += '<div class="pk_sc_category_body">';
						for (var ai = 0; ai < catActions.length; ai++) {
							var act = catActions[ai];
							var isCust = q.isCustomized(act.id);
							var effKey = q.getEffectiveShortcut(act.id);
							var conflictObj = q.checkConflict(act.id, effKey);

							html += '<div class="pk_sc_row" id="pk_sc_row_' + act.id + '" data-action="' + act.id + '">';
							html += '<div class="pk_sc_info">' +
								'<div class="pk_sc_name_row">' +
								'<span class="pk_sc_name">' + escapeHtml(act.name) + '</span>' +
								(isCust ? '<span class="pk_sc_badge_custom" title="Customized by user">Custom</span>' : '') +
								(conflictObj ? '<span class="pk_sc_badge_conflict" title="Conflicts with: ' + escapeHtml(conflictObj.name) + '">⚠ Conflict: ' + escapeHtml(conflictObj.name) + '</span>' : '') +
								'</div>' +
								'<div class="pk_sc_desc">' + escapeHtml(act.description) + '</div>' +
								'</div>';

							html += '<div class="pk_sc_controls">';
							html += '<button class="pk_sc_key_badge" id="pk_sc_btn_' + act.id + '" data-action="' + act.id + '" title="Click to record new shortcut">' +
								formatKeyDisplay(effKey) +
								'</button>';

							html += '<button class="pk_sc_action_btn pk_sc_edit_btn" data-action="' + act.id + '" title="Edit shortcut">✏</button>';

							if (isCust) {
								html += '<button class="pk_sc_action_btn pk_sc_reset_btn" data-action="' + act.id + '" title="Reset to default (' + escapeHtml(act.defaultKey) + ')">↺</button>';
							} else {
								html += '<button class="pk_sc_action_btn pk_sc_reset_btn pk_sc_btn_inact" disabled title="Already default">↺</button>';
							}

							html += '</div>'; // .pk_sc_controls
							html += '</div>'; // .pk_sc_row
						}
						html += '</div>'; // .pk_sc_category_body
					}

					html += '</div>'; // .pk_sc_category
				}

				if (totalVisible === 0) {
					html += '<div class="pk_sc_empty">' +
						'<div class="pk_sc_empty_icon">🔍</div>' +
						'<div class="pk_sc_empty_title">No shortcuts found</div>' +
						'<div class="pk_sc_empty_desc">' + (searchQuery ? 'No shortcuts match "' + escapeHtml(searchQuery) + '".' : 'No shortcuts in this filter.') + '</div>' +
						'<button class="pk_sc_clear_btn" id="pk_sc_empty_clear">Show All Shortcuts</button>' +
						'</div>';
				}

				return html;
			}

			function renderModalContent() {
				var html = '<div class="pk_sc_container">';

				// Top Toolbar
				html += '<div class="pk_sc_toolbar">';
				html += '<div class="pk_sc_search_wrap">' +
					'<span class="pk_sc_search_icon">🔍</span>' +
					'<input type="text" id="pk_sc_search_input" class="pk_sc_search_input" placeholder="Search by action name, description, or key combo…" value="' + escapeHtml(searchQuery) + '" />' +
					'<button id="pk_sc_search_clear" class="pk_sc_search_clear" title="Clear search" style="' + (searchQuery ? '' : 'display:none;') + '">✕</button>' +
					'</div>';

				html += '<div class="pk_sc_filter_row" id="pk_sc_filter_row">';
				html += renderPillsHtml();
				html += '</div>'; // .pk_sc_filter_row
				html += '</div>'; // .pk_sc_toolbar

				// Action List
				html += '<div class="pk_sc_list_container" id="pk_sc_list_container">';
				html += renderListHtml();
				html += '</div>'; // .pk_sc_list_container
				html += '</div>'; // .pk_sc_container

				return html;
			}

			function bindListEvents() {
				if (!modalEl) return;

				var emptyClear = modalEl.querySelector('#pk_sc_empty_clear');
				if (emptyClear) {
					emptyClear.onclick = function() {
						searchQuery = '';
						activeFilter = 'all';
						var searchInput = modalEl.querySelector('#pk_sc_search_input');
						if (searchInput) searchInput.value = '';
						var searchClear = modalEl.querySelector('#pk_sc_search_clear');
						if (searchClear) searchClear.style.display = 'none';
						updatePills();
						updateListOnly();
						if (searchInput) searchInput.focus();
					};
				}

				// Category collapse/expand
				var catHeaders = modalEl.querySelectorAll('.pk_sc_category_hdr');
				for (var ch = 0; ch < catHeaders.length; ch++) {
					catHeaders[ch].onclick = function() {
						var catId = this.getAttribute('data-cat');
						collapsedCategories[catId] = !collapsedCategories[catId];
						updateListOnly();
					};
				}

				// Shortcut editing buttons and badges
				var editBadges = modalEl.querySelectorAll('.pk_sc_key_badge, .pk_sc_edit_btn');
				for (var eb = 0; eb < editBadges.length; eb++) {
					editBadges[eb].onclick = function( e ) {
						e.stopPropagation();
						var actId = this.getAttribute('data-action');
						startInlineRecording(actId);
					};
				}

				// Reset single shortcut buttons
				var resetBtns = modalEl.querySelectorAll('.pk_sc_reset_btn:not(.pk_sc_btn_inact)');
				for (var rb = 0; rb < resetBtns.length; rb++) {
					resetBtns[rb].onclick = function( e ) {
						e.stopPropagation();
						var actId = this.getAttribute('data-action');
						var act = ACTION_MAP[actId];
						q.resetShortcut(actId);
						if (w.OneUp) w.OneUp('Reset ' + (act ? act.name : 'shortcut') + ' to default', 900);
						updatePills();
						updateListOnly();
					};
				}
			}

			function bindPillEvents() {
				if (!modalEl) return;
				var pills = modalEl.querySelectorAll('.pk_sc_pill');
				for (var p = 0; p < pills.length; p++) {
					pills[p].onclick = function() {
						activeFilter = this.getAttribute('data-filter');
						updatePills();
						updateListOnly();
					};
				}
			}

			function bindToolbarEvents() {
				if (!modalEl) return;

				var searchInput = modalEl.querySelector('#pk_sc_search_input');
				var searchClear = modalEl.querySelector('#pk_sc_search_clear');

				if (searchInput) {
					searchInput.focus();
					searchInput.oninput = function() {
						searchQuery = this.value;
						if (searchClear) searchClear.style.display = searchQuery ? 'block' : 'none';
						updateListOnly();
					};
				}

				if (searchClear) {
					searchClear.onclick = function() {
						searchQuery = '';
						if (searchInput) {
							searchInput.value = '';
							searchInput.focus();
						}
						searchClear.style.display = 'none';
						updateListOnly();
					};
				}

				bindPillEvents();
			}

			function updatePills() {
				if (!modalEl) return;
				var filterRow = modalEl.querySelector('#pk_sc_filter_row');
				if (filterRow) {
					filterRow.innerHTML = renderPillsHtml();
					bindPillEvents();
				}
			}

			function updateListOnly() {
				if (!modalEl) return;
				var list = modalEl.querySelector('#pk_sc_list_container');
				if (list) {
					var scrollTop = list.scrollTop;
					list.innerHTML = renderListHtml();
					list.scrollTop = scrollTop;
					bindListEvents();
				}
			}

			function updateView() {
				updatePills();
				updateListOnly();
			}

			function startInlineRecording( actionId ) {
				var badge = modalEl.querySelector('#pk_sc_btn_' + actionId);
				if (!badge) return;

				var act = ACTION_MAP[actionId];
				var oldHtml = badge.innerHTML;

				badge.classList.add('pk_sc_recording');
				badge.innerHTML = '<span class="pk_sc_recording_pulse">●</span> Press your desired key combination… <button class="pk_sc_rec_cancel" title="Cancel (Esc)">✕</button>';
				try { badge.focus(); } catch (err) {}

				var cancelBtn = badge.querySelector('.pk_sc_rec_cancel');
				if (cancelBtn) {
					cancelBtn.onclick = function( e ) {
						e.stopPropagation();
						q.stopRecording();
						badge.classList.remove('pk_sc_recording');
						badge.innerHTML = oldHtml;
					};
				}

				function onRecord( res ) {
					badge.classList.remove('pk_sc_recording');

					if (res.cancelled) {
						badge.innerHTML = oldHtml;
						return;
					}

					if (res.modifierOnly) {
						badge.classList.add('pk_sc_recording');
						badge.innerHTML = '<span class="pk_sc_recording_pulse">●</span> ' + escapeHtml(res.partial) + ' <button class="pk_sc_rec_cancel" title="Cancel (Esc)">✕</button>';
						var subCancel = badge.querySelector('.pk_sc_rec_cancel');
						if (subCancel) {
							subCancel.onclick = function( e ) {
								e.stopPropagation();
								q.stopRecording();
								badge.classList.remove('pk_sc_recording');
								badge.innerHTML = oldHtml;
							};
						}
						// Continue recording cleanly
						q.startRecording(actionId, onRecord);
						return;
					}

					var combo = res.combo;
					var result = q.setShortcut(actionId, combo, false);

					if (result.conflict) {
						// Prompt conflict dialog
						q.showConflictDialog(actionId, result.conflictingAction, combo, function( replace ) {
							if (replace) {
								q.setShortcut(actionId, combo, true);
								if (w.OneUp) w.OneUp('Reassigned ' + combo + ' to ' + (act ? act.name : actionId), 1000);
							}
							updateView();
						});
					} else {
						if (w.OneUp) w.OneUp('Saved: ' + (act ? act.name : actionId) + ' → ' + combo, 900);
						updateView();
					}
				}

				q.startRecording(actionId, onRecord);
			}

			var modalTitleHtml = '<div style="display:flex;align-items:center;gap:10px;width:100%;">' +
				'<span style="color:#00E5A3;font-size:16px;">⌨</span>' +
				'<span style="font-size:15px;font-family:Inter,system-ui,sans-serif;font-weight:600;color:#F5F7F6;">Keyboard Shortcuts</span>' +
				'<span style="font-size:11px;color:#A0A8A3;font-weight:400;margin-left:auto;margin-right:16px;">Custom Workstation Bindings</span>' +
				'</div>';

			var modal = new PKSimpleModal({
				title: modalTitleHtml,
				clss: 'pk_settings_modal pk_bigger',
				buttons: [
					{
						title: 'Export JSON',
						clss: 'pk_sc_btn_export',
						callback: function() {
							q.exportJSON();
						}
					},
					{
						title: 'Import JSON',
						clss: 'pk_sc_btn_import',
						callback: function() {
							var fileInput = d.getElementById('pk_sc_import_hidden');
							if (!fileInput) {
								fileInput = d.createElement('input');
								fileInput.type = 'file';
								fileInput.id = 'pk_sc_import_hidden';
								fileInput.accept = '.json,application/json';
								fileInput.style.display = 'none';
								d.body.appendChild(fileInput);
							}
							fileInput.onchange = function( ev ) {
								var file = ev.target.files && ev.target.files[0];
								if (!file) return;
								var reader = new FileReader();
								reader.onload = function( fEv ) {
									var res = q.importJSON(fEv.target.result);
									if (res.error) {
										alert(res.error);
									} else {
										updateView();
									}
								};
								reader.readAsText(file);
								fileInput.value = '';
							};
							fileInput.click();
						}
					},
					{
						title: 'Reset All',
						clss: 'pk_sc_btn_reset_all',
						callback: function() {
							q.showRestoreDefaultsDialog(function( confirmed ) {
								if (confirmed) {
									q.resetAll();
									if (w.OneUp) w.OneUp('All shortcuts restored to defaults', 1000);
									updateView();
								}
							});
						}
					}
				],
				ondestroy: function() {
					q.stopRecording();
					q.activeModal = null;
					if (q.app && q.app.ui && q.app.ui.InteractionHandler) {
						q.app.ui.InteractionHandler.on = false;
					}
				},
				body: renderModalContent(),
				setup: function( m ) {
					modalEl = m.el;
					q.activeModal = m;
					if (q.app && q.app.ui && q.app.ui.InteractionHandler) {
						q.app.ui.InteractionHandler.checkAndSet('modal');
					}
					bindToolbarEvents();
					bindListEvents();
				}
			});

			modal.Show();

			var cancelBtn = modal.el.querySelector('.pk_modal_cancel');
			if (cancelBtn) {
				cancelBtn.innerHTML = '&nbsp; Done &nbsp;';
			}
		};

		// Conflict Confirmation Dialog
		q.showConflictDialog = function( targetActionId, conflictingAction, combo, callback ) {
			var act = ACTION_MAP[targetActionId];
			var bodyHtml = '<div style="font-size:13px;color:#A0A8A3;line-height:1.6;padding:8px 0;">' +
				'The shortcut <kbd class="pk_kbd">' + escapeHtml(combo) + '</kbd> is already assigned to:<br/>' +
				'<div style="background:#181B19;border:1px solid #292E2B;padding:10px 14px;border-radius:4px;margin:12px 0;display:flex;align-items:center;justify-content:space-between;">' +
				'<strong style="color:#F5F7F6;font-size:14px;">' + escapeHtml(conflictingAction.name) + '</strong>' +
				'<span style="color:#f5c542;font-size:11px;font-weight:600;">Currently Active</span>' +
				'</div>' +
				'Assigning this shortcut to <strong style="color:#00E5A3;">' + escapeHtml(act.name) + '</strong> will replace the existing assignment. Would you like to proceed?' +
				'</div>';

			var diag = new PKSimpleModal({
				title: '<span style="color:#f5c542;margin-right:6px;">⚠</span> Shortcut Conflict Detected',
				clss: 'pk_sc_conflict_modal',
				buttons: [
					{
						title: 'Replace Assignment',
						clss: 'pk_modal_a_accpt',
						callback: function( m ) {
							m.Destroy();
							callback(true);
						}
					}
				],
				ondestroy: function() {},
				body: bodyHtml
			});
			diag.Show();
			var cancelBtn = diag.el.querySelector('.pk_modal_cancel');
			if (cancelBtn) {
				cancelBtn.innerHTML = 'Cancel';
				cancelBtn.onclick = function() {
					diag.Destroy();
					callback(false);
				};
			}
		};

		// Restore Defaults Confirmation Dialog
		q.showRestoreDefaultsDialog = function( callback ) {
			var bodyHtml = '<div style="font-size:13px;color:#A0A8A3;line-height:1.6;padding:8px 0;">' +
				'Are you sure you want to reset all keyboard shortcuts to their original factory defaults?<br/><br/>' +
				'<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:10px 14px;border-radius:4px;color:#F5F7F6;">' +
				'⚠ All custom shortcut modifications will be permanently removed.' +
				'</div>' +
				'</div>';

			var diag = new PKSimpleModal({
				title: '<span style="color:#f5c542;margin-right:6px;">↺</span> Restore Defaults Confirmation',
				clss: 'pk_sc_conflict_modal',
				buttons: [
					{
						title: 'Restore Defaults',
						clss: 'pk_modal_a_accpt',
						callback: function( m ) {
							m.Destroy();
							callback(true);
						}
					}
				],
				ondestroy: function() {},
				body: bodyHtml
			});
			diag.Show();
			var cancelBtn = diag.el.querySelector('.pk_modal_cancel');
			if (cancelBtn) {
				cancelBtn.innerHTML = 'Cancel';
				cancelBtn.onclick = function() {
					diag.Destroy();
					callback(false);
				};
			}
		};

		// Help Quick Reference Modal
		q.openHelpModal = function() {
			var isMacOs = isMac;
			var shortcutRow = function ( desc, keys ) {
				return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#111312;border:1px solid #202422;border-radius:4px;">' +
					'<span style="color:#A0A8A3;font-size:12px;font-family:Inter,system-ui,sans-serif;">' + desc + '</span>' +
					'<span style="background:#181B19;border:1px solid #292E2B;color:#00E5A3;font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:600;padding:2px 7px;border-radius:3px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);white-space:nowrap;margin-left:12px;">' + keys + '</span>' +
				'</div>';
			};

			var sectionHeader = function ( icon, title ) {
				return '<div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#00E5A3;margin:14px 0 8px 0;display:flex;align-items:center;gap:6px;font-family:Inter,system-ui,sans-serif;">' +
					'<span>' + icon + '</span> ' + title +
				'</div>';
			};

			var bodyHtml = '<div style="max-width:680px;width:calc(100vw - 44px);max-height:calc(100vh - 280px);overflow-y:auto;overflow-x:hidden;padding-right:4px;-webkit-overflow-scrolling:touch;box-sizing:border-box;">' +
				'<div style="color:#A0A8A3;font-size:12px;margin-bottom:12px;line-height:1.5;">Live keyboard shortcut reference. All shortcuts can be customized in Settings.</div>' +

				sectionHeader ('▶', 'Playback &amp; Transport') +
				'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px;">' +
					shortcutRow ('Play / Pause', q.getEffectiveShortcut('play_toggle')) +
					shortcutRow ('Stop', q.getEffectiveShortcut('play_stop')) +
					shortcutRow ('Play from Beginning', q.getEffectiveShortcut('play_from_start')) +
					shortcutRow ('Toggle Loop Playback', q.getEffectiveShortcut('play_loop')) +
					shortcutRow ('Toggle Metronome', q.getEffectiveShortcut('nav_metronome')) +
					shortcutRow ('Jump to Start', q.getEffectiveShortcut('nav_jump_start')) +
					shortcutRow ('Jump to End', q.getEffectiveShortcut('nav_jump_end')) +
				'</div>' +

				sectionHeader ('✂', 'Audio Editing &amp; Clipboard') +
				'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px;">' +
					shortcutRow ('Split Clip at Playhead', q.getEffectiveShortcut('edit_split')) +
					shortcutRow ('Cut', q.getEffectiveShortcut('edit_cut')) +
					shortcutRow ('Copy', q.getEffectiveShortcut('edit_copy')) +
					shortcutRow ('Paste', q.getEffectiveShortcut('edit_paste')) +
					shortcutRow ('Duplicate Clip', q.getEffectiveShortcut('edit_duplicate')) +
					shortcutRow ('Delete Selected Clip', q.getEffectiveShortcut('edit_delete')) +
					shortcutRow ('Undo', q.getEffectiveShortcut('file_undo')) +
					shortcutRow ('Redo', q.getEffectiveShortcut('file_redo')) +
				'</div>' +

				sectionHeader ('🔍', 'Selection, Zoom &amp; Navigation') +
				'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px;">' +
					shortcutRow ('Select All', q.getEffectiveShortcut('edit_select_all')) +
					shortcutRow ('Select None', q.getEffectiveShortcut('edit_select_none')) +
					shortcutRow ('Zoom In', q.getEffectiveShortcut('nav_zoom_in')) +
					shortcutRow ('Zoom Out', q.getEffectiveShortcut('nav_zoom_out')) +
					shortcutRow ('Fit Timeline to Window', q.getEffectiveShortcut('nav_zoom_fit')) +
					shortcutRow ('Add Marker', q.getEffectiveShortcut('edit_add_marker')) +
					shortcutRow ('Previous / Next Marker', q.getEffectiveShortcut('nav_prev_marker') + ' / ' + q.getEffectiveShortcut('nav_next_marker')) +
					shortcutRow ('Toggle Snap', q.getEffectiveShortcut('edit_toggle_snap')) +
				'</div>' +

				sectionHeader ('🎛', 'Multitrack &amp; Workspace') +
				'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px;">' +
					shortcutRow ('Toggle Multitrack View', q.getEffectiveShortcut('mt_toggle_view')) +
					shortcutRow ('Toggle Mixer', q.getEffectiveShortcut('mt_toggle_mixer')) +
					shortcutRow ('Add Track', q.getEffectiveShortcut('mt_add_track')) +
					shortcutRow ('Mute Selected Track', q.getEffectiveShortcut('edit_mute_track')) +
					shortcutRow ('Solo Selected Track', q.getEffectiveShortcut('edit_solo_track')) +
					shortcutRow ('Open Effects', q.getEffectiveShortcut('fx_open')) +
					shortcutRow ('Toggle Fullscreen', q.getEffectiveShortcut('view_fullscreen')) +
					shortcutRow ('Save Project', q.getEffectiveShortcut('file_save')) +
				'</div>' +

				'<div style="margin-top:16px;text-align:right;">' +
				'<button id="pk_sc_open_settings_from_help" class="pk_modal_a_bottom pk_modal_a_accpt" style="float:none;display:inline-block;">⚙ Customize Shortcuts in Settings…</button>' +
				'</div>' +
			'</div>';

			var modal = new PKSimpleModal({
				title: '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#00E5A3;font-size:15px;">⌨</span><span style="font-size:14px;font-family:Inter,system-ui,sans-serif;font-weight:600;color:#F5F7F6;">Keyboard Shortcuts Reference</span><span style="font-size:11px;color:#A0A8A3;margin-left:auto;">Mixota Quick Help</span></div>',
				clss: 'pk_bigger',
				ondestroy: function() {
					if (q.app && q.app.ui && q.app.ui.InteractionHandler) {
						q.app.ui.InteractionHandler.on = false;
					}
				},
				body: bodyHtml,
				setup: function( m ) {
					if (q.app && q.app.ui && q.app.ui.InteractionHandler) {
						q.app.ui.InteractionHandler.checkAndSet('modal');
					}
					var btn = m.el.querySelector('#pk_sc_open_settings_from_help');
					if (btn) {
						btn.onclick = function() {
							m.Destroy();
							setTimeout(function() {
								q.openSettingsModal();
							}, 50);
						};
					}
				}
			});

			modal.Show();

			var cancelBtn = modal.el.querySelector('.pk_modal_cancel');
			if (cancelBtn) {
				cancelBtn.innerHTML = '&nbsp; Close &nbsp;';
			}
		};
	}

	// Singleton shortcut manager instance
	var shortcutManagerInstance = new ShortcutManager();
	PKAE.ShortcutManager = shortcutManagerInstance;

	// Legacy KeyHandler for backward-compatibility with existing modal/transient listeners
	function KeyHandler( uiInstance ) {
		var q = this;
		q.ui = uiInstance;
		q.keyMap = {};
		q.callbacks = {};
		q.singleCallbacks = {};
		q.mac = isMac;

		q.isAccel = function( e ) {
			return e && (q.mac ? e.metaKey : e.ctrlKey) && !e.altKey;
		};

		q.isEditTarget = function( e ) {
			return shortcutManagerInstance.isEditTarget(e);
		};

		q.addCallback = function( callback_name, callback_function, keys ) {
			q.callbacks[callback_name] = {
				keys: keys,
				callback: callback_function
			};
		};

		q.addSingleCallback = function( callback_name, callback_function, key ) {
			q.singleCallbacks[callback_name] = {
				key: key,
				callback: callback_function
			};
		};

		q.removeCallback = function( callback_name ) {
			q.callbacks[callback_name] = null;
			delete q.callbacks[callback_name];
		};

		d.addEventListener('keydown', function( e ) {
			q.keyDown(e.keyCode, e);
		});

		q.keyDown = function( keyCode, e ) {
			q.keyMap[keyCode] = 1;

			for (var key in q.callbacks) {
				var group = q.callbacks[key];
				if (!group) continue;
				if (keyCode !== group.keys[group.keys.length - 1]) continue;

				var l = group.keys.length;
				var all_ok = true;
				while (l-- > 0) {
					if (!q.keyMap[group.keys[l]]) {
						all_ok = false;
						break;
					}
				}

				all_ok && group.callback && group.callback(keyCode, q.keyMap, e);
			}
		};

		q.keyUp = function( keyCode ) {
			q.keyMap[keyCode] = 0;
		};

		q.keyPress = function( keyCode, e ) {
			if (q.isEditTarget(e)) return;
			for (var key in q.singleCallbacks) {
				var group = q.singleCallbacks[key];
				if (!group) continue;
				if (group.key === keyCode) {
					group.callback && group.callback(e);
				}
			}
		};

		d.addEventListener('keyup', function( e ) {
			q.keyUp(e.keyCode);
		});

		d.addEventListener('keypress', function( e ) {
			q.keyPress(e.keyCode, e);
		});

		w.addEventListener('blur', function() {
			q.keyMap = {};
		}, false);

		d.addEventListener('contextmenu', function( e ) {
			e.preventDefault();
		}, false);
	}

	PKAE._deps.keyhandler = KeyHandler;

})( window, document, PKAudioEditor );
