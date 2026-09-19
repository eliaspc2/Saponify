const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');

async function run() {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/backend/domain/calculator/qualityMetrics.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);

    const profile = {
        lauric: 1,
        myristic: 2,
        palmitic: 3,
        stearic: 4,
        ricinoleic: 5,
        oleic: 6,
        linoleic: 7,
        linolenic: 8,
        gadoleic: 9,
        other: 55
    };
    const metrics = loaded.exports.computeQualityMetrics(profile);
    assert.deepEqual(metrics, {
        hardness: 10,
        cleansing: 3,
        bubbles: 8,
        persistence: 12,
        conditioning: 35
    });
    assert.ok(Math.abs(loaded.exports.computeIodine(profile) - 50.202) < 1e-9);
    assert.ok(Math.abs(loaded.exports.computeINS(0.2, 50.202) - 149.798) < 1e-9);
    console.log('calculator-quality: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
