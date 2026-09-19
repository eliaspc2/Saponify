const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');

async function run() {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/backend/domain/calculator/CalculatorEngine.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    const recipe = {
        id: 'recipe-1', code: 'RE0001', date: '2026-01-01', clientId: null, name: 'Receita de teste', notes: '',
        alkali: 'NaOH', superfat: 7, waterConcentration: 30, alkaliPurity: 100,
        fats: [{ id: 'fat-1', ingredientId: 'olive', name: 'Azeite', amount: 500, percentage: 100 }],
        liquids: [], functionalAdditives: [], lyeAdditives: [], traceAdditives: [], superfatOils: [], essentialOils: []
    };
    const ingredients = [{ id: 'olive', name: 'Azeite', sap: 0.134, sapKoh: 0.188, fattyAcids: { oleic: 70 }, properties: {} }];
    const calculation = loaded.exports.CalculatorEngine.calculate({ recipe, ingredients, now: new Date('2026-01-01T12:00:00Z') });
    const markdown = calculation.exports.markdown.content;
    assert.match(markdown, /## Cura e Secagem/);
    assert.match(markdown, new RegExp(`Estabilização química: ~${calculation.phaseTotals.chemicalDays} dias`));
    assert.match(markdown, new RegExp(`Secagem física: ~${calculation.phaseTotals.physicalDays} dias`));
    assert.match(markdown, new RegExp(`Peso estável alvo: ${calculation.phaseTotals.estimatedDryWeight.toFixed(1)} g`));
    assert.match(markdown, new RegExp(`Peso sem água teórico: ${calculation.phaseTotals.anhydrousWeight.toFixed(1)} g`));
    assert.equal(
        calculation.phaseTotals.anhydrousWeight,
        calculation.phaseTotals.batchWeightWithLye - calculation.results.waterAmount
    );
    assert.ok(calculation.phaseTotals.estimatedDryWeight >= calculation.phaseTotals.anhydrousWeight);
    assert.ok(calculation.phaseTotals.estimatedDryWeight <= calculation.phaseTotals.batchWeightWithLye);
    console.log('calculator-export: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
