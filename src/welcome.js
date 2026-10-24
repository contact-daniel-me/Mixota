(function ( w, d, PKAE ) {
'use strict';

setTimeout(function () {
	if (/(^|[?&])skipintro=1(&|$)/.test (w.location.search)) return ;
	var scroll_hint = 0;
	var showScrollHint = function () {
		var tbc, el, r;
		if (!PKAE.isMobile || scroll_hint) return ;
		scroll_hint = 1;
		tbc = PKAE.ui.el.getElementsByClassName ('pk_tbc')[0];
		if (!tbc || tbc.scrollWidth <= tbc.clientWidth + 2) return ;
		el = d.createElement ('i');
		r = tbc.getBoundingClientRect ();
		el.className = 'pk_tbhint';
		el.innerHTML = '&#8250;';
		el.style.top = ((r.top + r.height / 2 - 12) >> 0) + 'px';
		PKAE.ui.el.appendChild ( el );
		setTimeout (function () {
			el.parentNode && el.parentNode.removeChild ( el );
		}, 3000);
	};

	PKAudioEditor._deps.Wlc = function () {
			var body_str = '';
			var body_str2 = '';
			var mobile_note = '';

			if (PKAE.isMobile) {
				mobile_note = '<div style="color:#A0A8A3;margin-bottom:10px;">(Optimized for desktop experience)</div>';
				body_str = '<strong style="color:#F5F7F6;">Tips:</strong><br/>Please make sure your device is not in silent mode. You might need to physically flip the silent switch. '+
				'<img src="phone-switch.jpg" style="max-width:224px;max-height:126px;width:40%;margin: 10px auto; display: block; border-radius:4px;"/>'+
				'<br/><br/>';
			}
			else {
				body_str = '<div style="background:#111312;border:1px solid #292E2B;border-radius:6px;padding:12px;margin:12px 0 16px 0;">' +
					'<strong style="color:#F5F7F6;display:block;margin-bottom:6px;">Keyboard Shortcuts Quick-Guide:</strong>' +
					'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;color:#A0A8A3;font-family:\'JetBrains Mono\',monospace;">' +
					'<span><strong style="color:#00E5A3;">Space</strong> : Play / Stop</span>' +
					'<span><strong style="color:#00E5A3;">Shift + Z</strong> : Undo</span>' +
					'<span><strong style="color:#00E5A3;">Shift + X</strong> : Cut selection</span>' +
					'<span><strong style="color:#00E5A3;">Shift + C</strong> : Copy selection</span>' +
					'<span><strong style="color:#00E5A3;">Shift + V</strong> : Paste</span>' +
					'<span><strong style="color:#00E5A3;">Shift + K</strong> : Trim to selection</span>' +
					'</div></div>';
				body_str2 = '';
			}

			// Welcome to Mixota
			var md = new PKSimpleModal({
				title: '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#00E5A3;font-size:16px;">✦</span><span style="font-size:15px;font-family:Inter,system-ui,sans-serif;font-weight:600;color:#F5F7F6;">Welcome to Mixota</span><span style="font-size:11px;color:#A0A8A3;font-weight:400;margin-left:auto;">by growiota</span></div>',
				ondestroy: function( q ) {
					PKAE.ui.InteractionHandler.on = false;
					PKAE.ui.KeyHandler.removeCallback ('modalTemp');
					showScrollHint ();
			},
			body:'<div style="overflow:auto;-webkit-overflow-scrolling:touch;max-width:580px;width:calc(100vw - 40px);max-height:calc(100vh - 340px);min-height:110px;font-size:13px; color:#A0A8A3;padding-top:7px;font-family:Inter,system-ui,sans-serif;line-height:1.6;">'+
				mobile_note+
				'<div style="font-size:14px;color:#F5F7F6;margin-bottom:6px;font-weight:500;">Your sound. Your creativity.</div>' +
				'Mixota is a modern browser-based audio and waveform editor developed by <strong style="color:#F5F7F6;">growiota</strong>.<br />'+
				'Edit, trim, record, and process audio directly in your browser with complete privacy — 100% client-side with no uploads required.'+
				body_str+
				'Supports MP3, WAV, FLAC, OGG, WebM, and more with high-fidelity effects, real-time spectral analysis, and multitrack mixing.<br/><br/>'+
				body_str2+
				'</div>',
			setup:function( q ) {
					PKAE.ui.InteractionHandler.checkAndSet ('modal');
					PKAE.ui.KeyHandler.addCallback ('modalTemp', function ( e ) {
						q.Destroy ();
					}, [27]);

					// ------
					var scroll = q.el_body.getElementsByTagName('div')[0];
					if (scroll) {
						scroll.addEventListener ('touchstart', function(e){
							e.stopPropagation ();
						}, false);
						scroll.addEventListener ('touchmove', function(e){
							e.stopPropagation ();
						}, false);
					}

					// ------
				}
			});
			md.Show ();
			var cancelBtn = document.getElementsByClassName('pk_modal_cancel')[0];
			if (cancelBtn) cancelBtn.innerHTML = '&nbsp; &nbsp; &nbsp; Get Started &nbsp; &nbsp; &nbsp;';
	};

	var change = 99;
	var exists = w.localStorage && w.localStorage.getItem ('k');

	if (!exists) {
		change = 0;
		w.localStorage && w.localStorage.setItem ('k', 1);
	}

	// Welcome modal auto-popup disabled
	// PKAudioEditor._deps.Wlc ();
}, 320);

})( window, document, PKAudioEditor );
