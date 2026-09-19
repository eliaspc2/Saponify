const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../../../../');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const getGitRevision = () => {
    try {
        return require('child_process')
            .execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
            .trim();
    } catch {
        return process.env.GITHUB_SHA?.slice(0, 12) || 'local';
    }
};

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
const buildTime = new Date().toISOString();
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
    `export const BUILD_TIME = '${buildTime}';`,
    `export const RECIPE_DOMAIN_FINGERPRINT_INPUTS = ${JSON.stringify(sortedFiles, null, 4)} as const;`,
    ''
].join('\n');

fs.writeFileSync(outputPath, output, 'utf8');

const appVersionPath = path.join(__dirname, 'AppVersion.generated.ts');
const appVersion = `${packageJson.version || '0.0.0'}+${getGitRevision()}`;
fs.writeFileSync(appVersionPath, `export const APP_VERSION = '${appVersion}';\n`, 'utf8');

console.log(`Build metadata generated: ${appVersion}, domain fingerprint ${hash}`);
