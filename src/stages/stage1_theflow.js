/**
 * Stage 1 — "The Flow"
 * Concept: Viscosity & Temperature
 *
 * Sim space: 20 × 15  (gravity = +Y downward)
 *
 * Scene layout
 * ┌──────────────────────────────────┐  y=0.5
 * │        UPPER CHAMBER             │
 * │   (fluid spawns here, 600 ptcl)  │
 * └──────────────────────────────────┘  y=4.0
 *   ██████                  ██████      step A (y=4.0, w=2)
 *       ██████          ██████          step B (y=5.2, w=2)
 *           ██████  ██████              step C (y=6.4, w=2)
 *               │  PASSAGE │            y=6.8–10.5, 3 units wide
 *          ┌────┴──────────┴────┐       y=10.5
 *          │  COLLECTION POOL   │
 *          │   [  G O A L  ]    │
 *          └────────────────────┘       y=14.5
 */

export const stage1Config = {
    id: 'stage1',
    title: 'The Flow',
    number: '01',
    icon: '🔥',
    concept: 'Viscosity & Temperature',
    description: 'Warm a cold, viscous fluid to help it flow through the narrow passage.',
    locked: false,

    narrative: {
        title: 'STAGE ONE — THE FLOW',
        screenplay: [
            'FADE IN:',
            '',
            'INT. THE STILL PLACE — TIMELESS',
            '',
            'A golden amber substance fills a chamber.',
            'It does not move. It does not breathe.',
            'It has forgotten how.',
            '',
            'Below, a narrow passage waits — dark, patient.',
            'Beyond it, somewhere, a current remembers itself.',
            '',
            '        "What resists your flow?"',
            '',
            'FADE TO GAMEPLAY.',
        ],
        whisper: 'What resists your flow?',
    },

    sim: {
        simWidth: 20,
        simHeight: 15,
        numParticles: 600,
        smoothingRadius: 0.5,
        restDensity: 1000,
        gasConstant: 1500,
        viscosityCoeff: 8.0,   // high — honey-like at 5°C
        surfaceTensionCoeff: 0.1,
        gravity: [0, 9.81],
        temperature: 5,        // cold start → VTF gives very high effective viscosity
    },

    fluidColor: [0.85, 0.6, 0.15, 0.9],  // warm amber

    /*
     * Wall geometry (all AABB)
     *
     * Upper chamber: x 2–18, y 0.5–4.0  — particles spawn here
     *
     * Stepped funnel: three 2-unit-wide steps on each side descend toward the
     * passage gap. Steps are ≤ 2 units wide so fluid overflows under pressure
     * rather than pooling permanently (enforced by the dead-zone design test).
     *
     * Passage: gap x 8.5–11.5, 3 units wide, y 6.8–10.5
     *
     * Collection pool: x 5–15, y 10.5–14.5
     */
    walls: [
        // Upper chamber
        { minX: 2.0,  minY: 0.5,  maxX: 18.0, maxY: 1.0  }, // top border
        { minX: 2.0,  minY: 0.5,  maxX: 2.5,  maxY: 10.5 }, // left outer wall
        { minX: 17.5, minY: 0.5,  maxX: 18.0, maxY: 10.5 }, // right outer wall

        // Left stepped funnel — each step ≤ 2 units wide, descends toward passage
        { minX: 2.5,  minY: 4.0,  maxX: 4.5,  maxY: 4.4  }, // step A
        { minX: 4.5,  minY: 5.2,  maxX: 6.5,  maxY: 5.6  }, // step B
        { minX: 6.5,  minY: 6.4,  maxX: 8.5,  maxY: 6.8  }, // step C → passage entrance

        // Right stepped funnel — mirror of left
        { minX: 15.5, minY: 4.0,  maxX: 17.5, maxY: 4.4  }, // step A
        { minX: 13.5, minY: 5.2,  maxX: 15.5, maxY: 5.6  }, // step B
        { minX: 11.5, minY: 6.4,  maxX: 13.5, maxY: 6.8  }, // step C → passage entrance

        // Passage pipe walls — gap is x 8.5–11.5, 3 units wide
        { minX: 8.0,  minY: 6.8,  maxX: 8.5,  maxY: 10.5 }, // left pipe
        { minX: 11.5, minY: 6.8,  maxX: 12.0, maxY: 10.5 }, // right pipe

        // Collection pool
        { minX: 5.0,  minY: 10.5, maxX: 5.5,  maxY: 14.5 }, // left wall
        { minX: 14.5, minY: 10.5, maxX: 15.0, maxY: 14.5 }, // right wall
        { minX: 5.0,  minY: 14.0, maxX: 15.0, maxY: 14.5 }, // floor
    ],

    // Particles spawn in the upper chamber, above the funnel steps
    spawnRegion: { minX: 2.6, minY: 1.2, maxX: 17.4, maxY: 3.8 },

    tools: [
        {
            id: 'heater',
            name: 'Heat',
            icon: '🔥',
            effect: 'temperature',
            delta: 4,      // °C per click — 25 clicks to reach 105°C
            radius: 2.0,
        },
    ],

    gauges: [
        {
            id: 'temperature',
            label: 'Temperature',
            unit: '°C',
            min: 0,
            max: 120,
            color: 'var(--accent-orange)',
            param: 'temperature',
        },
        {
            id: 'viscosity',
            label: 'Viscosity',
            unit: 'Pa·s',
            min: 0,
            max: 10,
            color: 'var(--accent-purple)',
            compute: (params) => {
                const B = 500, T0 = -50, refTemp = 20;
                const refFactor = Math.exp(B / (refTemp - T0));
                const curFactor = Math.exp(B / (Math.max(params.temperature, T0 + 1) - T0));
                return (params.viscosityCoeff * (curFactor / refFactor)).toFixed(1);
            },
        },
    ],

    winCondition: {
        type: 'particlesInZone',
        zone: { minX: 5.6, minY: 11.2, maxX: 14.4, maxY: 13.8 },
        percentage: 0.6,
        timeLimit: 90,
        // Pure function — proxy for GPU particle counting via temperature-driven flow model.
        // temperature > 70°C means VTF viscosity has dropped enough for fluid to pass
        // the passage; elapsed > 10 gives physics time to settle after heating.
        check: (params, elapsed) =>
            elapsed <= 90 && elapsed > 10 && params.temperature > 70,
    },

    callouts: [
        {
            trigger: 'temperatureAbove',
            value: 30,
            text: 'Viscosity drops exponentially with temperature — Vogel-Tammann-Fulcher. Keep applying heat.',
        },
        {
            trigger: 'temperatureAbove',
            value: 70,
            text: 'The resistance melts. The passage opens to what was already moving.',
        },
    ],

    /*
     * Design-time TDD tests — executed by StageValidator at stage load.
     * These assert structural invariants that protect against geometry bugs.
     */
    designTests: [
        {
            id: 'passage_clear',
            description: 'Passage gap (x 8.5–11.5, y 6.8–10.5) contains no wall',
            test: (config) => !config.walls.some(w =>
                w.maxX > 8.5 && w.minX < 11.5 &&
                w.maxY > 6.8 && w.minY < 10.5
            ),
        },
        {
            id: 'passage_wide_enough',
            description: 'Passage is ≥ 4× smoothingRadius wide (ensures particles can pass)',
            test: (config) => (11.5 - 8.5) >= 4 * config.sim.smoothingRadius,
        },
        {
            id: 'pool_below_passage',
            description: 'Win zone starts below passage exit (y > 10.5)',
            test: (config) => config.winCondition.zone.minY > 10.5,
        },
        {
            id: 'funnel_no_dead_zones',
            description: 'Each funnel step is ≤ 2 units wide (prevents permanent pooling)',
            test: (config) => {
                const funnelFloors = config.walls.filter(w => {
                    const h = w.maxY - w.minY;
                    const ww = w.maxX - w.minX;
                    return w.minY >= 3.5 && w.maxY <= 8.5 && h < 0.6 && ww > 0.6;
                });
                return funnelFloors.every(w => (w.maxX - w.minX) <= 2.0);
            },
        },
        {
            id: 'heater_achieves_flow_temp',
            description: 'Heater can reach 70°C within 25 applications from start temperature',
            test: (config) => {
                const h = config.tools.find(t => t.id === 'heater');
                return config.sim.temperature + h.delta * 25 >= 70;
            },
        },
    ],

    winMessage: 'The current returns.\n\nViscosity decreases exponentially with temperature — the Vogel-Tammann-Fulcher relationship.',
};
