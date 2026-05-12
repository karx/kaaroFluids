/**
 * StageValidator — Design-time TDD runner for stage configs.
 * Call validate() when a stage loads; failures are logged to console.
 * Each stage config can supply a `designTests` array for stage-specific checks.
 */
export class StageValidator {
    validate(config) {
        const results = [
            this._test('spawn_in_bounds', 'Spawn region is within sim bounds', () => {
                const { spawnRegion: s, sim } = config;
                return s.minX >= 0 && s.minY >= 0 &&
                    s.maxX <= sim.simWidth && s.maxY <= sim.simHeight;
            }),

            this._test('spawn_no_wall_overlap', 'Spawn region does not overlap any wall', () => {
                return !config.walls.some(w => this._overlaps(config.spawnRegion, w));
            }),

            this._test('particle_density_sane', 'Particle count is 2–50 per unit² of spawn area', () => {
                const { spawnRegion: s, sim } = config;
                const area = (s.maxX - s.minX) * (s.maxY - s.minY);
                const density = sim.numParticles / area;
                return density >= 2 && density <= 50;
            }),

            this._test('tools_have_effect', 'Every tool has a non-zero delta', () => {
                return config.tools.length > 0 && config.tools.every(t => Math.abs(t.delta) > 0);
            }),
        ];

        if (config.winCondition?.zone) {
            results.push(
                this._test('win_zone_in_bounds', 'Win zone is within sim bounds', () => {
                    const z = config.winCondition.zone;
                    const { sim } = config;
                    return z.minX >= 0 && z.minY >= 0 &&
                        z.maxX <= sim.simWidth && z.maxY <= sim.simHeight;
                }),
                this._test('win_zone_no_wall', 'Win zone is not blocked by walls', () => {
                    return !config.walls.some(w => this._overlaps(config.winCondition.zone, w));
                })
            );
        }

        // Stage-specific design tests
        if (config.designTests) {
            for (const t of config.designTests) {
                results.push(this._test(t.id, t.description, () => t.test(config)));
            }
        }

        return results;
    }

    _test(id, description, fn) {
        try {
            return { id, description, passed: !!fn(), error: null };
        } catch (e) {
            return { id, description, passed: false, error: e.message };
        }
    }

    // AABB overlap check (exclusive boundaries)
    _overlaps(a, b) {
        return !(a.maxX <= b.minX || b.maxX <= a.minX ||
            a.maxY <= b.minY || b.maxY <= a.minY);
    }

    log(results, stageName) {
        const passed = results.filter(r => r.passed).length;
        const total = results.length;
        const ok = passed === total;
        console.group(
            `%c[StageValidator] ${stageName} — ${passed}/${total} passed`,
            `color:${ok ? '#34d399' : '#f87171'};font-weight:bold`
        );
        for (const r of results) {
            console.log(
                `%c${r.passed ? '✓' : '✗'} ${r.description}${r.error ? `  (${r.error})` : ''}`,
                `color:${r.passed ? '#34d399' : '#f87171'}`
            );
        }
        console.groupEnd();
        if (!ok) {
            console.warn('[StageValidator] Stage has design failures — check geometry before shipping.');
        }
    }
}
