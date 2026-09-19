const { spawnSync } = require('node:child_process');
const path = require('node:path');

for (const file of ['app-version.cjs', 'calculator-export.cjs', 'calculator-quality.cjs', 'backup-storage.cjs', 'backup-import.cjs', 'controller-sync.cjs', 'llm-client.cjs', 'firestore-sync.cjs']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
