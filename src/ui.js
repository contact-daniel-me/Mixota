(function ( w, d, PKAE ) {
	'use strict';

	//
	// MAIN UI CLASS
	function activeMultitrackFor ( app ) {
		var mt = (app && app.multitrack) || (PKAE && PKAE.multitrack);
		var root = (app && app.el) || (PKAE && PKAE.el);
		return mt &&
			mt.IsOn &&
			(mt.IsOn () || (root && root.classList.contains ('pk_mt_on'))) ?
			mt :
			null;
	}

	function activeCursorTimeFor ( app ) {
		var mt = activeMultitrackFor ( app );
		var ws = app.engine && app.engine.wavesurfer;
		return mt ? mt.GetCursor () : (ws ? ws.getCurrentTime () : 0);
	}

	function activeDurationFor ( app ) {
		var mt = activeMultitrackFor ( app );
		var ws = app.engine && app.engine.wavesurfer;
		return mt ? mt.GetDuration () : (ws ? ws.getDuration () : 0);
	}

	function activeRegionFor ( app ) {
		var mt = activeMultitrackFor ( app );
		var ws = app.engine && app.engine.wavesurfer;
		return mt && mt.GetRegion ? mt.GetRegion () :
			(ws && ws.regions ? ws.regions.list[0] : null);
	}

	function activeZoomFor ( app ) {
		var mt = activeMultitrackFor ( app );
		var ws = app.engine && app.engine.wavesurfer;
		return mt ?
			(mt.GetSeekZoomFactor ? mt.GetSeekZoomFactor () : mt.GetZoomFactor ()) :
			(ws ? ws.ZoomFactor : 1);
	}

	function activeSeekRampFor ( app ) {
		return 0.15;
	}

	function activeSeekWarmupFor ( app ) {
		return 2;
	}

	function activeReadyFor ( app ) {
		return !!activeMultitrackFor ( app ) ||
			!!(app.engine && app.engine.is_ready);
	}

	function seekMarkerEdgeFor ( app, dir ) {
		return !!(app.mrk && app.mrk.edge && app.mrk.edge (dir));
	}

	function seekRegionMarkerEdgeFor ( app, dir ) {
		var mt = activeMultitrackFor ( app );
		var r = activeRegionFor ( app );
		var total = activeDurationFor ( app );
		var pos, start, end;

		if (r && total > 0) {
			pos = mt ? (mt.GetMarker ? mt.GetMarker () : mt.GetCursor ()) :
				app.engine.wavesurfer.ActiveMarker;
			start = mt ? r.start : r.start / total;
			end = mt ? r.end : r.end / total;

			if (dir < 0) {
				if (pos > end + 0.004) {
					app.fireEvent ('RequestSeekTo', (r.end / total) - 0.0001);
					return true;
				}
				if (pos > start + 0.004) {
					app.fireEvent ('RequestSeekTo', r.start / total);
					return true;
				}
			}
			else {
				if (pos < start - 0.004) {
					app.fireEvent ('RequestSeekTo', r.start / total);
					return true;
				}
				if (pos < end - 0.004) {
					app.fireEvent ('RequestSeekTo', r.end / total);
					return true;
				}
			}
		}

		if (seekMarkerEdgeFor (app, dir)) return true;
		app.fireEvent ('RequestSeekTo', dir < 0 ? 0 : 1);
		return true;
	}

	var PKUI = function( app ) {
		var q = this;

		this.el = app.el;

		// if mobile add proper class
		this.el.className += ' pk_app' + (app.isMobile ? ' pk_mob' : '');
		
		// hold refferences to the event functions
		this.fireEvent = app.fireEvent;
		this.listenFor = app.listenFor;

		// keep track of the active UI element
		this.InteractionHandler = {
			on  : false,
			by  : null,
			arr : [],

			check: function ( _name ) {
				if (this.on && this.by !== _name) {
					return (false);
				}
				return (true);
			},

			checkAndSet: function ( _name ) {
				if (!this.check (_name))
					return (false);

				this.on = true;
				this.by = _name;

				return (true);
			},

			forceSet: function ( _name ) {
				if (this.on)
				{
					this.arr.push ({
						on: this.on,
						by: this.by
					});
				}

				this.on = true;
				this.by = _name;
			},

			forceUnset: function ( _name ) {
				if (this.check (_name))
				{
					var prev = this.arr.pop ();
					if (prev)
					{
						this.on = prev.on;
						this.by = prev.by;
					}
					else
					{
						this.on = false;
						this.by = null;
					}
				}
				// ---
			}
		};

		if (app.isMobile)
		{
			d.body.className = 'pk_stndln';
			var fxd = d.createElement ('div');
			fxd.className = 'pk_fxd';
			fxd.appendChild (this.el);

			d.body.appendChild (fxd);

			_makeMobileScroll (this);
		}

		this.KeyHandler = new app._deps.keyhandler ( this ); // initializing keyhandler
		this.TopHeader  = new _makeUITopHeader ( _topbarConfig ( app ), this ); // topmost menu
		this.Toolbar    = new _makeUIToolbar ( this ); // main toolbar and controls
		this.footer     = new _makeUIMainView ( this, app );
		this.BarBtm     = new _makeUIBarBottom (this, app);
		this.MainHeight = function () {
			var h = app.isMobile && w.visualViewport ? w.visualViewport.height : w.innerHeight;
			var used = 0;
			var root = this.el;
			var hdr = root.getElementsByClassName ('pk_hdr')[0];
			var tbc = root.getElementsByClassName ('pk_tbc')[0];
			var ftr = root.getElementsByClassName ('pk_ftr')[0];
			var mst = root.getElementsByClassName ('pk_mastering_panel')[0];
			if (hdr) used += hdr.offsetHeight;
			if (tbc) used += tbc.offsetHeight;
			if (ftr) used += ftr.offsetHeight;
			if (mst && root.classList.contains ('pk_mastering_on')) used += mst.offsetHeight;
			if (this.BarBtm && this.BarBtm.on) used += this.BarBtm.height;
			return Math.max (112, h - used);
		};
		if (app.isMobile && w.visualViewport) {
			var resize_raf = 0;
			w.visualViewport.addEventListener ('resize', function () {
				if (resize_raf) return ;
				resize_raf = w.requestAnimationFrame (function () {
					resize_raf = 0;
					app.fireEvent ('RequestResize');
				});
			});
		}

		this.Dock      = function ( id, arg1, arg2 ) {
			app.fireEvent (id, arg1, arg2);
		};
		this.GetActiveCursor = function () {
			return activeCursorTimeFor ( app );
		};

		app.listenFor ('ShowError', function( message ) {
			new PKSimpleModal ({
				title : 'Oops! Something is not right',
				clss:'pk_modal_anim',
				ondestroy : function( q ) {
					app.ui.InteractionHandler.on = false;
					app.ui.KeyHandler.removeCallback ('modalTempErr');
				},
				buttons:[],
				body:'<p>' + message + '</p>',
				setup:function( q ) {
					app.fireEvent ('RequestPause');
					app.fireEvent( 'RequestRegionClear');

					app.ui.InteractionHandler.checkAndSet ('modal');
					app.ui.KeyHandler.addCallback ('modalTempErr', function ( e ) {
						q.Destroy ();
					}, [27]);
				}
			}).Show ();
		});

		app.listenFor ('RequestKeyDown', function ( key ) {
			q.KeyHandler.keyDown ( key, null );
			q.KeyHandler.keyUp ( key );
		});
	};


	//top bar config list
	function _topbarConfig ( app, ui ) {
		function openShortcutsModal () {
			if (PKAudioEditor && PKAudioEditor.ShortcutManager && PKAudioEditor.ShortcutManager.openHelpModal) {
				PKAudioEditor.ShortcutManager.openHelpModal ();
			}
		}

		function openSettingsModal ( initialCategory ) {
			if (PKAudioEditor && PKAudioEditor.ShortcutManager && PKAudioEditor.ShortcutManager.openSettingsModal) {
				PKAudioEditor.ShortcutManager.openSettingsModal ( initialCategory );
			}
		}

		if (app && app.ui) {
			app.ui.openShortcutsModal = openShortcutsModal;
			app.ui.openSettingsModal  = openSettingsModal;
		}
		if (w.PKAudioEditor) {
			w.PKAudioEditor.openShortcutsModal = openShortcutsModal;
			w.PKAudioEditor.openSettingsModal  = openSettingsModal;
		}

		// =========================================================================
		// Mixota File Menu Helpers & Modal Implementations
		// =========================================================================
		var isMac = !!(navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0);

		function openExportModal ( app, defaultFormat, selectionOnly ) {
			var mt_on = activeMultitrackFor ( app );
			var mtHasClips = app.multitrack && app.multitrack.HasClips && app.multitrack.HasClips();
			var engineReady = app.engine && app.engine.is_ready;

			if (!engineReady && !mt_on && !mtHasClips) {
				new PKSimpleModal ({
					title: 'Export Audio',
					body: '<div style="padding:14px 4px;line-height:1.6;font-size:13px;">' +
						'<div style="font-weight:600;font-size:14px;color:#F3F5F4;margin-bottom:6px;">No audio loaded to export</div>' +
						'<div style="color:#9CA39F;">Please import an audio file, record from your microphone, or try the demo track before exporting.</div>' +
						'</div>',
					buttons: [
						{
							title: 'Import Audio',
							clss: 'pk_modal_a_accpt',
							callback: function ( q ) {
								q.Destroy ();
								app.fireEvent ('RequestLoadLocalFile');
							}
						},
						{
							title: 'Try Demo Track',
							callback: function ( q ) {
								q.Destroy ();
								app.engine.LoadSample ('test.mp3');
							}
						},
						{
							title: 'Cancel',
							callback: function ( q ) {
								q.Destroy ();
							}
						}
					]
				}).Show ();
				return ;
			}

			var defaultName = (app.projectTitle || (w.localStorage && w.localStorage.getItem ('pk_project_title')) || 'mixota-output').trim ();
			defaultName = defaultName.replace (/\.[^/.]+$/, '');
			var ext = defaultFormat ? ('.' + defaultFormat) : (mt_on ? '.mp3' : '.mp3');

			new PKSimpleModal ({
				title: 'Export / Download Audio',
				ondestroy: function ( q ) {
					app.ui.InteractionHandler.on = false;
					app.ui.KeyHandler.removeCallback ('modalTemp');
				},
				buttons: [
					{
						title: 'Export',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) {
							var input = q.el_body.getElementsByTagName ('input')[0];
							var value = input.value.trim () || 'mixota-output';

							var format = 'mp3';
							var kbps = 128;
							var export_sel = false;
							var stereo = false;
							var bit_depth = 16;

							var radios = q.el_body.getElementsByClassName ('pk_check');
							var l = radios.length;
							while (l-- > 0) {
								if (radios[l].checked) {
									if (radios[l].name === 'frmtex') {
										format = radios[l].value;
									} else if (radios[l].name === 'xport') {
										if (radios[l].value === 'sel') {
											var region = activeRegionFor ( app );
											if (!region) export_sel = false;
											else export_sel = [region.start, region.end];
										}
									} else if (radios[l].name === 'chnl') {
										if (radios[l].value === 'stereo') {
											stereo = true;
										}
									} else if (radios[l].name === 'wavbits') {
										bit_depth = radios[l].value / 1;
									} else {
										kbps = radios[l].value / 1;
									}
								}
							}
							var dither_chk = document.getElementById ('wav-dither');
							var dither = !!(dither_chk && dither_chk.checked);

							if (format === 'amss') {
								var mt = activeMultitrackFor ( app );
								if (mt) mt.ExportSession ( value );
								q.Destroy ();
								return ;
							}

							if (format === 'flac') {
								var flacComp = document.getElementById ('flac-comp');
								kbps = flacComp ? (flacComp.value / 1) : 5;
							}

							var target_sample_rate = null;
							var rateRadios = q.el_body.getElementsByClassName ('pk_check');
							var rl = rateRadios.length;
							while (rl-- > 0) {
								if (rateRadios[rl].checked && rateRadios[rl].name === 'smplrate') {
									if (rateRadios[rl].value !== 'orig') {
										target_sample_rate = parseInt (rateRadios[rl].value, 10);
									}
									break;
								}
							}

							app.engine.DownloadFile ( value, format, kbps, export_sel, stereo, bit_depth, dither, target_sample_rate );
							q.Destroy ();
						}
					},
					(mt_on ? {
						title: '⤓ Export Stems',
						callback: function ( q ) {
							var format = 'wav';
							var kbps = 128;
							var bit_depth = 16;
							var target_sample_rate = null;
							var radios = q.el_body.getElementsByClassName ('pk_check');
							var l = radios.length;
							while (l-- > 0) {
								if (radios[l].checked) {
									if (radios[l].name === 'frmtex') format = radios[l].value;
									else if (radios[l].name === 'wavbits') bit_depth = radios[l].value / 1;
									else if (radios[l].name === 'smplrate') {
										if (radios[l].value !== 'orig') target_sample_rate = parseInt (radios[l].value, 10);
									} else {
										kbps = radios[l].value / 1;
									}
								}
							}
							var dither_chk = document.getElementById ('wav-dither');
							var dither = !!(dither_chk && dither_chk.checked);
							if (format === 'flac') {
								var flacComp = document.getElementById ('flac-comp');
								kbps = flacComp ? (flacComp.value / 1) : 5;
							}
							if (app.multitrack && app.multitrack.ExportStems) {
								app.multitrack.ExportStems (format, kbps, bit_depth, dither, target_sample_rate);
							}
							q.Destroy ();
						}
					} : null)
				].filter(Boolean),
				body: '<div class="pk_row"><label for="k0">File Name</label>' + 
					'<input style="min-width:250px" placeholder="filename" value="' + defaultName + ext + '" ' +
					'class="pk_txt" type="text" id="k0" /></div>'+

					'<div class="pk_row" id="frmtex" style="padding-bottom:4px"><label style="display:inline">Format</label>'+
					'<input type="radio" class="pk_check" id="k01" name="frmtex" ' + (defaultFormat === 'mp3' || (!defaultFormat && !mt_on) ? 'checked' : '') + ' value="mp3">'+
					'<label for="k01">mp3</label>' +
					'<input type="radio" class="pk_check" id="k02" name="frmtex" ' + (defaultFormat === 'wav' ? 'checked' : '') + ' value="wav">'+  
					'<label for="k02">wav <i>(PCM)</i></label>' +
					'<input type="radio" class="pk_check" id="k03" name="frmtex" ' + (defaultFormat === 'flac' ? 'checked' : '') + ' value="flac">'+  
					'<label for="k03">flac</label>' +
					'<br class="pk_amss"><input type="radio" class="pk_check pk_amss" id="k04" name="frmtex" value="amss">'+
					'<label class="pk_amss" for="k04">session file (.amss / .mixota)</label>' +
					'</div>' +

					'<div class="pk_row" id="frmtex-mp3" style="' + (defaultFormat && defaultFormat !== 'mp3' ? 'display:none;' : '') + '"><input type="radio" class="pk_check" id="k1" name="rdslnc" value="128">'+ 
					'<label for="k1">128kbps</label>' +
					'<input type="radio" class="pk_check" id="k2" name="rdslnc" checked value="192">'+
					'<label for="k2">192kbps (Standard)</label>'+
					'<input type="radio" class="pk_check" id="k3" name="rdslnc" value="256">'+
					'<label for="k3">256kbps (High)</label></div>'+

					'<div class="pk_row" style="' + (defaultFormat === 'flac' ? 'display:block;' : 'display:none;') + '" id="frmtex-flac">'+
					'<label>Flac: Compression Level</label>'+
					'<input type="range" class="pk_horiz" min="0" max="8" step="1" value="5" id="flac-comp">'+
					'<span class="pk_val" style="float:left;margin-left:15px">5</span></div>' +

					'<div class="pk_row" style="' + (defaultFormat === 'wav' ? 'display:block;' : 'display:none;') + '" id="frmtex-wav">'+
					'<input type="radio" class="pk_check" id="kwb1" name="wavbits" checked value="16">'+
					'<label for="kwb1">16-bit (CD Standard)</label>'+
					'<input type="radio" class="pk_check" id="kwb2" name="wavbits" value="24">'+
					'<label for="kwb2">24-bit (Studio HD)</label>'+
					'<input type="radio" class="pk_check" id="kwb3" name="wavbits" value="32">'+
					'<label for="kwb3">32-bit float</label>'+
					'<div id="wav-dither-wrap" style="margin-top:6px">'+
					'<input type="checkbox" class="pk_check" id="wav-dither">'+
					'<label for="wav-dither">TPDF dither</label>'+
					'</div></div>' +

					'<div class="pk_row" id="frmtex-rate" style="padding-bottom:4px"><label style="display:inline">Sample Rate</label>' +
					'<input type="radio" class="pk_check" id="ksr0" name="smplrate" checked value="orig">' +
					'<label for="ksr0" id="ksr0-lbl">Project Native</label>' +
					'<input type="radio" class="pk_check" id="ksr1" name="smplrate" value="44100">' +
					'<label for="ksr1">44.1 kHz</label>' +
					'<input type="radio" class="pk_check" id="ksr2" name="smplrate" value="48000">' +
					'<label for="ksr2">48.0 kHz</label>' +
					'<input type="radio" class="pk_check" id="ksr3" name="smplrate" value="96000">' +
					'<label for="ksr3">96.0 kHz</label>' +
					'</div>' +

					'<div class="pk_row" style="padding-bottom:5px">' +
					'<input type="radio" class="pk_check" id="k6" name="chnl" checked value="mono">'+
					'<label for="k6">Mono</label>'+
					'<input type="radio" class="pk_check pk_stereo" id="k7" name="chnl" value="stereo">'+
					'<label for="k7">Stereo</label>'+
					'</div>'+
					'<div class="pk_row">' + 
					'<input type="radio" class="pk_check" id="k4" name="xport" ' + (!selectionOnly ? 'checked' : '') + ' value="whole">'+
					'<label for="k4">Export whole audio</label>'+
					'<input type="radio" class="pk_check" id="k5" name="xport" ' + (selectionOnly ? 'checked' : '') + ' value="sel">'+
					'<label class="pk_lblmp3" for="k5">Export Selection Only</label></div>' +

					'<div class="pk_export_summary_bar" id="pk_export_sum_bar">' +
					'<span class="pk_export_sum_badge">SELECTED SETTINGS</span>' +
					'<span id="pk_export_sum_txt">Configuring export...</span>' +
					'</div>',

				setup: function ( q ) {
					var wv = PKAudioEditor.engine.wavesurfer;
					var region = activeRegionFor ( app );
					if (!region) {
						var lbl = q.el_body.getElementsByClassName ('pk_lblmp3')[0];
						if (lbl) lbl.className = 'pk_dis';
					}

					var chan_num = mt_on ? 2 : (wv && wv.backend && wv.backend.buffer ? wv.backend.buffer.numberOfChannels : 1);
					if (chan_num === 2) {
						var stereoRad = q.el_body.getElementsByClassName ('pk_stereo')[0];
						if (stereoRad) stereoRad.checked = true;
					}

					var nativeRate = (wv && wv.backend && wv.backend.buffer && wv.backend.buffer.sampleRate) ||
					                 (wv && wv.backend && wv.backend.ac && wv.backend.ac.sampleRate) || 48000;
					var origRateLbl = q.el_body.querySelector ('#ksr0-lbl');
					if (origRateLbl) origRateLbl.innerText = 'Project Native (' + (nativeRate / 1000).toFixed(1) + ' kHz)';

					function updateExportSummary () {
						var sumTxt = q.el_body.querySelector ('#pk_export_sum_txt');
						if (!sumTxt) return ;
						var fmt = 'MP3';
						var fmtRadios = q.el_body.querySelectorAll ('input[name="frmtex"]');
						for (var i = 0; i < fmtRadios.length; i++) {
							if (fmtRadios[i].checked) { fmt = fmtRadios[i].value.toUpperCase(); break; }
						}
						var sr = 'Native (' + (nativeRate / 1000).toFixed(1) + ' kHz)';
						var srRadios = q.el_body.querySelectorAll ('input[name="smplrate"]');
						for (var i = 0; i < srRadios.length; i++) {
							if (srRadios[i].checked) {
								if (srRadios[i].value !== 'orig') sr = (parseInt(srRadios[i].value, 10) / 1000).toFixed(1) + ' kHz';
								break;
							}
						}
						var ch = 'Mono';
						var chRadios = q.el_body.querySelectorAll ('input[name="chnl"]');
						for (var i = 0; i < chRadios.length; i++) {
							if (chRadios[i].checked) { ch = chRadios[i].value === 'stereo' ? 'Stereo' : 'Mono'; break; }
						}
						var rng = 'Whole Audio';
						var rngRadios = q.el_body.querySelectorAll ('input[name="xport"]');
						for (var i = 0; i < rngRadios.length; i++) {
							if (rngRadios[i].checked) { rng = rngRadios[i].value === 'sel' ? 'Selection' : 'Whole Audio'; break; }
						}
						var detail = '';
						if (fmt === 'WAV') {
							var wbRadios = q.el_body.querySelectorAll ('input[name="wavbits"]');
							for (var i = 0; i < wbRadios.length; i++) {
								if (wbRadios[i].checked) { detail = ' ' + wbRadios[i].value + '-bit'; break; }
							}
						} else if (fmt === 'MP3') {
							var mpRadios = q.el_body.querySelectorAll ('input[name="rdslnc"]');
							for (var i = 0; i < mpRadios.length; i++) {
								if (mpRadios[i].checked) { detail = ' ' + mpRadios[i].value + 'kbps'; break; }
							}
						}
						sumTxt.innerText = fmt + detail + ' • ' + sr + ' • ' + ch + ' • ' + rng;
					}

					q.el_body.addEventListener ('change', updateExportSummary);
					setTimeout (updateExportSummary, 20);

					app.fireEvent ('RequestPause');
					app.ui.InteractionHandler.checkAndSet ('modal');
					app.ui.KeyHandler.addCallback ('modalTemp', function () {
						q.Destroy ();
					}, [27]);

					setTimeout (function () {
						if (!q.el) return ;
						var inputtxt = q.el.getElementsByTagName ('input')[0];
						inputtxt && inputtxt.select ();

						var format = document.getElementById ('frmtex');
						var mp3conf = document.getElementById ('frmtex-mp3');
						var flacconf = document.getElementById ('frmtex-flac');
						var wavconf = document.getElementById ('frmtex-wav');
						var ditherWrap = document.getElementById ('wav-dither-wrap');
						var amss = q.el_body.getElementsByClassName ('pk_amss');

						function setDitherFor ( bits ) {
							var on = bits === 16;
							var dchk = document.getElementById ('wav-dither');
							if (dchk) dchk.disabled = !on;
							if (ditherWrap) ditherWrap.classList.toggle ('pk_inact', !on);
						}
						function showConf ( m, f, w ) {
							if (mp3conf) mp3conf.style.display = m ? 'block' : 'none';
							if (flacconf) flacconf.style.display = f ? 'block' : 'none';
							if (wavconf) wavconf.style.display = w ? 'block' : 'none';
						}
						var k6 = document.getElementById ('k6');
						var k7 = document.getElementById ('k7');
						if (!mt_on) {
							for (var x = 0; x < amss.length; ++x) amss[x].style.display = 'none';
						}
						function setExt ( ext ) {
							if (inputtxt) inputtxt.value = inputtxt.value.replace (/\.(mp3|wav|flac|amss|mixota)$/i, '') + ext;
						}
						function chanOff ( off ) {
							if (k6) k6.disabled = !!off;
							if (k7) k7.disabled = !!off;
						}

						if (mt_on) {
							var k01 = document.getElementById ('k01');
							if (k01 && !defaultFormat) {
								k01.checked = true;
								showConf (1, 0, 0);
								chanOff ( false );
								setExt ('.mp3');
							}
						}

						var flacRange = document.getElementById ('flac-comp');
						if (flacRange) {
							flacRange.oninput = function () {
								var sp = this.parentNode.getElementsByTagName ('span')[0];
								if (sp) sp.innerText = this.value;
							};
						}

						setDitherFor (16);
						if (wavconf) {
							wavconf.addEventListener ('change', function () {
								var ws = wavconf.getElementsByTagName ('input');
								for (var i = 0; i < ws.length; ++i) {
									if (ws[i].name === 'wavbits' && ws[i].checked) {
										setDitherFor (ws[i].value / 1);
										break;
									}
								}
							}, false);
						}

						if (format) {
							format.addEventListener ('change', function () {
								var inputs = this.getElementsByTagName ('input');
								for (var i = 0; i < inputs.length; ++i) {
									if (inputs[i].checked) {
										var v = inputs[i].value;
										chanOff (v === 'amss');
										showConf (v === 'mp3', v === 'flac', v === 'wav');
										setExt ('.' + v);
									}
								}
							}, false);
						}
					}, 20);
				}
			}).Show ();
		}

		function openLoadFromURLModal ( app ) {
			new PKSimpleModal ({
				title: 'Load audio from remote URL',
				ondestroy: function ( q ) {
					app.ui.InteractionHandler.on = false;
					app.ui.KeyHandler.removeCallback ('modalTemp');
					app.ui.KeyHandler.removeCallback ('modalTempEnter');
				},
				buttons: [
					{
						title: 'Load Asset',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) {
							var input = q.el_body.getElementsByTagName ('input')[0];
							var value = input.value.trim ();

							function isURL ( str ) {
								if (!str || typeof str !== 'string') return false;
								try {
									var parsed = new URL ( str );
									return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:';
								} catch (e) {
									return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test ( str );
								}
							}

							if (isURL ( value )) {
								if (app.fireEvent ('RequestLoadURL', value) !== true)
									app.engine.LoadURL ( value );
								q.Destroy ();
							} else {
								OneUp ('Invalid URL entered', 1100);
							}
						}
					}
				],
				body: '<label for="k00">Audio URL</label>' + 
					'<input style="min-width:280px" placeholder="https://example.com/audio.mp3" class="pk_txt" type="text" id="k00" />',
				setup: function ( q ) {
					app.fireEvent ('RequestPause');
					app.ui.InteractionHandler.checkAndSet ('modal');
					app.ui.KeyHandler.addCallback ('modalTemp', function () {
						q.Destroy ();
					}, [27]);
					app.ui.KeyHandler.addCallback ('modalTempEnter', function () {
						q.els.bottom[0].click ();
					}, [13]);
					setTimeout (function () {
						q.el && q.el.getElementsByTagName ('input')[0].focus ();
					}, 20);
				}
			}).Show ();
		}

		function triggerSaveDraftLocally ( app ) {
			var mt_on = activeMultitrackFor ( app );
			var isReady = app.engine && app.engine.is_ready;

			if (!isReady && !mt_on) {
				w.OneUp && w.OneUp ('No audio loaded to save draft', 1000);
				return ;
			}

			var saving = function ( type, name ) {
				var buff = app.engine.wavesurfer.backend.buffer;
				if (type === 'copy') buff = app.engine.GetCopyBuff ();
				else if (type === 'sel') buff = app.engine.GetSel ();

				var func = function ( fls ) {
					var rr = Math.random().toString(36).substring(7);
					fls.SaveSession ( buff, rr, name );
					app.stopListeningFor ('DidOpenDB', func);
				};

				app.listenFor ('DidOpenDB', func);

				if (!app.fls.on) app.fls.Init (function ( err ) { if (err) alert ("DB error: " + err); });
				else app.fireEvent ('DidOpenDB', app.fls);
			};

			new PKSimpleModal ({
				title: 'Save Draft Locally',
				ondestroy: function () {
					app.ui.InteractionHandler.on = false;
					app.ui.KeyHandler.removeCallback ('modalTempErr');
				},
				buttons: [
					{
						title: 'Save Draft',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) {
							var type = 'whole';
							var input = q.el_body.getElementsByTagName ('input');
							var name = input[ input.length - 1 ].value;
							if (name) {
								name = name.trim ();
								if (name.length >= 100) name = name.substr (0, 99).trim ();
								if (name.length === 0) name = null;
							} else {
								name = null;
							}

							for (var i = 0; i < input.length; ++i) {
								if (input[i].checked) {
									type = input[i].value;
									break;
								}
							}
							saving ( type, name );
							q.Destroy ();
						}
					}
				],
				body: '<p style="margin-bottom:8px;">Choose audio source to preserve:</p>' +
					'<div class="pk_row"><input type="radio" class="pk_check" id="sl1" name="rdslnc" checked value="whole">'+ 
					'<label style="vertical-align:top" for="sl1">Whole Track</label>' +
					'<input type="radio" class="pk_check" id="sl2" name="rdslnc" value="sel">'+
					'<label style="vertical-align:top" class="pk_lblsel" for="sl2">Selection'+
					'<i style="display:block;font-size:11px;margin-top:-5px"></i></label>'+
					'<input type="radio" class="pk_check" id="sl3" name="rdslnc" value="copy">'+
					'<label style="vertical-align:top" class="pk_lblsel2" for="sl3">"Copy" clipboard</label></div>'+

					'<div class="pk_row"><label for="slk0">Draft Name</label>' + 
					'<input style="min-width:250px" placeholder="(optional) draft name" maxlength="100" ' +
					'class="pk_txt" type="text" id="slk0" /></div>',
				setup: function ( q ) {
					var wv = app.engine.wavesurfer;
					var region = wv && wv.regions && wv.regions.list && wv.regions.list[0];
					var lblr = q.el_body.getElementsByClassName ('pk_lblsel')[0];
					if (!region) {
						if (lblr) lblr.className = 'pk_dis';
					} else {
						var chks = q.el_body.getElementsByClassName ('pk_check');
						if (chks[1]) chks[1].checked = true;
						if (lblr && lblr.childNodes[1]) {
							lblr.childNodes[1].textContent = app.ui.formatTime (region.start) + ' to ' + app.ui.formatTime (region.end);
						}
					}

					var copy = app.engine.GetCopyBuff ();
					if (!copy) {
						var lbl2 = q.el_body.getElementsByClassName ('pk_lblsel2')[0];
						if (lbl2) lbl2.className = 'pk_dis';
					}

					if (!app.isMobile) {
						setTimeout (function () {
							q.el && q.el.getElementsByClassName ('pk_txt')[0].focus ();
						}, 20);
					}

					app.fireEvent ('RequestPause');
					app.ui.InteractionHandler.checkAndSet ('modal');
					app.ui.KeyHandler.addCallback ('modalTempErr', function () {
						q.Destroy ();
					}, [27]);
				}
			}).Show ();
		}

		function triggerSaveProjectAs ( app ) {
			var currentTitle = (app && app.projectTitle) || (w.localStorage && w.localStorage.getItem ('pk_project_title')) || 'mixota-project';
			var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ();

			if (isMt && app.multitrack.ExportSession) {
				var name = prompt ('Save Session As (.mixota / .amss):', currentTitle);
				if (name && name.trim ()) {
					app.multitrack.ExportSession ( name.trim () );
					w.OneUp && w.OneUp ('Project saved as: ' + name.trim (), 1000);
				}
			} else {
				openExportModal ( app, 'amss' );
			}
		}

		function triggerSaveCopy ( app ) {
			var currentTitle = (app && app.projectTitle) || (w.localStorage && w.localStorage.getItem ('pk_project_title')) || 'Untitled Project';
			var copyName = currentTitle + ' (Copy)';

			if (!app.engine.is_ready) {
				w.OneUp && w.OneUp ('No active audio project to copy', 1000);
				return ;
			}

			var buff = app.engine.wavesurfer.backend.buffer;
			if (!buff) return ;

			var onSaved = function ( fls ) {
				var rr = Math.random().toString(36).substring(7);
				fls.SaveSession ( buff, rr, copyName );
				w.OneUp && w.OneUp ('Saved copy: ' + copyName, 1200);
			};

			if (!app.fls.on) {
				app.fls.Init (function ( err ) {
					if (err) { alert ("DB error: " + err); return ; }
					onSaved ( app.fls );
				});
			} else {
				onSaved ( app.fls );
			}
		}

		function promptNewAudioFile ( app ) {
			var isDirty = app.engine && app.engine.is_ready && app.engine.history && app.engine.history.length > 0;
			if (isDirty) {
				new PKSimpleModal ({
					title: 'Start New Audio Project',
					body: '<div style="padding:14px 4px;line-height:1.6;font-size:13px;">' +
						'<div style="font-weight:600;font-size:14px;color:#F3F5F4;margin-bottom:6px;">Discard unsaved changes?</div>' +
						'<div style="color:#9CA39F;">You have unsaved edits in the current project. Creating a new audio project will reset the waveform canvas.</div>' +
						'</div>',
					buttons: [
						{
							title: 'Save Draft First',
							clss: 'pk_modal_a_accpt',
							callback: function ( q ) {
								q.Destroy ();
								triggerSaveDraftLocally ( app );
							}
						},
						{
							title: 'Discard & New Project',
							callback: function ( q ) {
								q.Destroy ();
								doCreateNewAudioFile ( app );
							}
						},
						{
							title: 'Cancel',
							callback: function ( q ) {
								q.Destroy ();
							}
						}
					]
				}).Show ();
			} else {
				doCreateNewAudioFile ( app );
			}
		}

		function doCreateNewAudioFile ( app ) {
			if (app.multitrack && app.multitrack.Toggle) {
				app.multitrack.Toggle ( false );
			}
			app.fireEvent ('DidUnloadFile');
			app.fireEvent ('StateRequestClearAll');
			var titleInput = document.getElementById ('pk_hdr_title_input');
			var titleText = document.getElementById ('pk_hdr_title');
			if (titleText) titleText.textContent = 'Untitled Project';
			if (titleInput) titleInput.value = 'Untitled Project';
			try {
				if (w.localStorage) w.localStorage.setItem ('pk_project_title', 'Untitled Project');
			} catch (e) {}
			w.OneUp && w.OneUp ('New single-track project ready', 900);
		}

		function promptNewMultitrack ( app ) {
			var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ();
			var hasClips = app.multitrack && app.multitrack.HasClips && app.multitrack.HasClips ();

			if (hasClips) {
				new PKSimpleModal ({
					title: 'New Multitrack Project',
					body: '<div style="padding:14px 4px;line-height:1.6;font-size:13px;">' +
						'<div style="font-weight:600;font-size:14px;color:#F3F5F4;margin-bottom:6px;">Start a fresh Multitrack session?</div>' +
						'<div style="color:#9CA39F;">Existing tracks and clips will be cleared for a new project.</div>' +
						'</div>',
					buttons: [
						{
							title: 'New Session',
							clss: 'pk_modal_a_accpt',
							callback: function ( q ) {
								q.Destroy ();
								doCreateNewMultitrack ( app );
							}
						},
						{
							title: 'Cancel',
							callback: function ( q ) {
								q.Destroy ();
							}
						}
					]
				}).Show ();
			} else {
				doCreateNewMultitrack ( app );
			}
		}

		function doCreateNewMultitrack ( app ) {
			var mtTab = document.getElementById ('pk-tab-multitrack');
			if (mtTab) mtTab.click ();
			else if (app.multitrack && app.multitrack.Toggle) app.multitrack.Toggle ( true );

			if (app.multitrack && app.multitrack.ResetSession) {
				app.multitrack.ResetSession ();
			}
			app.fireEvent ('DidUpdateMultitrack');
			w.OneUp && w.OneUp ('New Multitrack session created', 900);
		}

		function openMixotaProjectFile ( app ) {
			var input = d.createElement ('input');
			input.type = 'file';
			input.accept = '.mixota,.amss';
			input.onchange = function () {
				if (input.files && input.files.length) {
					var file = input.files[0];
					if (app.multitrack && app.multitrack.LoadSessionFiles) {
						var mtTab = document.getElementById ('pk-tab-multitrack');
						if (mtTab) mtTab.click ();
						else if (app.multitrack.Toggle) app.multitrack.Toggle ( true );
						app.multitrack.LoadSessionFiles ([file]);
						w.OneUp && w.OneUp ('Loading project: ' + file.name, 1000);
					} else {
						app.fireEvent ('RequestLoadFile', file);
					}
				}
			};
			input.click ();
		}

		function importIntoMultitrack ( app ) {
			var mtTab = document.getElementById ('pk-tab-multitrack');
			if (mtTab) mtTab.click ();
			else if (app.multitrack && app.multitrack.Toggle) app.multitrack.Toggle ( true );

			var input = d.createElement ('input');
			input.type = 'file';
			input.multiple = true;
			input.accept = 'audio/*';
			input.onchange = function () {
				if (input.files && input.files.length) {
					if (app.multitrack && app.multitrack.AddFilesAuto) {
						app.multitrack.AddFilesAuto ( input.files );
						w.OneUp && w.OneUp ('Imported ' + input.files.length + ' clip(s) to Multitrack', 1000);
					}
				}
			};
			input.click ();
		}

		function showRawAudioInfoModal ( app ) {
			new PKSimpleModal ({
				title: 'Import Raw PCM Audio',
				body: '<div style="padding:14px 4px;line-height:1.6;font-size:13px;">' +
					'<div style="font-weight:600;font-size:14px;color:#F3F5F4;margin-bottom:6px;">Headerless PCM Audio Format</div>' +
					'<p style="color:#9CA39F;margin-bottom:10px;">Browser Web Audio decoders natively decode standard audio containers (WAV, MP3, FLAC, OGG, AAC) where sampling rates and bit-depths are self-describing.</p>' +
					'<p style="color:#9CA39F;margin-bottom:10px;">To import raw headerless PCM stream files into Mixota, wrap them in standard 16/24-bit WAV headers or import them through a .mixota session archive.</p>' +
					'</div>',
				buttons: [
					{
						title: 'Import Standard Audio',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) {
							q.Destroy ();
							app.fireEvent ('RequestLoadLocalFile');
						}
					},
					{
						title: 'Got It',
						callback: function ( q ) {
							q.Destroy ();
						}
					}
				]
			}).Show ();
		}

		function showProjectPropertiesModal ( app ) {
			var title = (app && app.projectTitle) || (w.localStorage && w.localStorage.getItem ('pk_project_title')) || 'Untitled Project';
			var ws = app && app.engine && app.engine.wavesurfer;
			var buf = ws && ws.backend && ws.backend.buffer;
			var durr = buf ? app.ui.formatTime (buf.duration) : '--:--';
			var sampleRate = buf ? (buf.sampleRate + ' Hz') : '-- Hz';
			var channels = buf ? (buf.numberOfChannels === 1 ? 'Mono (1 channel)' : (buf.numberOfChannels === 2 ? 'Stereo (2 channels)' : buf.numberOfChannels + ' channels')) : '--';
			var memEst = buf ? ((buf.length * buf.numberOfChannels * 4 / (1024 * 1024)).toFixed(2) + ' MB') : '0 MB';
			var historyCount = (app.engine && app.engine.history ? app.engine.history.length : 0);
			var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ();

			var bodyHtml = 
				'<div style="display:grid;grid-template-columns:140px 1fr;gap:10px 16px;padding:12px 4px;font-size:13px;line-height:1.5;">' +
					'<div style="color:#9CA39F;">Project Title:</div><div><strong style="color:#00E5A3;">' + title + '</strong></div>' +
					'<div style="color:#9CA39F;">Active Workspace:</div><div>' + (isMt ? 'Multitrack Studio' : 'Waveform Editor') + '</div>' +
					'<div style="color:#9CA39F;">Audio Duration:</div><div>' + durr + '</div>' +
					'<div style="color:#9CA39F;">Sample Rate:</div><div>' + sampleRate + '</div>' +
					'<div style="color:#9CA39F;">Channel Config:</div><div>' + channels + '</div>' +
					'<div style="color:#9CA39F;">DSP Buffer RAM:</div><div>' + memEst + '</div>' +
					'<div style="color:#9CA39F;">Undo History States:</div><div>' + historyCount + '</div>' +
					'<div style="color:#9CA39F;">Processing Precision:</div><div>32-bit Floating Point (IEEE 754)</div>' +
				'</div>';

			new PKSimpleModal ({
				title: 'Project Properties',
				body: bodyHtml,
				buttons: [
					{
						title: 'Close',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) { q.Destroy (); }
					}
				]
			}).Show ();
		}

		function formatTimeAgo ( timestamp ) {
			var now = Date.now();
			var diff = Math.max(0, (now - timestamp) / 1000) >> 0;
			if (diff < 60) return diff <= 2 ? 'just now' : diff + 's ago';
			if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
			if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
			if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
			return new Date(timestamp).toLocaleDateString();
		}

		function openRecoveryPromptModal ( app, candidate ) {
			if (!candidate) return ;
			var timeStr = formatTimeAgo(candidate.timestamp || Date.now());
			var projectName = candidate.projectName || 'Untitled Project';
			var rev = candidate.snapshotRevision || 1;
			var type = candidate.projectType === 'multitrack' ? 'Multitrack' : 'Waveform';

			new PKSimpleModal ({
				title: 'Unsaved Work Found',
				clss: 'pk_bigger',
				buttons: [
					{
						title: '✦ Recover This Version',
						clss: 'pk_modal_a_accpt',
						callback: function ( q ) {
							q.Destroy ();
							if (candidate.data) {
								app.engine.LoadDB ( candidate );
								if (app.autosave) {
									app.autosave.setProject ( candidate.projectId, projectName, candidate.projectType, rev );
									app.autosave.saveImmediately ();
								}
								w.OneUp && w.OneUp ('✦ Recovered ' + projectName + ' (Rev #' + rev + ')', 2000);
							}
						}
					},
					{
						title: 'Open Last Saved Version',
						callback: function ( q ) {
							q.Destroy ();
							app.fls.GetSession ( candidate.projectId, function ( saved ) {
								if (saved) {
									app.engine.LoadDB ( saved );
									if (app.autosave) {
										app.autosave.setProject ( saved.id, saved.name, saved.projectType, saved.revision || 1 );
									}
									w.OneUp && w.OneUp ('Opened last confirmed save', 1500);
								} else {
									w.OneUp && w.OneUp ('No saved version found; snapshot preserved', 1500);
								}
							});
						}
					},
					{
						title: 'Decide Later',
						callback: function ( q ) {
							q.Destroy ();
						}
					}
				],
				body: '<div style="padding:10px 4px;font-size:13px;line-height:1.6;">' +
					'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
						'<span style="font-size:24px;">⚠️</span>' +
						'<div>' +
							'<div style="font-weight:600;font-size:15px;color:#F3F5F4;">Unsaved work detected from a previous session</div>' +
							'<div style="color:#9CA39F;font-size:12.5px;">Mixota found a newer recoverable version of <strong>' + projectName + '</strong> (' + timeStr + ').</div>' +
						'</div>' +
					'</div>' +
					'<div style="background:#181B19;border:1px solid #2A2F2C;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-family:var(--ff-mono);font-size:12px;color:#CBD5E1;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
						'<span>Project: <strong style="color:#00E5A3;">' + projectName + '</strong></span>' +
						'<span>Type: <strong>' + type + '</strong></span>' +
						'<span>Snapshot: <strong>Rev #' + rev + '</strong></span>' +
						'<span>Time: <strong>' + timeStr + '</strong></span>' +
					'</div>' +
					'<div style="color:#9CA39F;font-size:12px;">' +
						'Choose <strong>Recover This Version</strong> to restore your unsaved edits, or <strong>Open Last Saved Version</strong> to discard the crash snapshot.' +
					'</div>' +
				'</div>'
			}).Show ();
		}

		function openProjectLibraryModal ( app ) {
			if (!app.fls || !app.fls.Init) {
				w.OneUp && w.OneUp ('Project storage offline', 1200);
				return ;
			}

			app.fls.Init (function ( err ) {
				if (err) {
					w.OneUp && w.OneUp ('Could not initialize project database', 1500);
					return ;
				}

				var modal;
				var currentSearch = '';
				var currentSort = 'updated';
				var currentOrder = 'desc';

				function renderProjectList () {
					var container = document.getElementById ('pk_proj_list_container');
					if (!container) return ;
					container.innerHTML = '<div style="text-align:center;padding:24px;color:#9CA39F;">Loading projects...</div>';

					app.fls.ListProjects ({ search: currentSearch, sortBy: currentSort, sortOrder: currentOrder }, function ( projects ) {
						if (!projects || projects.length === 0) {
							container.innerHTML = '<div style="text-align:center;padding:32px 16px;color:#9CA39F;font-size:13px;">' +
								'<div style="font-size:24px;margin-bottom:8px;">📁</div>' +
								(currentSearch ? 'No projects match "<strong>' + currentSearch + '</strong>".' : 'No saved projects found. Projects you save appear here.') +
							'</div>';
							return ;
						}

						var html = '';
						for (var i = 0; i < projects.length; i++) {
							var p = projects[i];
							var timeStr = formatTimeAgo (p.updated || p.created || Date.now());
							var durStr = p.duration ? (Math.floor (p.duration / 60) + ':' + ('0' + Math.floor (p.duration % 60)).slice (-2)) : '--:--';
							var typeStr = p.projectType === 'multitrack' ? 'Multitrack' : 'Waveform';
							var chStr = p.channels === 1 ? 'Mono' : 'Stereo';

							html += '<div class="pk_proj_card" id="pk_proj_card_' + p.id + '">' +
								'<div class="pk_proj_card_main">' +
									'<div class="pk_proj_card_title_row">' +
										'<span class="pk_proj_card_name">' + (p.name || 'Untitled Project') + '</span>' +
										'<span class="pk_proj_type_pill">' + typeStr + '</span>' +
										(p.hasRecovery ? '<span class="pk_recovery_badge">Recovery available</span>' : '') +
									'</div>' +
									'<div class="pk_proj_card_meta">' +
										'<span>' + durStr + '</span> • ' +
										'<span>' + chStr + '</span> • ' +
										'<span>Saved ' + timeStr + '</span>' +
									'</div>' +
								'</div>' +
								'<div class="pk_proj_card_actions">' +
									'<button type="button" class="pk_proj_act_btn pk_proj_btn_open" data-id="' + p.id + '">Open</button>' +
									'<button type="button" class="pk_proj_act_btn" data-act="rename" data-id="' + p.id + '" data-name="' + (p.name || '') + '" title="Rename Project">✎</button>' +
									'<button type="button" class="pk_proj_act_btn" data-act="dup" data-id="' + p.id + '" title="Duplicate Project">⎘</button>' +
									'<button type="button" class="pk_proj_act_btn pk_proj_btn_del" data-act="del" data-id="' + p.id + '" data-name="' + (p.name || '') + '" title="Delete Project">🗑</button>' +
								'</div>' +
							'</div>';
						}

						container.innerHTML = html;

						// Wire action buttons
						var openBtns = container.querySelectorAll ( '.pk_proj_btn_open' );
						for (var b = 0; b < openBtns.length; b++) {
							openBtns[b].onclick = function () {
								var id = this.getAttribute ( 'data-id' );
								app.fls.GetSession ( id, function ( sess ) {
									if (sess) {
										if (modal) modal.Destroy ();
										app.engine.LoadDB ( sess );
										if (app.autosave) {
											app.autosave.setProject ( sess.id, sess.name, sess.projectType, sess.revision || 1 );
										}
										w.OneUp && w.OneUp ('Opened project: ' + (sess.name || 'Untitled'), 1200);
									}
								});
							};
						}

						var actBtns = container.querySelectorAll ( '.pk_proj_act_btn[data-act]' );
						for (var a = 0; a < actBtns.length; a++) {
							actBtns[a].onclick = function () {
								var act = this.getAttribute ( 'data-act' );
								var id = this.getAttribute ( 'data-id' );
								var name = this.getAttribute ( 'data-name' );

								if (act === 'del') {
									// Delete confirmation dialog
									new PKSimpleModal ({
										title: 'Delete Project',
										buttons: [
											{
												title: 'Delete Project',
												clss: 'pk_modal_a_accpt',
												callback: function ( qDel ) {
													qDel.Destroy ();
													app.fls.DeleteProject ( id, function ( ok ) {
														if (ok) {
															w.OneUp && w.OneUp ('Deleted project: ' + name, 1200);
															renderProjectList ();
															refreshRecentsList ();
														}
													});
												}
											},
											{
												title: 'Cancel',
												callback: function ( qDel ) { qDel.Destroy (); }
											}
										],
										body: '<div style="padding:12px 4px;font-size:13px;line-height:1.6;">' +
											'<div style="font-weight:600;font-size:14px;color:#EF4444;margin-bottom:6px;">Delete "' + name + '"?</div>' +
											'<div style="color:#9CA39F;">This will permanently remove this project and its recovery snapshots from browser storage. This cannot be undone.</div>' +
										'</div>'
									}).Show ();
								} else if (act === 'dup') {
									app.fls.DuplicateProject ( id, function ( dup ) {
										if (dup) {
											w.OneUp && w.OneUp ('✦ Duplicated as ' + dup.name, 1500);
											renderProjectList ();
											refreshRecentsList ();
										}
									});
								} else if (act === 'rename') {
									var newTitle = prompt ('Rename project:', name);
									if (newTitle && newTitle.trim () && newTitle.trim () !== name) {
										app.fls.RenameProject ( id, newTitle.trim (), function () {
											w.OneUp && w.OneUp ('Renamed to ' + newTitle.trim (), 1200);
											renderProjectList ();
											refreshRecentsList ();
											if (app.autosave && app.autosave.projectId === id) {
												app.autosave.setProjectName ( newTitle.trim () );
												var titleText = d.getElementById ( 'pk_hdr_title' );
												if (titleText) titleText.textContent = newTitle.trim ();
											}
										});
									}
								}
							};
						}
					});
				}

				modal = new PKSimpleModal ({
					title: 'Project Library',
					clss: 'pk_bigger',
					buttons: [
						{
							title: '+ New Project',
							clss: 'pk_modal_a_accpt',
							callback: function ( q ) {
								q.Destroy ();
								app.fireEvent ('RequestUnloadFile');
								var newId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
								if (app.autosave) {
									app.autosave.setProject ( newId, 'Untitled Project', 'waveform', 1 );
								}
								var titleText = d.getElementById ( 'pk_hdr_title' );
								if (titleText) titleText.textContent = 'Untitled Project';
								w.OneUp && w.OneUp ('Created new project', 1200);
							}
						},
						{
							title: 'Close',
							callback: function ( q ) { q.Destroy (); }
						}
					],
					body: '<div class="pk_proj_modal_wrap">' +
						'<div class="pk_proj_toolbar">' +
							'<input type="text" class="pk_proj_search" id="pk_proj_search_input" placeholder="🔍 Search projects by name..." />' +
							'<select class="pk_proj_sort" id="pk_proj_sort_select">' +
								'<option value="updated" selected>Last Modified</option>' +
								'<option value="name">Name (A-Z)</option>' +
								'<option value="created">Date Created</option>' +
							'</select>' +
						'</div>' +
						'<div class="pk_proj_list_container" id="pk_proj_list_container">' +
						'</div>' +
					'</div>',
					setup: function ( q ) {
						setTimeout (function () {
							var searchInput = q.el_body.querySelector ( '#pk_proj_search_input' );
							var sortSelect = q.el_body.querySelector ( '#pk_proj_sort_select' );

							if (searchInput) {
								searchInput.oninput = function () {
									currentSearch = this.value;
									renderProjectList ();
								};
							}
							if (sortSelect) {
								sortSelect.onchange = function () {
									currentSort = this.value;
									currentOrder = this.value === 'name' ? 'asc' : 'desc';
									renderProjectList ();
								};
							}
							renderProjectList ();
						}, 30);
					}
				});
				modal.Show ();
			});
		}

		function openLocalDraftsModal ( app ) {
			openProjectLibraryModal ( app );
		}

		// Helper to wire dynamic export and save item listeners
		function setupSaveItem ( app, btn ) {
			function updateSaveReady () {
				var mtOn = activeMultitrackFor ( app );
				var mtHasClips = app.multitrack && app.multitrack.HasClips && app.multitrack.HasClips ();
				var engineReady = app.engine && app.engine.is_ready;
				if (engineReady || mtOn || mtHasClips) {
					btn.classList.remove ('pk_inact');
				} else {
					btn.classList.add ('pk_inact');
				}
			}
			app.listenFor ('DidUnloadFile', updateSaveReady);
			app.listenFor ('DidLoadFile', updateSaveReady);
			app.listenFor ('DidUpdateMultitrack', updateSaveReady);
			updateSaveReady ();
		}

		function setupExportItem ( app, btn ) {
			btn.setAttribute ('data-id', 'dl');
			function updateExportReady () {
				var mtOn = activeMultitrackFor ( app );
				var mtHasClips = app.multitrack && app.multitrack.HasClips && app.multitrack.HasClips ();
				var engineReady = app.engine && app.engine.is_ready;
				if (engineReady || mtOn || mtHasClips) {
					btn.classList.remove ('pk_inact');
				} else {
					btn.classList.add ('pk_inact');
				}
			}
			app.listenFor ('DidUnloadFile', updateExportReady);
			app.listenFor ('DidLoadFile', updateExportReady);
			app.listenFor ('DidUpdateMultitrack', updateExportReady);
			updateExportReady ();
		}

		// =========================================================================
		// File Menu Definition (Adobe Audition-inspired architecture)
		// =========================================================================
		return [
			{
				name: 'File',
				children: [
					// --- GROUP A: NEW ---
					{ type: 'header', name: 'New' },
					{
						name: 'New Audio File',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
						shortcut: isMac ? '⌘N' : 'Ctrl+N',
						title: 'Start a new single-track audio project',
						action: function () {
							promptNewAudioFile ( app );
						}
					},
					{
						name: 'New Multitrack Project',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
						shortcut: isMac ? '⇧⌘N' : 'Ctrl+Shift+N',
						title: 'Create a new multi-track session',
						action: function () {
							promptNewMultitrack ( app );
						}
					},
					{
						name: 'New Recording...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7" fill="#EF4444"/><path d="M12 1v3M12 20v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M1 12h3M20 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>',
						shortcut: 'R',
						title: 'Record from microphone or line input',
						action: function () {
							app.fireEvent ('RequestActionNewRec');
						}
					},

					{ type: 'separator' },

					// --- GROUP B: OPEN ---
					{ type: 'header', name: 'Open' },
					{
						name: 'Load from Computer...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
						shortcut: isMac ? '⌘O' : 'Ctrl+O',
						title: 'Open audio file from your device',
						action: function () {
							app.fireEvent ('RequestLoadLocalFile');
						}
					},
					{
						name: 'Load from URL...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
						title: 'Fetch and decode audio from remote URL',
						action: function () {
							openLoadFromURLModal ( app );
						}
					},
					{
						name: 'Open Mixota Project...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
						title: 'Open .mixota or .amss session project archive',
						action: function () {
							openMixotaProjectFile ( app );
						}
					},
					{
						name: 'Load Sample Track',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
						title: 'Load bundled demo audio track',
						action: function () {
							if (app.fireEvent ('RequestLoadSampleFile') !== true)
								app.engine.LoadSample ('test.mp3');
						}
					},

					{ type: 'separator' },

					// --- GROUP C: RECENT PROJECTS ---
					{ type: 'header', name: 'Recent' },
					{
						name: 'Open Local Drafts...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
						title: 'Browse and restore browser-saved drafts',
						id: 'drf',
						action: function () {
							openLocalDraftsModal ( app );
						}
					},

					{ type: 'separator' },

					// --- GROUP D: IMPORT ---
					{ type: 'header', name: 'Import' },
					{
						name: 'Import Audio...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
						title: 'Import audio file into current workspace',
						action: function () {
							app.fireEvent ('RequestLoadLocalFile');
						}
					},
					{
						name: 'Import into Multitrack...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
						title: 'Add audio files as individual tracks in Multitrack',
						action: function () {
							importIntoMultitrack ( app );
						}
					},
					{
						name: 'Import Raw PCM Audio...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
						title: 'Import headerless PCM audio data',
						action: function () {
							showRawAudioInfoModal ( app );
						}
					},

					{ type: 'separator' },

					// --- GROUP E: SAVE ---
					{ type: 'header', name: 'Save' },
					{
						name: 'Save Draft Locally',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
						shortcut: isMac ? '⌘S' : 'Ctrl+S',
						title: 'Save project to browser IndexedDB storage',
						setup: function ( btn ) {
							setupSaveItem ( app, btn );
						},
						action: function () {
							triggerSaveDraftLocally ( app );
						}
					},
					{
						name: 'Save Project As...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><circle cx="12" cy="8" r="2"/></svg>',
						shortcut: isMac ? '⇧⌘S' : 'Ctrl+Shift+S',
						title: 'Save project with custom name (.mixota / .amss)',
						setup: function ( btn ) {
							setupSaveItem ( app, btn );
						},
						action: function () {
							triggerSaveProjectAs ( app );
						}
					},
					{
						name: 'Save a Copy...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
						title: 'Save a separate project copy without renaming active file',
						setup: function ( btn ) {
							setupSaveItem ( app, btn );
						},
						action: function () {
							triggerSaveCopy ( app );
						}
					},

					{ type: 'separator' },

					// --- GROUP F: EXPORT / DOWNLOAD ---
					{ type: 'header', name: 'Export' },
					{
						name: 'Export Audio...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
						shortcut: isMac ? '⌘E' : 'Ctrl+E',
						id: 'dl',
						title: 'Render and download master audio (MP3, WAV, FLAC, Session)',
						setup: function ( btn ) {
							setupExportItem ( app, btn );
						},
						action: function () {
							openExportModal ( app );
						}
					},
					{
						name: 'Export WAV...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/></svg>',
						title: 'Export uncompressed 16/24/32-bit WAV',
						setup: function ( btn ) {
							setupExportItem ( app, btn );
						},
						action: function () {
							openExportModal ( app, 'wav' );
						}
					},
					{
						name: 'Export MP3...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/></svg>',
						title: 'Export compressed MP3 audio (128/192/256 kbps)',
						setup: function ( btn ) {
							setupExportItem ( app, btn );
						},
						action: function () {
							openExportModal ( app, 'mp3' );
						}
					},
					{
						name: 'Export FLAC...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/></svg>',
						title: 'Export lossless compressed FLAC',
						setup: function ( btn ) {
							setupExportItem ( app, btn );
						},
						action: function () {
							openExportModal ( app, 'flac' );
						}
					},
					{
						name: 'Export Selection...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
						title: 'Export currently selected audio region only',
						setup: function ( btn ) {
							function updateSel () {
								var reg = activeRegionFor ( app );
								if (reg) btn.classList.remove ('pk_inact');
								else btn.classList.add ('pk_inact');
							}
							app.listenFor ('DidSelectRegion', updateSel);
							app.listenFor ('DidClearRegion', updateSel);
							app.listenFor ('DidLoadFile', updateSel);
							app.listenFor ('DidUnloadFile', updateSel);
							updateSel ();
						},
						action: function () {
							openExportModal ( app, null, true );
						}
					},
					{
						name: 'Export Multitrack Mixdown...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="10 9 9 9 8 9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
						title: 'Render and export all multitrack stems into master audio',
						setup: function ( btn ) {
							function updateMt () {
								var mt = app.multitrack;
								var hasClips = mt && mt.HasClips && mt.HasClips ();
								if (hasClips) btn.classList.remove ('pk_inact');
								else btn.classList.add ('pk_inact');
							}
							app.listenFor ('DidUpdateMultitrack', updateMt);
							app.listenFor ('DidLoadFile', updateMt);
							app.listenFor ('DidUnloadFile', updateMt);
							updateMt ();
						},
						action: function () {
							var mtTab = document.getElementById ('pk-tab-multitrack');
							if (mtTab) mtTab.click ();
							openExportModal ( app, 'wav' );
						}
					},

					{ type: 'separator' },

					// --- GROUP G: APPLICATION ---
					{ type: 'header', name: 'Application' },
					{
						name: 'Project Properties...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
						title: 'View audio specs, sample rate, and project metadata',
						action: function () {
							showProjectPropertiesModal ( app );
						}
					},
					{
						name: 'Keyboard Shortcuts...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="7" y1="16" x2="17" y2="16"/></svg>',
						shortcut: '?',
						title: 'View and customize keyboard shortcuts',
						action: function () {
							openSettingsModal ('shortcuts');
						}
					},
					{
						name: 'Preferences...',
						icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
						shortcut: isMac ? '⌘,' : 'Ctrl+,',
						title: 'Audio preferences and workspace settings',
						action: function () {
							openSettingsModal ('audio');
						}
					}
				]
			},
			{
				name:'Edit',
				children:[
					{
						name: 'Undo <span class="pk_shrtct">Shft+Z</span>',
						clss: 'pk_inact',
						action: function () {
							app.fireEvent ('StateRequestUndo');
						},
						setup: function ( obj ) {
							app.listenFor ('DidStateChange', function ( undo_states, redo_states ) {
								if (undo_states.length === 0)
								{
									obj.innerHTML = 'Undo <span class="pk_shrtct">Shft+Z</span>';
									obj.classList.add ('pk_inact');
								}
								else
								{
									obj.innerHTML = 'Undo&nbsp;<i style="pointer-events:none">' + undo_states[undo_states.length - 1].desc + '</i><span class="pk_shrtct">Shft+Z</span>';
									obj.classList.remove ('pk_inact');
								}
							});
						}
					},
					
					{
						name: 'Redo <span class="pk_shrtct">Shft+Y</span>',
						clss: 'pk_inact',
						action: function () {
							app.fireEvent ('StateRequestRedo');
						},
						setup: function ( obj ) {
							app.listenFor('DidStateChange', function ( undo_states, redo_states ) {
								if (redo_states.length === 0)
								{
									obj.innerHTML = 'Redo <span class="pk_shrtct">Shft+Y</span>';
									obj.classList.add ('pk_inact');
								}
								else
								{
									obj.innerHTML = 'Redo&nbsp;<i style="pointer-events:none">' + redo_states[0].desc  + '</i><span class="pk_shrtct">Shft+Y</span>';
									obj.classList.remove ('pk_inact');
								}
							});
						}
					},

					{
						name: 'Play <span class="pk_shrtct">Space</span>',
						action: function () {
							app.fireEvent ('RequestPlay');
						}
					},
					
					{
						name: 'Stop',
						action: function () {
							app.fireEvent ('RequestStop');
						}
					},
					
					{
						name: 'Select All <span class="pk_shrtct">Shft+A</span>',
						action: function () {
							app.fireEvent ('RequestSelect');
						}
					},
					
					{
						name: 'Deselect All <span class="pk_shrtct">~</span>',
						action: function () {
							app.fireEvent ('RequestDeselect');
						}
					},

					{
						name   : 'Channel Info/Flip',
						action : function () {
							app.fireEvent ('RequestActionFXUI_Flip');
						},
						clss: 'pk_inact',
						setup: function ( obj ) {
							app.listenFor ('DidUnloadFile', function () {
								obj.classList.add ('pk_inact');
							});
							app.listenFor ('DidLoadFile', function () {
								obj.classList.remove ('pk_inact');
							});
						}
					},

					{
						name:'Seamless Loop',
						action:function () {
							app.fireEvent ('RequestActionFXUI_SeamlessLoop');
						}
					},

					{
						name: 'Zero Cross Selection',
						action: function () {
							app.fireEvent ('RequestSnapSelDrag');
						},
						setup: function ( obj ) {
							var txt = 'Zero Cross Selection';
							function set ( val ) { obj.innerHTML = txt + (val ? ' &#10004;' : ''); }
							set (!w.localStorage || w.localStorage.pk_snapzc !== '0');
							app.listenFor ('DidSnapSelDrag', set);
						}
					},
					{
						name: '---'
					},
					{
						name: 'Keyboard Shortcuts...',
						action: function () {
							openSettingsModal ('shortcuts');
						}
					}
					]
				},
			{
				name:'Effects',
				children:[
					{
						name:'Gain',
						action:function () {
							app.fireEvent ('RequestFXUI_Gain');
						}
					},

					{
						name:'Fade In',
						action:function () {
							app.fireEvent ('RequestActionFX_FadeIn');
						}
					},

					{
						name:'Fade Out',
						action:function () {
							app.fireEvent ('RequestActionFX_FadeOut');
						}
					},

                    {
                        name: "Noise Reduction (Voice)",
                        action: function () {
                            app.fireEvent("RequestActionFX_NoiseRNN");
                        },
                    },

					{
						name   : 'Paragraphic EQ',
						action:function () {
							app.fireEvent ('RequestActionFXUI_ParaGraphicEQ');
						}
					},

					{
						name:'Compressor',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Compressor');
						}
					},


					{
						name   : 'Normalize',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Normalize');
						}
					},

					{
						name   : 'Graphic EQ',
						action:function () {
							app.fireEvent ('RequestActionFXUI_GraphicEQ', 10);
						}
					},

					{
						name   : 'Graphic EQ (20 bands)',
						action:function () {
							app.fireEvent ('RequestActionFXUI_GraphicEQ', 20);
						}
					},

					{
						name   : 'Hard Limiter',
						action:function () {
							app.fireEvent ('RequestActionFXUI_HardLimiter');
						}
					},

					{
						name   : 'Delay',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Delay');
						}
					},

					{
						name:'Distortion',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Distortion');
						}
					},


					{
						name:'Reverb',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Reverb');
						}
					},

					{
						name:'Audio Repair',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Repair');
						}
					},

					{
						name   : 'Speed Up / Slow Down (pitch)',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Speed');
						}
					},

					{
						name : 'Speed / Playback Rate',
						action:function () {
							app.fireEvent ('RequestActionFXUI_Rate');
						}
					},

					{
						name   : 'Reverse',
						action : function () {
							app.fireEvent ('RequestActionFX_Reverse');
						}
					},
					
					{
						name   : 'Invert',
						action : function () {
							app.fireEvent ('RequestActionFX_Invert');
						}
					},

					{
						name   : 'Remove Silence',
						action : function () {
							app.fireEvent ('RequestActionFX_RemSil');
						}
					}
					
				]
			},
			{
				name:'View',
				children:[
					{
						name:'Follow Cursor  &#10004;',
						action: function ( obj ) {
							app.fireEvent ('RequestViewFollowCursorToggle');
						},
						setup: function ( obj ) {
							// perhaps read from stored settings?

							app.listenFor ('DidViewFollowCursorToggle', function ( val ) {
								var txt = 'Follow Cursor';

								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'Peak Separators &#10004;',
						action: function ( obj ) {
							app.fireEvent ('RequestViewPeakSeparatorToggle');
						},
						setup: function ( obj ) {
							app.listenFor ('DidViewPeakSeparatorToggle', function ( val ) {
								var txt = 'Peak Separators';
								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'Timeline &#10004;',
						action: function ( obj ) {
							app.fireEvent ('RequestViewTimelineToggle');
						},
						setup: function ( obj ) {
							app.listenFor ('DidViewTimelineToggle', function ( val ) {
								var txt = 'Timeline';
								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'---'
					},

					{
						name:'Frequency Analyser',
						action: function ( obj ) {
							app.fireEvent ('RequestShowFreqAn', 'eq', [1]);
						},
						setup: function ( obj ) {
							app.listenFor ('DidToggleFreqAn', function ( url, val ) {
								if (url !== 'eq') return ;

								var txt = 'Frequency Analyser';
								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'Spectrum Analyser',
						action: function ( obj ) {
							app.fireEvent ('RequestShowFreqAn', 'sp', [1]);
						},
						setup: function ( obj ) {
							app.listenFor ('DidToggleFreqAn', function ( url, val ) {
								if (url !== 'sp') return ;

								var txt = 'Spectrum Analyser';
								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'Multitrack Mixer',
						action: function ( obj ) {
							var mt = app.multitrack;
							if (mt && mt.IsOn && !mt.IsOn ()) mt.Toggle ( true );
							app.fireEvent ('RequestMixerToggle');
						},
						setup: function ( obj ) {
							app.listenFor ('DidToggleFreqAn', function ( url, val ) {
								if (url !== 'mix') return ;

								var txt = 'Multitrack Mixer';
								if (val) {
									obj.innerHTML = txt + ' &#10004;';
								} else {
									obj.textContent = txt;
								}
							});
						}
					},

					{
						name:'Tempo Tools',
						action: function ( obj ) {
							app.fireEvent ('RequestActionTempo');
						}
					},

					{
						name:'ID3 Tags',
						action: function ( obj ) {
							app.fireEvent ('RequestActionID3');
						}
					},

					{
						name:'---'
					},

					{
						name:'Center to Cursor <span class="pk_shrtct">[Tab]</span>',
						action: function ( obj ) {
							app.fireEvent ('RequestViewCenterToCursor');
						}
					},

					{
						name:'Reset Zoom <span class="pk_shrtct">[0]</span>',
						action: function ( obj ) {
							app.fireEvent ('RequestZoomUI', 0);
						}
					}

				]
			},
			{
				name:'Help',
				children:[
					{
						name   : 'Shortcuts Reference <span class="pk_shrtct">[?]</span>',
						action : function () {
							openShortcutsModal ();
						}
					},
					{
						name   : 'Keyboard Shortcuts Settings...',
						action : function () {
							openSettingsModal ('shortcuts');
						}
					},

					{
						name:'---'
					},

					{
						name   : 'About Mixota',
						action : function () {
							window.open ('/about');
						}
					}
				]
			}
		];
	};

	// 
	// TOP-BAR CLASS
	// 
	function _makeUITopHeader ( menu_tree, UI ) {
		var app = UI.app || (PKAE && PKAE.app) || (w.PKAudioList && w.PKAudioList[0]) || null;
		var header = d.createElement ( 'div' );
		header.className = 'pk_hdr pk_noselect';

		// 1. Left Container: Brand + Project Title + Menus
		var left_wrap = d.createElement ( 'div' );
		left_wrap.className = 'pk_hdr_left';
		header.appendChild ( left_wrap );


		// Editable Project Title
		var titleWrap = d.createElement ( 'div' );
		titleWrap.className = 'pk_hdr_title_wrap';
		titleWrap.title = 'Click to rename project';
		titleWrap.innerHTML = '<span class="pk_hdr_title_text" id="pk_hdr_title">Untitled Project</span>' +
			'<span class="pk_hdr_title_icon">✎</span>' +
			'<input type="text" class="pk_hdr_title_input" id="pk_hdr_title_input" value="Untitled Project" style="display:none;" />';
		left_wrap.appendChild ( titleWrap );

		var titleText = titleWrap.querySelector ( '#pk_hdr_title' );
		var titleIcon = titleWrap.querySelector ( '.pk_hdr_title_icon' );
		var titleInput = titleWrap.querySelector ( '#pk_hdr_title_input' );

		function getSavedTitle () {
			return (w.localStorage && w.localStorage.getItem ('pk_project_title')) || 'Untitled Project';
		}
		var currentTitle = getSavedTitle ();
		titleText.textContent = currentTitle;
		titleInput.value = currentTitle;

		function saveProjectTitle ( newTitle ) {
			newTitle = (newTitle || '').trim ();
			if (!newTitle) newTitle = 'Untitled Project';
			currentTitle = newTitle;
			titleText.textContent = newTitle;
			titleInput.value = newTitle;
			try {
				if (w.localStorage) w.localStorage.setItem ('pk_project_title', newTitle);
			} catch (e) {}
			if (app) app.projectTitle = newTitle;
			if (app && app.fireEvent) app.fireEvent ('DidProjectTitleChange', newTitle);
		}

		titleWrap.onclick = function () {
			if (titleInput.style.display === 'none') {
				titleText.style.display = 'none';
				titleIcon.style.display = 'none';
				titleInput.style.display = 'inline-block';
				titleInput.focus ();
				titleInput.select ();
			}
		};

		titleInput.onblur = function () {
			saveProjectTitle ( titleInput.value );
			titleInput.style.display = 'none';
			titleText.style.display = 'inline-block';
			titleIcon.style.display = 'inline-block';
		};

		titleInput.onkeydown = function ( e ) {
			if (e.key === 'Enter') {
				titleInput.blur ();
			} else if (e.key === 'Escape') {
				titleInput.value = currentTitle;
				titleInput.blur ();
			}
		};

		if (app && app.listenFor) {
			app.listenFor ('DidLoadFile', function ( file_name ) {
				if (file_name && currentTitle === 'Untitled Project') {
					var cleanName = file_name.replace(/\.[^/.]+$/, '');
					saveProjectTitle ( cleanName );
				}
			});
		}

		var menus_wrap = d.createElement ( 'div' );
		menus_wrap.className = 'pk_hdr_menus';
		left_wrap.appendChild ( menus_wrap );

		// 2. Center Container: Workspace Switcher
		var center_wrap = d.createElement ( 'div' );
		center_wrap.className = 'pk_hdr_center';
		header.appendChild ( center_wrap );

		var ws_switcher = d.createElement ( 'nav' );
		ws_switcher.className = 'pk_workspace_switcher';
		ws_switcher.setAttribute ( 'role', 'tablist' );
		ws_switcher.setAttribute ( 'aria-label', 'Workspaces' );
		ws_switcher.innerHTML = 
			'<button type="button" class="pk_ws_tab pk_ws_active" role="tab" aria-selected="true" data-ws="waveform" id="pk-tab-waveform">' +
				'<span class="pk_ws_icon">∿</span><span>Waveform</span>' +
			'</button>' +
			'<button type="button" class="pk_ws_tab" role="tab" aria-selected="false" data-ws="multitrack" id="pk-tab-multitrack">' +
				'<span class="pk_ws_icon">𝍢</span><span>Multitrack</span>' +
			'</button>' +
			'<button type="button" class="pk_ws_tab" role="tab" aria-selected="false" data-ws="mastering" id="pk-tab-mastering">' +
				'<span class="pk_ws_icon">✦</span><span>Mastering</span>' +
			'</button>';
		center_wrap.appendChild ( ws_switcher );

		var activeWorkspace = 'waveform';
		function setWorkspace ( wsName ) {
			if (wsName !== 'waveform' && wsName !== 'multitrack' && wsName !== 'mastering') return ;

			var tabs = ws_switcher.querySelectorAll ( '.pk_ws_tab' );
			for (var t = 0; t < tabs.length; ++t) {
				var match = tabs[t].getAttribute ('data-ws') === wsName;
				tabs[t].classList.toggle ('pk_ws_active', match);
				tabs[t].setAttribute ('aria-selected', match ? 'true' : 'false');
			}

			activeWorkspace = wsName;

			if (wsName === 'waveform') {
				if (UI.el.classList.contains ('pk_mastering_on')) {
					UI.el.classList.remove ('pk_mastering_on');
				}
				if (app && app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ()) {
					app.multitrack.Toggle (false);
				}
				if (app && app.fireEvent) app.fireEvent ('RequestResize');
			}
			else if (wsName === 'multitrack') {
				if (UI.el.classList.contains ('pk_mastering_on')) {
					UI.el.classList.remove ('pk_mastering_on');
				}
				if (!app.multitrack && app._deps && app._deps.multitrack) {
					try {
						app.multitrack = new app._deps.multitrack ( app );
					} catch (e) {
						console.error ('Failed to instantiate multitrack on demand:', e);
					}
				}
				if (app && app.multitrack) {
					if (!app.multitrack.IsOn || !app.multitrack.IsOn ()) {
						app.multitrack.Toggle (true);
					}
				} else {
					if (typeof OneUp === 'function') OneUp ('Multitrack Studio unavailable', 2000);
					setWorkspace ('waveform');
					return ;
				}
				if (app && app.fireEvent) app.fireEvent ('RequestResize');
			}
			else if (wsName === 'mastering') {
				if (app && app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ()) {
					app.multitrack.Toggle (false);
				}
				UI.el.classList.add ('pk_mastering_on');
				if (UI.refreshMastering) UI.refreshMastering ();
				if (app && app.fireEvent) app.fireEvent ('RequestResize');
			}

			if (app && app.fireEvent) app.fireEvent ('DidWorkspaceChange', wsName);
		}

		ws_switcher.addEventListener ('click', function ( e ) {
			var btn = e.target.closest ( '.pk_ws_tab' );
			if (btn) {
				setWorkspace ( btn.getAttribute ('data-ws') );
			}
		});

		UI.setWorkspace = setWorkspace;
		UI.getActiveWorkspace = function () { return activeWorkspace; };
		UI.setProjectTitle = saveProjectTitle;
		UI.getProjectTitle = function () { return currentTitle; };

		if (app && app.listenFor) {
			app.listenFor ('DidUpdateMultitrack', function () {
				var isMt = app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ();
				if (isMt && activeWorkspace !== 'multitrack') {
					var tabs = ws_switcher.querySelectorAll ( '.pk_ws_tab' );
					for (var t = 0; t < tabs.length; ++t) {
						var match = tabs[t].getAttribute ('data-ws') === 'multitrack';
						tabs[t].classList.toggle ('pk_ws_active', match);
						tabs[t].setAttribute ('aria-selected', match ? 'true' : 'false');
					}
					activeWorkspace = 'multitrack';
					UI.el.classList.remove ('pk_mastering_on');
				}
			});

			app.listenFor ('RequestOriginalEditor', function () {
				if (activeWorkspace !== 'waveform') {
					var tabs = ws_switcher.querySelectorAll ( '.pk_ws_tab' );
					for (var t = 0; t < tabs.length; ++t) {
						var match = tabs[t].getAttribute ('data-ws') === 'waveform';
						tabs[t].classList.toggle ('pk_ws_active', match);
						tabs[t].setAttribute ('aria-selected', match ? 'true' : 'false');
					}
					activeWorkspace = 'waveform';
					UI.el.classList.remove ('pk_mastering_on');
				}
			});
		}

		// 3. Right Container: Telemetry + Save Status + Shortcuts + Export
		var right_wrap = d.createElement ( 'div' );
		right_wrap.className = 'pk_hdr_right';
		header.appendChild ( right_wrap );

		var telemetryBadge = d.createElement ( 'span' );
		telemetryBadge.className = 'pk_hdr_telemetry';
		telemetryBadge.id = 'pk_hdr_telemetry';
		telemetryBadge.textContent = 'Ready • No File';
		right_wrap.appendChild ( telemetryBadge );

		var saveStatus = d.createElement ( 'span' );
		saveStatus.className = 'pk_hdr_save_status pk_status_clean';
		saveStatus.id = 'pk_hdr_save_status';
		saveStatus.textContent = 'Clean';
		right_wrap.appendChild ( saveStatus );

		function updateTelemetry () {
			var ws = app && app.engine && app.engine.wavesurfer;
			var buf = ws && ws.backend && ws.backend.buffer;
			if (buf && buf.sampleRate) {
				var chText = buf.numberOfChannels === 1 ? 'Mono' : (buf.numberOfChannels === 2 ? 'Stereo' : buf.numberOfChannels + ' Ch');
				var rateText = (buf.sampleRate / 1000).toFixed(1) + ' kHz';
				telemetryBadge.textContent = rateText + ' • ' + chText;
				telemetryBadge.classList.add ('pk_telemetry_active');
			} else {
				telemetryBadge.textContent = 'Ready • No File';
				telemetryBadge.classList.remove ('pk_telemetry_active');
			}
		}

		if (app && app.listenFor) {
			app.listenFor ('DidLoadFile', updateTelemetry);
			app.listenFor ('DidUnloadFile', updateTelemetry);

			app.listenFor ('DidStateChange', function ( undo_states ) {
				if (undo_states && undo_states.length > 0) {
					saveStatus.textContent = 'Unsaved edits';
					saveStatus.className = 'pk_hdr_save_status pk_status_unsaved';
				} else {
					saveStatus.textContent = 'Clean';
					saveStatus.className = 'pk_hdr_save_status pk_status_clean';
				}
			});

			app.listenFor ('DidStoreDB', function () {
				saveStatus.textContent = '✦ Saved locally';
				saveStatus.className = 'pk_hdr_save_status pk_status_saved';
			});
		}

		var _name = 'TopHeader',
			_default_class = 'pk_btn pk_noselect';

		var target_index = -1;
		var target_el = null;
		var target_el_old = null;
		var target_option = null;
		var top_els = [];
		var q = this;

				// recursively build the interface into menus_wrap
		function build_menus ( parent_el, tree_obj, level ) {
			for (var i = 0; i < tree_obj.length; ++i)
			{
				var curr_obj = tree_obj[i];
				if (!curr_obj) continue;

				if (level > 0 && (curr_obj.type === 'separator' || curr_obj.name === '---'))
				{
					var sep = d.createElement ( 'div' );
					sep.className = 'pk_menu_sep';
					sep.setAttribute ( 'role', 'separator' );
					parent_el.appendChild ( sep );
					continue;
				}

				if (level > 0 && (curr_obj.type === 'header' || curr_obj.isHeader))
				{
					var hdr = d.createElement ( 'div' );
					hdr.className = 'pk_menu_header';
					hdr.textContent = curr_obj.name;
					parent_el.appendChild ( hdr );
					continue;
				}

				var btn_container = d.createElement ( 'div' );

				if (level === 0)
				{
					btn_container.className = _default_class;
					var btn = d.createElement ( 'button' );
					btn.innerHTML = curr_obj.name;
					btn_container.appendChild ( btn );
				}
				else
				{
					btn_container.className = 'pk_menu_el';
					var btn = d.createElement ( 'button' );
					btn.className = 'pk_opt ' + (curr_obj.clss ? curr_obj.clss : '');
					btn.setAttribute ( 'role', 'menuitem' );
					btn.setAttribute ( 'tabindex', '-1' );
					btn.setAttribute ( 'data-index', i );
					if (curr_obj.id) btn.setAttribute ( 'data-id', curr_obj.id );
					if (curr_obj.title || curr_obj.tooltip) btn.title = curr_obj.title || curr_obj.tooltip;

					var contentHtml = '<span class="pk_menu_label">';
					if (curr_obj.icon) {
						contentHtml += '<span class="pk_menu_icon">' + curr_obj.icon + '</span>';
					}
					contentHtml += curr_obj.name + '</span>';

					if (curr_obj.shortcut) {
						contentHtml += '<span class="pk_shrtct">' + curr_obj.shortcut + '</span>';
					}
					btn.innerHTML = contentHtml;
					btn_container.appendChild ( btn );

					if (curr_obj.action)
					{
						(function ( btn, action ) {
							btn.onclick = function ( obj ) {
								if (this.classList.contains('pk_inact')) return ;

								q.closeMenu ();
								action ( obj );
							};
						})( btn, curr_obj.action );
					}
					if (curr_obj.setup)
					{
						curr_obj.setup ( btn );
					}
				}
				parent_el.appendChild ( btn_container );
				
				if (level === 0)
					top_els[i] = btn_container.childNodes[0];

				if (curr_obj.children)
				{
					var list = d.createElement('div');
					list.className = 'pk_menu';
					list.setAttribute ( 'role', 'menu' );
					
					build_menus ( list, curr_obj.children, level + 1 );
					btn_container.appendChild ( list );
				}
				// --- 
			}
		};
		build_menus ( menus_wrap, menu_tree, 0 );

		var shortcutsBtn = d.createElement ( 'button' );
		shortcutsBtn.className = 'pk_hdr_shortcuts_btn';
		shortcutsBtn.setAttribute ( 'tabindex', '-1' );
		shortcutsBtn.title = 'Keyboard Shortcuts & Settings (?)';
		shortcutsBtn.innerHTML = '<span style="color:#00E5A3;font-size:12px;margin-right:4px;">⌨</span>Shortcuts';
		shortcutsBtn.onclick = function () {
			if (w.PKAudioEditor && w.PKAudioEditor.openSettingsModal) {
				w.PKAudioEditor.openSettingsModal ('shortcuts');
			}
		};
		right_wrap.appendChild ( shortcutsBtn );

		var quickExportBtn = d.createElement ( 'button' );
		quickExportBtn.className = 'pk_hdr_export_btn';
		quickExportBtn.id = 'pk_hdr_export_btn';
		quickExportBtn.innerHTML = '⤓ Export';
		quickExportBtn.title = 'Export Audio (MP3, WAV, FLAC, Session)';
		quickExportBtn.onclick = function () {
			var exportOpt = header.querySelector ( '[data-id="dl"]' );
			if (exportOpt && !exportOpt.classList.contains ('pk_inact')) {
				exportOpt.click ();
			} else {
				q.openMenu (0);
			}
		};
		right_wrap.appendChild ( quickExportBtn );
		
		this.getOpenElement = function () {
			return target_el;
		};
		this.closeMenu = function() {
			if (!target_el) return ;

			target_el.parentNode.className = _default_class;
			target_el = target_el_old = null;

			if (target_option)
			{
				target_option.classList.remove ('pk_act');
				target_option = null;
			}
			
			UI.InteractionHandler.on = false;
			d.removeEventListener ( 'mouseup', mouseup );
			
			// de-register keys
			UI.KeyHandler.removeCallback (_name + 1);
			UI.KeyHandler.removeCallback (_name + 2);
			UI.KeyHandler.removeCallback (_name + 3);
			UI.KeyHandler.removeCallback (_name + 4);
			UI.KeyHandler.removeCallback (_name + 5);
			UI.KeyHandler.removeCallback (_name + 6);
		};
		
		this.openMenu = function ( index, is_mouse ) {
			if (target_el) {
				target_el.parentNode.className = _default_class;
			}

			if (index === -1) {
				index = target_index === -1 ? 0 : target_index;
			}

			var curr_target = top_els[ index ];
			target_el = curr_target;

			var parent = curr_target.parentNode;
			var left = parent.getBoundingClientRect ().left;
			var max = window.innerWidth;
			var offset = 0;

			if ( max - left < 200 )
			{
				offset = (264 - (max - left)) >> 0;

				if (offset > 1)
					parent.getElementsByClassName ('pk_menu')[0].style.left = (-offset / 2) + 'px';
			}

			parent.className += ' pk_vis';
			setTimeout(function() {
				if (target_el === curr_target)
					parent.className += ' pk_act';
			},0);

			target_index = index;
			
			UI.InteractionHandler.checkAndSet (_name);
			
			if (!is_mouse)
				d.addEventListener ( 'mouseup', mouseup, false );
			
			// register keystrokes
			UI.KeyHandler.addCallback (_name + 1, function ( key ) {
				if (target_index === 0)
					target_index = top_els.length;
				
				q.closeMenu ();
				q.openMenu ( target_index - 1 );				
			}, [37]);
			UI.KeyHandler.addCallback (_name + 2, function ( key ) {
				if (target_index === top_els.length - 1)
					target_index = -1;

				q.closeMenu ();
				q.openMenu ( target_index + 1 );				
			}, [39]);
			UI.KeyHandler.addCallback (_name + 3, function ( key ) {
				q.closeMenu ();			
			}, [27]);
			UI.KeyHandler.addCallback (_name + 4, function ( key, m, e ) {
				if (!target_option)
				{
					var els = target_el.parentNode.getElementsByClassName ('pk_opt');
					if (els[0]) {
						target_option = els[0];
						target_option.classList.add ('pk_act');
					}
				}
				else
				{
					var ind = target_option.getAttribute ('data-index')/1;
					target_option.classList.remove ('pk_act');
					
					target_option = target_el.parentNode.getElementsByClassName ('pk_opt');
					if (ind - 1 < 0)
					{
						target_option = target_option[target_option.length - 1];
					}
					else
					{
						target_option = target_option[ind - 1];
					}
					target_option.classList.add ('pk_act');
				}
			}, [38]);
			UI.KeyHandler.addCallback (_name + 5, function ( key, m, e ) {
				if (!target_option)
				{
					var els = target_el.parentNode.getElementsByClassName ('pk_opt');
					if (els[0]) {
						target_option = els[0];
						target_option.classList.add ('pk_act');
					}
				}
				else
				{
					var ind = target_option.getAttribute ('data-index')/1;
					target_option.classList.remove ('pk_act');
					
					target_option = target_el.parentNode.getElementsByClassName ('pk_opt');
					if (target_option.length <= ind + 1)
					{
						target_option = target_option[0];
					}
					else
					{
						target_option = target_option[ind + 1];
					}
					target_option.classList.add ('pk_act');				
				}
			}, [40]);
			UI.KeyHandler.addCallback (_name + 6, function ( key ) {
				if (target_option)
					target_option.click();
				else
					q.closeMenu ();
			}, [13]);

			return (true);
		};

		UI.listenFor ('DidReadyFire', function () {
			q.closeMenu ();
		});

		// register hot keys for opening the menu 
		function _checkForAct( x ) {
				if (target_el == x || !x) return (false);

				var par = x.parentNode;
				while (par && target_el) {
					if (target_el.parentNode == par) {
						return (false);
					}
					par = par.parentNode;
				}
				
				var l = top_els.length;
				while(l-- > 0) {
					if (top_els[l] === x) {				
						return q.openMenu (l, true);
					}
				}
				return (false);
		}

		// now make the buttons interactive
		var mousemove = function ( e ) {
			if (!UI.InteractionHandler.check (_name)) {
				return (false);
			}

			if (target_el || (UI.InteractionHandler.on && UI.InteractionHandler.by === _name) )
			{
				var x = e.target || e.srcElement;
				
				if (x.className.indexOf('pk_opt') >= 0)
				{
					if (target_option)
						target_option.classList.remove ('pk_act');

					target_option = x;
					target_option.classList.add ('pk_act');
				}
				else
				{
					if (target_option)
						target_option.classList.remove ('pk_act');
					target_option = null;
				}

				return _checkForAct ( x );
			}

			return (false);
		};
		var mouseup = function( e ) {
			var x = e.target || e.srcElement;

			if (target_el)
			{
				// todo check for inner menu?
				var par = x;
				var found = false;
				while (par && target_el) {
					if (target_el.parentNode == par) {
						found = true;
						break;
					}
					par = par.parentNode;
				}

				if (!found || target_el_old === x) {
					q.closeMenu();
				}
			}
			else
			{
				UI.InteractionHandler.on = false;
				d.removeEventListener ( 'mouseup', mouseup );
			}
			
			target_el_old = null;
		};

		header.addEventListener ( 'mousemove', mousemove, false );
		header.addEventListener ( 'mousedown', function( e ) {
			if (!UI.InteractionHandler.checkAndSet (_name)) {
				return (false);
			}

			d.removeEventListener ( 'mouseup', mouseup );

			if (target_el)
			{
				if (!_checkForAct ( e.target || e.srcElement ))
					target_el_old = target_el;
				else
					target_el_old = null;

				d.addEventListener ( 'mouseup', mouseup, false );
			}
			else
			{
				target_el_old = null;
				d.addEventListener ( 'mouseup', mouseup, false );
				_checkForAct ( e.target || e.srcElement );
			}
			// -
		}, false);

		UI.el.appendChild ( header );
		// -
	};


	// ####
	function _makeUIBarBottom ( UI, app ) {
		var q = this;

		var bar_bottom_el = d.createElement ('div');
		bar_bottom_el.className = 'pk_dck';
		UI.el.appendChild( bar_bottom_el );

		q.el = bar_bottom_el;
		q.on = false;
		q.height = 130;

		q.SetHeight = function ( height ) {
			q.height = height;
			if (q.on) bar_bottom_el.style.height = height + 'px';
		};

		q.Show = function () {
			q.on = true;
			bar_bottom_el.style.display = 'block';
			bar_bottom_el.style.height = q.height + 'px';

			app.fireEvent ('RequestResize');
		};
		q.Hide = function () {
			q.on = false;
			bar_bottom_el.style.display = 'none';
			bar_bottom_el.style.height = '0';

			app.fireEvent ('RequestResize');
		};
	};

	function _makeUIMainView ( UI, app ) {
		var q = this;

		var audio_container = d.createElement ('div');
		audio_container.className = 'pk_av_cont';
		UI.el.appendChild( audio_container );

		var main_audio_view = d.createElement ( 'div' );
		main_audio_view.className = 'pk_av pk_noselect';
		main_audio_view.id = 'pk_av_' + app.id;
		audio_container.appendChild( main_audio_view );

		// Creator Launchpad Component
		var launchpad = d.createElement ( 'div' );
		launchpad.className = 'pk_launchpad';
		launchpad.id = 'pk_launchpad';
		launchpad.innerHTML = 
			'<div class="pk_lp_card">' +
				'<div class="pk_lp_header">' +
					'<div class="pk_lp_mascot"><img src="mascot.png" alt="Mixota" /></div>' +
					'<h2 class="pk_lp_title">Welcome to Mixota</h2>' +
					'<p class="pk_lp_subtitle">Universal browser-based workstation for musicians, podcasters, and creators.</p>' +
				'</div>' +
				'<div class="pk_lp_dropzone" id="pk_lp_dropzone" tabindex="0" role="button" aria-label="Drop audio files or click to import">' +
					'<span class="pk_lp_drop_icon">⤓</span>' +
					'<span class="pk_lp_drop_title">Drag & drop your audio file here</span>' +
					'<span class="pk_lp_drop_sub">Supports MP3, WAV, FLAC, OGG, WebM & Mixota sessions • 100% Client-Side</span>' +
				'</div>' +
				'<div class="pk_lp_actions">' +
					'<button type="button" class="pk_lp_btn" id="pk_lp_btn_import">' +
						'<span class="pk_lp_btn_icon">📂</span>' +
						'<span class="pk_lp_btn_text">Import Audio</span>' +
						'<span class="pk_lp_btn_sub">Load from computer</span>' +
					'</button>' +
					'<button type="button" class="pk_lp_btn" id="pk_lp_btn_record">' +
						'<span class="pk_lp_btn_icon">🎙️</span>' +
						'<span class="pk_lp_btn_text">Record Voice</span>' +
						'<span class="pk_lp_btn_sub">Capture mic input</span>' +
					'</button>' +
					'<button type="button" class="pk_lp_btn" id="pk_lp_btn_multi">' +
						'<span class="pk_lp_btn_icon">𝍢</span>' +
						'<span class="pk_lp_btn_text">New Multitrack</span>' +
						'<span class="pk_lp_btn_sub">Multi-clip arranger</span>' +
					'</button>' +
					'<button type="button" class="pk_lp_btn" id="pk_lp_btn_demo">' +
						'<span class="pk_lp_btn_icon">⚡</span>' +
						'<span class="pk_lp_btn_text">Try Demo Track</span>' +
						'<span class="pk_lp_btn_sub">Explore test audio</span>' +
					'</button>' +
				'</div>' +
				'<div class="pk_lp_recents">' +
					'<div class="pk_lp_recents_title">Recent Local Drafts</div>' +
					'<div class="pk_lp_recents_list" id="pk_lp_recents_list">' +
						'<span class="pk_lp_recents_empty">Scanning local storage...</span>' +
					'</div>' +
				'</div>' +
			'</div>';
		audio_container.appendChild ( launchpad );

		
		var footer = d.createElement ( 'div' );
		footer.className = 'pk_ftr pk_noselect';
		UI.el.appendChild( footer );

		// make panner buttons
		var btn_panner_cnt = d.createElement ('div');
		btn_panner_cnt.className = 'pk_panner pk_noselect';

		var panner_col_left = d.createElement ('div');
		panner_col_left.className = 'pk_pan_left';
		var panner_col_right = d.createElement ('div');
		panner_col_right.className = 'pk_pan_right';

		var btn_panner_left = d.createElement ('button');
		var btn_panner_right = d.createElement ('button');
		btn_panner_left.setAttribute ('tabIndex', -1);
		btn_panner_right.setAttribute ('tabIndex', -1);
		btn_panner_left.className = 'pk_pan_btn';
		btn_panner_right.className = 'pk_pan_btn';

		btn_panner_left.innerHTML = '<strong>L</strong> ON';
		btn_panner_right.innerHTML = '<strong>R</strong> ON';

		panner_col_left.appendChild ( btn_panner_left );
		panner_col_right.appendChild ( btn_panner_right );
		btn_panner_cnt.appendChild ( panner_col_left );
		btn_panner_cnt.appendChild ( panner_col_right );
		audio_container.appendChild ( btn_panner_cnt );


		btn_panner_left.onclick = function () {
			app.fireEvent ('RequestChanToggle', 0);
			this.blur();
		};
		btn_panner_right.onclick = function () {
			app.fireEvent ('RequestChanToggle', 1);
			this.blur();
		};
		app.listenFor ('DidChanToggle', function ( chan, val ) {
			if ( chan === 0) {
				if (val)
				{
					btn_panner_left.classList.remove ('pk_inact');
					btn_panner_left.innerHTML = '<strong>L</strong> ON';
				}
				else
				{
					btn_panner_left.classList.add ('pk_inact');
					btn_panner_left.innerHTML = '<strong>L</strong> OFF';
				}
			} else {
				if (val)
				{
					btn_panner_right.classList.remove ('pk_inact');
					btn_panner_right.innerHTML = '<strong>R</strong> ON';
				}
				else
				{
					btn_panner_right.classList.add ('pk_inact');
					btn_panner_right.innerHTML = '<strong>R</strong> OFF';
				}
			}
		});

		// zoom btns
		var btn_zoom_cnt = d.createElement ('div');
		btn_zoom_cnt.className = 'pk_zoombtn';

		var btn_zoom_in_h = d.createElement ('button');
		btn_zoom_in_h.className = 'pk_btn pk_zoom_in_h';
		btn_zoom_in_h.innerHTML = '+<span>Zoom In Horiz (+)</span>';
		btn_zoom_in_h.setAttribute ('tabIndex', -1);
		btn_zoom_in_h.onclick = function () {
			app.fireEvent ('RequestZoomUI', 'h', -1);
			this.blur();
		};

		var btn_zoom_out_h = d.createElement ('button');
		btn_zoom_out_h.className = 'pk_btn pk_zoom_out_h pk_inact';
		btn_zoom_out_h.innerHTML = '&ndash;<span>Zoom Out Horiz (-)</span>';
		btn_zoom_out_h.setAttribute ('tabIndex', -1);
		btn_zoom_out_h.onclick = function () {
			app.fireEvent ('RequestZoomUI', 'h', 1);
			this.blur();
		};

		var btn_zoom_reset = d.createElement ('button');
		btn_zoom_reset.className = 'pk_btn pk_zoom_reset pk_inact';
		btn_zoom_reset.innerHTML = '[R] <span>Reset Zoom (0)</span>';
		btn_zoom_reset.setAttribute ('tabIndex', -1);
		btn_zoom_reset.onclick = function () {
			app.fireEvent ('RequestZoomUI', 0);
			this.blur();
		};
		UI.KeyHandler.addCallback ('Key0', function ( key ) {
			if (UI.InteractionHandler.on) return ;
			app.fireEvent ('RequestZoomUI', 0);
		}, [48]);

		UI.KeyHandler.addCallback ('KeyZO', function ( key ) {
			if (UI.InteractionHandler.on) return ;
			app.fireEvent ('RequestZoomUI', 'h', 1);
		}, [189]);
		UI.KeyHandler.addCallback ('KeyZI', function ( key ) {
			if (UI.InteractionHandler.on) return ;
			app.fireEvent ('RequestZoomUI', 'h', -1);
		}, [187]);

		var btn_zoom_in_v = d.createElement ('button');
		btn_zoom_in_v.className = 'pk_btn pk_zoom_in_v';
		btn_zoom_in_v.innerHTML = '&#x2195; +<span>Zoom In Vertically</span>';
		btn_zoom_in_v.setAttribute ('tabIndex', -1);
		btn_zoom_in_v.onclick = function () {
			app.fireEvent ('RequestZoomUI', 'v', -1);
			this.blur();
		};

		var btn_zoom_out_v = d.createElement ('button');
		btn_zoom_out_v.className = 'pk_btn pk_zoom_out_v';
		btn_zoom_out_v.innerHTML = '&#x2195; &ndash;<span>Zoom Out Vertically</span>';
		btn_zoom_out_v.setAttribute ('tabIndex', -1);
		btn_zoom_out_v.onclick = function () {
			app.fireEvent ('RequestZoomUI', 'v', 1);
			this.blur();
		};

		btn_zoom_cnt.appendChild ( btn_zoom_in_h );
		btn_zoom_cnt.appendChild ( btn_zoom_out_h );
		btn_zoom_cnt.appendChild ( btn_zoom_reset );
		btn_zoom_cnt.appendChild ( btn_zoom_in_v );
		btn_zoom_cnt.appendChild ( btn_zoom_out_v );

		footer.appendChild ( btn_zoom_cnt );
		// end of zoom btns
		
		var wavezoom = d.createElement ( 'div' );
		wavezoom.className = 'pk_wavescroll';

		var wavepoint_visible = false;
		var wavepoint = d.createElement ( 'div' );
		wavepoint.className = 'pk_wavepoint';

		var wavedrag = d.createElement ( 'div' );
		var wavedrag_style = wavedrag.style;
		wavedrag.className = 'pk_wavedrag pk_inact';

		var wavedrag_left = d.createElement ( 'div' );
		wavedrag_left.className = 'pk_wavedrag_l';
		var wavedrag_right = d.createElement ( 'div' );
		wavedrag_right.className = 'pk_wavedrag_r';

		wavezoom.appendChild ( wavepoint );
		wavedrag.appendChild ( wavedrag_left );
		wavedrag.appendChild ( wavedrag_right );
		wavezoom.appendChild ( wavedrag );
		footer.appendChild ( wavezoom );

		var temp = 0;
		var wavedrag_width = 100;
		wavezoom.onclick = function( e ) {
			if (window.performance.now() - temp < 20)
			{
				return ;
			}

			var rect = e.target.getBoundingClientRect();
			var x = e.clientX - rect.left;
			UI.fireEvent ('RequestPan', x, 2);
		};
		
		// add zoom event, and add seek event....
		UI.listenFor ('DidZoom', function ( v ) {
			var e = v[0];
			var o = v[1];

			if (e === 1) {
				btn_zoom_out_h.classList.add ('pk_inact');
				btn_zoom_reset.classList.add ('pk_inact');
			} else {
				btn_zoom_out_h.classList.remove ('pk_inact');
				btn_zoom_reset.classList.remove ('pk_inact');
			}

			if (v[2] != 1) {
				btn_zoom_reset.classList.remove ('pk_inact');
			}

			if (e === 1) {
				if (wavepoint_visible)
				{
					wavepoint.style.display = 'none';
					wavepoint_visible = false;
				}
			} else {
				if (!wavepoint_visible)
				{
					wavepoint.style.display = 'block';
					wavepoint_visible = true;
				}

				var perc = (v[3] !== undefined) ?
					v[3] :
					app.engine.wavesurfer.getCurrentTime() / app.engine.wavesurfer.getDuration ();
				// wavepoint.style.left = ((perc * 100).toFixed(2)/1) + '%';
				wavepoint.style.left = ((perc * 10000)>>0)/100 + '%';
			}

			// get zoom value and left...
			if ((100/e) > 99)
			{
				wavedrag_width = 100;
				wavedrag_style.width = '100%';
				wavedrag_style.left =  '0%';
				//wavedrag_style.transform = 'translate(0,0)';
				wavedrag.classList.add ('pk_inact');
			}
			else
			{
				wavedrag_width = (100/e);
				wavedrag_style.width = wavedrag_width + '%';
				wavedrag_style.left =  o + '%';
				//wavedrag_style.transform = 'translate(' +  (e * o) + '%,0)';
				wavedrag.classList.remove ('pk_inact');
			}
		});
		UI.listenFor ('DidCursorCenter', function( val, zoom ) {

			requestAnimationFrame(function () {
				wavedrag_style.left = (val * 100) + '%';
				//wavedrag_style.transform = 'translate(' + (val * zoom * 100) + '%,0)';
			});
		});
		
		var drag_mode = 0;
		var startingX = 0;
		var waveScrollMouseMove = function( e ) {
			e.stopPropagation(); e.preventDefault();

			var clx = e.clientX;

			if (e.touches) {
				if (e.touches.length > 1) return ;

				clx = e.touches[0].clientX;
			}

			if (drag_mode === 2)
			{
				var rect = wavezoom.getBoundingClientRect ();
				UI.fireEvent ('RequestPan', Math.max (0, Math.min (wavezoom.clientWidth, clx - rect.left)), 2);
				return ;
			}

			var diff = -startingX + clx;
			if (drag_mode === 0)
				UI.fireEvent ('RequestPan', diff, 1);
			else if (drag_mode === -1)
			{
				UI.fireEvent ('RequestZoom', diff, -1);
			}
			else if (drag_mode === 1)
			{
				UI.fireEvent ('RequestZoom', diff, 1);
			}
			
			startingX = clx;
		},
		waveScrollMouseUp = function ( e ) {
			if (e.touches && e.touches.length > 1) return ;

			PKAudioEditor.engine.wavesurfer.Interacting &= ~(1 << 1);
			e.stopPropagation();e.preventDefault();
			drag_mode = 0;
			temp = window.performance.now();
			
			wavedrag.classList.remove ('pk_drag');
			
			document.removeEventListener('mousemove', waveScrollMouseMove);
			document.removeEventListener('mouseup', waveScrollMouseUp);

			document.removeEventListener('touchmove', waveScrollMouseMove, {passive:false});
			document.removeEventListener('touchend', waveScrollMouseUp);
		};

		var mdown = function ( e ) {
			var mt_on = activeMultitrackFor ( app );
			if (!PKAudioEditor.engine.is_ready && !mt_on) return ;
			if (e.target === wavezoom && !mt_on) return ;

			if (e.target === wavedrag) {
				drag_mode = 0;
			} else if ( e.target === wavedrag_left) {
				drag_mode = -1;
			} else if ( e.target === wavedrag_right) {
				drag_mode = 1;
			}
			else if (mt_on) {
				drag_mode = 2;
			}
			else return ;

			e.stopPropagation(); e.preventDefault();
			wavedrag.className += ' pk_drag';

			startingX = e.clientX;
			if (drag_mode === 2) waveScrollMouseMove ( e );
			PKAudioEditor.engine.wavesurfer.Interacting |= (1 << 1);

			if (e.is_touch)
			{
				document.addEventListener ('touchmove', waveScrollMouseMove, {passive:false});
				document.addEventListener ('touchend', waveScrollMouseUp, false);
			}
			else
			{		
				document.addEventListener ('mousemove', waveScrollMouseMove, false);
				document.addEventListener ('mouseup', waveScrollMouseUp, false);	
			}
		};

		wavezoom.addEventListener ('mousedown', mdown, false);

		if ('ontouchstart' in window) {
			wavedrag.addEventListener ('touchstart', function ( e ) {
				e.preventDefault ();
				e.stopPropagation ();

				if (e.touches.length > 1) {
					return ;
				}

				var ev = {
					is_touch : true,
					target : wavedrag,
					clientX: e.touches[0].clientX,
					stopPropagation: function(){},
					preventDefault: function(){}
				};
				mdown ( ev );
			}, false);
		}
		
		
		this.volumeGauge = d.createElement( 'div' );
		this.volumeGauge2 = d.createElement( 'div' );
		
		this.volumeGaugeInner = d.createElement( 'div' );
		this.volumeGaugeInner2 = d.createElement( 'div' );
		this.volumeGaugePeaker = d.createElement( 'div' );
		this.volumeGaugePeaker2 = d.createElement( 'div' );

		var volume_parent = d.createElement('div');
		
		this.volumeGauge.className = 'pk_volpar';
		this.volumeGauge2.className = 'pk_volpar';
		this.volumeGaugeInner.className = 'pk_vol';
		this.volumeGaugeInner2.className = 'pk_vol';
		this.volumeGaugePeaker.className = 'pk_peaker';
		this.volumeGaugePeaker2.className = 'pk_peaker';
		
		this.volumeGauge.appendChild ( this.volumeGaugeInner );
		this.volumeGauge.appendChild( this.volumeGaugePeaker );
		
		this.volumeGauge2.appendChild ( this.volumeGaugeInner2 );
		this.volumeGauge2.appendChild( this.volumeGaugePeaker2 );
		
		var markers = d.createElement('div');
		markers.className = 'pk_markers pk_noselect';
		
		var str = '<span class="pk_mark1">-Inf</span>';
		for (var i = 35; i >= 0; --i)
		{
			str += '<span class="pk_mark1 '+(i%2?'pk_odd':'')+'">' + -(i*2) + '</span>';
		}
		markers.innerHTML = str;
		
		volume_parent.appendChild( this.volumeGauge );
		volume_parent.appendChild( this.volumeGauge2 );
		volume_parent.appendChild( markers );
		
		volume_parent.onclick = function() {
			q.volumeGaugePeaker.className = 'pk_peaker';
			q.volumeGaugePeaker2.className = 'pk_peaker';
		};

		footer.appendChild( volume_parent );

		// change temp message, it's pretty ugly #### TODO
		var ttmp = d.createElement('div');
		ttmp.className = 'pk_tmpMsg pk_ed_empty';
		ttmp.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">' +
		'<img src="mascot.png" style="width:52px;height:52px;border-radius:50%;box-shadow:0 0 20px rgba(0,229,160,0.35);border:1.5px solid #00E5A0;" alt="Mixo"/>' +
		'<span>Drag and drop an audio file here, or click ' +
		'<a style="white-space:nowrap;border:1px solid;border-radius:23px;padding:5px 18px;font-size:0.94em;margin-left:5px" '+
		'onclick="PKAudioEditor.engine.LoadSample()">here to use a sample</a></span></div>';
		main_audio_view.appendChild( ttmp );

		var ttmp2 = d.createElement('div');
		ttmp2.className = 'pk_tmpMsg2';
		ttmp2.innerHTML = '<img src="mascot.png" style="width:40px;height:40px;border-radius:50%;margin-bottom:8px;box-shadow:0 0 16px rgba(0,229,160,0.4);border:1px solid #00E5A0;" alt="Mixo"/>' +
			'<span>Processing Audio...</span><div class="pk_mload"><div></div></div>' + 
			'<div class="pk_prc"><span>0%</span>' + 
			'<button tabIndex="-1" class="pk_btn" '+
			'onclick="PKAudioEditor.fireEvent(\'RequestCancelModal\');">cancel</button></div>';

		d.body.appendChild( ttmp2 );
		UI.loaderEl = ttmp2;

		UI.listenFor ('WillDownloadFile', function() {
			UI.loaderEl.classList.add ('pk_act');
			UI.loaderEl.getElementsByTagName('span')[1].style.display = 'none';
		});
		UI.listenFor ('DidDownloadFile', function() {
			UI.loaderEl.classList.remove ('pk_act');
		});
		UI.listenFor ('DidProgressModal', function ( val ) {
			UI.loaderEl.getElementsByTagName('span')[1].style.display = 'block';
			UI.loaderEl.getElementsByTagName('span')[1].textContent = val + '%';
		});

		// Launchpad wiring & visibility
		function checkLaunchpadVisibility () {
			var hasAudio = !!(app.engine && app.engine.is_ready);
			var currentWs = UI.getActiveWorkspace ? UI.getActiveWorkspace () : 'waveform';
			var isMultitrack = !!(app.multitrack && app.multitrack.IsOn && app.multitrack.IsOn ()) || currentWs === 'multitrack';
			var isMastering = (UI.el && UI.el.classList.contains ('pk_mastering_on')) || currentWs === 'mastering';
			if (!hasAudio && !isMultitrack && !isMastering) {
				launchpad.style.display = 'flex';
				refreshRecentsList ();
			} else {
				launchpad.style.display = 'none';
			}
		}

		var dz = launchpad.querySelector ( '#pk_lp_dropzone' );
		if (dz) {
			dz.onclick = function () {
				app.fireEvent ('RequestLoadLocalFile');
			};
			dz.addEventListener ('dragover', function ( e ) {
				e.preventDefault ();
				dz.classList.add ('pk_lp_dragover');
			}, false);
			dz.addEventListener ('dragleave', function ( e ) {
				dz.classList.remove ('pk_lp_dragover');
			}, false);
			dz.addEventListener ('drop', function ( e ) {
				e.preventDefault ();
				e.stopPropagation ();
				dz.classList.remove ('pk_lp_dragover');
				if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
					if (app.multitrack && app.multitrack.LoadSessionFiles && app.multitrack.LoadSessionFiles ( e.dataTransfer.files )) {}
					else if (app.fireEvent ('RequestLoadPickedFiles', e.dataTransfer.files) !== true) {
						app.engine.LoadFile ( e.dataTransfer );
					}
				}
			}, false);
		}

		var lpImport = launchpad.querySelector ( '#pk_lp_btn_import' );
		if (lpImport) lpImport.onclick = function () { app.fireEvent ('RequestLoadLocalFile'); };

		var lpRecord = launchpad.querySelector ( '#pk_lp_btn_record' );
		if (lpRecord) lpRecord.onclick = function () { app.fireEvent ('RequestActionNewRec'); };

		var lpMulti = launchpad.querySelector ( '#pk_lp_btn_multi' );
		if (lpMulti) lpMulti.onclick = function () {
			if (UI.setWorkspace) UI.setWorkspace ('multitrack');
			else if (app.multitrack) app.multitrack.Toggle (true);
		};

		var lpDemo = launchpad.querySelector ( '#pk_lp_btn_demo' );
		if (lpDemo) lpDemo.onclick = function () {
			var sub = lpDemo.querySelector ( '.pk_lp_btn_sub' );
			if (sub) sub.textContent = 'Loading test.mp3...';
			app.engine.LoadSample ('test.mp3');
		};

		function refreshRecentsList () {
			var listEl = launchpad.querySelector ( '#pk_lp_recents_list' );
			if (!listEl) return ;
			if (!app.fls || !app.fls.Init) {
				listEl.innerHTML = '<span class="pk_lp_recents_empty">Local storage offline</span>';
				return ;
			}
			app.fls.Init (function ( err ) {
				if (err) {
					listEl.innerHTML = '<span class="pk_lp_recents_empty">Could not load local projects</span>';
					return ;
				}
				app.fls.ListProjects ({ sortBy: 'updated', sortOrder: 'desc' }, function ( projects ) {
					if (!projects || projects.length === 0) {
						listEl.innerHTML = '<span class="pk_lp_recents_empty">No saved projects found. Projects you save appear here.</span>';
						return ;
					}
					var html = '';
					var limit = Math.min (4, projects.length);
					for (var i = 0; i < limit; i++) {
						var p = projects[i];
						var name = p.name || 'Untitled Project';
						var dur = p.duration ? (Math.floor (p.duration / 60) + ':' + ('0' + Math.floor (p.duration % 60)).slice (-2)) : '--:--';
						var timeStr = formatTimeAgo (p.updated || p.created || Date.now());
						var typeBadge = p.projectType === 'multitrack' ? '𝍢 Multitrack' : '∿ Waveform';

						html += '<div class="pk_lp_recent_item">' +
							'<div class="pk_lp_recent_info">' +
								'<div style="display:flex;align-items:center;gap:6px;">' +
									'<span class="pk_lp_recent_name">' + name + '</span>' +
									'<span class="pk_proj_type_pill" style="font-size:9.5px;padding:1px 4px;">' + typeBadge + '</span>' +
									(p.hasRecovery ? '<span class="pk_recovery_badge" style="font-size:9px;padding:1px 4px;">Recovery</span>' : '') +
								'</div>' +
								'<span class="pk_lp_recent_meta">' + dur + ' • Saved ' + timeStr + '</span>' +
							'</div>' +
							'<button type="button" class="pk_lp_recent_btn" data-id="' + p.id + '">Resume ➜</button>' +
						'</div>';
					}
					html += '<div style="margin-top:8px;text-align:right;"><button type="button" id="pk_lp_view_all_btn" style="background:transparent;border:0;color:#00E5A3;font-size:11.5px;cursor:pointer;font-weight:600;">View All in Project Library ➜</button></div>';

					listEl.innerHTML = html;

					var btns = listEl.querySelectorAll ( '.pk_lp_recent_btn' );
					for (var b = 0; b < btns.length; b++) {
						btns[b].onclick = function () {
							var id = this.getAttribute ( 'data-id' );
							app.fls.GetSession (id, function ( sess ) {
								if (sess) {
									app.engine.LoadDB ( sess );
									if (app.autosave) {
										app.autosave.setProject ( sess.id, sess.name, sess.projectType, sess.revision || 1 );
									}
									w.OneUp && w.OneUp ('Resumed project: ' + (sess.name || 'Untitled'), 1200);
								}
							});
						};
					}

					var viewAllBtn = listEl.querySelector ( '#pk_lp_view_all_btn' );
					if (viewAllBtn) {
						viewAllBtn.onclick = function () {
							openProjectLibraryModal ( app );
						};
					}
				});

				// Startup Recovery Check
				app.fls.CheckRecoveryCandidates (function ( candidates ) {
					if (candidates && candidates.length > 0) {
						setTimeout (function () {
							openRecoveryPromptModal ( app, candidates[0] );
						}, 300);
					}
				});
			});
		}

		app.listenFor ('DidLoadFile', checkLaunchpadVisibility);
		app.listenFor ('DidUnloadFile', checkLaunchpadVisibility);
		app.listenFor ('DidWorkspaceChange', checkLaunchpadVisibility);
		app.listenFor ('DidUpdateMultitrack', checkLaunchpadVisibility);
		setTimeout (checkLaunchpadVisibility, 150);

		// Mastering Workspace Panel Component
		var mastering_panel = d.createElement ( 'div' );
		mastering_panel.className = 'pk_mastering_panel';
		mastering_panel.id = 'pk_mastering_panel';
		UI.el.appendChild ( mastering_panel );

		var analysisSeq = 0;
		var analysisState = 'idle'; // 'idle', 'analyzing', 'up-to-date', 'stale', 'error'
		var cachedReport = null;
		var cachedBuffer = null;
		var analysisDebounceTimer = null;
		var isPreviewing = false;

		var selectedTarget = -16.0;
		var selectedCeiling = -1.0;
		var useLimiter = false; // Safe Ceiling by default, opt-in True-Peak Limiter
		var lastAppliedState = null;

		function getActiveMasterBuffer () {
			var ws = app.engine && app.engine.wavesurfer;
			return ws && ws.backend && ws.backend.buffer;
		}

		function triggerMasteringAnalysis ( force ) {
			var buf = getActiveMasterBuffer ();
			if (!buf || !app.engine.is_ready) {
				analysisState = 'idle';
				cachedReport = null;
				cachedBuffer = null;
				renderMasteringPanel ();
				return ;
			}

			if (!force && cachedBuffer === buf && cachedReport) {
				analysisState = 'up-to-date';
				renderMasteringPanel ();
				return ;
			}

			var thisSeq = ++analysisSeq;
			analysisState = 'analyzing';
			renderMasteringPanel ();

			clearTimeout ( analysisDebounceTimer );
			analysisDebounceTimer = setTimeout (function () {
				if (thisSeq !== analysisSeq) return ; // Stale sequence dropped!

				try {
					if (PKAE._deps.lufs && PKAE._deps.lufs.analyze) {
						var rep = PKAE._deps.lufs.analyze ( buf );
						if (thisSeq !== analysisSeq) return ; // Superceded during analysis!

						cachedReport = rep;
						cachedBuffer = buf;
						analysisState = 'up-to-date';
						renderMasteringPanel ();
					}
				} catch ( err ) {
					if (thisSeq === analysisSeq) {
						console.error ("LUFS Analysis error:", err);
						analysisState = 'error';
						renderMasteringPanel ();
					}
				}
			}, 120);
		}

		function renderMasteringPanel () {
			if (!mastering_panel) return ;
			var buf = getActiveMasterBuffer ();

			if (!buf || !app.engine.is_ready) {
				mastering_panel.innerHTML = 
					'<div class="pk_mst_empty">' +
						'<div class="pk_mst_empty_icon">✦</div>' +
						'<div class="pk_mst_empty_text">No audio loaded in workstation. Load or record a track, or Bounce from Multitrack to begin mastering.</div>' +
						'<div style="display:flex;gap:10px;margin-top:6px;">' +
							'<button type="button" class="pk_mst_btn_load" id="pk_mst_load_btn">📂 Import Audio File</button>' +
							'<button type="button" class="pk_mst_btn_load" id="pk_mst_demo_btn">♫ Try Demo Track</button>' +
						'</div>' +
					'</div>';

				var loadBtn = mastering_panel.querySelector ( '#pk_mst_load_btn' );
				if (loadBtn) loadBtn.onclick = function () { app.fireEvent ('RequestLoadLocalFile'); };
				var demoBtn = mastering_panel.querySelector ( '#pk_mst_demo_btn' );
				if (demoBtn) demoBtn.onclick = function () { app.engine.LoadSample ('test.mp3'); };
				return ;
			}

			var report = cachedReport;
			var lufsVal = (report && isFinite (report.lufs)) ? report.lufs.toFixed (1) : '--.-';
			var tpVal = (report && isFinite (report.truePeakDb)) ? report.truePeakDb.toFixed (1) : '--.-';
			var rmsVal = (report && isFinite (report.rmsDb)) ? report.rmsDb.toFixed (1) : '--.-';
			var peakVal = (report && isFinite (report.peakDb)) ? report.peakDb.toFixed (1) : '--.-';

			// Compute delta & limiter behavior
			var norm = null;
			var gainDb = 0;
			var isLimited = false;
			var expectedLUFS = lufsVal;
			var expectedTP = tpVal;
			var explanation = '';

			if (report && isFinite (report.lufs)) {
				norm = PKAE._deps.lufs.gainForTarget ( report, selectedTarget, selectedCeiling );
				if (useLimiter) {
					gainDb = selectedTarget - report.lufs;
					expectedLUFS = selectedTarget.toFixed (1);
					expectedTP = Math.min (selectedCeiling, report.truePeakDb + gainDb).toFixed (1);
					isLimited = (report.truePeakDb + gainDb) > selectedCeiling;
					explanation = isLimited ? 
						'<span style="color:#00E5A3;">✦ True-Peak Limiter Active: Target reached (' + selectedTarget.toFixed(1) + ' LUFS) with ceiling clamped at ' + selectedCeiling.toFixed(1) + ' dBTP.</span>' :
						'<span style="color:#9CA39F;">Linear gain applied with clean peak headroom below ceiling.</span>';
				} else {
					gainDb = norm.gainDb;
					expectedLUFS = norm.expectedLUFS.toFixed (1);
					expectedTP = norm.expectedTruePeakDb.toFixed (1);
					isLimited = norm.limited;
					explanation = isLimited ?
						'<span style="color:#F59E0B;">⚠ Safe Ceiling: Gain scaled to +' + gainDb.toFixed(1) + ' dB to protect ' + selectedCeiling.toFixed(1) + ' dBTP ceiling. Enable Limiter to reach full target.</span>' :
						'<span style="color:#9CA39F;">Linear gain will reach full target without exceeding ceiling.</span>';
				}
			}

			var gainText = gainDb >= 0 ? ('+' + gainDb.toFixed (1)) : gainDb.toFixed (1);

			// Status badge
			var statusBadgeHtml = '';
			if (analysisState === 'analyzing') {
				statusBadgeHtml = '<span class="pk_mst_status_badge pk_status_analyzing">⟳ Analyzing...</span>';
			} else if (analysisState === 'up-to-date') {
				statusBadgeHtml = '<span class="pk_mst_status_badge pk_status_uptodate">✦ Up to date</span>';
			} else if (analysisState === 'stale') {
				statusBadgeHtml = '<span class="pk_mst_status_badge pk_status_stale">⚠ Analysis needed</span>';
			}

			var canUndo = (app.engine && app.engine.history && app.engine.history.length > 0) || lastAppliedState;

			mastering_panel.innerHTML = 
				'<div class="pk_mst_header">' +
					'<div class="pk_mst_title">' +
						'<span style="color:var(--ac);margin-right:6px;">✦</span>Mastering & Loudness Console ' +
						'<span class="pk_mst_sub">ITU-R BS.1770-4</span>' +
						statusBadgeHtml +
					'</div>' +
					'<div class="pk_mst_actions">' +
						'<button type="button" class="pk_mst_act_btn" id="pk_mst_reanalyze_btn" title="Re-measure audio buffer loudness">⟳ Re-analyze</button>' +
						'<button type="button" class="pk_mst_act_btn" id="pk_mst_eq_btn" title="Open 10-Band Graphic Equalizer">🎚️ 10-Band EQ</button>' +
						'<button type="button" class="pk_mst_act_btn pk_mst_export_btn" id="pk_mst_export_btn" title="Export Master Audio">⤓ Export Master</button>' +
					'</div>' +
				'</div>' +
				'<div class="pk_mst_grid">' +
					'<!-- Column 1: Source Loudness & True-Peak -->' +
					'<div class="pk_mst_col pk_mst_meters">' +
						'<div class="pk_mst_card">' +
							'<span class="pk_mst_metric_label">Integrated Loudness (Source)</span>' +
							'<span class="pk_mst_metric_val" id="pk_mst_lufs_val">' + lufsVal + ' <small>LUFS</small></span>' +
						'</div>' +
						'<div class="pk_mst_card">' +
							'<span class="pk_mst_metric_label">True-Peak Max (Source)</span>' +
							'<span class="pk_mst_metric_val ' + (report && report.truePeakDb > -1.0 ? 'pk_tp_warn' : '') + '" id="pk_mst_tp_val">' + tpVal + ' <small>dBTP</small></span>' +
						'</div>' +
						'<div class="pk_mst_meta_row">' +
							'<span>RMS: <strong>' + rmsVal + ' dB</strong></span>' +
							'<span>Peak: <strong>' + peakVal + ' dB</strong></span>' +
						'</div>' +
					'</div>' +

					'<!-- Column 2: Target Presets & Limiter Options -->' +
					'<div class="pk_mst_col pk_mst_presets">' +
						'<div class="pk_mst_section_label">Target Standard & Ceiling</div>' +
						'<div class="pk_mst_preset_grid">' +
							'<button type="button" class="pk_mst_preset_btn ' + (selectedTarget === -16 ? 'pk_preset_active' : '') + '" data-target="-16" data-ceiling="-1.0">🎙️ Podcast (-16 LUFS)</button>' +
							'<button type="button" class="pk_mst_preset_btn ' + (selectedTarget === -14 ? 'pk_preset_active' : '') + '" data-target="-14" data-ceiling="-1.0">🎵 Streaming (-14 LUFS)</button>' +
							'<button type="button" class="pk_mst_preset_btn ' + (selectedTarget === -23 ? 'pk_preset_active' : '') + '" data-target="-23" data-ceiling="-1.0">📺 Broadcast (-23 LUFS)</button>' +
							'<button type="button" class="pk_mst_preset_btn ' + (selectedTarget === -9 ? 'pk_preset_active' : '') + '" data-target="-9" data-ceiling="-0.3">🔊 Club / Loud (-9 LUFS)</button>' +
						'</div>' +
						'<div class="pk_mst_controls_row">' +
							'<div class="pk_mst_control_field">' +
								'<label for="pk_mst_target_range">Target: <strong id="pk_mst_target_txt">' + selectedTarget.toFixed(1) + ' LUFS</strong></label>' +
								'<input type="range" id="pk_mst_target_range" min="-30" max="-8" step="0.5" value="' + selectedTarget + '" />' +
							'</div>' +
							'<div class="pk_mst_control_field">' +
								'<label for="pk_mst_ceil">Ceiling: <strong id="pk_mst_ceil_txt">' + selectedCeiling.toFixed(1) + ' dBTP</strong></label>' +
								'<input type="range" id="pk_mst_ceil" min="-3.0" max="-0.1" step="0.1" value="' + selectedCeiling + '" />' +
							'</div>' +
						'</div>' +
						'<div class="pk_mst_limiter_row">' +
							'<label class="pk_mst_toggle_label">' +
								'<input type="checkbox" id="pk_mst_limiter_chk" ' + (useLimiter ? 'checked' : '') + ' />' +
								'<span>Enable True-Peak Soft Limiter</span>' +
							'</label>' +
						'</div>' +
					'</div>' +

					'<!-- Column 3: Processing & Actions -->' +
					'<div class="pk_mst_col pk_mst_apply_col">' +
						'<div class="pk_mst_impact_box">' +
							'<div class="pk_mst_impact_gain">Gain Adjustment: <strong>' + gainText + ' dB</strong></div>' +
							'<div class="pk_mst_impact_exp">Expected: <strong>' + expectedLUFS + ' LUFS</strong> • <strong>' + expectedTP + ' dBTP</strong></div>' +
							'<div class="pk_mst_impact_expl">' + explanation + '</div>' +
						'</div>' +
						'<div class="pk_mst_btns_row">' +
							'<button type="button" class="pk_mst_preview_btn ' + (isPreviewing ? 'pk_preview_active' : '') + '" id="pk_mst_preview_btn">' +
								(isPreviewing ? '⏹ Stop Preview' : '▶ Preview Master') +
							'</button>' +
							'<button type="button" class="pk_mst_apply_btn" id="pk_mst_apply_btn">✦ Apply Mastering</button>' +
						'</div>' +
						(canUndo ? '<button type="button" class="pk_mst_undo_link" id="pk_mst_undo_btn">↩ Undo Last Operation</button>' : '') +
					'</div>' +
				'</div>' +
				'<!-- Real-Time Spectrum Analyzer -->' +
				'<div class="pk_mst_spectrum_wrap">' +
					'<div class="pk_mst_spectrum_header">' +
						'<div class="pk_mst_spectrum_title">' +
							'<span class="pk_spec_live_dot" id="pk_spec_live_dot"></span>' +
							'<span style="font-weight:600;color:var(--fg-0);">Real-Time Frequency Spectrum</span>' +
							'<span class="pk_spec_live_badge" id="pk_spec_live_badge">FFT 2048 • 0.80 Smooth • Logarithmic</span>' +
						'</div>' +
						'<div class="pk_mst_spectrum_legend">' +
							'<span class="pk_spec_band" title="20 Hz - 60 Hz">Sub &lt;60Hz</span>' +
							'<span class="pk_spec_band" title="60 Hz - 250 Hz">Bass 60-250Hz</span>' +
							'<span class="pk_spec_band" title="250 Hz - 500 Hz">Low Mids 250-500Hz</span>' +
							'<span class="pk_spec_band" title="500 Hz - 2 kHz">Mids 500-2kHz</span>' +
							'<span class="pk_spec_band" title="2 kHz - 6 kHz">Presence 2k-6kHz</span>' +
							'<span class="pk_spec_band" title="6 kHz - 20 kHz">Brilliance 6k-20kHz</span>' +
						'</div>' +
					'</div>' +
					'<div class="pk_mst_spectrum_canvas_wrap">' +
						'<canvas id="pk_mst_spectrum_canvas" class="pk_mst_spectrum_canvas" height="130" aria-label="Live Frequency Spectrum Visualization"></canvas>' +
					'</div>' +
				'</div>';

			// Event wiring
			var reanalyzeBtn = mastering_panel.querySelector ( '#pk_mst_reanalyze_btn' );
			if (reanalyzeBtn) {
				reanalyzeBtn.onclick = function () {
					triggerMasteringAnalysis ( true );
				};
			}

			var eqBtn = mastering_panel.querySelector ( '#pk_mst_eq_btn' );
			if (eqBtn) {
				eqBtn.onclick = function () {
					app.fireEvent ('RequestActionFXUI_GraphicEQ');
				};
			}

			var exportBtn = mastering_panel.querySelector ( '#pk_mst_export_btn' );
			if (exportBtn) {
				exportBtn.onclick = function () {
					var dl = document.querySelector ('.pk_opt[data-id="dl"]');
					if (dl) dl.click ();
				};
			}

			var presetBtns = mastering_panel.querySelectorAll ( '.pk_mst_preset_btn' );
			for (var p = 0; p < presetBtns.length; p++) {
				presetBtns[p].onclick = function () {
					selectedTarget = parseFloat (this.getAttribute ('data-target'));
					selectedCeiling = parseFloat (this.getAttribute ('data-ceiling'));
					renderMasteringPanel ();
				};
			}

			var targetRange = mastering_panel.querySelector ( '#pk_mst_target_range' );
			if (targetRange) {
				targetRange.oninput = function () {
					selectedTarget = parseFloat (this.value);
					renderMasteringPanel ();
				};
			}

			var ceilRange = mastering_panel.querySelector ( '#pk_mst_ceil' );
			if (ceilRange) {
				ceilRange.oninput = function () {
					selectedCeiling = parseFloat (this.value);
					renderMasteringPanel ();
				};
			}

			var limiterChk = mastering_panel.querySelector ( '#pk_mst_limiter_chk' );
			if (limiterChk) {
				limiterChk.onchange = function () {
					useLimiter = !!this.checked;
					renderMasteringPanel ();
				};
			}

			var previewBtn = mastering_panel.querySelector ( '#pk_mst_preview_btn' );
			if (previewBtn) {
				previewBtn.onclick = function () {
					if (isPreviewing) {
						app.fireEvent ('RequestActionFX_PREVIEW_STOP');
						isPreviewing = false;
					} else {
						app.fireEvent ('RequestActionFX_PREVIEW_NormalizeLUFS', {
							target: selectedTarget,
							ceiling: selectedCeiling,
							useLimiter: useLimiter
						});
						isPreviewing = true;
					}
					renderMasteringPanel ();
				};
			}

			var applyBtn = mastering_panel.querySelector ( '#pk_mst_apply_btn' );
			if (applyBtn) {
				applyBtn.onclick = function () {
					if (isPreviewing) {
						app.fireEvent ('RequestActionFX_PREVIEW_STOP');
						isPreviewing = false;
					}
					lastAppliedState = { target: selectedTarget, ceiling: selectedCeiling, time: Date.now() };
					app.fireEvent ('RequestActionFX_NormalizeLUFS', {
						target: selectedTarget,
						ceiling: selectedCeiling,
						useLimiter: useLimiter
					});
					if (typeof OneUp === 'function') {
						OneUp ('✦ Master applied: ' + selectedTarget + ' LUFS (' + (useLimiter ? 'Limiter Active' : 'Linear Safe') + ')', 2000);
					}
				};
			}

			var undoBtn = mastering_panel.querySelector ( '#pk_mst_undo_btn' );
			if (undoBtn) {
				undoBtn.onclick = function () {
					app.fireEvent ('StateRequestUndo');
					lastAppliedState = null;
					if (typeof OneUp === 'function') OneUp ('Undid mastering operation', 1000);
				};
			}

			// Initialize Real-Time Spectrum Analyzer
			initSpectrumAnalyzer ();
		}

		UI.refreshMastering = function ( force ) {
			triggerMasteringAnalysis ( !!force );
		};

		// Automatic Re-analysis on Audio-Altering Operations
		function onAudioDataChanged () {
			if (UI.el.classList.contains ('pk_mastering_on')) {
				triggerMasteringAnalysis ( true );
			} else {
				analysisState = 'stale';
			}
		}

		app.listenFor ('DidStateChange', onAudioDataChanged);
		app.listenFor ('DidFinishFX', onAudioDataChanged);
		app.listenFor ('DidLoadFile', onAudioDataChanged);
		app.listenFor ('RequestPause', function () {
			if (isPreviewing) {
				isPreviewing = false;
				renderMasteringPanel ();
			}
		});

		UI.checkLaunchpadVisibility = checkLaunchpadVisibility;

		app.listenFor ('DidLoadFile', function () {
			if (UI.el.classList.contains ('pk_mastering_on')) {
				updateMasteringView ();
			}
		});

		// =========================================================================
		// Real-Time Spectrum Analyzer Implementation (Phase 3)
		// =========================================================================
		var spectrumRaf = 0;
		var spectrumPeaks = null;
		var spectrumAnalyser = null;

		function initSpectrumAnalyzer () {
			if (!mastering_panel) return ;
			var canvas = mastering_panel.querySelector ( '#pk_mst_spectrum_canvas' );
			if (!canvas) return ;
			var ctx = canvas.getContext ( '2d' );
			if (!ctx) return ;

			var liveDot = mastering_panel.querySelector ( '#pk_spec_live_dot' );
			var ws = app.engine && app.engine.wavesurfer;
			if (ws && ws.backend && ws.backend.analyser) {
				spectrumAnalyser = ws.backend.analyser;
				try {
					spectrumAnalyser.fftSize = 2048;
					spectrumAnalyser.smoothingTimeConstant = 0.8;
					spectrumAnalyser.minDecibels = -90;
					spectrumAnalyser.maxDecibels = 0;
				} catch (e) {}
			}

			var dpr = window.devicePixelRatio || 1;
			var rect = canvas.getBoundingClientRect ();
			var w = Math.max (300, Math.floor (rect.width || 600));
			var h = Math.max (100, Math.floor (rect.height || 130));
			canvas.width = Math.round (w * dpr);
			canvas.height = Math.round (h * dpr);

			if (!spectrumPeaks || spectrumPeaks.length !== canvas.width) {
				spectrumPeaks = new Float32Array (canvas.width);
				spectrumPeaks.fill (-90);
			}

			var freqBinCount = (spectrumAnalyser && spectrumAnalyser.frequencyBinCount) || 1024;
			var floatFreqData = new Float32Array (freqBinCount);

			function renderSpectrumFrame () {
				if (!canvas || !canvas.parentNode) return ;
				if (!UI.el.classList.contains ('pk_mastering_on')) {
					if (spectrumRaf) { cancelAnimationFrame (spectrumRaf); spectrumRaf = 0; }
					return ;
				}

				var isPlaying = ws && ws.isPlaying && ws.isPlaying ();
				if (isPlaying && liveDot && !liveDot.classList.contains ('pk_live_active')) {
					liveDot.classList.add ('pk_live_active');
				} else if (!isPlaying && liveDot && liveDot.classList.contains ('pk_live_active')) {
					liveDot.classList.remove ('pk_live_active');
				}

				if (isPlaying && spectrumAnalyser) {
					spectrumAnalyser.getFloatFrequencyData (floatFreqData);
				} else {
					for (var b = 0; b < floatFreqData.length; b++) floatFreqData[b] = -90;
				}

				var cw = canvas.width;
				var ch = canvas.height;
				ctx.clearRect (0, 0, cw, ch);

				ctx.fillStyle = '#080C0A';
				ctx.fillRect (0, 0, cw, ch);

				var sampleRate = (ws && ws.backend && ws.backend.ac && ws.backend.ac.sampleRate) || 48000;
				var nyquist = sampleRate / 2;

				var minF = 20;
				var maxF = Math.min (20000, nyquist);
				var logMin = Math.log10 (minF);
				var logMax = Math.log10 (maxF);
				var logRange = logMax - logMin;

				function freqToX ( f ) {
					if (f <= minF) return 0;
					if (f >= maxF) return cw;
					return ((Math.log10 (f) - logMin) / logRange) * cw;
				}

				function xToFreq ( x ) {
					return minF * Math.pow (10, (x / cw) * logRange);
				}

				function dbToY ( db ) {
					var norm = (-db) / 90;
					if (norm < 0) norm = 0;
					if (norm > 1) norm = 1;
					return norm * (ch - 14 * dpr) + (2 * dpr);
				}

				// Vertical frequency guide lines
				var guideFreqs = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
				ctx.font = (9 * dpr) + 'px "Inter", -apple-system, sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'bottom';

				for (var gf = 0; gf < guideFreqs.length; gf++) {
					var fVal = guideFreqs[gf];
					if (fVal > maxF) continue;
					var gx = freqToX (fVal);
					ctx.strokeStyle = '#15201B';
					ctx.lineWidth = 1 * dpr;
					ctx.beginPath ();
					ctx.moveTo (gx, 0);
					ctx.lineTo (gx, ch - 12 * dpr);
					ctx.stroke ();

					var fText = fVal >= 1000 ? (fVal / 1000) + 'k' : fVal + '';
					ctx.fillStyle = '#4E6559';
					ctx.fillText (fText, gx, ch - 1 * dpr);
				}

				// Horizontal dB guide lines
				var guideDbs = [0, -12, -24, -36, -48, -60, -72];
				ctx.textAlign = 'left';
				ctx.textBaseline = 'middle';

				for (var gd = 0; gd < guideDbs.length; gd++) {
					var dbVal = guideDbs[gd];
					var gy = dbToY (dbVal);
					ctx.strokeStyle = gd === 0 ? '#1E332A' : '#141E19';
					ctx.lineWidth = 1 * dpr;
					ctx.beginPath ();
					ctx.moveTo (0, gy);
					ctx.lineTo (cw, gy);
					ctx.stroke ();

					ctx.fillStyle = '#41574C';
					ctx.fillText (dbVal + ' dB', 4 * dpr, gy - 1 * dpr);
				}

				// Calculate spectrum points and peak decay
				var points = [];
				var hasActiveSignal = false;

				for (var px = 0; px < cw; px += 2) {
					var f1 = xToFreq (px);
					var f2 = xToFreq (px + 2);
					var b1 = Math.floor ((f1 / nyquist) * freqBinCount);
					var b2 = Math.max (b1, Math.floor ((f2 / nyquist) * freqBinCount));
					b1 = Math.max (0, Math.min (freqBinCount - 1, b1));
					b2 = Math.max (0, Math.min (freqBinCount - 1, b2));

					var maxDb = -90;
					for (var b = b1; b <= b2; b++) {
						if (floatFreqData[b] > maxDb) maxDb = floatFreqData[b];
					}
					if (!isFinite (maxDb)) maxDb = -90;
					if (maxDb > -85) hasActiveSignal = true;

					if (maxDb > spectrumPeaks[px]) {
						spectrumPeaks[px] = maxDb;
					} else {
						spectrumPeaks[px] = Math.max (-90, spectrumPeaks[px] - 0.45);
					}
					if (spectrumPeaks[px] > -85) hasActiveSignal = true;

					points.push ({ x: px, y: dbToY (maxDb), peakY: dbToY (spectrumPeaks[px]) });
				}

				if (points.length > 0) {
					// Filled gradient area
					var grad = ctx.createLinearGradient (0, 0, 0, ch);
					grad.addColorStop (0.0, 'rgba(0, 229, 163, 0.40)');
					grad.addColorStop (0.6, 'rgba(0, 229, 163, 0.12)');
					grad.addColorStop (1.0, 'rgba(0, 229, 163, 0.00)');

					ctx.beginPath ();
					ctx.moveTo (points[0].x, ch - 12 * dpr);
					for (var p = 0; p < points.length; p++) {
						ctx.lineTo (points[p].x, points[p].y);
					}
					ctx.lineTo (points[points.length - 1].x, ch - 12 * dpr);
					ctx.closePath ();
					ctx.fillStyle = grad;
					ctx.fill ();

					// Live curve stroke
					ctx.beginPath ();
					ctx.moveTo (points[0].x, points[0].y);
					for (var p = 1; p < points.length; p++) {
						ctx.lineTo (points[p].x, points[p].y);
					}
					ctx.strokeStyle = '#00E5A3';
					ctx.lineWidth = 1.5 * dpr;
					ctx.stroke ();

					// Peak hold stroke
					ctx.beginPath ();
					ctx.moveTo (points[0].x, points[0].peakY);
					for (var p = 1; p < points.length; p++) {
						ctx.lineTo (points[p].x, points[p].peakY);
					}
					ctx.strokeStyle = 'rgba(94, 234, 212, 0.85)';
					ctx.lineWidth = 1.0 * dpr;
					ctx.stroke ();
				}

				if (isPlaying || hasActiveSignal) {
					spectrumRaf = requestAnimationFrame (renderSpectrumFrame);
				} else {
					spectrumRaf = 0;
				}
			}

			function wakeUpSpectrum () {
				if (!spectrumRaf && UI.el.classList.contains ('pk_mastering_on')) {
					spectrumRaf = requestAnimationFrame (renderSpectrumFrame);
				}
			}

			UI.wakeUpSpectrum = wakeUpSpectrum;
			wakeUpSpectrum ();
		}

		app.listenFor ('DidPlay', function () {
			if (UI.wakeUpSpectrum) UI.wakeUpSpectrum ();
		});

		app.listenFor ('RequestResize', function () {
			if (UI.el.classList.contains ('pk_mastering_on')) {
				initSpectrumAnalyzer ();
			}
		});
	}


	function _bindToolbarTips ( UI, container ) {
		if (!container || !UI || !UI.el || UI.el.classList.contains ('pk_mob')) return ;

		var tip = d.createElement ('div');
		var active = null;
		var raf = 0;
		tip.className = 'pk_ttip';
		UI.el.appendChild ( tip );

		function tipButton ( node ) {
			while (node && node !== container) {
				if (node.classList && node.classList.contains ('pk_btn')) return node;
				node = node.parentNode;
			}
			return null;
		}

		function hide () {
			active = null;
			tip.classList.remove ('pk_act');
			if (raf) {
				w.cancelAnimationFrame ( raf );
				raf = 0;
			}
		}

		function place () {
			raf = 0;
			if (!active) return ;
			var span = active.getElementsByTagName ('span')[0];
			var txt = span && span.textContent;
			if (!txt || active.classList.contains ('pk_inact')) return hide ();

			var r = active.getBoundingClientRect ();
			tip.textContent = txt;
			tip.classList.add ('pk_act');
			var tw = tip.offsetWidth;
			var x = Math.max (4, Math.min (w.innerWidth - tw - 4, r.left + (r.width - tw) / 2));
			tip.style.left = (x >> 0) + 'px';
			tip.style.top = ((r.bottom + 6) >> 0) + 'px';
		}

		function show ( e ) {
			var btn = tipButton ( e.target );
			if (!btn || btn === active) return ;
			active = btn;
			if (!raf) raf = w.requestAnimationFrame ( place );
		}

		container.addEventListener ('mouseover', show, false);
		container.addEventListener ('focusin', show, false);
		container.addEventListener ('mouseout', function ( e ) {
			if (!active || tipButton ( e.relatedTarget ) === active) return ;
			hide ();
		}, false);
		container.addEventListener ('focusout', hide, false);
		container.addEventListener ('scroll', hide, false);
		w.addEventListener ('resize', hide, false);
	}

	function _makeUIToolbar (UI) {
		var container = d.createElement ( 'div' );
		container.className = 'pk_tbc';

		var toolbar = d.createElement ( 'div' );
		toolbar.className = 'pk_tb pk_noselect';

		var btn_groups = d.createElement( 'div' );
		btn_groups.className = 'pk_btngroup';
		
		var transport = d.createElement( 'div' );
		transport.className = 'pk_transport';

		// play button
		var btn_stop = d.createElement ('button');
		btn_stop.setAttribute ('tabIndex', -1);
		btn_stop.innerHTML = '<span>Stop Playback (Space)</span>';
		btn_stop.className = 'pk_btn pk_stop icon-stop2';
		btn_stop.onclick = function() {
			UI.fireEvent('RequestStop');
			this.blur();
		};
		transport.appendChild ( btn_stop );

		var btn_play = d.createElement ('button');
		btn_play.setAttribute ('tabIndex', -1);
		btn_play.className = 'pk_btn pk_play icon-play3';
		btn_play.innerHTML = '<span>Play (Space)</span>';
		transport.appendChild ( btn_play );
		btn_play.onclick = function() {
			UI.fireEvent('RequestPlay');
			this.blur();
		};
		UI.listenFor ('DidStopPlay', function(){
			btn_play.classList.remove ('pk_act');
		});
		UI.listenFor ('DidPlay', function(){
			btn_play.classList.add ('pk_act');
		});

		var btn_pause = d.createElement ('button');
		btn_pause.setAttribute('tabIndex', -1);
		btn_pause.className = 'pk_btn pk_pause icon-pause2';
		btn_pause.innerHTML = '<span>Pause (Shift+Space)</span>';
		transport.appendChild ( btn_pause );
		btn_pause.onclick = function() {
			UI.fireEvent('RequestPause');
			this.blur();
		};

		var btn_loop = d.createElement ('button');
		btn_loop.setAttribute('tabIndex', -1);
		btn_loop.className = 'pk_btn pk_loop icon-loop';
		btn_loop.innerHTML = '<span>Toggle Loop (L)</span>';
		transport.appendChild ( btn_loop );
		btn_loop.onclick = function() {
			UI.fireEvent('RequestSetLoop');
			this.blur();
		};
		UI.listenFor('DidSetLoop', function( val ) {
			val ? btn_loop.classList.add('pk_act') :
				  btn_loop.classList.remove('pk_act');
		});

		var btn_back_jump = d.createElement ('button');
		btn_back_jump.setAttribute('tabIndex', -1);
		btn_back_jump.className = 'pk_btn pk_back_jump icon-backward2';
		btn_back_jump.innerHTML = '<span>Seek (left arrow)</span>';
		transport.appendChild ( btn_back_jump );

		///////////////////////////////////////////////////////////
		// REWING / BACK BTN
		var btn_back_focus = false;
		var btn_back_hold = false;
		var btn_back_tm = null;
		btn_back_jump.onclick = function() {

			if (!btn_back_focus)
			{
				if (btn_back_tm) {
					clearTimeout(btn_back_tm);
					btn_back_tm = null;
				}

				var big_step = activeDurationFor ( app ) / 20;
				var zoom = activeZoomFor ( app );
				big_step /= ((zoom/2)+0.5);
				if (big_step > 1) big_step = big_step << 0;

				UI.fireEvent ('RequestSkipBack', big_step);
			}

			this.blur();
			btn_back_focus = false;
			btn_back_hold = false;
		};
		btn_back_jump.onmousedown = function () {
			btn_back_hold = true;
			this.focus ();
			if (!btn_back_tm) this.onfocus ();
		};
		btn_back_jump.onmouseup = function () {
			btn_back_hold = false;
		};

		btn_back_jump.onmouseleave = function () {
			btn_back_hold = false;
			if (btn_back_tm) {
				clearTimeout(btn_back_tm);
				btn_back_tm = null;
			}
			this.blur();
		};

		btn_back_jump.onfocus = function() {
			var btn = this;
			btn_back_focus = false;
			if (btn_back_tm) clearTimeout ( btn_back_tm );

			var step = function ( num, count ) {
				if (btn_back_hold || document.activeElement === btn)
				{
					btn_back_focus = true;

					UI.fireEvent ('RequestSkipBack', num);

					if (count >= activeSeekWarmupFor ( app ))
						num += num * activeSeekRampFor ( app );

					btn_back_tm = setTimeout(function() {
						step (num, ++count);
					},40);
				}
			};
			btn_back_tm = setTimeout(function(){

				var small = activeDurationFor ( app ) / 2000;
				var zoom = activeZoomFor ( app );
				small /= zoom;

				if (small < 0.01) {
					small = 0.01;
				}

				step (small, 0);
			},220);
		};
		////////////////////////

		var btn_front_jump = d.createElement ('button');
		btn_front_jump.setAttribute('tabIndex', -1);
		btn_front_jump.className = 'pk_btn pk_front_jump icon-forward3';
		btn_front_jump.innerHTML = '<span>Seek (right arrow)</span>';
		transport.appendChild ( btn_front_jump );

		var btn_frnt_focus = false;
		var btn_frnt_hold = false;
		var btn_frnt_tm = null;
		btn_front_jump.onclick = function() {
			if (!btn_frnt_focus)
			{
				if (btn_frnt_tm) {
					clearTimeout(btn_frnt_tm);
					btn_frnt_tm = null;
				}

				var big_step = activeDurationFor ( app ) / 20;
				var zoom = activeZoomFor ( app );
				big_step /= ((zoom/2)+0.5);
				if (big_step > 1) big_step = big_step << 0;

				UI.fireEvent ('RequestSkipFront', big_step);
			}

			this.blur();
			btn_frnt_focus = false;
			btn_frnt_hold = false;
		};
		btn_front_jump.onmousedown = function () {
			btn_frnt_hold = true;
			this.focus ();
			if (!btn_frnt_tm) this.onfocus ();
		};
		btn_front_jump.onmouseup = function () {
			btn_frnt_hold = false;
		};
		btn_front_jump.onmouseleave = function () {
			btn_frnt_hold = false;
			if (btn_frnt_tm) {
				clearTimeout(btn_frnt_tm);
				btn_frnt_tm = null;
			}
			this.blur();
		};
		btn_front_jump.onfocus = function() {
			var btn = this;
			btn_frnt_focus = false;
			if (btn_frnt_tm) clearTimeout ( btn_frnt_tm );

			var step = function ( num, count ) {
				if (btn_frnt_hold || document.activeElement === btn)
				{
					btn_frnt_focus = true;

					UI.fireEvent ('RequestSkipFront', num);

					if (count >= activeSeekWarmupFor ( app ))
						num += num * activeSeekRampFor ( app );

					btn_frnt_tm = setTimeout(function() {
						step (num, ++count);
					},40);
				}
			};
			btn_frnt_tm = setTimeout(function(){

				var small = activeDurationFor ( app ) / 2000;
				var zoom = activeZoomFor ( app );
				small /= zoom;

				if (small < 0.01) {
					small = 0.01;
				}

				step (small, 0);
			},220);
		};
		////////////////////////


		var k_arr_bck_time = 0;
		var k_arr_bck_mult = 1;
		var k_arr_bck_skip_frames = 4;
		UI.KeyHandler.addCallback ('KeyArrowBack', function ( key, c, ev ) {
			var mt_on = activeMultitrackFor ( app );
			if (UI.InteractionHandler.on || (!PKAudioEditor.engine.is_ready && !mt_on)) return ;
			if (c[16] || (ev && ev.shiftKey)) return ;
			if (mt_on && ev) ev.preventDefault ();

			var time = ev ? ev.timeStamp : w.performance.now ();
			var diff = time - k_arr_bck_time;

			if (diff > 158) {
				k_arr_bck_mult = 1;
				k_arr_bck_skip_frames = mt_on ? activeSeekWarmupFor ( app ) : 4;
			} else {
				if (--k_arr_bck_skip_frames < 0 && k_arr_bck_mult < 6.0)
					k_arr_bck_mult += mt_on ? activeSeekRampFor ( app ) : 0.05;
			}

			k_arr_bck_time = time;

			// get zoom factor
			var jump = 0.5;
			var zoom = mt_on ? activeZoomFor ( app ) : PKAudioEditor.engine.wavesurfer.ZoomFactor;
			var total_dur = mt_on ? activeDurationFor ( app ) : PKAudioEditor.engine.wavesurfer.getDuration ();

			jump = Math.max(total_dur / 200, 0.05);
			jump /= zoom;
			jump *= k_arr_bck_mult;

			UI.fireEvent( 'RequestSkipBack', jump );
		}, [37]);

		var k_arr_frnt_time = 0;
		var k_arr_frnt_mult = 1;
		var k_arr_frnt_skip_frames = 4;
		UI.KeyHandler.addCallback ('KeyArrowFront', function ( key, c, ev ) {
			var mt_on = activeMultitrackFor ( app );
			if (UI.InteractionHandler.on || (!PKAudioEditor.engine.is_ready && !mt_on)) return ;
			if (c[16] || (ev && ev.shiftKey)) return ;
			if (mt_on && ev) ev.preventDefault ();

			var time = ev ? ev.timeStamp : w.performance.now ();
			var diff = time - k_arr_frnt_time;

			if (diff > 158) {
				k_arr_frnt_mult = 1;
				k_arr_frnt_skip_frames = mt_on ? activeSeekWarmupFor ( app ) : 4;
			} else {
				if (--k_arr_frnt_skip_frames < 0 && k_arr_frnt_mult < 6.0)
					k_arr_frnt_mult += mt_on ? activeSeekRampFor ( app ) : 0.05;
			}

			k_arr_frnt_time = time;

			var jump = 0.5;
			var zoom = mt_on ? activeZoomFor ( app ) : PKAudioEditor.engine.wavesurfer.ZoomFactor;
			var total_dur = mt_on ? activeDurationFor ( app ) : PKAudioEditor.engine.wavesurfer.getDuration ();

			jump = Math.max(total_dur / 200, 0.05);

			jump /= zoom;
			jump *= k_arr_frnt_mult;

			UI.fireEvent( 'RequestSkipFront', jump );
		}, [39]);
		function mtSelectChannelKey ( diff, ev ) {
			var mt_on = activeMultitrackFor ( app );
			var target = ev && ev.target;
			if (!mt_on ||
				UI.InteractionHandler.on ||
				(UI.TopHeader.getOpenElement && UI.TopHeader.getOpenElement ()) ||
				(target && /INPUT|TEXTAREA|SELECT/.test (target.tagName))) return ;

			ev && ev.preventDefault ();
			ev && ev.stopPropagation ();
			UI.fireEvent ('RequestChannelSelect', diff);
		}
		UI.KeyHandler.addCallback ('KeyMtChannelUp', function ( key, c, ev ) {
			mtSelectChannelKey ( -1, ev );
		}, [38]);
		UI.KeyHandler.addCallback ('KeyMtChannelDown', function ( key, c, ev ) {
			mtSelectChannelKey ( 1, ev );
		}, [40]);
		UI.KeyHandler.addCallback ('KeyShiftArrowBack', function ( key, c, ev ) {
			var mt_on = activeMultitrackFor ( app );
			if (UI.InteractionHandler.on ||
				(ev && (ev.ctrlKey || ev.metaKey)) ||
				(!PKAudioEditor.engine.is_ready && !mt_on)) return ;
			ev && ev.preventDefault ();
			seekRegionMarkerEdgeFor (PKAE, -1);
		}, [16, 37]);
		UI.KeyHandler.addCallback ('KeyShiftArrowFront', function ( key, c, ev ) {
			var mt_on = activeMultitrackFor ( app );
			if (UI.InteractionHandler.on ||
				(ev && (ev.ctrlKey || ev.metaKey)) ||
				(!PKAudioEditor.engine.is_ready && !mt_on)) return ;
			ev && ev.preventDefault ();
			seekRegionMarkerEdgeFor (PKAE, 1);
		}, [16, 39]);
		UI.KeyHandler.addCallback ('killctx', function ( e ) {
			var event = new Event ('killCTX', {bubbles: true});
			document.body.dispatchEvent (event);
		}, [27]);

		var btn_back_total = d.createElement ('button');
		btn_back_total.setAttribute('tabIndex', -1);
		btn_back_total.className = 'pk_btn icon-previous2';
		btn_back_total.innerHTML = '<span>Seek Start (Shift + left arrow)</span>';
		transport.appendChild ( btn_back_total );
		btn_back_total.onclick = function() {
			seekRegionMarkerEdgeFor (PKAE, -1);
			this.blur();
		};

		var btn_front_total = d.createElement ('button');
		btn_front_total.setAttribute('tabIndex', -1);
		btn_front_total.className = 'pk_btn icon-next2';
		btn_front_total.innerHTML = '<span>Seek End (Shift + right arrow)</span>';
		btn_front_total.onclick = function() {
			seekRegionMarkerEdgeFor (PKAE, 1);
			this.blur();
		};
		transport.appendChild ( btn_front_total );


		var btn_rec = d.createElement ('button');
		btn_rec.setAttribute('tabIndex', -1);
		btn_rec.className = 'pk_btn icon-rec';
		btn_rec.innerHTML = '<span>Record (R)</span>';
		btn_rec.onclick = function() {
			if (this.getAttribute('disabled') === 'disabled') {
				this.blur (); return ;
			}

			UI.fireEvent('RequestActionRecordToggle');
			this.blur();
		};

		UI.listenFor ('ErrorRec', function() {
			btn_rec.style.opacity = 0.6;
			btn_rec.setAttribute("disabled", "disabled");
		});

		transport.appendChild ( btn_rec );
		UI.KeyHandler.addCallback ('KeyRecR', function( k ) {
			if (UI.InteractionHandler.on) return ;
			btn_rec.click ();
		}, [82]);

		UI.listenFor ('DidActionRecordStart', function () {
			btn_rec.classList.add ('pk_act');
		});
		UI.listenFor ('DidActionRecordStop', function () {
			btn_rec.classList.remove ('pk_act');
		});

		UI.KeyHandler.addCallback ('KeyTab', function ( key ) {
			if (UI.InteractionHandler.on || !activeReadyFor ( app )) return ;

			UI.fireEvent ('RequestViewCenterToCursor');
		}, [9]);

		UI.KeyHandler.addCallback ('KeyHelpShortcuts', function ( key, map, e ) {
			if (UI.InteractionHandler.on || (UI.KeyHandler && UI.KeyHandler.isEditTarget ( e ))) return ;
			if (UI.openSettingsModal) UI.openSettingsModal ('shortcuts');
			else if (UI.openShortcutsModal) UI.openShortcutsModal ();
			else if (w.PKAudioEditor && w.PKAudioEditor.openSettingsModal) w.PKAudioEditor.openSettingsModal ('shortcuts');
		}, [16, 191]);

		var is_chrome = !!window.chrome;
		var timing = d.createElement( 'div' );
		timing.className = 'pk_timecontainer';

		var timingspan = d.createElement( 'span' );

		if (!is_chrome)
		{
			timingspan.textContent = '00:00:000';
			timingspan.className = 'pk_timing';
			timing.appendChild( timingspan );
		}

		/////
		var pk_timingcnv = d.createElement( 'canvas' );
		pk_timingcnv.className = 'pk_timingcnv';
		pk_timingcnv.width = 150;
		pk_timingcnv.height = 40;
		var pk_timingnum = '00:00:000';
		var pk_timingctx = pk_timingcnv.getContext('2d', {alpha:false});
		var timing_caches = {};

		if (is_chrome)
		{
			timing.appendChild( pk_timingcnv );
			pk_timingctx.fillStyle = "#000";
			pk_timingctx.fillRect(0, 0, 150, 40);

			for (var ii = 0; ii < 11; ++ii)
			{
				var curr_cache = d.createElement('canvas');
				curr_cache.width = 18;
				curr_cache.height = 26;
				var curr_ctx = curr_cache.getContext('2d', {alpha:false});
				curr_ctx.font = "29px Helvetica, Arial, sans-serif";
				curr_ctx.textAlign = "center";
				curr_ctx.fillStyle = "#000";
				curr_ctx.fillRect(0, 0, 18, 26);
				curr_ctx.fillStyle = "#fff";
				curr_ctx.textBaseline = 'middle';

				if (ii === 10) {
					curr_ctx.fillText (':', 8, 14);
					timing_caches[':'] = curr_cache;
				}
				else {
					curr_ctx.fillText (ii + '', 9, 14);
					timing_caches[ii+''] = curr_cache;
				}
				// timing_caches.push (curr_cache);
				// document.body.appendChild( curr_cache );
			}

			(function (pk_timingctx, timing_caches){
				var ttm = '00:00:000';
				for (var jk = 0; jk < ttm.length; ++jk)
				{
					pk_timingctx.drawImage (timing_caches[ttm[jk]], jk * 16, 10);
				}
			})(pk_timingctx, timing_caches);
		}
		/////


		var total_duration = d.createElement( 'span' );
		total_duration.textContent = '00:00:000';
		total_duration.className = 'pk_total_dur';
		timing.appendChild( total_duration );
		
		var hover_duration = d.createElement( 'span' );
		hover_duration.textContent = '00:00:000';
		hover_duration.className = 'pk_hover_dur';
		timing.appendChild( hover_duration );

		var tb = null, tc = 0, td = 0;
		function closeTB () {
			if (!tb) return ;
			d.removeEventListener ('mousedown', tb._off);
			tb.parentNode && tb.parentNode.removeChild (tb);
			tb = null;
		}
		function tnav ( b, a, go, cl ) {
			b.onkeydown = function (ev) {
				var k = ev.keyCode, j;
				ev.stopPropagation ();
				if (k === 13) go ();
				else if (k === 27) cl ();
				else if (k > 36 && k < 41 && (j = a.indexOf (ev.target)) > -1) {
					if ((k === 37 || k === 39) && ev.target.tagName === 'INPUT' &&
						(ev.target.selectionStart !== ev.target.selectionEnd ||
						(k === 37 && ev.target.selectionStart > 0) ||
						(k === 39 && ev.target.selectionEnd < ev.target.value.length))) return ;
					j = (j + (k < 39 ? -1 : 1) + a.length) % a.length;
					a[j].focus ();
					a[j].tagName === 'INPUT' && a[j].select ();
					ev.preventDefault ();
				}
			};
		}
		function openTB ( e ) {
			e && e.stopPropagation ();
			e && e.preventDefault ();
			var dur = activeDurationFor ( app ) || td || 0;
			closeTB ();
			var t = Math.max (0, Math.min (dur, tc || activeCursorTimeFor ( app ) || 0));
			var s = t >> 0;
			var ms = ((t - s) * 1000 + 0.5) >> 0;
			if (ms > 999) { ms = 0; ++s; }
			var m = (s / 60) >> 0;
			s %= 60;
			var b = tb = d.createElement ('div');
			b.className = 'pk_pgeq_freq';
			b.style.padding = '3px 16px';
			b.style.paddingRight = '6px';
			b.innerHTML =
				'<input class="pk_mtbeat_bpm" style=width:46px> <b>:</b> <input class="pk_mtbeat_bpm" style=width:46px>' +
				' <b>:</b> <input class="pk_mtbeat_bpm" style=width:46px> <button class="pk_modal_a_bottom pk_modal_a_accpt" style="float:none;display:inline-block;vertical-align:middle">Go</button>';
			d.body.appendChild ( b );
			var i = b.getElementsByTagName ('input');
			var g = b.lastChild;
			var a = [i[0], i[1], i[2], g];
			i[0].value = m; i[1].value = s; i[2].value = ms;
			var r = timing.getBoundingClientRect ();
			b.style.left = (r.left|0) + 'px';
			b.style.top = ((r.top + 3)|0) + 'px';
			function go () {
				var durr = activeDurationFor ( app ) || td || 0;
				if (!(durr > 0)) return closeTB ();
				var v = Math.max (0, Math.min (durr, ((i[0].value|0) * 60) + (i[1].value|0) + ((i[2].value|0) / 1000)));
				tc = v;
				drawT (v);
				UI.fireEvent ('RequestSeekTo', v / durr);
				closeTB ();
			}
			b._off = function ( ev ) { if (!b.contains (ev.target) && !timing.contains (ev.target)) closeTB (); };
			tnav ( b, a, go, closeTB );
			g.onclick = go;
			d.addEventListener ('mousedown', b._off);
			i[0].focus ();
			i[0].select ();
		}
		timing.onmousedown = openTB;

		setTimeout(function () {
			UI.listenFor ('DidZoom', function (v, f) {
				// do something smarter for f (event) ####
				if (f)
					hover_duration.textContent = formatTime (
						PKAudioEditor.engine.wavesurfer.drawer.handleEvent(f) * 
						PKAudioEditor.engine.wavesurfer.VisibleDuration + 
						PKAudioEditor.engine.wavesurfer.LeftProgress );
			});

			var old_refresh = 0;

			var avv = d.getElementsByClassName('pk_av')[0]; 
			avv.addEventListener ('mousemove', function ( e ) {
				// re-run the mousemove fam on zoom based on the pointer position)

				// throttle this as well ####  violation
				var new_refresh = e.timeStamp;

				if (new_refresh - old_refresh < 58) {
					return ;
				}

				old_refresh = new_refresh;

				hover_duration.textContent = formatTime (
					PKAudioEditor.engine.wavesurfer.drawer.handleEvent( e ) * 
					PKAudioEditor.engine.wavesurfer.VisibleDuration + 
					PKAudioEditor.engine.wavesurfer.LeftProgress );
			}, false);


			var main_context = PKAudioEditor._deps.ContextMenu ( avv );

			main_context.addOption ('Select Visible View', function( e,x,i ) {
				UI.fireEvent ('RequestRegionSet');
			}, false );

			main_context.addOption ('Reset Zoom', function( e ) {
				UI.fireEvent ('RequestZoomUI', 0);
			}, false );

			UI.listenFor ('DidHoverTime', function ( time ) {
				hover_duration.textContent = formatTime ( time );
			});

			main_context.addOption ('Set Volume/Gain', function( e ) {
				UI.fireEvent ('RequestFXUI_Gain');
			}, false );

			main_context.addOption ('Seamless Loop...', function( e ) {
				UI.fireEvent ('RequestActionFXUI_SeamlessLoop');
			}, false );

			main_context.addOption ('Copy', function( e ) {
				var region = PKAudioEditor.engine.wavesurfer.regions.list[0];
				if (!region) return ;

				UI.fireEvent( 'RequestActionCopy');
			}, false );
			main_context.addOption ('Paste', function( e ) {
				if (!copable) return ;
				UI.fireEvent( 'RequestActionPaste');
			}, false );
			main_context.addOption ('Cut', function( e ) {
				var region = PKAudioEditor.engine.wavesurfer.regions.list[0];
				if (!region) return ;

				UI.fireEvent( 'RequestActionCut', 1);
			}, false );
			main_context.addOption ('Insert Silence', function( e ) {
				UI.fireEvent ('RequestFXUI_Silence', 0); // #### call effect
			}, false );
			// --- 


			var copable = false;
			UI.listenFor ('DidSetClipboard', function ( val ) {
				if (val)
					copable = true;
				else
					copable = false;
			});

			main_context.onOpen = function ( menu, div ) {
				var divs = div.childNodes;
				if (!copable) divs[5].className += ' pk_inact';

				UI.fireEvent ('RequestPause');

				var region = PKAudioEditor.engine.wavesurfer.regions.list[0];
				if (region) return ;

				divs[3].className += ' pk_inact';
				divs[4].className += ' pk_inact';
				divs[6].className += ' pk_inact';
			};

		}, 1000);

		UI.listenFor ('DidUpdateLen', function( val ) {
			td = val || 0;
			total_duration.textContent = formatTime (val);
		});
		
		function formatTime( time ) {
			var time_s = time >> 0;
			var miliseconds = time - time_s;

			if (time_s < 10)
			{
				if (time === 0) return '00:00:000';
				time_s = '00:0' + time_s;
			}
			else if (time_s < 60)
			{
				time_s = '00:' + time_s;
			}
			else
			{
				var m = (time_s / 60) >> 0;
				var s = (time_s % 60);
				time_s = ((m<10)?'0':'') + m + ':' + (s < 10 ? '0'+s : s);
			}

			if (miliseconds < 0.1)
			{
				return time_s + ':0' + (miliseconds < 0.01 ? '0' : '') + ((miliseconds*1000)>>0);
			}

			return time_s + ':' + ((miliseconds*1000)>>0); // (miliseconds+'').substr(2, 3);
		}
		UI.formatTime = formatTime;

		function drawT ( time ) {
			var ttm = formatTime (time);
			if (!is_chrome)
			{
				timingspan.textContent = ttm;
				return ;
			}

			var exit = false;
			for (var jk = 0; jk < ttm.length; ++jk)
			{
				if (!exit)
				{
					if (ttm[jk] === pk_timingnum[jk]) continue;
					exit = true;
				}
				pk_timingctx.drawImage (timing_caches[ttm[jk]], jk * 16, 10);
			}
			pk_timingnum = ttm;
		}

		function formatTimelineTime ( time, format ) {
			var time_s = time >> 0;
			var miliseconds = time - time_s;

			if (time_s < 10)
				time_s = '00:0' + time_s;
			else if (time_s < 60)
				time_s = '00:' + time_s;
			else
			{
				var m = (time_s / 60) >> 0;
				var s = (time_s % 60);
				time_s = ((m<10)?'0':'') + m + ':' + (s < 10 ? '0'+s : s);
			}

			if (format === 1)
				return time_s + ':' + (miliseconds+'').substr(2, 2);

			return time_s;
		}
		UI.formatTimelineTime = formatTimelineTime;

		function timelineRuler ( total, width, left_offset, visible_width ) {
			var data = {step: 0, ticks: [], halves: []};
			if (!total || !width) return data;

			var pixel_distance = width / total;
			if (pixel_distance < 60)
				pixel_distance = 60;
			else if (pixel_distance > 160)
				pixel_distance /= ((pixel_distance / 160) >> 0) + 1;

			data.step = pixel_distance;
			left_offset = left_offset || 0;
			visible_width = visible_width || width;

			var step_time = pixel_distance / width * total;
			var format = step_time < 1.0 ? 1 : (step_time < 60 ? 2 : 3);
			var x = Math.max (0, (((left_offset - 2) / pixel_distance) >> 0) * pixel_distance);
			var end = left_offset + visible_width + 2;

			for (; x <= end && x < width - 2; x += pixel_distance)
			{
				if (x >= left_offset - 2)
					data.ticks.push ({
						x: x,
						time: x / width * total,
						label: formatTimelineTime ( x / width * total, format )
					});
			}

			x = Math.max (pixel_distance / 2,
				((((left_offset - 2 - pixel_distance / 2) / pixel_distance) >> 0) * pixel_distance) + pixel_distance / 2);
			for (; x <= end && x < width - 2; x += pixel_distance)
				if (x >= left_offset - 2) data.halves.push ( x );

			return data;
		}
		UI.timelineRuler = timelineRuler;

		function drawTimelineRuler ( ctx, total, width, left_offset, visible_width ) {
			var data = timelineRuler ( total, width, left_offset, visible_width );
			ctx.fillStyle = '#111';
			ctx.fillRect (0, 0, visible_width, 24);
			ctx.fillStyle = '#aaa';
			ctx.strokeStyle = '#aaa';
			ctx.textAlign = 'center';

			for (var i = 0; i < data.ticks.length; ++i)
				ctx.fillText ( data.ticks[i].label, data.ticks[i].x - left_offset, 12 );

			ctx.beginPath ();
			for (i = 0; i < data.ticks.length; ++i) {
				var x = data.ticks[i].x - left_offset;
				ctx.moveTo (x, 16);
				ctx.lineTo (x, 24);
			}
			for (i = 0; i < data.halves.length; ++i) {
				x = data.halves[i] - left_offset;
				ctx.moveTo (x, 19);
				ctx.lineTo (x, 24);
			}
			ctx.stroke ();
			return data;
		}
		UI.drawTimelineRuler = drawTimelineRuler;
		
		var volume1 = 0;
		var volume2 = 0;
		var old_refresh = 0;
		var wvpnt = document.querySelector('.pk_wavepoint');

		UI.listenFor ('DidAudioProcess', function( val ) {

			var time = val[0];
			var loudness = val[1];
			if (time > -1) tc = time;

			var new_refresh =  val[2] || w.performance.now ();

			if (new_refresh - old_refresh < 50) {
				return ;
			}

			old_refresh = new_refresh;

			if (time > -1)
			{
					drawT (time);

				var mt_on = activeMultitrackFor ( app );
				var zoomed = mt_on ?
					mt_on.GetZoomFactor () > 1 :
					PKAudioEditor.engine.wavesurfer.ZoomFactor > 1;

				if (zoomed)
				{
					var perc = mt_on ?
						mt_on.GetCursorPercent () :
						time / PKAudioEditor.engine.wavesurfer.getDuration ();

					if (!wvpnt) wvpnt = document.querySelector('.pk_wavepoint');
					wvpnt.style.left = ((perc * 10000)>>0)/100 + '%';
					// wvpnt.style.left = ((perc * 100).toFixed(2)/1) + '%';
				}
			}

			if (!loudness)
			{
				UI.footer.volumeGaugePeaker.className = 'pk_peaker';
				UI.footer.volumeGaugePeaker2.className = 'pk_peaker';

				UI.footer.volumeGaugeInner.style.transform = 'translate3d(0,0,0)';
				UI.footer.volumeGaugeInner2.style.transform = 'translate3d(0,0,0)';
				// UI.footer.volumeGaugeInner.style.width = '100%';
				// UI.footer.volumeGaugeInner2.style.width = '100%';
			}
			else if (loudness[0] > 0) {
				UI.footer.volumeGaugePeaker.className = 'pk_peaker pk_act';
				
				UI.footer.volumeGaugeInner.style.transform = 'translate3d(100%,0,0)';
				// UI.footer.volumeGaugeInner.style.width = '0%';
				volume1 = 100;

				var peak_time = activeCursorTimeFor ( app );
				UI.footer.volumeGaugePeaker.setAttribute ('title', 'Peak at ' + peak_time.toFixed(2) );
				if (loudness[1] > 0) {
					UI.footer.volumeGaugePeaker2.className = 'pk_peaker pk_act';
					
					UI.footer.volumeGaugeInner2.style.transform = 'translate3d(100%,0,0)';
					// UI.footer.volumeGaugeInner2.style.width = '0%';
					volume2 = 100;

					UI.footer.volumeGaugePeaker2.setAttribute ('title', 'Peak at ' + peak_time.toFixed(2) );
				}
			}
			else if (loudness[1] > 0) {
				UI.footer.volumeGaugePeaker2.className = 'pk_peaker pk_act';
				
				UI.footer.volumeGaugeInner2.style.transform = 'translate3d(100%,0,0)';
				// UI.footer.volumeGaugeInner2.style.width = '0%';
				volume2 = 100;

				var peak_time2 = activeCursorTimeFor ( app );
				UI.footer.volumeGaugePeaker2.setAttribute ('title', 'Peak at ' + peak_time2.toFixed(2) );
			}
			else
			{
				var tmp = (100 + loudness[0]);
				if (tmp < -100) volume1 = 0; // tmp = -100;
				else
				{
					volume1 = volume1 + (tmp - volume1)/4;
					if (isNaN (volume1)) volume1 = 0;
				}

				tmp = (100 + loudness[1]);
				if (tmp < -100) volume2 = 0; //tmp = -100;
				else
				{
					volume2 = volume2 + (tmp - volume2)/4;
					if (isNaN (volume2)) volume2 = 0;
				}

				UI.footer.volumeGaugeInner.style.transform = 'translate3d(' + volume1 + '%,0,0)';
				UI.footer.volumeGaugeInner2.style.transform = 'translate3d(' + volume2 + '%,0,0)';
				// UI.footer.volumeGaugeInner.style.width = (100 - volume1) + '%';
				// UI.footer.volumeGaugeInner2.style.width = (100 - volume2) + '%';
			}
		});
		
		
		var actions = d.createElement( 'div' );
		actions.className = 'pk_ctns';
		
		var copy_btn = d.createElement ('button');
		copy_btn.setAttribute('tabIndex', -1);
		copy_btn.className = 'pk_btn icon-files-empty pk_inact';
		copy_btn.innerHTML = '<span>Copy Selection (Shift + C)</span>';
		actions.appendChild ( copy_btn );

		copy_btn.onclick = function() {
			UI.fireEvent( 'RequestActionCopy');
			this.blur();
		};

		UI.listenFor ('DidSetClipboard', function ( val ) {
			if (val)
				paste_btn.classList.remove ('pk_inact');
			else
				paste_btn.classList.add ('pk_inact');
		});

		var paste_btn = d.createElement ('button');
		paste_btn.setAttribute('tabIndex', -1);
		paste_btn.className = 'pk_btn icon-file-text2 pk_inact';
		paste_btn.innerHTML = '<span>Paste Selection (Shift + V)</span>';
		actions.appendChild ( paste_btn );

		paste_btn.onclick = function() {
			UI.fireEvent( 'RequestActionPaste');
			this.blur();
		};

		var cut_btn = d.createElement ('button');
		cut_btn.setAttribute('tabIndex', -1);
		cut_btn.className = 'pk_btn icon-scissors pk_inact';
		cut_btn.innerHTML = '<span>Cut Selection (Shift + X)</span>';
		actions.appendChild ( cut_btn );

		cut_btn.onclick = function() {
			UI.fireEvent( 'RequestActionCut', 1);
			this.blur();
		};
		UI.listenFor ('DidSelectClip', function () {
			copy_btn.classList.remove ('pk_inact');
			cut_btn.classList.remove ('pk_inact');
			btn_clear_selection.classList.remove ('pk_inact');
		});
		UI.listenFor ('DidDeselectClip', function () {
			copy_btn.classList.add ('pk_inact');
			cut_btn.classList.add ('pk_inact');
		});
		
		var silence_btn = d.createElement ('button');
		silence_btn.setAttribute('tabIndex', -1);
		silence_btn.className = 'pk_btn icon-silence';
		silence_btn.innerHTML = '<span>Insert Silence (Shift + N)</span>';
		actions.appendChild ( silence_btn );

		UI.KeyHandler.addCallback ('KeyShiftN', function( k, m, e ) {
			if (UI.InteractionHandler.on || (e && (e.ctrlKey || e.metaKey))) return ;

			silence_btn.click ();
		},[16, 78]);

		silence_btn.onclick = function() {
			UI.fireEvent( 'RequestFXUI_Silence');			
			this.blur();
		};

		
		
		var selection = d.createElement( 'div' );
		selection.className = 'pk_selection';
		selection.innerHTML = '<div class="pk_sellist">' + 
			'<span class="pk_title">Selection:</span>' + 
			'<div><span class="title">Start:</span><span class="s_s pk_dat">-</span></div>' + 
			'<div><span class="title">End:</span><span class="s_e pk_dat">-</span></div>' + 
			'<div><span  class="title">Duration:</span><span class="s_d pk_dat">-</span></div>' +
		'</div>';
		
		var btn_clear_selection = d.createElement ('button');
		btn_clear_selection.setAttribute('tabIndex', -1);
		btn_clear_selection.className = 'pk_btn icon-clearsel pk_inact';
		btn_clear_selection.innerHTML = '<span>Clear Selection (Q key)</span>';

		var sel_spans = selection.getElementsByClassName('pk_dat');
		var sb = null, sr = null, sd = 0;
		function closeSB () {
			if (!sb) return ;
			d.removeEventListener ('mousedown', sb._off);
			sb.parentNode && sb.parentNode.removeChild (sb);
			sb = null;
		}
		function openSB ( e ) {
			var rg = sr, dur = sd || activeDurationFor ( app );
			if (!rg || !(dur > 0)) return ;
			e.stopPropagation ();
			e.preventDefault ();
			closeSB ();
			var b = sb = d.createElement ('div');
			b.className = 'pk_pgeq_freq';
			b.style.cssText = 'padding:6px 10px;width:auto;white-space:nowrap';
			b.innerHTML = '<b style=font-size:12px>Start</b> <input class="pk_mtbeat_bpm" style=width:62px> <b style=font-size:12px>End</b> <input class="pk_mtbeat_bpm" style=width:62px> <button class="pk_modal_a_bottom pk_modal_a_accpt" style="float:none;display:inline-block;vertical-align:middle">Go</button>';
			d.body.appendChild ( b );
			var i = b.getElementsByTagName ('input');
			var g = b.lastChild;
			var a = [i[0], i[1], g];
			i[0].value = rg.start.toFixed (3);
			i[1].value = rg.end.toFixed (3);
			var r = selection.getBoundingClientRect ();
			b.style.left = (r.left|0) + 'px';
			b.style.top = ((r.top + 3)|0) + 'px';
			function go () {
				var rg = sr;
				var a = parseFloat (i[0].value), z = parseFloat (i[1].value);
				if (!rg) return closeSB ();
				dur = sd || activeDurationFor ( app ) || dur;
				if (!(a >= 0)) a = rg.start;
				if (!(z >= 0)) z = rg.end;
				a = Math.max (0, Math.min (dur, a));
				z = Math.max (0, Math.min (dur, z));
				if (Math.abs (z - a) > 0.001) UI.fireEvent ('RequestRegionSet', a, z);
				closeSB ();
			}
			b._off = function ( ev ) { if (!b.contains (ev.target) && !selection.contains (ev.target)) closeSB (); };
			tnav ( b, a, go, closeSB );
			g.onclick = go;
			d.addEventListener ('mousedown', b._off);
			i[e.target === sel_spans[1] ? 1 : 0].focus ();
		}
		sel_spans[0].onmousedown = sel_spans[1].onmousedown = sel_spans[2].onmousedown = openSB;
		UI.listenFor ('DidCreateRegion', function ( region ) {
			if (region && region.mt)
			{
				copy_btn.classList.add ('pk_inact');
				cut_btn.classList.add  ('pk_inact');
			}
			else
			{
				copy_btn.classList.remove ('pk_inact');
				cut_btn.classList.remove ('pk_inact');
			}
			btn_clear_selection.classList.remove  ('pk_inact');
			
			if (region)
			{
				sr = region;
				sd = activeDurationFor ( app ) || region.end || 0;
				if (!sel_spans[0]) sel_spans = document.querySelectorAll('.pk_sellist .pk_dat');
				sel_spans[0].textContent = region.start.toFixed(3);
				sel_spans[1].textContent = region.end.toFixed(3);
				sel_spans[2].textContent = (region.end - region.start).toFixed(3);
			}
		});
		UI.listenFor ('DidDestroyRegion', function () {
			copy_btn.classList.add ('pk_inact');
			cut_btn.classList.add  ('pk_inact');
			btn_clear_selection.classList.add  ('pk_inact');
			closeSB ();
			sr = null;
			sd = 0;

			if (!sel_spans[0]) sel_spans = document.querySelectorAll('.pk_sellist .pk_dat');
			sel_spans[0].textContent = '-';
			sel_spans[1].textContent = '-';
			sel_spans[2].textContent = '-';
		});
		
		btn_clear_selection.onclick = function () {
			UI.fireEvent( 'RequestRegionClear');
			this.blur ();
		};
		selection.appendChild ( btn_clear_selection );
		
		toolbar.appendChild ( timing );
		
		
		UI.listenFor ('DidChanToggle', function ( chan, val ) {
			var region = PKAudioEditor.engine.wavesurfer.regions.list[0];
			if (!region) return ;

			if (val === 1) {
				region.element.style.top = '0';
				region.element.style.height = '100%';
				return ;
			}

			if (chan === 0) {
				region.element.style.top = '50%';
				region.element.style.height = '50%';
				return ;
			}

			if (chan === 1) {
				region.element.style.top = '0';
				region.element.style.height = '50%';
			}
			//
		});

		// end
		toolbar.appendChild ( btn_groups );
		btn_groups.appendChild ( transport );
		btn_groups.appendChild ( actions );
		toolbar.appendChild ( selection );

		container.appendChild ( toolbar );

		UI.el.appendChild ( container );
		_bindToolbarTips ( UI, container );

		var _appEl = d.getElementById('app');

		_appEl.addEventListener('dragover', function ( e ) {
			var mt = PKAudioEditor && PKAudioEditor.multitrack;
			if (mt && mt.IsOn && mt.IsOn ()) {
				e.preventDefault ();
			}
		}, true);
		_appEl.addEventListener('drop', function ( e ) {
			var mt = PKAudioEditor && PKAudioEditor.multitrack;
			if (!mt || !mt.IsOn || !mt.IsOn ()) return ;
			var t = e.target;
			while (t && t !== _appEl) {
				if (t.classList && (
					t.classList.contains ('pk_mt_lane') ||
					t.classList.contains ('pk_mt_track')
				)) return ;
				t = t.parentNode;
			}
			if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return ;
			e.preventDefault ();
			e.stopPropagation ();
			mt.AddFilesAuto ( e.dataTransfer.files );
		}, true);

		dragNDrop( _appEl, 'pk_overlay', function ( e, name ) {
			var mt = PKAudioEditor && PKAudioEditor.multitrack;
			if (mt && mt.IsOn && mt.IsOn ()) return ;
			if (mt && mt.LoadSessionBuffer) {
				if (mt.LoadSessionBuffer ( e, name )) return ;
				if (/\.amss$/i.test (name || '')) {
					OneUp ('Could not load session', 1400);
					return ;
				}
			}
			PKAudioEditor.engine.LoadArrayBuffer ( new Blob([e]) );
		}, 'arrayBuffer' );

		// -
	};

	function _makeMobileScroll (UI) {

		var isControlTouch = function ( target ) {
			while (target && target !== d.body) {
				if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/i.test (target.tagName || '')) return true;
				if (target.classList && (
					target.classList.contains ('pk_btn') ||
					target.classList.contains ('pk_mt') ||
					target.classList.contains ('pk_mt_topbtn') ||
					target.classList.contains ('pk_modal_a_bottom')
				)) return true;
				target = target.parentNode;
			}
			return false;
		};

		var getFactor = function () {
			var screen_h = window.screen.height;
			var screen_w = window.screen.width;

			var iw = window.innerWidth;
			var ih = window.innerHeight;

			var bars_visible = false;
			var ratio = 0;

			if (window.orientation === 0) {
				ratio = ih / screen_h;
			}
			else if (window.orientation === 90 || window.orientation === -90) {
				ratio = ih / screen_w;
			}
			if (ratio < 0.8) bars_visible = true;

			return (bars_visible);
		};

		var ex = -1;
		var ey = -1;

		var allow = false;
		// var first = false;
		d.body.addEventListener ('touchstart', function( e ) {
			ex = e.touches[0].pageX;
			ey = e.touches[0].pageY;

			// first = true;
			allow = false;
		});

		d.body.addEventListener ('touchend', function( e ) {
			ex = -1;
			ey = -1;

			// first = false;
			allow = false;
		});

		d.body.addEventListener ('touchmove', function( e ) {
			if (isControlTouch ( e.target )) return ;
			if (allow) return ;

			var ny = e.touches[0].pageY;
			var nx = e.touches[0].pageX;
			var direction = ey - ny;
			var direction2 = ex - nx;

			// if (first) {
			//	first = false;
			// }

			if ( direction === 0 || (Math.abs (direction) < 3 && Math.abs (direction2) > 3 ) || (Math.abs (direction) < 6 && Math.abs (direction2) > 10 ) ) {
				ey = ny;
				ex = nx;
				allow = true;

				return ;
			}

			ey = ny;
			ex = nx;

			var xx = document.getElementsByClassName ('pk_modal_back');

			if (xx[0])
			{
				xx = xx[0];
				if ( xx.scrollHeight > window.innerHeight )
				{
					var scrolled = xx.scrollTop;

					if (direction > 0)
					{
						var modal_h = document.getElementsByClassName ('pk_modal')[0].clientHeight;

						if ((modal_h - scrolled) < (window.innerHeight - 80))
						{
							e.preventDefault ();
						}
					}
					else
					{
						if (scrolled <= 0)
						{
							e.preventDefault ();
						}
					}

					allow = true;
					return ;
				}
				else
				{
					e.preventDefault ();

					allow = true;
					return ;
				}
			}


			if (!getFactor ()) {
				e.preventDefault ();
				allow = true;
			}

		}, {passive:false});
	};
	// ---

	PKAE._deps.ui = PKUI;
	
})( window, document, PKAudioEditor );
