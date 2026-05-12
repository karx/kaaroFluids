/**
 * Stage 1 — "The Flow" — Functional Tests
 *
 * These tests simulate the player's path to victory without a GPU.
 * The win condition uses a temperature proxy (VTF viscosity model):
 *   - player applies heat → temperature rises
 *   - temperature > 70°C → viscosity drops enough for fluid to pass the passage
 *   - elapsed > 10s     → physics have time to settle
 *
 * Path to victory
 * ───────────────
 *   Start: temperature = 5°C (viscous, cold)
 *   Action: click heater N times (each press: +4°C)
 *   Minimum presses to win: ceil((70 - 5 + ε) / 4) = 17 presses → 73°C
 *   Then wait > 10 seconds → win fires
 */

import { describe, it, expect } from 'vitest';
import { stage1Config } from '../stage1_theflow.js';
import { StageValidator } from '../StageValidator.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simulate pressing the heater N times; returns updated params object. */
function applyHeater(n, startTemp = stage1Config.sim.temperature) {
    const heater = stage1Config.tools.find(t => t.id === 'heater');
    return { temperature: startTemp + heater.delta * n };
}

/** VTF viscosity value matching the gauge compute function. */
function vtfViscosity(temperature) {
    const B = 500, T0 = -50, refTemp = 20;
    const ref = Math.exp(B / (refTemp - T0));
    const cur = Math.exp(B / (Math.max(temperature, T0 + 1) - T0));
    return stage1Config.sim.viscosityCoeff * (cur / ref);
}

// ─── Design-time validation ───────────────────────────────────────────────────

describe('StageValidator — design-time checks', () => {
    const validator = new StageValidator();
    let results;

    // Run once and share across all tests in this block
    results = validator.validate(stage1Config);

    it('all design tests pass', () => {
        const failures = results.filter(r => !r.passed);
        expect(failures, `failing: ${failures.map(f => f.id).join(', ')}`).toHaveLength(0);
    });

    it('spawn region is within sim bounds', () => {
        const r = results.find(r => r.id === 'spawn_in_bounds');
        expect(r.passed).toBe(true);
    });

    it('spawn region does not overlap any wall', () => {
        const r = results.find(r => r.id === 'spawn_no_wall_overlap');
        expect(r.passed).toBe(true);
    });

    it('passage gap (x 8.5–11.5) is clear of walls', () => {
        const r = results.find(r => r.id === 'passage_clear');
        expect(r.passed).toBe(true);
    });

    it('passage is ≥ 4× smoothingRadius wide', () => {
        const r = results.find(r => r.id === 'passage_wide_enough');
        expect(r.passed).toBe(true);
    });

    it('win zone starts below the passage exit', () => {
        const r = results.find(r => r.id === 'pool_below_passage');
        expect(r.passed).toBe(true);
    });

    it('heater can reach flow temperature within 25 presses', () => {
        const r = results.find(r => r.id === 'heater_achieves_flow_temp');
        expect(r.passed).toBe(true);
    });
});

// ─── Tool simulation ──────────────────────────────────────────────────────────

describe('Heater tool — parameter effects', () => {
    const heater = stage1Config.tools.find(t => t.id === 'heater');

    it('has a positive temperature delta', () => {
        expect(heater.delta).toBeGreaterThan(0);
    });

    it('each press increases temperature by delta (4°C)', () => {
        const before = stage1Config.sim.temperature;
        const after = applyHeater(1).temperature;
        expect(after - before).toBe(heater.delta);
    });

    it('10 presses → 5 + 40 = 45°C', () => {
        expect(applyHeater(10).temperature).toBe(45);
    });

    it('17 presses → 73°C (crosses the 70°C flow threshold)', () => {
        expect(applyHeater(17).temperature).toBeGreaterThan(70);
    });

    it('16 presses → 69°C (just below flow threshold)', () => {
        expect(applyHeater(16).temperature).toBeLessThanOrEqual(70);
    });
});

// ─── Win condition: victory path ──────────────────────────────────────────────

describe('Win condition — victory path', () => {
    const { check, timeLimit } = stage1Config.winCondition;

    it('17 presses (73°C) + 11s elapsed → win fires', () => {
        const params = applyHeater(17);
        expect(check(params, 11)).toBe(true);
    });

    it('20 presses (85°C) + 15s elapsed → win fires', () => {
        const params = applyHeater(20);
        expect(check(params, 15)).toBe(true);
    });

    it('maximum heater presses still win within time limit', () => {
        // 25 presses × 4 = 100°C delta → 105°C
        const params = applyHeater(25);
        // 25 presses at ~1/second + 11 seconds wait = ~36s, well under 90s
        expect(check(params, 36)).toBe(true);
    });
});

// ─── Win condition: failure paths ─────────────────────────────────────────────

describe('Win condition — failure paths', () => {
    const { check, timeLimit } = stage1Config.winCondition;

    it('16 presses (69°C) never wins regardless of wait time', () => {
        const params = applyHeater(16); // 69°C — below threshold
        expect(check(params, 30)).toBe(false);
        expect(check(params, 80)).toBe(false);
    });

    it('17 presses (73°C) + only 5s → win does NOT fire yet', () => {
        const params = applyHeater(17);
        expect(check(params, 5)).toBe(false);  // elapsed ≤ 10
    });

    it('17 presses (73°C) + exactly 10s → win does NOT fire (boundary)', () => {
        const params = applyHeater(17);
        expect(check(params, 10)).toBe(false);  // elapsed must be > 10, not =
    });

    it('time expired at 91s → win cannot fire even with high temperature', () => {
        const params = applyHeater(25); // 105°C
        expect(check(params, 91)).toBe(false);  // elapsed > timeLimit
    });

    it('starting temperature (5°C) + any elapsed → win never fires', () => {
        const params = { temperature: stage1Config.sim.temperature };
        expect(check(params, 50)).toBe(false);
        expect(check(params, 89)).toBe(false);
    });
});

// ─── Stage solvability ────────────────────────────────────────────────────────

describe('Stage solvability — theoretical guarantees', () => {
    const { check, timeLimit } = stage1Config.winCondition;
    const heater = stage1Config.tools.find(t => t.id === 'heater');

    it('minimum presses to cross 70°C threshold is 17', () => {
        const minPresses = Math.ceil((70 - stage1Config.sim.temperature + 0.001) / heater.delta);
        expect(minPresses).toBe(17);
    });

    it('minimum real-time to win: 17 presses (~17s) + 11s settle = ~28s < 90s limit', () => {
        const minPresses = Math.ceil((70 - stage1Config.sim.temperature + 0.001) / heater.delta);
        const pressTimeSeconds = minPresses;  // pessimistic: 1 press per second
        const settleTime = 11;
        const minimumTotalTime = pressTimeSeconds + settleTime;
        expect(minimumTotalTime).toBeLessThan(timeLimit);
    });

    it('heater delta × 25 presses from start exceeds 70°C', () => {
        const reachable = stage1Config.sim.temperature + heater.delta * 25;
        expect(reachable).toBeGreaterThan(70);
    });

    it('stage time limit is generous enough (at least 2× minimum time needed)', () => {
        const minPresses = Math.ceil((70 - stage1Config.sim.temperature + 0.001) / heater.delta);
        const minimumTime = minPresses + 11;
        expect(timeLimit).toBeGreaterThanOrEqual(minimumTime * 2);
    });
});

// ─── VTF viscosity model ──────────────────────────────────────────────────────

describe('VTF viscosity model — gauge sanity', () => {
    const viscGauge = stage1Config.gauges.find(g => g.id === 'viscosity');

    it('viscosity at 5°C is higher than at reference temp (20°C)', () => {
        const cold = vtfViscosity(5);
        const ref = vtfViscosity(20);
        expect(cold).toBeGreaterThan(ref);
    });

    it('viscosity decreases monotonically as temperature rises', () => {
        const temps = [5, 20, 40, 60, 80, 100];
        const values = temps.map(vtfViscosity);
        for (let i = 1; i < values.length; i++) {
            expect(values[i]).toBeLessThan(values[i - 1]);
        }
    });

    it('viscosity at 80°C is at least 5× lower than at 5°C', () => {
        const cold = vtfViscosity(5);
        const hot = vtfViscosity(80);
        expect(cold / hot).toBeGreaterThan(5);
    });

    it('gauge compute returns a numeric string', () => {
        const result = viscGauge.compute({ temperature: 60, viscosityCoeff: 8.0 });
        expect(typeof result).toBe('string');
        expect(isNaN(parseFloat(result))).toBe(false);
    });

    it('gauge compute at 5°C returns higher value than at 80°C', () => {
        const cold = parseFloat(viscGauge.compute({ temperature: 5,  viscosityCoeff: 8.0 }));
        const hot  = parseFloat(viscGauge.compute({ temperature: 80, viscosityCoeff: 8.0 }));
        expect(cold).toBeGreaterThan(hot);
    });
});

// ─── Scene geometry ───────────────────────────────────────────────────────────

describe('Scene geometry — structural invariants', () => {
    const { walls, spawnRegion, sim } = stage1Config;

    it('spawn region area contains the correct particle density', () => {
        const area = (spawnRegion.maxX - spawnRegion.minX) * (spawnRegion.maxY - spawnRegion.minY);
        const density = sim.numParticles / area;
        expect(density).toBeGreaterThanOrEqual(2);
        expect(density).toBeLessThanOrEqual(50);
    });

    it('all walls are within sim bounds', () => {
        for (const w of walls) {
            expect(w.minX).toBeGreaterThanOrEqual(0);
            expect(w.minY).toBeGreaterThanOrEqual(0);
            expect(w.maxX).toBeLessThanOrEqual(sim.simWidth);
            expect(w.maxY).toBeLessThanOrEqual(sim.simHeight);
        }
    });

    it('every wall has positive width and height', () => {
        for (const w of walls) {
            expect(w.maxX).toBeGreaterThan(w.minX);
            expect(w.maxY).toBeGreaterThan(w.minY);
        }
    });

    it('passage pipe walls are symmetric about x = 10 (centre)', () => {
        // Find pipe walls by their narrow width (< 1 unit) at the passage x-edges
        const left  = walls.find(w => w.maxX === 8.5  && (w.maxX - w.minX) < 1.0);
        const right = walls.find(w => w.minX === 11.5 && (w.maxX - w.minX) < 1.0);
        expect(left).toBeDefined();
        expect(right).toBeDefined();
        expect(10 - left.maxX).toBeCloseTo(right.minX - 10, 5);
    });

    it('collection pool floor is below the passage exit', () => {
        const floor    = walls.find(w => w.minX === 5.0 && (w.maxX - w.minX) > 5.0 && (w.maxY - w.minY) < 1.0);
        const leftPipe = walls.find(w => w.maxX === 8.5 && (w.maxX - w.minX) < 1.0);
        expect(floor).toBeDefined();
        expect(leftPipe).toBeDefined();
        expect(floor.minY).toBeGreaterThan(leftPipe.maxY);
    });

    it('funnel zone has no horizontal dead-zone wider than 2 units', () => {
        // Flat horizontal walls create dead zones: gravity holds particles on them
        // but no horizontal force exists to push them toward the passage gap.
        // Each funnel step must be narrow enough (≤ 2 units) that fluid overflows it
        // under pressure rather than pooling permanently.
        const funnelFloors = walls.filter(w => {
            const height = w.maxY - w.minY;
            const width  = w.maxX - w.minX;
            const inFunnelY  = w.minY >= 3.5 && w.maxY <= 8.5; // lower chamber zone
            const isFloorLike = height < 0.6 && width > 0.6;   // thin + wide = horizontal surface
            return inFunnelY && isFloorLike;
        });

        for (const w of funnelFloors) {
            const width = w.maxX - w.minX;
            expect(
                width,
                `Wall [x ${w.minX}–${w.maxX}, y ${w.minY}–${w.maxY}] is ${width} units wide — particles pool here and never reach the passage`
            ).toBeLessThanOrEqual(2.0);
        }
    });
});
