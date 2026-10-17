/** Local-only model exercise. This does not claim native multi-touch hardware QA. */
export function touchSequence(tick, channels, rect = { left: 0, top: 0, width: 100, height: 100 }) {
    if (tick === 0) { channels.clear(); channels.begin('throttle', 101, 50, 25, rect); channels.begin('lean', 102, 65, 50, rect); }
    if (tick === 60) channels.move(102, 35, 50, rect);
    if (tick === 120) { channels.end(101); channels.begin('brake', 103, 50, 50, rect); }
    if (tick === 180) channels.clear();
    return tick < 240;
}
