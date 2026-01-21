import { RecipeService } from './RecipeService';
import { ClientService } from './ClientService';
import { IngredientService } from './IngredientService';
import { SettingsService } from './SettingsService';
import { QuestionnaireService } from './QuestionnaireService';
import { CalculatorService } from './CalculatorService';

export class BackupService {
    private static instance: BackupService;
    private static AUTO_BACKUP_KEY = 'saponify_auto_backup';

    private constructor() { }

    public static getInstance(): BackupService {
        if (!BackupService.instance) {
            BackupService.instance = new BackupService();
        }
        return BackupService.instance;
    }

    public async exportAllData(): Promise<string> {
        const ingredients = IngredientService.getInstance().getAll();
        const recipes = RecipeService.getInstance().getAll();
        const recipeCalculations = recipes.map(recipe => {
            const results = CalculatorService.calculate(recipe, ingredients);
            return {
                recipeId: recipe.id,
                code: recipe.code,
                name: recipe.name,
                alkaliAmount: results.alkaliAmount,
                alkaliPure: results.alkaliPure,
                alkaliPurity: results.alkaliPurity,
                waterAmount: results.waterAmount
            };
        });

        const data = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            recipes,
            recipeCalculations,
            clients: ClientService.getInstance().getAll(),
            activities: ClientService.getInstance().getAllActivities(),
            ingredients: IngredientService.getInstance().getAll(),
            settings: SettingsService.getInstance().getSettings(),
            questionnaires: await QuestionnaireService.getQuestionnaires()
        };

        return JSON.stringify(data, null, 2);
    }

    public async importAllData(jsonString: string): Promise<boolean> {
        try {
            const data = JSON.parse(jsonString);

            if (!data.recipes || !data.clients || !data.settings) {
                throw new Error('Formato de backup inválido');
            }

            // 1. Settings
            SettingsService.getInstance().updateSettings(data.settings);

            // 2. Clients
            const clientService = ClientService.getInstance();
            data.clients.forEach((c: any) => clientService.save(c));

            // 2.1 Activities
            (data.activities || []).forEach((activity: any) => clientService.addActivity(activity));

            // 3. Recipes
            const recipeService = RecipeService.getInstance();
            data.recipes.forEach((r: any) => recipeService.save(r));

            // 4. Questionnaires
            for (const q of (data.questionnaires || [])) {
                await QuestionnaireService.saveQuestionnaire(q);
            }

            return true;
        } catch (e) {
            console.error('Falha ao importar backup:', e);
            return false;
        }
    }

    // Helper to download the file
    public downloadBackup(json: string) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `saponify_backup_${timestamp}.json`;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============ BACKUP AUTOMÁTICO ============

    /**
     * Realiza backup automático se estiver ativado nas configurações
     * Guarda em LocalStorage (navegadores limitam escrita em disco)
     */
    public async performAutoBackup(): Promise<void> {
        const settings = SettingsService.getInstance().getSettings();

        if (!settings.autoBackupEnabled) {
            return;
        }

        try {
            // Exportar dados
            const jsonData = await this.exportAllData();

            // Encriptar se necessário
            const finalData = settings.autoBackupEncrypted && settings.autoBackupPassword
                ? this.simpleEncrypt(jsonData, settings.autoBackupPassword)
                : jsonData;

            // Guardar em LocalStorage
            localStorage.setItem(BackupService.AUTO_BACKUP_KEY, finalData);
            localStorage.setItem(`${BackupService.AUTO_BACKUP_KEY}_timestamp`, new Date().toISOString());

            // Atualizar timestamp nas configurações
            settings.lastAutoBackup = new Date().toISOString();
            SettingsService.getInstance().updateSettings(settings);

            console.log('Backup automático realizado com sucesso');
        } catch (error) {
            console.error('Erro ao realizar backup automático:', error);
        }
    }

    /**
     * Restaura backup automático do LocalStorage
     */
    public async restoreAutoBackup(password?: string): Promise<boolean> {
        try {
            const data = localStorage.getItem(BackupService.AUTO_BACKUP_KEY);
            if (!data) {
                console.warn('Nenhum backup automático encontrado');
                return false;
            }

            const settings = SettingsService.getInstance().getSettings();

            // Desencriptar se necessário
            const jsonData = settings.autoBackupEncrypted && password
                ? this.simpleDecrypt(data, password)
                : data;

            return await this.importAllData(jsonData);
        } catch (error) {
            console.error('Erro ao restaurar backup automático:', error);
            return false;
        }
    }

    /**
     * Descarrega o backup automático como ficheiro
     */
    public downloadAutoBackup() {
        const data = localStorage.getItem(BackupService.AUTO_BACKUP_KEY);
        if (!data) {
            alert('Nenhum backup automático encontrado!');
            return;
        }

        const timestamp = localStorage.getItem(`${BackupService.AUTO_BACKUP_KEY}_timestamp`) || new Date().toISOString();
        const filename = `saponify_auto_backup_${timestamp.replace(/[:.]/g, '-').slice(0, 19)}.json`;

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============ ENCRIPTAÇÃO SIMPLES ============
    // Nota: Isto é encriptação básica. Para produção, usar crypto-js ou similar

    private simpleEncrypt(text: string, password: string): string {
        const encrypted = btoa(unescape(encodeURIComponent(text + '::' + password)));
        return `ENCRYPTED:${encrypted}`;
    }

    private simpleDecrypt(encryptedText: string, password: string): string {
        if (!encryptedText.startsWith('ENCRYPTED:')) {
            return encryptedText; // Não encriptado
        }

        const encrypted = encryptedText.replace('ENCRYPTED:', '');
        const decrypted = decodeURIComponent(escape(atob(encrypted)));

        if (!decrypted.endsWith('::' + password)) {
            throw new Error('Palavra-passe incorreta');
        }

        return decrypted.replace('::' + password, '');
    }
}
