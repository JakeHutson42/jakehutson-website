import { DrivingInput } from '../drift/input.js';
import { EngineAudio } from '../drift/audio.js';
import { MobilePlayView } from '../drift/mobile-play-view.js';
import { formatTime, clamp } from '../drift/math.js';
import { ROOMS, makeTrack } from './tracks.js';
import { PocketRace, RACERS, STEP } from './race.js';
import { PocketStorage } from './storage.js';
import { PocketWorld } from './world.js';
import { PocketCup } from './cup.js';

const $ = id => document.getElementById(id);
const stage = $('raceStage'), canvas = $('raceCanvas'), dialog = $('menuDialog');
const storage = new PocketStorage(), audio = new EngineAudio(storage.sound);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const utcDay = () => new Date().toISOString().slice(0, 10);
let day = utcDay(), remix = 0, roomIndex = 0, world, race, track;
let playing = false, pausedState = 'racing', menuKind = '', lastFrame = 0, accumulator = 0, hudTimer = 0;
let noticeTime = 0, goTime = 0, lastCount = 4, cup = null, completed = false;
const input = new DrivingInput(stage, command => {
    if (command === 'KeyR' && playing && race.state === 'racing') { race.reset(); input.clear(); announce('BACK ON TRACK · +3 SECONDS'); }
    else if (['Escape', 'blur'].includes(command)) pause();
});
const mobile = new MobilePlayView(stage, () => { input.clear(); pause(); });
mobile.shell.setAttribute('aria-label', 'Pocket Circuit mobile play view');

function announce(message, seconds = 2) { $('raceNotice').textContent = message; noticeTime = seconds; }
function storageStatus() {
    $('storageStatus').textContent = storage.available ? 'Personal bests stay on this device.' : 'Storage unavailable. Bests last for this visit only.';
}
function updateSound() {
    $('soundButton').setAttribute('aria-pressed', String(storage.sound));
    $('soundButton').setAttribute('aria-label', storage.sound ? 'Mute game sound' : 'Enable game sound');
}
function unlockSound() {
    audio.setEnabled(storage.sound).then(() => {
        if (!playing || race.state === 'paused' || race.state === 'finished') audio.silence();
    }).catch(() => { if (playing) announce('SOUND UNAVAILABLE · KEEP RACING'); });
}
function paint() { $('paintDot').style.background = storage.paint; world?.setCars(race.cars, storage.paint); }
function recordId() { return `${track.id}:${$('modeSelect').value === 'trial' ? 'trial' : 'race'}`; }
function updateBest() {
    const record = storage.records[recordId()];
    $('bestTime').textContent = record ? formatTime(record.time) : 'A blank page. A fresh start.';
    $('bestDetail').textContent = record ? `Best lap ${formatTime(record.lap)} · ${record.runs} finished ${record.runs === 1 ? 'run' : 'runs'} · ${$('modeSelect').value === 'trial' ? 'solo time trial' : 'race'}` : 'Finish a race to leave your mark.';
    storageStatus();
}
function drawMap(target, drivers = []) {
    const ctx = target.getContext('2d'), width = target.width, height = target.height;
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min((width - 35) / 220, (height - 24) / 170);
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale);
    ctx.beginPath(); track.points.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)); ctx.closePath();
    ctx.strokeStyle = '#70617c'; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#ffdc70'; ctx.lineWidth = 3; ctx.stroke();
    track.boosts.forEach(pad => { ctx.fillStyle = '#fff5df'; ctx.fillRect(pad.x - 2.5, pad.z - 2.5, 5, 5); });
    const start = track.points[0]; ctx.fillStyle = '#ee8977'; ctx.fillRect(start[0] - 4, start[1] - 4, 8, 8);
    [...drivers].reverse().forEach(car => {
        ctx.beginPath(); ctx.arc(car.x, car.z, car.index === 0 ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = car.index === 0 ? storage.paint : RACERS[car.index].color; ctx.fill();
        if (car.index === 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    ctx.restore();
}
function loadRoom(index) {
    roomIndex = Number(index); day = playing ? day : utcDay();
    const seed = remix ? `${day}-remix-${remix}` : day;
    track = makeTrack(roomIndex, seed); race = new PocketRace(track, $('modeSelect').value);
    world.build(track); world.setCars(race.cars, storage.paint);
    const room = ROOMS[roomIndex];
    $('trackName').textContent = room.name; $('trackDescription').textContent = room.description;
    $('trackEdition').textContent = `ROOM 0${roomIndex + 1} / 03 · ${remix ? `REMIX ${remix}` : 'DAILY'}`;
    $('gridSpec').textContent = $('modeSelect').value === 'trial' ? 'JUST YOU & THE CLOCK' : 'YOU + 3 RIVALS';
    $('roomCaption').textContent = room.tag;
    $('roomSelect').value = String(roomIndex);
    $('circuitDate').textContent = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
    $('circuitDate').dateTime = day;
    $('layoutLabel').textContent = remix ? `EXTRA PLAYGROUND / ${remix}` : 'TODAY’S PLAYGROUND';
    document.querySelectorAll('[data-room]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.room) === roomIndex)));
    drawMap($('trackMap')); drawMap($('raceMap'), race.cars); updateBest();
    $('stageMessage').hidden = true; $('startButton').disabled = false;
    $('startButton').firstChild.textContent = $('modeSelect').value === 'cup' ? 'RACE THE POCKET CUP ' : $('modeSelect').value === 'trial' ? 'CHASE YOUR BEST ' : 'LET’S RACE ';
}
function lockLobby(locked) {
    for (const id of ['roomSelect', 'modeSelect', 'remixButton', 'startButton', 'paintButton', 'helpButton', 'recordsButton']) $(id).disabled = locked;
    document.querySelectorAll('[data-room]').forEach(button => { button.disabled = locked; });
}
function start(newCup = true) {
    if (!world) return;
    if (dialog.open) dialog.close();
    menuKind = ''; completed = false;
    if (newCup) cup = $('modeSelect').value === 'cup' ? new PocketCup(roomIndex) : null;
    race = new PocketRace(track, $('modeSelect').value); world.setCars(race.cars, storage.paint);
    playing = true; lastCount = 4; goTime = 0; accumulator = 0; input.clear(); input.active = true;
    $('startingCard').hidden = true; $('raceHud').hidden = false; $('countdown').hidden = false;
    $('raceNotice').textContent = ''; stage.classList.add('is-playing'); lockLobby(true);
    mobile.enter();
    if (!mobile.active) stage.scrollIntoView({ behavior: 'instant', block: 'center' });
    world.cameraTarget.set(race.player.x, 0, race.player.z); world.resize(); canvas.focus({ preventScroll: true });
    unlockSound(); updateHud();
}
function backToLobby() {
    dialog.close(); menuKind = ''; playing = false; cup = null; completed = false;
    input.active = false; input.clear(); audio.silence(); mobile.exit();
    stage.classList.remove('is-playing'); $('startingCard').hidden = false; $('raceHud').hidden = true; $('countdown').hidden = true;
    lockLobby(false); loadRoom(roomIndex); world.resize(); $('startButton').focus({ preventScroll: true });
}
function setMenu(kind, title, eyebrow, content, actions) {
    menuKind = kind; $('menuTitle').textContent = title; $('menuEyebrow').textContent = eyebrow;
    $('menuContent').replaceChildren();
    // All markup passed here is authored locally; saved values use textContent below.
    $('menuContent').innerHTML = content;
    $('menuActions').replaceChildren();
    for (const [label, action, secondary] of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = `race-button ${secondary ? 'secondary' : 'primary'}`;
        button.textContent = label; button.addEventListener('click', action); $('menuActions').append(button);
    }
    if (!dialog.open) dialog.showModal();
}
function pause() {
    if (!playing || !['racing', 'countdown'].includes(race.state)) return;
    pausedState = race.state; race.state = 'paused'; input.active = false; input.clear(); audio.silence();
    setMenu('pause', 'PARKED UP.', cup ? `POCKET CUP / RACE ${cup.round + 1} OF 3` : 'TAKE A BREATHER',
        '<p>Your race is paused. The house can wait.</p><p>W / ↑ accelerate · S / ↓ brake<br>A D / ← → steer · Space slide<br>R resets to the last checkpoint (+3 seconds).</p>',
        [['BACK TO THE RACE ↗', resume], ['RESTART THIS RACE', () => start(false), true], ['RETURN TO THE PLAYGROUND', backToLobby, true]]);
}
function resume() {
    dialog.close(); menuKind = ''; race.state = pausedState; accumulator = 0; lastFrame = performance.now();
    input.clear(); input.active = true; canvas.focus({ preventScroll: true }); unlockSound();
}
function closeMenu() {
    if (menuKind === 'pause') resume();
    else if (menuKind === 'results') backToLobby();
    else { dialog.close(); menuKind = ''; }
}
function showHelp() {
    setMenu('help', 'READY. TINY. GO.', 'YOUR POCKET-SIZED DRIVING SCHOOL',
        '<p><strong>Race three laps.</strong> Follow the tape circuit through each checkpoint. Your timer starts at GO, including the short run to the start line.</p><p><kbd>W</kbd> / <kbd>↑</kbd> Accelerate &nbsp; <kbd>S</kbd> / <kbd>↓</kbd> Brake / reverse</p><p><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> Steer &nbsp; <kbd>SPACE</kbd> Slide</p><p><kbd>R</kbd> Reset (+3 seconds) &nbsp; <kbd>ESC</kbd> Pause</p><p>Steering is relative to the car. On touch screens use the left pad to steer and the right pad to accelerate, brake or slide. You can hold two fingers at once.</p><p><strong>Yellow pads boost your speed</strong> once per pad each lap. In the cup, race all three rooms for 10 / 6 / 4 / 2 points per finish. Rivals still on track are ranked by progress.</p><p>Daily circuits change at midnight UTC. Remix creates an extra layout. Race and solo time-trial records save separately on this device.</p>', [['GOT IT ↗', closeMenu]]);
}
function showGarage() {
    setMenu('garage', 'LITTLE CAR. YOURS.', 'THE TOY GARAGE / POCKET GT', '<p>A die-cast coupe, a pair of racing stripes, and your favourite colour. Every paint job has the same handling.</p><div class="paint-options" id="paintOptions"></div><p id="paintStatus" role="status">Choose a colour. It saves automatically.</p>', [['LOOKING GOOD ↗', closeMenu]]);
    const options = [['#f8cf5c', 'Butter yellow'], ['#ed736c', 'Coral red'], ['#65c9b2', 'Mint green'], ['#a28ce5', 'Lilac purple'], ['#f4eee0', 'Warm white']];
    for (const [color, name] of options) {
        const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--paint', color);
        button.setAttribute('aria-label', name); button.setAttribute('aria-pressed', String(storage.paint === color));
        button.addEventListener('click', () => {
            storage.paint = color; storage.persist(); paint(); storageStatus();
            $('paintStatus').textContent = `${name} ${storage.available ? 'saved.' : 'selected for this visit.'}`;
            $('paintOptions').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        }); $('paintOptions').append(button);
    }
}
function showRecords() {
    setMenu('records', 'LITTLE LEGENDS.', 'YOUR RECORDS / THIS DEVICE', '<p>Personal bests for your last 80 layouts and modes. Race times include reset penalties.</p><div id="recordList"></div>', [['BACK TO THE PLAYGROUND ↗', closeMenu]]);
    const entries = Object.entries(storage.records).reverse();
    if (!entries.length) $('recordList').textContent = 'No records yet. There’s a whole house waiting.';
    entries.forEach(([id, record]) => {
        const [, room, seed, mode] = id.split(':');
        const row = document.createElement('div'); row.className = 'record-entry';
        const name = document.createElement('strong'); name.textContent = `${ROOMS.find(r => r.id === room)?.name || 'Circuit'} · ${mode === 'trial' ? 'Solo' : 'Race'}`;
        const time = document.createElement('span'); time.textContent = formatTime(record.time);
        const detail = document.createElement('small'); detail.textContent = `${seed} · Best lap ${formatTime(record.lap)} · ${record.runs} runs`;
        row.append(name, time, detail); $('recordList').append(row);
    });
    if (!storage.available) $('menuContent').append(document.createTextNode('Storage is unavailable; these records last for this visit.'));
}
function results() {
    if (completed) return; completed = true; input.active = false; input.clear(); audio.silence(); $('countdown').hidden = true;
    const ranking = race.ranking, position = ranking.findIndex(car => car.index === 0) + 1;
    const time = race.elapsed + race.penalty, bestLap = Math.min(...race.player.lapTimes);
    const best = storage.saveRun(recordId(), time, bestLap); updateBest();
    cup?.award(ranking);
    const finalCup = cup?.finalRound;
    const overall = cup?.standings || [];
    const cupPosition = overall.findIndex(r => r.index === 0) + 1;
    setMenu('results', finalCup ? cupPosition === 1 ? 'HOUSE CHAMPION!' : 'CUP COMPLETE.' : position === 1 ? 'TINY TRIUMPH!' : 'THAT’S A WRAP.',
        finalCup ? `POCKET CUP / ${cupPosition === 1 ? 'WINNER' : `POSITION ${cupPosition} OF 4`}` : cup ? `POCKET CUP / RACE ${cup.round + 1} OF 3` : race.mode === 'trial' ? 'TIME TRIAL COMPLETE' : `FINISHED / POSITION ${position} OF 4`,
        `<p>${best ? 'A fresh personal best. ' : ''}${race.penalty ? `${race.penalty} seconds of reset penalties included.` : 'Three laps around the little things.'}</p><div class="result-summary"><div><span>RACE TIME</span><strong>${formatTime(time)}</strong></div><div><span>BEST LAP</span><strong>${formatTime(bestLap)}</strong></div></div><div id="resultRows"></div>`,
        [[cup && !finalCup ? 'NEXT ROOM ↗' : finalCup ? 'RACE ANOTHER CUP ↗' : 'RACE AGAIN ↗', () => {
            if (cup && !finalCup) { cup.next(); loadRoom(cup.room); start(false); }
            else if (cup) { const first = cup.startRoom; loadRoom(first); start(true); }
            else start(true);
        }], ['RETURN TO THE PLAYGROUND', backToLobby, true]]);
    const rows = cup ? overall : ranking.map(car => ({ ...RACERS[car.index], index: car.index, finishTime: car.finishTime }));
    rows.forEach((racer, i) => {
        const row = document.createElement('div'); row.className = `result-row${racer.index === 0 ? ' is-you' : ''}`;
        const rank = document.createElement('span'); rank.textContent = i + 1;
        const dot = document.createElement('i'); dot.style.background = racer.index === 0 ? storage.paint : racer.color;
        const name = document.createElement('span'); name.textContent = racer.name;
        const value = document.createElement('span'); value.textContent = cup ? `${racer.points} PTS` : racer.finishTime ? formatTime(racer.finishTime) : 'ON TRACK';
        row.append(rank, dot, name, value); $('resultRows').append(row);
    });
    if (cup) { const note = document.createElement('p'); note.textContent = finalCup ? 'Final cup standings. Ties are decided by the final race finishing order.' : 'Cup standings so far. Three races make a champion.'; $('menuContent').append(note); }
}
function updateHud() {
    $('lapValue').textContent = `${Math.min(3, race.player.laps + 1)} / 3`;
    $('timeValue').textContent = formatTime(race.elapsed + race.penalty);
    const ranking = race.ranking;
    $('positionValue').textContent = race.mode === 'trial' ? 'SOLO' : `${ranking.findIndex(car => car.index === 0) + 1} / 4`;
    $('speedValue').textContent = Math.round(race.player.speed * 2.23694);
    $('boostBar').style.transform = `scaleX(${clamp(race.player.boost / .9, 0, 1)})`;
    $('boostLabel').textContent = race.player.boost > 0 ? 'LITTLE TURBO!' : 'HIT THE YELLOW PADS';
    $('standings').replaceChildren();
    ranking.forEach((car, i) => {
        const row = document.createElement('div'); if (!car.index) row.className = 'is-you';
        const dot = document.createElement('i'); dot.style.background = car.index === 0 ? storage.paint : RACERS[car.index].color;
        row.append(document.createTextNode(`${i + 1} `), dot, document.createTextNode(RACERS[car.index].name)); $('standings').append(row);
    });
    drawMap($('raceMap'), race.cars);
}
function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastFrame) / 1000 || 0, .08); lastFrame = now;
    if (!world || document.hidden) return;
    if (playing && ['racing', 'countdown'].includes(race.state)) {
        accumulator += dt;
        while (accumulator >= STEP) {
            race.update(input.read(), STEP); accumulator -= STEP;
            for (const event of race.events) {
                if (event === 'go') { goTime = .65; audio.countdown(true); }
                if (event === 'lap' && !race.player.finished) announce(race.player.laps === 2 ? 'FINAL LAP · MAKE IT A GOOD ONE' : 'LAP 2 · KEEP IT TINY');
                if (event === 'boost') announce('POCKET TURBO!', .8);
            }
            if (race.state === 'finished') { results(); accumulator = 0; break; }
        }
        if (race.state === 'countdown') {
            const count = Math.ceil(race.countdown);
            if (count !== lastCount) { lastCount = count; $('countdownWord').textContent = count === 3 ? 'READY' : count === 2 ? 'TINY' : 'SET'; $('countdown').dataset.phase = count === 3 ? 'ready' : 'set'; audio.countdown(false); }
        }
        if (race.state === 'racing') {
            goTime = Math.max(0, goTime - dt); $('countdown').hidden = goTime <= 0;
            if (goTime > 0) { $('countdownWord').textContent = 'GO!'; $('countdown').dataset.phase = 'go'; }
        }
        noticeTime -= dt; if (noticeTime <= 0) $('raceNotice').textContent = '';
        audio.update(race.player, race.state === 'racing');
    }
    hudTimer += dt; if (playing && hudTimer > .09) { updateHud(); hudTimer = 0; }
    world.render(race.cars, playing, dt, reducedMotion.matches);
}

$('startButton').addEventListener('click', () => start());
$('pauseButton').addEventListener('click', pause);
$('mobileExitButton').addEventListener('click', pause);
$('roomSelect').addEventListener('change', event => { if (!playing) loadRoom(Number(event.target.value)); });
document.querySelectorAll('[data-room]').forEach(button => button.addEventListener('click', () => {
    if (!playing) { loadRoom(Number(button.dataset.room)); $('circuit').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' }); }
}));
$('modeSelect').addEventListener('change', () => { if (!playing) loadRoom(roomIndex); });
$('remixButton').addEventListener('click', () => { if (!playing) { remix++; loadRoom(roomIndex); } });
$('helpButton').addEventListener('click', showHelp);
$('recordsButton').addEventListener('click', showRecords);
[$('paintButton'), $('carButton')].forEach(button => button.addEventListener('click', showGarage));
$('closeMenu').addEventListener('click', closeMenu);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
$('soundButton').addEventListener('click', () => { storage.sound = !storage.sound; storage.persist(); updateSound(); unlockSound(); storageStatus(); });
$('fullscreenButton').addEventListener('click', () => {
    const action = document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.();
    action?.catch(() => announce('FULLSCREEN IS UNAVAILABLE'));
});
document.addEventListener('fullscreenchange', () => {
    $('fullscreenButton').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    input.clear(); pause(); world?.resize();
});
setInterval(() => { if (!playing && !dialog.open && day !== utcDay()) { remix = 0; loadRoom(roomIndex); } }, 30000);
$('year').textContent = new Date().getFullYear(); updateSound(); storageStatus();
try {
    world = new PocketWorld(canvas);
    world.onContextLost = () => { pause(); $('stageMessage').textContent = 'Graphics paused. Waiting for the browser to restore the scene…'; $('stageMessage').hidden = false; };
    world.onContextRestored = () => { world.resize(); $('stageMessage').hidden = true; };
    loadRoom(0); paint(); requestAnimationFrame(animate);
} catch (error) {
    console.error('Pocket Circuit could not prepare its scene.', error);
    $('stageMessage').textContent = 'The toybox needs WebGL. Enable browser hardware acceleration, then reload to race.';
    $('stageMessage').hidden = false; $('startButton').disabled = true;
    $('startButton').firstChild.textContent = 'GRAPHICS UNAVAILABLE ';
}
