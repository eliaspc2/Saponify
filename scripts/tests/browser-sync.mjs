import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {})
});
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('saponify_sync_enabled', 'false'));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5187/');
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
    const stage = async name => page.evaluate(async clientName => {
        const loadedModule = path => performance.getEntriesByType('resource')
            .map(entry => entry.name).find(url => new URL(url).pathname === path) || path;
        const { BackupService } = await import(loadedModule('/app/backend/application/backup/BackupService.ts'));
        const { FirestoreSyncService } = await import(loadedModule('/app/orchestrator/services/FirestoreSyncService.ts'));
        // Isolated browser context: exercise local reception without production credentials or writes.
        const service = FirestoreSyncService.getInstance();
        service.auth = { currentUser: { uid: 'test-sync-user' } };
        const payload = JSON.parse(await BackupService.getInstance().exportAllData());
        payload.clients = [{
            id: 'sync-client', name: clientName, email: 'test@example.test', phone: '', address: '',
            createdAt: '2026-09-11T10:00:00.000Z'
        }];
        localStorage.setItem('saponify_sync_pending_payload', JSON.stringify({
            uid: 'test-sync-user', data: JSON.stringify(payload),
            updatedAt: '2026-09-11T10:00:00.000Z', deviceId: 'other-device', revision: 2
        }));
        localStorage.setItem('saponify_sync_pending_data_version', localStorage.getItem('saponify_data_version') || '');
        localStorage.setItem('saponify_sync_pending_import', 'true');
    }, name);
    await page.getByText('Clientes', { exact: true }).first().click();
    await stage('Cliente recebido por sincronizacao');
    try {
        await page.getByText('Cliente recebido por sincronizacao', { exact: true }).first().waitFor({ timeout: 10000 });
    } catch (error) {
        console.log(await page.evaluate(() => ({
            error: localStorage.getItem('saponify_sync_last_error'),
            pending: localStorage.getItem('saponify_sync_pending_import'),
            version: localStorage.getItem('saponify_data_version'),
            stagedVersion: localStorage.getItem('saponify_sync_pending_data_version'),
            clients: localStorage.getItem('saponify_clients')
        })));
        console.log(errors);
        throw error;
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('saponify_sync_pending_import')), null);
    const version = await page.evaluate(() => localStorage.getItem('saponify_data_version'));
    await page.waitForTimeout(3200);
    assert.equal(await page.evaluate(() => localStorage.getItem('saponify_data_version')), version);

    await page.getByText('Calculadora', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'Calculadora de Receitas', exact: true }).waitFor();
    await page.getByPlaceholder('P. ex: Sabonete de Lavanda Premium').fill('Rascunho preservado');
    await stage('Atualizacao adiada');
    await page.waitForTimeout(2800);
    assert.equal(await page.getByPlaceholder('P. ex: Sabonete de Lavanda Premium').inputValue(), 'Rascunho preservado');
    assert.equal(await page.evaluate(() => localStorage.getItem('saponify_sync_pending_import')), 'true');
    await page.getByText('Clientes', { exact: true }).first().click();
    await page.getByText('Atualizacao adiada', { exact: true }).first().waitFor({ timeout: 10000 });
    assert.match(await page.evaluate(() => localStorage.getItem('saponify_calculator_draft')), /Rascunho preservado/);
    await page.getByText('Configurações', { exact: true }).first().click();
    await page.getByRole('heading', { name: 'Configurações', exact: true }).waitFor();
    await page.locator('input[type="url"]').fill('http://127.0.0.1:1234/v1');
    await page.locator('input[list="llm-model-options"]').fill('modelo-personalizado');
    await page.route('http://127.0.0.1:1234/v1/models', route => route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'modelo-local-teste' }] })
    }));
    await page.getByRole('button', { name: 'Consultar modelos' }).click();
    await page.locator('#llm-model-options option[value="modelo-local-teste"]').waitFor({ state: 'attached' });
    await page.getByLabel('Modelo').selectOption('modelo-local-teste');
    assert.equal(await page.getByLabel('Modelo').inputValue(), 'modelo-local-teste');
    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await page.getByText('Configurações guardadas com sucesso!', { exact: true }).waitFor();
    await stage('Recebido apos guardar configuracoes');
    await page.waitForFunction(() => localStorage.getItem('saponify_sync_pending_import') === null);
    assert.equal(await page.getByLabel('Modelo').inputValue(), 'modelo-local-teste');
    await page.screenshot({ path: '/tmp/saponify-sync-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: '/tmp/saponify-sync-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Browser sync: live reception, deferred editor import, draft preservation and no page errors passed.');
} finally {
    await browser.close();
}
