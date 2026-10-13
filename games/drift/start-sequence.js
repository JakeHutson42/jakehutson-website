// Simulation time keeps lights and beeps in sync across pause and hidden tabs.
export class StartSequence {
    constructor(element, audio) { this.element = element; this.audio = audio; }

    update(race) {
        if (this.race !== race) { this.race = race; this.phase = null; }
        const phase = race.state === 'countdown' ? (race.countdown > 1.5 ? 'ready' : 'set')
            : race.state === 'racing' && race.elapsed < 0.65 ? 'go' : null;
        this.element.hidden = !phase;
        if (!phase || phase === this.phase) return;
        this.phase = phase;
        this.element.dataset.phase = phase;
        this.element.querySelector('[data-start-word]').textContent = phase.toUpperCase();
        this.element.querySelector('[data-start-hint]').textContent = phase === 'go' ? 'OWN THE NIGHT' : 'HOLD YOUR LINE';
        this.audio.countdown(phase === 'go');
    }
}
