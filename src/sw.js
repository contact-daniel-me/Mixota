const CACHE_NAME = 'mixota-v5';
const assets = [
	'./',
	'./manifest.json',
	'./ico.png',
	'./icon.png',
	'./mascot.png',
	'./index.html',
	'./main.css',
	'./mixota-cms.css',
	'./all.css',
	'./all.build.js',
	'./dist/wavesurfer.js',
	'./dist/plugin/wavesurfer.regions.js',
	'./dist/supabase.js',
	'./oneup.js',
	'./app.js',
	'./keys.js',
	'./markers.js',
	'./contextmenu.js',
	'./lufs.js',
	'./ui-fx.js',
	'./ui.js',
	'./modal.js',
	'./state.js',
	'./engine.js',
	'./actions.js',
	'./drag.js',
	'./recorder.js',
	'./welcome.js',
	'./fx-pg-eq.js',
	'./fx-auto.js',
	'./local.js',
	'./id3.js',
	'./lzma.js',
	'./mixota-format.js',
	'./multitrack.js?v=1.1',
	'./mixota-cms.js',
	'./recorder-worklet.js',
	'./tempo-estimator.js',
	'./tempo-worker.js',
	'./wav.js',
	'./lame.js',
	'./flac.js',
	'./libflac.js',
	'./libflac.wasm',
	'./lz4-block-codec-wasm.js',
	'./lz4-block-codec.wasm',
	'./rnn_denoise.js',
	'./rnn_denoise.wasm',
	'./fonts/icomoon.woff',
	'./eq.html',
	'./sp.html',
	'./mix.html'
];

self.addEventListener( 'install', function ( event ) {
	self.skipWaiting();
	event.waitUntil(( async function () {
		const cache = await caches.open( CACHE_NAME );
		await Promise.all( assets.map( function ( asset ) {
			return cache.add( new Request ( asset, { cache: 'reload' } ) ).catch( function ( err ) {
				console.warn( '[SW] Could not precache:', asset, err );
			});
		}));
	})());
});

self.addEventListener( 'activate', function ( event ) {
	event.waitUntil(( async function () {
		const keys = await caches.keys();
		await Promise.all( keys.map( function ( key ) {
			if ( key !== CACHE_NAME ) return caches.delete( key );
		}));
		await self.clients.claim();
	})());
});

self.addEventListener( 'fetch', function ( event ) {
	event.respondWith( cacheFirst( event.request ) );
});

self.addEventListener( 'message', function ( event ) {
	if ( event.data === 'SKIP_WAITING' ) self.skipWaiting();
});

async function cacheFirst( request ) {
	if ( request.method !== 'GET' ) return fetch( request );

	var url;
	try {
		url = new URL( request.url );
	} catch ( e ) {
		return fetch( request );
	}

	// 1. NEVER intercept or cache external origins (Supabase backend, Google fonts, CDNs)
	if ( url.origin !== self.location.origin ) {
		return fetch( request );
	}

	// 2. NEVER cache audio files, signed URLs, auth tokens, or CMS API calls
	if ( url.pathname.includes('/storage/v1/') || 
	     url.pathname.includes('/rest/v1/') || 
	     url.searchParams.has('token') || 
	     url.searchParams.has('apikey') ||
	     url.searchParams.has('signature') ) {
		return fetch( request );
	}

	// 3. Check cache with exact URL match (preserving cache busting params)
	const cachedResponse = await caches.match( request );
	if ( cachedResponse !== undefined ) return cachedResponse;

	// 4. Fallback to network; cache static application shell assets
	try {
		const response = await fetch( request );
		if ( response && response.status === 200 && response.type === 'basic' ) {
			const contentType = response.headers.get('content-type') || '';
			// Do not cache audio/video media streams
			if ( !contentType.includes('audio/') && !contentType.includes('video/') ) {
				const responseToCache = response.clone();
				caches.open( CACHE_NAME ).then( function ( cache ) {
					cache.put( request, responseToCache );
				});
			}
		}
		return response;
	} catch ( err ) {
		// Offline fallback for navigation to editor
		if ( request.mode === 'navigate' ) {
			const indexFallback = await caches.match( './index.html' ) || await caches.match( './' );
			if ( indexFallback ) return indexFallback;
		}
		throw err;
	}
}
