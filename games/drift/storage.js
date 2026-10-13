import { GAME_CONFIG } from './config.js';

// Storage is an adapter, not a simulation dependency. Replace this class with an API
// client when accounts arrive. Private browsing/quota failures must never stop a race.
export class LocalRecords {
    constructor(storage) {
        this.available = true;
        this.data = { version: 1, sound: true, soundPreferenceVersion: 2, records: {} };
        try {
            this.storage = storage || window.localStorage;
            const saved = JSON.parse(this.storage.getItem(GAME_CONFIG.storageKey));
            if (saved?.version === 1) {
                // Old releases saved their default OFF value with every result.
                // Migrate once; explicit choices in this release remain persistent.
                this.data.sound = saved.soundPreferenceVersion === 2 ? saved.sound !== false : true;
                for (const [date, record] of Object.entries(saved.records || {})) {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(record.score) && record.score >= 0 && Number.isFinite(record.time) && record.time > 0) {
                        this.data.records[date] = { score: Math.floor(record.score), time: record.time, runs: Math.max(1, Math.floor(record.runs) || 1) };
                    }
                }
            }
        } catch { this.available = false; }
    }

    get(date) { return this.data.records[date] || null; }

    saveRun(date, score, time) {
        const previous = this.get(date);
        const isBest = !previous || score > previous.score;
        this.data.records[date] = { score: Math.max(previous?.score || 0, Math.floor(score)),
            time: Math.min(previous?.time || Infinity, time), runs: (previous?.runs || 0) + 1 };
        // Bound growth on shared devices. An archived track may be raced repeatedly.
        const dates = Object.keys(this.data.records).sort().reverse();
        for (const oldDate of dates.slice(GAME_CONFIG.maximumRecords)) delete this.data.records[oldDate];
        this.persist();
        return isBest;
    }

    setSound(enabled) { this.data.sound = enabled; this.persist(); }

    persist() {
        try { this.storage.setItem(GAME_CONFIG.storageKey, JSON.stringify(this.data)); }
        catch { this.available = false; }
    }
}
