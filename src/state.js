(function ( PKAE ) {
	'use strict';
	
	function PKState ( _depth, app ) {
		if (!_depth) _depth = 1;

		var q = this;

		var _id = 1;
		var _fireEvent = app.fireEvent;
		var _listenFor = app.listenFor;

		var undo_state_list = [];
		var redo_state_list = [];

		// Snapshots retain full audio buffers, so long files can hold
		// gigabytes hostage well before the depth cap is reached. Keep
		// the total retained bytes bounded across both undo and redo lists.
		// Adapt _min_keep based on individual buffer sizes so large recordings
		// don't exhaust browser heap (default 10 steps, down to 2 for massive files).
		var _max_bytes = (app && app.isMobile) ? (384 * 1024 * 1024) : (1.5 * 1024 * 1024 * 1024);
		var _min_keep  = 10;

		function getEffectiveMinKeep ( sampleBuffer ) {
			if (!sampleBuffer || !sampleBuffer.length) return _min_keep;
			var ch = sampleBuffer.numberOfChannels || 1;
			var bufferBytesSize = sampleBuffer.length * ch * 4;
			if (bufferBytesSize <= 0) return _min_keep;
			var safeCount = Math.floor((_max_bytes * 0.70) / bufferBytesSize);
			return Math.max( 2, Math.min( _min_keep, safeCount ) );
		}

		function bufferBytes ( b, seen ) {
			if (!b || !b.length || !b.numberOfChannels || seen.indexOf ( b ) !== -1) return 0;
			seen.push ( b );
			return b.length * b.numberOfChannels * 4;
		}

		function stateBytes ( state, seen ) {
			var total = bufferBytes ( state && state.data, seen );
			var clips = state && state.mt && state.mt.clips;
			if (clips)
				for (var i = 0; i < clips.length; ++i)
					total += bufferBytes ( clips[i] && clips[i].buffer, seen );
			return total;
		}

		function seedLiveMultitrackBuffers ( seen, pending_editor_buffer ) {
			var mt = app.multitrack && app.multitrack.getState ?
				app.multitrack.getState () : null;
			var clips = mt && mt.clips;
			if (clips)
				for (var i = 0; i < clips.length; ++i) {
					var b = clips[i] && clips[i].buffer;
					if (b && b !== pending_editor_buffer && seen.indexOf ( b ) === -1) seen.push ( b );
				}
		}

		function liveEditorBuffer () {
			var eng = app.engine;
			return eng && eng.wavesurfer && eng.wavesurfer.backend ?
				eng.wavesurfer.backend.buffer : null;
		}

		function trimForMemory () {
			var uLen = undo_state_list.length;
			var rLen = redo_state_list.length;
			if (uLen === 0 && rLen === 0) return ;

			var live = liveEditorBuffer ();
			var sampleBuf = live || (uLen > 0 && undo_state_list[uLen - 1] && undo_state_list[uLen - 1].data);
			var effectiveMinKeep = getEffectiveMinKeep( sampleBuf );

			var seen = [];
			var newest = uLen > 0 ? undo_state_list[uLen - 1] : null;
			var pending = newest && !newest.type && newest.data === live ?
				live : null;
			if (live && !pending) seen.push ( live );
			seedLiveMultitrackBuffers ( seen, pending );

			// 1. Account for undo states from newest to oldest
			var undoBytesArr = [];
			var totalUndo = 0;
			for (var i = uLen - 1; i >= 0; --i) {
				var addU = stateBytes ( undo_state_list[i], seen );
				undoBytesArr[i] = addU;
				totalUndo += addU;
			}

			// 2. Account for redo states (nearest index 0 to furthest)
			var redoBytesArr = [];
			var totalRedo = 0;
			for (var j = 0; j < rLen; ++j) {
				var addR = stateBytes ( redo_state_list[j], seen );
				redoBytesArr[j] = addR;
				totalRedo += addR;
			}

			var total = totalUndo + totalRedo;
			if (total <= _max_bytes) return ;

			// 3. Trim oldest redo states first (furthest into future)
			while (redo_state_list.length > 0 && total > _max_bytes) {
				var lastRedoIdx = redo_state_list.length - 1;
				total -= (redoBytesArr[lastRedoIdx] || 0);
				redo_state_list.pop ();
			}

			if (total <= _max_bytes) return ;

			// 4. Trim oldest undo states, respecting effectiveMinKeep
			for (var k = 0; k < undo_state_list.length; ++k) {
				if ((undo_state_list.length - k) <= effectiveMinKeep) break;
				var freed = undoBytesArr[k] || 0;
				total -= freed;
				if (total <= _max_bytes) {
					undo_state_list.splice ( 0, k + 1 );
					return ;
				}
			}

			if (total > _max_bytes && undo_state_list.length > effectiveMinKeep) {
				undo_state_list.splice ( 0, undo_state_list.length - effectiveMinKeep );
			}
		}

		function currentStateFor ( state ) {
			var current = {
				data: app.engine.wavesurfer.backend.buffer
			};
			if (state.type === 'mult' && app.multitrack)
				current.mt = app.multitrack.getState ();
			if (state.type === 'mrk' && app.mrk)
				current.markers = app.mrk.ser (state.ctx);
			return current;
		}

		function updateStateData ( state, current ) {
			state.data = current.data;
			if (current.mt) state.mt = current.mt;
			if (current.markers) state.markers = current.markers;
		}

		q.getLastUndoState = function () {
			return (undo_state_list [ undo_state_list.length - 1]);
		};

		q.pushUndoState = function ( state ) {
			if (!state) return (false);

			if (!state.id) state.id = ++_id;
			if (undo_state_list.length >= _depth) undo_state_list.shift ();

			if (undo_state_list.length > 0)
			{
				if (undo_state_list[undo_state_list.length - 1].id !== state.id - 1)
					undo_state_list = [];
			}
			if (redo_state_list.length > 0)
			{
				if (redo_state_list[0].id !== state.id + 1)
					redo_state_list = [];
			}

			undo_state_list.push ( state );
			trimForMemory ();

			_fireEvent ( 'StatePush', undo_state_list.length );
			_fireEvent ( 'DidStateChange', undo_state_list, redo_state_list);

			return (true);
		};

		q.popUndoState = function () {
			var last_state =undo_state_list.pop ();

			if (last_state) {
				var current = currentStateFor ( last_state );

				_fireEvent ( 'StateDidPop', last_state, 1 );

				// a listener that could not apply the snapshot flags it -
				// put the entry back untouched so history is not corrupted
				if (last_state._restore_failed) {
					delete last_state._restore_failed;
					undo_state_list.push ( last_state );
					_fireEvent ( 'DidStateChange', undo_state_list, redo_state_list);
					return ( null );
				}

				if (redo_state_list.length > 0)
				{
					if (redo_state_list[0].id !== last_state.id + 1)
						redo_state_list = [];
				}

				updateStateData ( last_state, current );
				if (redo_state_list.length >= _depth) redo_state_list.pop ();
				redo_state_list.unshift (last_state);
				trimForMemory ();

				_fireEvent ( 'DidStateChange', undo_state_list, redo_state_list);
			}

			return (last_state);
		};
		
		q.shiftRedoState = function () {
			var last_state = redo_state_list.shift ();

			if (last_state) {
				var current = currentStateFor ( last_state );

				_fireEvent ( 'StateDidPop', last_state, 0 );

				// see popUndoState - a failed restore must be a no-op
				if (last_state._restore_failed) {
					delete last_state._restore_failed;
					redo_state_list.unshift ( last_state );
					_fireEvent ( 'DidStateChange', undo_state_list, redo_state_list);
					return ( null );
				}

				if (undo_state_list.length > 0)
				{
					if (undo_state_list[undo_state_list.length - 1].id !== last_state.id - 1)
						undo_state_list = [];
				}

				updateStateData ( last_state, current );
				undo_state_list.push (last_state);

				_fireEvent ( 'DidStateChange', undo_state_list, redo_state_list);
			}

			return (last_state);
		};
		
		q.clearAllState = function () {
			undo_state_list = [];
			redo_state_list = [];

			_fireEvent ( 'StateClearAll' );
			_fireEvent ( 'DidStateChange', [], []);
		};

		_listenFor ('StateRequestPush', function ( _state ) {
			q.pushUndoState ( _state );
		});
		_listenFor ('StateRequestUndo', function () {
			q.popUndoState ();
		});
		_listenFor ('StateRequestRedo', function () {
			q.shiftRedoState ();
		});
		_listenFor ('StateRequestClearAll', function () {
			q.clearAllState ();
		});
		_listenFor ('StateRequestLastState', function () {
			_fireEvent ('StateDidLastState', q.getLastUndoState ());
		});
		// -
	};
	
	PKAE._deps.state = PKState;
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = { PKState };
	}
	
})( typeof PKAudioEditor !== 'undefined' ? PKAudioEditor : (typeof window !== 'undefined' ? (window.PKAudioEditor = { _deps: {} }) : { _deps: {} }) );
