import coreRules from './rules/soap_recipe_core_norms.json';
import extendedRules from './rules/soap_recipe_norms.json';

export type RecipePromptParams = {
    clientForm: object;
    availableIngredients: object[];
};

export class RecipePromptBuilder {
    buildRecipePrompt(params: RecipePromptParams): object {
        const { clientForm, availableIngredients } = params;

        return {
            role: 'soap_recipe_generation_engine',
            strict_mode: true,
            instructions: {
                json_only: true,
                no_explanations: true,
                no_text_outside_json: true,
                use_only_provided_ingredients: true,
                respect_all_rules: true
            },
            rules: {
                core: coreRules,
                extended: extendedRules
            },
            client_questionnaire: clientForm,
            available_ingredients: availableIngredients,
            output_contract: {
                description: 'Responder apenas com uma receita de sabonete válida e importável',
                format: 'json',
                no_extra_fields: true
            }
        };
    }
}
