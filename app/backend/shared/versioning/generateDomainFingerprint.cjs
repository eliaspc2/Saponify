const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../../../../');

const inputFiles = [
    'app/backend/ai/rules/soap_recipe_core_norms.json',
    'app/backend/ai/rules/soap_recipe_norms.json',
    'app/backend/ai/schemas/GeneratedRecipeSchema.ts',
    'app/backend/ai/validators/GeneratedRecipeValidator.ts',
    'app/backend/domain/calculator/CalculatorEngine.ts',
    'app/backend/domain/calculator/CalculatorRules.ts',
    'app/backend/domain/calculator/CalculatorModels.ts',
    'app/backend/domain/calculator/fattyAcidProfile.ts',
    'app/backend/domain/calculator/alkaliAndWater.ts',
    'app/backend/domain/calculator/qualityMetrics.ts',
    'app/backend/domain/calculator/phaseWeights.ts',
    'app/shared/settings/AppSettings.ts',
    'app/shared/settings/AppSettingsDefaults.ts'
];

const normalizeContent = (content) => content.replace(/\r\n/g, '\n');

const sortedFiles = [...inputFiles].sort();
let combined = '';

sortedFiles.forEach((relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Fingerprint input missing: ${relativePath}`);
    }
    const raw = fs.readFileSync(absolutePath, 'utf8');
    combined += `\n--FILE:${relativePath}--\n${normalizeContent(raw)}`;
});

const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');

const outputPath = path.join(__dirname, 'DomainFingerprint.generated.ts');
const output = [
    `export const RECIPE_DOMAIN_FINGERPRINT = '${hash}';`,
    `export const RECIPE_DOMAIN_FINGERPRINT_INPUTS = ${JSON.stringify(sortedFiles, null, 4)} as const;`,
    ''
].join('\n');

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Domain fingerprint generated: ${hash}`);
