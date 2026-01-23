import { RecipeService } from './RecipeService';
import { ClientService } from './ClientService';
import { IngredientService } from './IngredientService';
import { SettingsService } from './SettingsService';
import { QuestionnaireService } from './QuestionnaireService';
import { CalculatorEngine } from '../calculator/CalculatorEngine';
import { ClientActivityService } from './ClientActivityService';
import { AppConstants } from '../../shared/constants/AppConstants';

export class BackupComposer {
    public async exportAllData(): Promise<string> {
        const ingredients = IngredientService.getInstance().getAll();
        const recipes = RecipeService.getInstance().getAll();
        const recipeCalculations = recipes.map(recipe => {
            const results = CalculatorEngine.calculate({ recipe, ingredients }).results;
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
            version: AppConstants.BACKUP_VERSION,
            timestamp: new Date().toISOString(),
            recipes,
            recipeCalculations,
            clients: ClientService.getInstance().getAll(),
            activities: ClientActivityService.getInstance().getAllActivities(),
            ingredients,
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
            SettingsService.getInstance().replaceSettings(data.settings);

            // 2. Ingredients (replace all)
            IngredientService.getInstance().replaceAll(Array.isArray(data.ingredients) ? data.ingredients : [], true);

            // 3. Clients + Activities (replace all)
            ClientService.getInstance().replaceAll(Array.isArray(data.clients) ? data.clients : []);
            ClientActivityService.getInstance().replaceAll(Array.isArray(data.activities) ? data.activities : []);

            // 4. Recipes (replace all)
            RecipeService.getInstance().replaceAll(Array.isArray(data.recipes) ? data.recipes : []);

            // 5. Questionnaires (replace all)
            QuestionnaireService.replaceAll(Array.isArray(data.questionnaires) ? data.questionnaires : []);

            return true;
        } catch (e) {
            console.error('Falha ao importar backup:', e);
            return false;
        }
    }
}
