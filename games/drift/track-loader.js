import { GAME_CONFIG } from './config.js';

const TRACK_DIRECTORY = new URL('./tracks/', import.meta.url);
export const utcDate = (now = new Date()) => now.toISOString().slice(0, 10);

export async function loadTrackManifest() {
    // Revalidate at the edge: an open tab should discover the new daily circuit.
    const response = await fetch(new URL('manifest.json', TRACK_DIRECTORY), { cache: 'no-cache' });
    if (!response.ok) throw new Error('The circuit schedule could not be loaded. Please try again.');
    const manifest = await response.json();
    if (manifest.version !== 1 || !Array.isArray(manifest.dates)) throw new Error('The circuit schedule is invalid.');
    return manifest;
}

export function availableTrackDates(manifest, today = utcDate()) {
    const firstDate = new Date(`${today}T00:00:00Z`);
    firstDate.setUTCDate(firstDate.getUTCDate() - GAME_CONFIG.archiveDays);
    const first = utcDate(firstDate);
    return manifest.dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= first && date <= today).sort().reverse();
}

export async function loadTrack(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid circuit date.');
    const response = await fetch(new URL(`${date}.json`, TRACK_DIRECTORY));
    if (!response.ok) throw new Error('This circuit is not available yet. Please try again shortly.');
    const track = await response.json();
    const elevationsValid = track.elevations === undefined || (Array.isArray(track.elevations) &&
        Array.isArray(track.points) && track.elevations.length === track.points.length &&
        track.elevations.every(height => Number.isFinite(height) && height >= 0 && height <= 100));
    const loopValid = track.loop === undefined || (track.loop &&
        [track.loop.start, track.loop.end, track.loop.radius, track.loop.minimumSpeed].every(Number.isFinite) &&
        track.loop.start > 0.03 && track.loop.end < 0.97 && track.loop.end > track.loop.start &&
        track.loop.end - track.loop.start < 0.1 && track.loop.radius >= 12 && track.loop.radius <= 40 &&
        track.loop.minimumSpeed >= 10 && track.loop.minimumSpeed <= GAME_CONFIG.maximumSpeed);
    const offsetValid = !track.loop || (Number.isFinite(track.loop.heading) && Number.isFinite(track.loop.offset) &&
        track.loop.offset >= track.width + 4 && track.loop.offset <= 40);
    if (track.version !== 1 || track.date !== date || !Array.isArray(track.points) || track.points.length < 64 ||
        track.points.length > 1024 || !track.points.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && Math.abs(value) < 10000)) ||
        track.points.some((point, index) => Math.hypot(point[0] - track.points[(index + 1) % track.points.length][0], point[1] - track.points[(index + 1) % track.points.length][1]) < 0.1) ||
        !elevationsValid || !loopValid || !offsetValid || typeof track.name !== 'string' || !Number.isInteger(track.seed) ||
        !Number.isFinite(track.width) || track.width < 8 || track.width > 30 || !Number.isFinite(track.length) || track.length <= 0) {
        throw new Error('This circuit file is invalid.');
    }
    return track;
}
