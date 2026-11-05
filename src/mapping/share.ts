import type { Mapping, MappingBundle } from './types';

/** Whether a mapping holds anything Auto wouldn't work out by itself, so it's worth sending to others. */
export function isCustomMapping(m: Mapping): boolean {
  const corrected = Object.values(m.corrections).some((v) => (v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v)));
  return m.mode !== 'auto' || corrected || Boolean(m.rules);
}

/** URL-safe base64. */
function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/**
 * Encode a mapping bundle for a share link: "z" + deflated base64url when compression is available, else "j" + plain base64url.
 */
export async function encodeBundle(b: MappingBundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(b));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + toB64url(await pipe(json, new CompressionStream('deflate-raw')));
    } catch {
      /* fall through */
    }
  }
  return 'j' + toB64url(json);
}

export async function decodeBundle(s: string): Promise<MappingBundle | undefined> {
  try {
    const kind = s[0];
    let bytes = fromB64url(s.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return undefined;
    const b = JSON.parse(new TextDecoder().decode(bytes)) as MappingBundle;
    if (!b?.mapping || b.mapping.version !== 1 || !Array.isArray(b.mapping.games)) return undefined;
    return b;
  } catch {
    return undefined;
  }
}
