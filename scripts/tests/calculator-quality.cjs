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

    const engineBundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/backend/domain/calculator/CalculatorEngine.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false
    });
    const engineModule = { exports: {} };
    new Function('module', 'exports', 'require', engineBundle.outputFiles[0].text)(engineModule, engineModule.exports, require);
    const recipe = {
        id: 'recipe-1', code: 'RE0001', date: '2026-01-01', clientId: null, name: 'Teste de superfat', notes: '',
        alkali: 'NaOH', superfat: 5, waterConcentration: 30, alkaliPurity: 100,
        fats: [{ id: 'base', ingredientId: 'base', name: 'Base', amount: 100, percentage: 100 }],
        liquids: [], functionalAdditives: [], lyeAdditives: [], traceAdditives: [],
        superfatOils: [{ id: 'superfat', ingredientId: 'superfat', name: 'Superfat', amount: 25, percentage: 0 }],
        essentialOils: [{ id: 'essential', ingredientId: 'essential', name: 'Essencial', amount: 5, percentage: 0 }]
    };
    const zeroProfile = { lauric: 0, myristic: 0, palmitic: 0, stearic: 0, ricinoleic: 0, oleic: 0, linoleic: 0, linolenic: 0, gadoleic: 0, other: 0 };
    const ingredients = [
        { id: 'base', name: 'Base', kind: 'oil', sapNaOH: 0.14, sapKOH: 0.196, fattyAcids: { ...zeroProfile, palmitic: 100 }, properties: {} },
        { id: 'superfat', name: 'Superfat', kind: 'oil', sapNaOH: 0.14, sapKOH: 0.196, fattyAcids: { ...zeroProfile, oleic: 100 }, properties: {} },
        { id: 'essential', name: 'Essencial', kind: 'essentialOil', sapNaOH: 0, sapKOH: 0, fattyAcids: { ...zeroProfile, lauric: 100 }, properties: {} }
    ];
    const calculation = engineModule.exports.CalculatorEngine.calculate({ recipe, ingredients, now: new Date('2026-01-01T12:00:00Z') });
    assert.equal(calculation.results.properties.hardness, 80);
    assert.equal(calculation.results.properties.conditioning, 20);
    assert.equal(calculation.results.iodine, 17.2);
    assert.ok(Math.abs(calculation.results.ins - 178.8) < 1e-9);
    assert.equal(calculation.results.superfatFinal, 24);

    const standardDimensions = { lengthCm: 6.5, widthCm: 6.5, heightCm: 2.5 };
    const summerDrying = engineModule.exports.CalculatorEngine.calculate({
        recipe,
        ingredients,
        now: new Date('2026-06-21T12:00:00Z'),
        curingBarDimensions: standardDimensions
    }).phaseTotals.physicalDays;
    const winterDrying = engineModule.exports.CalculatorEngine.calculate({
        recipe,
        ingredients,
        now: new Date('2026-12-21T12:00:00Z'),
        curingBarDimensions: standardDimensions
    }).phaseTotals.physicalDays;
    const thickerBarDrying = engineModule.exports.CalculatorEngine.calculate({
        recipe,
        ingredients,
        now: new Date('2026-12-21T12:00:00Z'),
        curingBarDimensions: { ...standardDimensions, heightCm: 5 }
    }).phaseTotals.physicalDays;
    const wetterRecipeDrying = engineModule.exports.CalculatorEngine.calculate({
        recipe: { ...recipe, waterConcentration: 24 },
        ingredients,
        now: new Date('2026-12-21T12:00:00Z'),
        curingBarDimensions: standardDimensions
    }).phaseTotals.physicalDays;
    assert.ok(winterDrying > summerDrying);
    assert.ok(thickerBarDrying > winterDrying);
    assert.ok(wetterRecipeDrying > winterDrying);
    console.log('calculator-quality: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
