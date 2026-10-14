const KEY = 'pocket-circuit:v1';
export class PocketStorage {
    constructor(storage) {
        this.available = true; this.records = {}; this.sound = true; this.paint = '#f8cf5c';
        try {
            this.storage = storage || window.localStorage;
            const data = JSON.parse(this.storage.getItem(KEY)) || {};
            this.sound = data.sound !== false;
            if (/^#[0-9a-f]{6}$/i.test(data.paint)) this.paint = data.paint;
            for (const [id, record] of Object.entries(data.records || {}).slice(-80)) {
                if (id.length < 100 && Number.isFinite(record.time) && record.time > 0 && Number.isFinite(record.lap) && record.lap > 0 && Number.isInteger(record.runs) && record.runs > 0)
                    this.records[id] = { time: record.time, lap: record.lap, runs: record.runs };
            }
        } catch { this.available = false; }
    }
    saveRun(id, time, lap) {
        if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(lap) || lap <= 0) return false;
        const previous = this.records[id], best = !previous || time < previous.time;
        delete this.records[id];
        this.records[id] = { time: Math.min(previous?.time ?? Infinity, time), lap: Math.min(previous?.lap ?? Infinity, lap), runs: (previous?.runs || 0) + 1 };
        for (const old of Object.keys(this.records).slice(0, -80)) delete this.records[old];
        this.persist(); return best;
    }
    persist() {
        try { this.storage.setItem(KEY, JSON.stringify({ records: this.records, sound: this.sound, paint: this.paint })); }
        catch { this.available = false; }
    }
}
