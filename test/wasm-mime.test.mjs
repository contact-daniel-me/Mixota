import { describe, it, expect } from 'vitest';

describe('Priority 2: WebAssembly MIME Handling & Server Routing', () => {
  const baseUrl = 'http://localhost:5055';

  it('serves rnn_denoise.wasm with application/wasm MIME type', async () => {
    const res = await fetch(`${baseUrl}/rnn_denoise.wasm`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
  });

  it('serves libflac.wasm with application/wasm MIME type', async () => {
    const res = await fetch(`${baseUrl}/libflac.wasm`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
  });

  it('serves lz4-block-codec.wasm with application/wasm MIME type', async () => {
    const res = await fetch(`${baseUrl}/lz4-block-codec.wasm`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
  });

  it('routes clean URLs /editor and /multitrack to index.html', async () => {
    const resEditor = await fetch(`${baseUrl}/editor`);
    expect(resEditor.status).toBe(200);
    const textEditor = await resEditor.text();
    expect(textEditor).toContain('<title>Mixota</title>');

    const resMulti = await fetch(`${baseUrl}/multitrack`);
    expect(resMulti.status).toBe(200);
    const textMulti = await resMulti.text();
    expect(textMulti).toContain('<title>Mixota</title>');
  });

  it('includes CORS and no-cache headers on static responses', async () => {
    const res = await fetch(`${baseUrl}/manifest.json`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toContain('no-cache');
  });
});
