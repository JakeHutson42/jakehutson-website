import { GLTFLoader } from '../../../lib/three/0.180.0/addons/loaders/GLTFLoader.js';
import { disposeTree } from './dispose.js';
import { resourceBytes, decodeJSON, sha256 } from '../resources.js';
export const FALLBACK_CONTENT = 'c1b84012482089ec1b89bf38b87b4bb63a6ee08d3518feb3fc81eb137abc5dbd';
const HASH = /^[a-f0-9]{64}$/;
export async function validateAssetManifest(manifest, expected) {
    if (manifest?.schemaVersion !== 1 || manifest.contentId !== expected || !HASH.test(expected) || !HASH.test(manifest.inputHash) || !manifest.files || Object.keys(manifest.files).length > 32) throw Error('Stale asset manifest');
    for (const [name, hash] of Object.entries(manifest.files)) if (!/^[a-zA-Z0-9/._-]+$/.test(name) || name.includes('..') || name.startsWith('/') || !HASH.test(hash)) throw Error('Invalid asset manifest path/hash');
    for (const name of [manifest.bike, manifest.rider, manifest.course, ...Object.values(manifest.assets || {}), ...Object.values(manifest.sounds || {})]) if (!manifest.files[name]) throw Error('Unhashed generated resource');
    if (!manifest.assets?.bike || !manifest.assets?.rider || !manifest.assets?.rig) throw Error('Generated bike/rider assets are unavailable');
    const identity = JSON.stringify({ files: Object.fromEntries(Object.entries(manifest.files).sort(([a],[b]) => a < b ? -1 : 1)), inputs: manifest.inputHash });
    if (await sha256(new TextEncoder().encode(identity)) !== expected) throw Error('Asset manifest identity mismatch');
    return manifest;
}
export async function loadContent(options = {}) {
    const root = new URL('../content/', import.meta.url);
    const json = async url => decodeJSON(await resourceBytes(url, { ...options, maxBytes: 100000 }));
    let base, manifest, fallback = false;
    const select = async release => {
        if (!/^releases\/[a-f0-9]{64}\/manifest\.json$/.test(release)) throw Error('Invalid content release');
        const url = new URL(release, root), expected = release.split('/')[1];
        return { base: url, manifest: await validateAssetManifest(await json(url), expected) };
    };
    try { ({ base, manifest } = await select((await json(new URL('current.json', root))).release)); }
    catch { ({ base, manifest } = await select(`releases/${FALLBACK_CONTENT}/manifest.json`)); fallback = true; }
    const checked = async name => {
        if (!manifest.files[name] || name.includes('..') || name.startsWith('/')) throw Error('Invalid asset manifest');
        const bytes = await resourceBytes(new URL(name, base), options);
        if (await sha256(bytes) !== manifest.files[name]) throw Error(`Content integrity mismatch: ${name}`);
        return bytes;
    };
    const decode = async name => decodeJSON(await checked(name)), loader = new GLTFLoader();
    const results = await Promise.allSettled([
        decode(manifest.bike), decode(manifest.rider), decode(manifest.course), decode(manifest.assets.rig),
        checked(manifest.assets.bike).then(bytes => loader.parseAsync(bytes, base.href)), checked(manifest.assets.rider).then(bytes => loader.parseAsync(bytes, base.href))
    ]);
    const failure = results.find(r => r.status === 'rejected');
    if (failure) { for (const r of results) if (r.status === 'fulfilled' && r.value?.scene) disposeTree(r.value.scene); throw failure.reason; }
    const [bikeSpec, riderSpec, course, rig, bike, rider] = results.map(r => r.value);
    return { bikeSpec, riderSpec, course, rig, bike: bike.scene, rider: rider.scene, manifest, checked, fallback };
}
