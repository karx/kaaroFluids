/**
 * Stage 1 — "The Flow"
 * Concept: Viscosity & Temperature (Meeting the Ego's Resistance)
 * 
 * The mind has grown cold. Thought does not flow.
 * Apply warmth — not force — and watch the current return.
 */
export const stage1Config = {
    id: 'stage1',
    title: 'The Flow',
    number: '01',
    icon: '🔥',
    concept: 'Viscosity & Temperature',
    description: 'Warm a viscous fluid to help it flow through a narrow passage.',
    locked: false,

    // Narrative transition screen (placeholder for future video)
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
            'A warmth appears at the edge of perception.',
            'Not fire. Something gentler.',
            'Attention, perhaps.',
            '',
            '        "What resists your flow?"',
            '',
            'FADE TO GAMEPLAY.',
        ],
        whisper: 'What resists your flow?',
    },

    // Simulation config
    sim: {
        simWidth: 20,
        simHeight: 15,
        numParticles: 500,
        smoothingRadius: 0.45,
        restDensity: 1000,
        gasConstant: 1500,
        viscosityCoeff: 8.0, // Very viscous — honey-like
        surfaceTensionCoeff: 0.15,
        gravity: [0, 9.81],
        temperature: 5, // Cold — high viscosity
    },

    // Fluid appearance
    fluidColor: [0.85, 0.6, 0.15, 0.9], // Warm amber/honey

    // Static geometry (walls)
    walls: [
        // Upper container walls
        { minX: 3, minY: 2, maxX: 3.3, maxY: 8 },    // Left wall
        { minX: 10, minY: 2, maxX: 10.3, maxY: 8 },   // Right wall
        { minX: 3, minY: 2, maxX: 10.3, maxY: 2.3 },  // Top wall
        // Narrow pipe walls
        { minX: 3, minY: 8, maxX: 6, maxY: 8.3 },     // Left bottom
        { minX: 7.3, minY: 8, maxX: 10.3, maxY: 8.3 }, // Right bottom
        // Pipe sides
        { minX: 6, minY: 8, maxX: 6.3, maxY: 11 },    // Left pipe wall
        { minX: 7, minY: 8, maxX: 7.3, maxY: 11 },    // Right pipe wall
        // Collection floor
        { minX: 2, minY: 13, maxX: 11, maxY: 13.3 },  // Floor
        { minX: 2, minY: 11, maxX: 2.3, maxY: 13.3 }, // Left wall
        { minX: 10.7, minY: 11, maxX: 11, maxY: 13.3 }, // Right wall
    ],

    // Particle spawn region
    spawnRegion: { minX: 3.5, minY: 2.5, maxX: 10, maxY: 7.5 },

    // Tools available
    tools: [
        {
            id: 'heater',
            name: 'Heat',
            icon: '🔥',
            effect: 'temperature',
            delta: 3, // degrees per application
            radius: 2.0,
        },
    ],

    // Gauges
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
                // VTF approximation for display
                const B = 500, T0 = -50, refTemp = 20;
                const refFactor = Math.exp(B / (refTemp - T0));
                const curFactor = Math.exp(B / (Math.max(params.temperature, T0 + 1) - T0));
                return (params.viscosityCoeff * (curFactor / refFactor)).toFixed(1);
            },
        },
    ],

    // Win condition
    winCondition: {
        type: 'particlesInZone',
        zone: { minX: 2.5, minY: 11.5, maxX: 10.5, maxY: 13 },
        percentage: 0.6, // 60% of particles must reach the zone
        timeLimit: 60, // seconds
    },

    // Educational callouts
    callouts: [
        {
            trigger: 'temperatureAbove',
            value: 40,
            text: 'Vogel-Tammann-Fulcher: Viscosity decreases exponentially as temperature rises. The warmth is working.',
        },
        {
            trigger: 'temperatureAbove',
            value: 80,
            text: 'The resistance melts. What was frozen begins to remember how to move.',
        },
    ],

    winMessage: 'The current returns. What was still now flows freely.\n\nYou learned: viscosity drops exponentially with temperature.',
};
