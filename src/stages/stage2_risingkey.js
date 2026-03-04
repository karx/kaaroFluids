/**
 * Stage 2 — "Rising Key"
 * Concept: Density & Buoyancy (Encountering the Unconscious)
 * 
 * Buried deep, beyond reach. You cannot seize what is hidden.
 * Change the waters within, and what was lost will rise to meet you.
 */
export const stage2Config = {
    id: 'stage2',
    title: 'Rising Key',
    number: '02',
    icon: '🗝️',
    concept: 'Density & Buoyancy',
    description: 'Dissolve salt to increase fluid density and float a sunken key.',
    locked: false,

    // Narrative transition screen
    narrative: {
        title: 'STAGE TWO — RISING KEY',
        screenplay: [
            'FADE IN:',
            '',
            'INT. THE DEEP PLACE — UNLIT',
            '',
            'Water fills a tall, silent chamber.',
            'Blue. Clear. Deceptively calm.',
            '',
            'Far below, barely visible, a shape rests on the floor.',
            'A key. Old. Heavy. Patient.',
            '',
            'You reach. The water resists depth.',
            'You cannot dive far enough.',
            'The key does not want to be grabbed.',
            'It wants to be understood.',
            '',
            '        "Make the waters richer.',
            '         What sank will rise."',
            '',
            'FADE TO GAMEPLAY.',
        ],
        whisper: 'What sank will rise.',
    },

    // Simulation config
    sim: {
        simWidth: 20,
        simHeight: 15,
        numParticles: 600,
        smoothingRadius: 0.4,
        restDensity: 1000,
        gasConstant: 2000,
        viscosityCoeff: 1.0, // Water-like
        surfaceTensionCoeff: 0.07,
        gravity: [0, 9.81],
        temperature: 20,
    },

    // Fluid appearance
    fluidColor: [0.15, 0.4, 0.9, 0.85], // Deep blue water

    // Static geometry
    walls: [
        // Tank walls (tall, narrow)
        { minX: 6, minY: 1, maxX: 6.3, maxY: 14 },    // Left wall
        { minX: 13.7, minY: 1, maxX: 14, maxY: 14 },   // Right wall
        { minX: 6, minY: 13.7, maxX: 14, maxY: 14 },   // Floor
    ],

    // Particle spawn region (fill the tank)
    spawnRegion: { minX: 6.5, minY: 3, maxX: 13.5, maxY: 13.5 },

    // Key object (simulated as a dense zone)
    keyObject: {
        x: 10,
        y: 12.5,
        width: 1.2,
        height: 0.6,
        density: 2500, // Much heavier than water
        color: [0.8, 0.7, 0.2, 1.0], // Gold
    },

    // Tools
    tools: [
        {
            id: 'salt',
            name: 'Salt',
            icon: '🧂',
            effect: 'restDensity',
            delta: 80, // kg/m³ per application
            radius: 3.0,
            maxApplications: 25,
        },
    ],

    // Gauges
    gauges: [
        {
            id: 'fluidDensity',
            label: 'Fluid Density',
            unit: 'kg/m³',
            min: 900,
            max: 3500,
            color: 'var(--accent-blue)',
            param: 'restDensity',
        },
        {
            id: 'keyDensity',
            label: 'Key Density',
            unit: 'kg/m³',
            min: 0,
            max: 3500,
            color: 'var(--accent-orange)',
            static: 2500,
        },
        {
            id: 'buoyancy',
            label: 'Buoyancy',
            unit: '',
            min: 0,
            max: 100,
            color: 'var(--accent-green)',
            compute: (params) => {
                const ratio = (params.restDensity / 2500) * 100;
                return Math.min(ratio, 100).toFixed(0) + '%';
            },
        },
    ],

    // Win condition
    winCondition: {
        type: 'keyReachesSurface',
        surfaceY: 4, // Key must rise above this Y
        timeLimit: 90,
    },

    // Educational callouts
    callouts: [
        {
            trigger: 'restDensityAbove',
            value: 1500,
            text: "Archimedes' Principle: The buoyant force grows as the fluid becomes denser. The waters are changing.",
        },
        {
            trigger: 'restDensityAbove',
            value: 2200,
            text: 'Almost there. When the medium becomes richer than what it holds, the hidden truth rises unbidden.',
        },
    ],

    winMessage: 'The key surfaces. What was buried rises when the medium transforms.\n\nYou learned: buoyancy depends on the density of the surrounding fluid, not the strength of your reach.',
};
