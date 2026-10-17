/** Bound the entire request, including body reads; abort on every exit. */
export async function resourceBytes(url, { fetcher = fetch, timeoutMs = 15000, maxBytes = 2000000 } = {}) {
    const controller = new AbortController(); let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Resource request timed out')); }, timeoutMs); });
    try {
        return await Promise.race([deadline, (async () => {
            const response = await fetcher(url, { cache: 'no-cache', signal: controller.signal });
            if (!response.ok) throw Error(`Resource unavailable (${response.status}): ${new URL(url).pathname.split('/').pop()}`);
            if (Number(response.headers?.get('content-length')) > maxBytes) throw Error('Resource exceeds byte limit');
            if (!response.body?.getReader) { const bytes = await response.arrayBuffer(); if (bytes.byteLength > maxBytes) throw Error('Resource exceeds byte limit'); return bytes; }
            const reader = response.body.getReader(), chunks = []; let size = 0;
            try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw Error('Resource exceeds byte limit'); chunks.push(value); } }
            finally { await reader.cancel().catch(() => {}); }
            const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes.buffer;
        })()]);
    } finally { clearTimeout(timer); controller.abort(); }
}
export const decodeJSON = bytes => JSON.parse(new TextDecoder().decode(bytes));
export async function sha256(bytes) { if (!globalThis.crypto?.subtle) throw Error('Integrity checks require a secure context'); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }
