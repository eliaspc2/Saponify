const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const generated = fs.readFileSync(
    path.join(repoRoot, 'app/backend/shared/versioning/AppVersion.generated.ts'),
    'utf8'
);
const match = generated.match(/APP_VERSION = '([^']+)'/);

assert.ok(match, 'The generated application version must be available to the frontend build.');
assert.match(match[1], new RegExp(`^${packageVersion.replace(/\./g, '\\.')}\\+[A-Za-z0-9]+$`));
assert.notEqual(match[1], '0.0.0', 'Published builds must not report the placeholder version.');

console.log('app-version: ok');
