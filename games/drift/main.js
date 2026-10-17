import { miles, mph, SPEEDOMETER_MAX_MPH } from './units.js';
import { CircuitLibrary, BIOMES } from './biome-circuits.js';
import { CircuitPicker } from './circuit-picker.js';
import { TrackSettings } from './generation-settings.js';
import { initialiseDrivingGuides } from './tutorial.js';
import { LoadingOverlay } from './loading-overlay.js';
import { GaragePreferences, CAR_MODELS } from './garage-data.js';
import { GAME_CONFIG } from './config.js';
import { formatTime, clamp, trackPose } from './math.js';
import { DrivingInput } from './input.js';
import { MobilePlayView } from './mobile-play-view.js';
import { LocalRecords } from './storage.js';
import { Race } from './race.js';
import { EngineAudio } from './audio.js';
import { StartSequence } from './start-sequence.js';
import { BonusReadout } from './bonus-readout.js';
import { loadBiomeBase } from './track-loader.js';

// This module coordinates the page. Physics, scoring, persistence, and rendering remain
// independent so each can be tuned or replaced without rewriting the interface.
initialiseDrivingGuides();
const element = id => document.getElementById(id);
element('year').textContent = new Date().getFullYear();
const stage = element('raceStage');
const records = new LocalRecords();
const audio = new EngineAudio(records.data.sound);
const startSequence = new StartSequence(element('countdown'), audio);
const bonusReadout = new BonusReadout(element('comboReadout'), element('comboValue'), element('bonusTier'));
const mapCache = new WeakMap();
const garagePreferences = new GaragePreferences();
let garage;
let world;
let race;
let circuitLibrary;
const circuitPicker = new CircuitPicker(element('trackSelect'), biome => circuitLibrary?.get(biome));
const trackSettings = new TrackSettings(element('trackSettingsDialog'), {
    read: () => circuitLibrary.settingsFor(element('trackSelect').value),
    apply: settings => loader.run('Building your next route', async () => {
        const biome = element('trackSelect').value;
        circuitLibrary.regenerate(biome, undefined, settings);
        if (!await selectTrackContent(biome)) throw new Error('The route could not load. Try again.');
    }),
});
let loadSequence = 0;
let lastFrameTime = 0;
let simulationRemainder = 0;
let lastHudTime = 0;
let noticeTimeout;
let finishHandled = false;
let previewVisible = true;
// Stop the lobby fly-through while the player reads below it, saving GPU/battery.
const previewObserver = new IntersectionObserver(entries => {
    previewVisible = entries[0].isIntersecting;
});
previewObserver.observe(stage);

const input = new DrivingInput(stage, command => {
    if (command === 'blur') { pauseRun(); return; }
    if (loader.active || element('garageDialog').open) return;
    if (command === 'KeyR') { race?.resetCar(); world && (world.lastMark = null); }
    else if (command === 'Escape') {
        if (race?.state === 'paused') resumeRun();
        else pauseRun();
    }
});

const loader = new LoadingOverlay(element('loadingDialog'), () => input.clear());

const mobileView = new MobilePlayView(stage, () => {
    input.clear();
    pauseRun();
});

function showStageMessage(message) {
    element('stageMessage').textContent = message;
    element('stageMessage').hidden = !message;
}

function showNotice(message) {
    element('raceNotice').textContent = message;
    clearTimeout(noticeTimeout);
    noticeTimeout = setTimeout(() => { element('raceNotice').textContent = ''; }, 2500);
}

function updateStorageStatus() {
    element('storageStatus').textContent = records.available ? 'YOUR BEST RUNS STAY ON THIS DEVICE' : 'SAVING IS OFF · THESE RUNS LAST THIS VISIT';
}

function displayPersonalBest() {
    const best = race && records.get(race.track.date);
    element('personalBest').textContent = best ? `${best.score.toLocaleString()} POINTS.` : 'No score yet. Your move.';
    element('personalBestNote').textContent = best ? `Quickest run ${formatTime(best.time)} · ${best.runs} ${best.runs === 1 ? 'run' : 'runs'} on this circuit.` : 'Finish three laps. Your best score and quickest time stay here.';
    updateStorageStatus();
}

function drawMap(canvas, track, car = null) {
    let cached = mapCache.get(canvas);
    if (!cached || cached.track !== track || cached.width !== canvas.width || cached.height !== canvas.height || cached.driving !== Boolean(car)) {
        const background = document.createElement('canvas');
        background.width = canvas.width; background.height = canvas.height;
        const project = drawMapRoute(background, track, Boolean(car));
        cached = { track, width: canvas.width, height: canvas.height, driving: Boolean(car), background, project };
        mapCache.set(canvas, cached);
    }
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cached.background, 0, 0);
    if (car) {
        context.beginPath(); context.arc(...cached.project(car.x, car.z), 4, 0, Math.PI * 2);
        context.fillStyle = '#ffffff'; context.fill();
    }
}

// The route and its bounds are static. Rebuild only when the circuit/canvas changes;
// during racing each minimap refresh copies the background and draws one marker.
function drawMapRoute(canvas, track, driving) {
    const context = canvas.getContext('2d');
    const xs = track.points.map(point => point[0]);
    const zs = track.points.map(point => point[1]);
    const minimumX = Math.min(...xs); const maximumX = Math.max(...xs);
    const minimumZ = Math.min(...zs); const maximumZ = Math.max(...zs);
    const scale = Math.min((canvas.width - 35) / (maximumX - minimumX), (canvas.height - 30) / (maximumZ - minimumZ));
    const centerX = (minimumX + maximumX) / 2; const centerZ = (minimumZ + maximumZ) / 2;
    const project = (x, z) => [canvas.width / 2 + (x - centerX) * scale, canvas.height / 2 + (z - centerZ) * scale];
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    track.points.forEach((point, index) => {
        const [x, y] = project(...point);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.strokeStyle = '#61718b'; context.lineWidth = driving ? 3 : 9; context.lineJoin = 'round'; context.stroke();
    context.strokeStyle = track.biome === 'synthwave' ? '#ff39d4' : '#36e6ed'; context.lineWidth = driving ? 1 : 3; context.stroke();
    for (const bridge of track.bridges || []) {
        const a = trackPose(track, bridge.upper - 18 / track.length), b = trackPose(track, bridge.upper + 18 / track.length);
        context.beginPath(); context.moveTo(...project(a.x, a.z)); context.lineTo(...project(b.x, b.z));
        context.strokeStyle = '#080d23'; context.lineWidth = driving ? 6 : 14; context.stroke();
        context.strokeStyle = '#ffc578'; context.lineWidth = driving ? 2 : 5; context.stroke();
    }
    if (track.loop) {
        const entry = trackPose(track, track.loop.start);
        context.beginPath(); context.arc(...project(entry.x, entry.z), driving ? 4 : 7, 0, Math.PI * 2);
        context.strokeStyle = '#f34dac'; context.lineWidth = 2; context.stroke();
    }
    for (let checkpoint = 0; checkpoint < 4; checkpoint++) {
        const point = track.points[Math.floor(checkpoint * track.points.length / 4)];
        const [x, y] = project(...point);
        context.fillStyle = checkpoint === 0 ? '#36e6ed' : '#f3f5fa';
        context.fillRect(x - 3, y - 3, 6, 6);
    }
    return project;
}

function populateTrackSelector(selectedBiome='city') {
    const selector=element('trackSelect');selector.replaceChildren();
    for(const [biome,name] of Object.entries(BIOMES)) {
        const option=document.createElement('option');option.value=biome;option.textContent=name;selector.append(option);
    }
    selector.value=selectedBiome;selector.disabled=false;
    circuitPicker.sync();
}

async function selectTrack(biome, regenerate = false) {
    return loader.run('Preparing circuit', () => selectTrackContent(biome, regenerate));
}

async function selectTrackContent(biome, regenerate = false) {
    const sequence = ++loadSequence;
    element('startButton').disabled = true;
    element('startButton').textContent = 'LOADING CIRCUIT…';
    element('trackSelect').disabled = true;
    element('regenerateButton').disabled = true;
    element('trackSettingsButton').disabled = true;
    showStageMessage('');
    try {
        const track = regenerate ? circuitLibrary.regenerate(biome) : circuitLibrary.get(biome);
        circuitPicker.sync();
        if (sequence !== loadSequence) return;
        world.loadTrack(track);
        race = new Race(track);
        showPreview();
        const synthwave=track.biome==='synthwave';
        element('circuitMode').textContent=synthwave?'SYNTHWAVE HIGHWAY':'NIGHT CITY';
        const dateElement=element('circuitDate');dateElement.removeAttribute('datetime');
        dateElement.textContent=`ROUTE ${track.seed.toString(16).toUpperCase().padStart(8,'0')}`;
        element('trackEdition').textContent=synthwave?'BLACK MOUNTAINS / MAGENTA NIGHTS':'AFTER HOURS / CITY STREETS';
        element('trackName').textContent=track.name.toUpperCase();
        element('trackDescription').textContent=synthwave?
            'Black mountains. Magenta lights. Follow the sun and keep it sideways.':
            'Linked esses, returning corners and flowing chicanes. Own the night.';
        document.querySelector('.scene-caption span').textContent=synthwave?'SYNTHWAVE HIGHWAY':'AFTER HOURS';
        element('trackLength').textContent = `${miles(track.drivingLength || track.length).toFixed(2)} MI`;
        drawMap(element('trackMap'), track);
        displayPersonalBest();
        await world.prepare(race);
        element('startButton').replaceChildren(document.createTextNode('Drive this circuit '));
        const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
        element('startButton').append(arrow);
        element('startButton').disabled = false;
        element('trackSelect').disabled = false;
        element('regenerateButton').disabled = false;
        element('trackSettingsButton').disabled = false;
        return true;
    } catch (error) {
        race = null;
        showStageMessage(error.message);
        element('startButton').textContent = 'TRY AGAIN ↗';
        element('startButton').disabled = false;
        element('trackSelect').disabled = false;
        element('regenerateButton').disabled = false;
        element('trackSettingsButton').disabled = false;
        return false;
    }
}

function showPreview() {
    if (race) audio.update(race.car, false);
    stage.classList.remove('is-playing');
    element('startingCard').hidden = false;
    element('raceHud').hidden = true;
    element('countdown').hidden = true;
    element('raceOverlay').hidden = true;
    input.active = false; input.suspended = false; input.clear();
    mobileView.exit();
    element('trackSelect').disabled = false;
    element('regenerateButton').disabled = false;
    element('trackSettingsButton').disabled = false;
    simulationRemainder = 0;
    finishHandled = false;
    clearTimeout(noticeTimeout); element('raceNotice').textContent = '';
}

async function startRun() {
    if (loader.active) return;
    if (!race || !world) { await initialize(); return; }
    const soundReady = enableSound(audio.enabled);
    // Move the mobile stage before opening a top-layer dialog: reparenting an
    // already-open dialog can dismiss it in some browsers.
    mobileView.enter();
    try {
        await loader.run('Putting you on the grid', async () => {
            await soundReady;
            startRunContent();
            await world.prepare(race);
            await loader.nextPaint();
        });
        if (race.state !== 'paused') element('raceCanvas').focus({ preventScroll: true });
    } catch {
        pauseRun();
        showStageMessage('Graphics could not prepare. Try again or reload the page.');
    }
}

function startRunContent() {
    if (!race || !world) { initialize(); return; }
    race = new Race(race.track);
    race.start(); finishHandled = false;
    bonusReadout.update(0, 1, false);
    world.lastMark = null;
    simulationRemainder = 0;
    input.clear(); input.suspended = false; input.active = true;
    element('startingCard').hidden = true;
    element('raceHud').hidden = false;
    element('raceOverlay').hidden = true;
    element('trackSelect').disabled = true;
    element('regenerateButton').disabled = true;
    element('trackSettingsButton').disabled = true;
    stage.classList.add('is-playing');
    mobileView.enter();
    element('raceCanvas').focus({ preventScroll: true });
    if (!mobileView.active) stage.scrollIntoView({ behavior: 'instant', block: 'center' });
}

function pauseRun() {
    if (!race || !['racing', 'countdown'].includes(race.state)) return;
    race.pause(); input.suspended = true; input.clear();
    bonusReadout.setActive(false);
    // Silence immediately: background tabs can suspend requestAnimationFrame entirely.
    audio.update(race.car, false);
    element('overlayEyebrow').textContent = 'TAKE A BREATHER';
    element('overlayTitle').textContent = 'PARKED UP.';
    element('overlayDescription').textContent = 'Your run is paused. The clock can wait.';
    element('resultGrid').hidden = true;
    element('resumeButton').hidden = false;
    element('restartButton').textContent = 'START AGAIN ↗';
    element('raceOverlay').hidden = false;
    element('countdown').hidden = true;
    element('resumeButton').focus({ preventScroll: true });
}

function resumeRun() {
    if (loader.active || element('garageDialog').open || race?.state !== 'paused') return;
    enableSound(audio.enabled);
    race.resume(); simulationRemainder = 0; input.clear(); input.suspended = false;
    element('raceOverlay').hidden = true;
    element('raceCanvas').focus({ preventScroll: true });
}

function finishRun() {
    finishHandled = true;
    input.clear(); input.active = false;
    const newBest = records.saveRun(race.track.date, race.score, race.elapsed);
    displayPersonalBest();
    element('overlayEyebrow').textContent = newBest ? 'A NEW PERSONAL BENCHMARK' : 'THREE LAPS. ONE GOOD TIME.';
    element('overlayTitle').textContent = 'THAT’S YOUR LINE.';
    element('overlayDescription').textContent = records.available ? 'Run complete. Your record is saved on this device.' : 'Run complete. Your record is kept for this visit; browser storage is unavailable.';
    element('resultScore').textContent = race.score.toLocaleString();
    element('resultTime').textContent = formatTime(race.elapsed);
    element('resultGrid').hidden = false;
    element('resumeButton').hidden = true;
    element('restartButton').textContent = 'ONE MORE RUN ↗';
    element('raceOverlay').hidden = false;
    element('restartButton').focus({ preventScroll: true });
}

function updateInstruments() {
    const car = race.car, speed = clamp(mph(car.speed) / SPEEDOMETER_MAX_MPH, 0, 1), rpm = car.rpm || 950;
    element('speedNeedle').style.transform = 'rotate(' + (-135 + speed * 270) + 'deg)';
    element('speedArc').style.strokeDasharray = (speed * 226.2) + ' 301.6';
    element('speedBars').style.transform = 'scaleX(' + clamp(rpm / 8000, 0.03, 1) + ')';
    element('instrumentCluster').classList.toggle('is-redlining', rpm > 6500);
    element('gearValue').textContent = car.gearLabel || 'N';
    element('rpmValue').textContent = String(Math.round(rpm / 50) * 50);
}

function updateHud() {
    element('lapValue').textContent = race.lap;
    element('timeValue').textContent = formatTime(race.elapsed);
    element('scoreValue').textContent = race.score.toLocaleString();
    bonusReadout.update(race.combo, race.multiplier, race.state === 'racing');
    element('speedValue').textContent = Math.round(mph(race.car.speed));
    element('driftLabel').textContent = race.car.offRoad ? 'OFF ROAD · FIND THE ASPHALT' : race.drifting ? 'HOLD THAT SLIDE' : race.combo ? 'LINK THE NEXT CORNER' : '';
    element('comboReadout').classList.toggle('is-drifting', race.drifting);
    element('comboBar').style.transform = `scaleX(${race.combo ? clamp(1 - race.comboIdle / GAME_CONFIG.comboGrace, 0, 1) : 0})`;

    drawMap(element('raceMap'), race.track, race.car);
    if (race.message) { showNotice(race.message); race.message = ''; }
}

function animate(timeMilliseconds) {
    requestAnimationFrame(animate);
    const seconds = timeMilliseconds / 1000;
    const deltaTime = Math.min(GAME_CONFIG.maximumFrameTime, seconds - (lastFrameTime || seconds));
    lastFrameTime = seconds;
    if (!race || !world || document.hidden || loader.active) return;
    if (race.state === 'ready' && !previewVisible) return;
    if (['racing', 'countdown'].includes(race.state)) {
        simulationRemainder += deltaTime;
        const controls = input.read();
        while (simulationRemainder >= GAME_CONFIG.fixedStep) {
            race.update(controls, GAME_CONFIG.fixedStep);
            simulationRemainder -= GAME_CONFIG.fixedStep;
        }
    } else simulationRemainder = 0;
    world.render(race, deltaTime, seconds);
    updateInstruments();
    audio.update(race.car, ['countdown', 'racing'].includes(race.state));
    startSequence.update(race);
    // Simulation/rendering run every frame; text and the minimap only need 12 Hz.
    if (seconds - lastHudTime > 1 / 12) { updateHud(); lastHudTime = seconds; }
    if (race.state === 'finished' && !finishHandled) finishRun();
}

function updateSoundButton() {
    const button = element('soundButton');
    button.setAttribute('aria-pressed', String(audio.enabled));
    button.setAttribute('aria-label', audio.enabled ? 'Mute game sound' : 'Enable game sound');
    button.title = audio.enabled ? 'Mute sound' : 'Enable sound';
}

async function enableSound(enabled, persist = false) {
    try {
        const ready = audio.setEnabled(enabled);
        if (persist) records.setSound(enabled);
        updateSoundButton();
        await ready;
        updateSoundButton();
        updateStorageStatus();
    } catch { showStageMessage('Sound could not start in this browser. You can still play.'); }
}

function showRecords() {
    const container = element('recordsList');
    container.replaceChildren();
    const dates = Object.keys(records.data.records).sort().reverse();
    if (!dates.length) {
        const empty = document.createElement('p');
        empty.textContent = 'A clean slate. Finish your first run to start your collection.';
        container.append(empty);
    }
    for (const date of dates) {
        const record = records.get(date);
        const row = document.createElement('div'); row.className = 'record-entry';
        const dateCell = document.createElement('span'); dateCell.textContent = date.startsWith('city-') || date.startsWith('synthwave-') ? `${BIOMES[date.split('-')[0]]} · ${date.split('-')[1].toUpperCase()}` : date;
        const runCount = document.createElement('small'); runCount.textContent = `${record.runs} completed ${record.runs === 1 ? 'run' : 'runs'}`; dateCell.append(runCount);
        const scoreCell = document.createElement('strong'); scoreCell.textContent = `${record.score.toLocaleString()} PTS`;
        const timeCell = document.createElement('span'); timeCell.textContent = formatTime(record.time);
        row.append(dateCell, scoreCell, timeCell); container.append(row);
    }
    element('recordsDialog').showModal();
}

async function initialize() {
    return loader.run('Warming up Apex Drift', initializeContent);
}

async function initializeContent() {
    element('startButton').disabled = true;
    try {
        if (!world) {
            // Dynamic import lets a failed renderer/library load show an actionable error.
            const { DriftWorld } = await import('./world.js');
            world = new DriftWorld(element('raceCanvas'));
            world.setCar(garagePreferences.value);
        }
        if (!garage) {
            const { Garage } = await import('./garage.js');
            garage = new Garage(element('garageDialog'), garagePreferences, customization => loader.run('Preparing your build', async () => {
                try {
                    world.setCar(customization);
                    await world.prepare(race);
                    updateSelectedCar(customization);
                    await loader.nextPaint();
                } catch (error) {
                    world.setCar(garagePreferences.value);
                    throw error;
                }
            }), operation => loader.run('Opening your garage', async () => {
                await operation();
                await loader.nextPaint();
            }));
            updateSelectedCar(garagePreferences.value);
            element('garageButton').disabled = false;
            element('previewGarageButton').disabled = false;
            element('raceCanvas').addEventListener('webglcontextlost', event => {
                event.preventDefault(); pauseRun();
                showStageMessage('Graphics were interrupted. Reload this page to restore the circuit.');
                element('resumeButton').disabled = true;
            });
        }
        if(!circuitLibrary) circuitLibrary = new CircuitLibrary(await loadBiomeBase());
        populateTrackSelector('city');
        await selectTrack('city');
    } catch (error) {
        showStageMessage(`Unable to load the game. ${error.message} A browser with WebGL2 is required.`);
        element('startButton').textContent = 'TRY AGAIN ↗'; element('startButton').disabled = false;
    }
}

function updateSelectedCar(customization) {
    const car = CAR_MODELS.find(model => model.id === customization.model);
    element('selectedCar').textContent = `${car.name} · ${car.category}`;
}

for (const id of ['garageButton', 'previewGarageButton', 'pauseGarageButton']) {
    element(id).addEventListener('click', () => {
        if (!garage || loader.active || !race) return;
        pauseRun();
        garage.open();
    });
}

element('startButton').addEventListener('click', startRun);
element('pauseButton').addEventListener('click', pauseRun);
element('resumeButton').addEventListener('click', resumeRun);
element('restartButton').addEventListener('click', startRun);
async function exitRun() {
    race = new Race(race.track); showPreview();
    populateTrackSelector(race.track.biome);
    element('startButton').focus({ preventScroll: true });
}
element('exitButton').addEventListener('click', exitRun);
element('mobileExitButton').addEventListener('click', exitRun);
element('trackSelect').addEventListener('change', event => { if (!loader.active) selectTrack(event.target.value); });
element('regenerateButton').addEventListener('click', () => { if (!loader.active && circuitLibrary) selectTrack(element('trackSelect').value, true); });
element('trackSettingsButton').addEventListener('click', () => {
    if (!loader.active && circuitLibrary && race?.state === 'ready') {
        trackSettings.open(BIOMES[element('trackSelect').value]);
    }
});
element('soundButton').addEventListener('click', () => {
    enableSound(!audio.enabled, true);
    if (input.active && race?.state !== 'paused') element('raceCanvas').focus({ preventScroll: true });
});
element('cameraButton').addEventListener('click', () => {
    if (!world) return;
    const close = world.toggleCameraDistance();
    const button = element('cameraButton');
    button.setAttribute('aria-pressed', String(close));
    button.setAttribute('aria-label', close ? 'Use standard camera distance' : 'Move camera 50% closer');
    button.title = close ? 'Camera: close · switch to standard' : 'Camera: standard · switch to close';
    if (input.active && race?.state !== 'paused') element('raceCanvas').focus({ preventScroll: true });
});
element('fullscreenButton').addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (stage.requestFullscreen) await stage.requestFullscreen();
        else throw new Error('Fullscreen is not available in this browser.');
        if (input.active && race?.state !== 'paused') element('raceCanvas').focus({ preventScroll: true });
    } catch { showStageMessage('Fullscreen is not available in this browser. You can still play in the page.'); }
});
document.addEventListener('fullscreenchange', () => {
    element('fullscreenButton').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});
// Keep keyboard navigation inside the pause/results panel until the driver leaves it.
element('raceOverlay').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...element('raceOverlay').querySelectorAll('button:not([hidden]):not([disabled])')];
    const first = buttons[0]; const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
// Instructions remain available inside the full-screen mobile stage.
for (const id of ['helpButton', 'pauseHelpButton']) {
    element(id).addEventListener('click', () => { pauseRun(); element('helpDialog').showModal(); });
}
element('recordsButton').addEventListener('click', () => { pauseRun(); showRecords(); });
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

updateStorageStatus();
updateSoundButton();
initialize();
requestAnimationFrame(animate);
