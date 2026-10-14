import { RACERS } from './race.js';

const POINTS = [10, 6, 4, 2];

export class PocketCup {
    constructor(startRoom = 0) {
        this.startRoom = startRoom; this.round = 0; this.totals = [0, 0, 0, 0];
        this.scoredRound = -1; this.lastOrder = [0, 1, 2, 3];
    }
    get room() { return (this.startRoom + this.round) % 3; }
    get finalRound() { return this.round === 2; }
    award(ranking) {
        if (this.scoredRound === this.round) return;
        const order = ranking.map(car => car.index);
        if (order.length !== 4 || new Set(order).size !== 4 || order.some(i => !Number.isInteger(i) || i < 0 || i > 3))
            throw new Error('Cup results require all four racers.');
        order.forEach((index, place) => { this.totals[index] += POINTS[place]; });
        this.lastOrder = order; this.scoredRound = this.round;
    }
    next() {
        if (this.finalRound || this.scoredRound !== this.round) return false;
        this.round++; return true;
    }
    get standings() {
        return RACERS.map((racer, index) => ({ ...racer, index, points: this.totals[index] }))
            .sort((a, b) => b.points - a.points || this.lastOrder.indexOf(a.index) - this.lastOrder.indexOf(b.index));
    }
}
