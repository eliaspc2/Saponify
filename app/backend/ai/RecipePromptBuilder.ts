import coreRules from './rules/soap_recipe_core_norms.json';
import extendedRules from './rules/soap_recipe_norms.json';

export type RecipePromptParams = {
    clientForm: object;
    availableIngredients: object[];
    targetOilsWeight?: number;
    examplePairs?: Array<{
        questionnaire: object;
        recipe: object;
    }>;
    userFeedback?: string;
    targetLyeConcentration?: number;
};

type IngredientLike = {
    id?: string;
    ingredientId?: string;
    name?: string;
    category?: string;
    menuKey?: string;
    kind?: string;
    sapNaOH?: number;
};

type ExampleIngredient = {
    ingredientId: string;
    name: string;
    percentage: number;
    weight: number;
    function: string;
};

type ExampleRecipe = {
    metadata: {
        recipeName: string;
        clientId: string;
        createdAt: string;
        source: 'ai';
    };
    phases: {
        phase1_base_fatty: ExampleIngredient[];
        phase2_lye: {
            liquid: ExampleIngredient;
            lye_type: string;
            naoh_calculated: number;
            compensations_applied: string[];
        };
        phase3_trace: ExampleIngredient[];
    };
    technical: {
        superfat_initial: number;
        superfat_final: number;
        lye_concentration: number;
        citric_acid: {
            used: boolean;
            weight: number;
            naoh_adjustment: number;
        };
        essential_oils_total_percentage: number;
    };
    curing: {
        days: number;
        calculation_basis: string;
        estimated_ready_date: string;
    };
    technical_notes: string[];
    rationale: string[];
    assistant_message: string;
};

export class RecipePromptBuilder {
    buildRecipePrompt(params: RecipePromptParams): object {
        const { clientForm, availableIngredients, examplePairs, userFeedback } = params;
        const targetOilsWeight = params.targetOilsWeight || 1000;
        const targetLyeConcentration = typeof params.targetLyeConcentration === 'number'
            ? params.targetLyeConcentration
            : 0;
        const examples = this.buildExamples(availableIngredients, targetOilsWeight, targetLyeConcentration);
        const productionRules = this.getProductionRules();
        const ingredientsByPhase = this.groupIngredientsByPhase(availableIngredients);

        return {
            role: 'soap_recipe_generation_engine',
            strict_mode: true,
            instructions: {
                json_only: true,
                no_explanations: true,
                no_text_outside_json: true,
                use_only_provided_ingredients: true,
                respect_all_rules: true,
                include_essential_oils_when_possible: true,
                target_oils_weight_scope: 'phase1_base_fatty_only',
                phase2_lye_calculated_by_app: true,
                phase2_liquid_weight_calculated_by_app: true
            },
            rules: {
                core: coreRules,
                extended: extendedRules
            },
            custom_rules: productionRules,
            target_oils_weight_g: targetOilsWeight,
            target_lye_concentration_percent: targetLyeConcentration,
            client_questionnaire: clientForm,
            available_ingredients: availableIngredients,
            available_ingredients_by_phase: ingredientsByPhase,
            example_pairs: Array.isArray(examplePairs) ? examplePairs : [],
            user_feedback: (userFeedback || '').trim(),
            output_contract: {
                description: 'Responder apenas com uma receita de sabonete válida e importável',
                format: 'json',
                no_extra_fields: true,
                response_schema: this.getResponseSchema(),
                examples
            }
        };
    }

    private getResponseSchema() {
        return {
            metadata: {
                recipeName: 'string',
                clientId: 'string',
                createdAt: 'ISO_8601',
                source: 'ai'
            },
            phases: {
                phase1_base_fatty: [
                    {
                        ingredientId: 'string',
                        name: 'string',
                        percentage: 'number',
                        weight: 'number',
                        function: 'string'
                    }
                ],
                phase2_lye: {
                    liquid: {
                        ingredientId: 'string',
                        name: 'string',
                        percentage: 'number',
                        weight: 'number',
                        function: 'string'
                    },
                    lye_type: 'NaOH|KOH',
                    naoh_calculated: 'number',
                    compensations_applied: ['string']
                },
                phase3_trace: [
                    {
                        ingredientId: 'string',
                        name: 'string',
                        percentage: 'number',
                        weight: 'number',
                        function: 'string'
                    }
                ]
            },
            technical: {
                superfat_initial: 'number',
                superfat_final: 'number',
                lye_concentration: 'number',
                citric_acid: {
                    used: 'boolean',
                    weight: 'number',
                    naoh_adjustment: 'number'
                },
                essential_oils_total_percentage: 'number'
            },
            curing: {
                days: 'number',
                calculation_basis: 'string',
                estimated_ready_date: 'YYYY-MM-DD'
            },
            technical_notes: ['string'],
            rationale: ['string'],
            assistant_message: 'string'
        };
    }

    private getProductionRules(): string {
        return [
            'NORMAS DE FORMULAÇÃO — NOVIESSENCE',
            'Todas as decisões devem alinhar-se com sintomas reais, segurança, preferências éticas/sensoriais/etárias e ingredientes disponíveis.',
            'Nunca usar classificações genéricas como único critério. Ingredientes decorativos só com justificação estética/simbólica.',
            'Superfat inicial: 2-4% pele oleosa/corporal; 5-7% pele mista/uso frequente; 8-10% pele seca/reativa.',
            'Base gordurosa: equilibrar limpeza, suavidade, espuma, durabilidade. Preferir banha em fórmulas regeneradoras e sebo para maior dureza.',
            'Lixívia: infusões conforme pele. Sal 5g por 500g óleos. Mel cru preferível (5g por receita). Calcular NaOH via SAP e ajustar se houver ácido cítrico.',
            'Traço: aditivos funcionais/decorativos conforme pele e justificação.',
            'Superfat final: escolher óleos conforme objetivo terapêutico.',
            'Óleos essenciais: usar sempre que possível e seguro; dose base 5 ml por receita completa. Selecionar conforme perfil de pele.',
            'Restrições éticas: respeitar vegan/vegetariano/religioso/alergias.',
            'Equilíbrio técnico final: limpeza + suavidade + espuma + durabilidade.',
            'NOMES DE RECEITA: "Sabonete" para uso cutâneo regular e "Sabão" para uso doméstico/técnico. Estrutura obrigatória: Sabonete|Sabão + Função principal + Qualificador(es).',
            'Função principal é o objetivo dominante (ex.: Suavizante, Calmante, Nutritivo, Regenerador, Purificante, Equilibrante, Sensorial, Protetor, Multiusos). Evitar múltiplas funções no núcleo do nome.',
            'Qualificadores opcionais (máx. 2) apenas para clarificar uso: tipo de pele, contexto, público, perfil sensorial.',
            'Não incluir ingredientes no nome, exceto se definem inequivocamente a função. Nunca incluir nome do cliente, datas ou quantidades.',
            'Nome deve ser descritivo, neutro, reprodutível e válido fora do contexto do cliente. Não usar termos promocionais.',
            'USO DE INGREDIENTES: só usar IDs presentes em available_ingredients e respeitar o menuKey/phase correto.',
            'Fase 1 (phase1_base_fatty): usar APENAS ingredientes de menuKey=baseOils.',
            'Fase 2 (phase2_lye.liquid): usar APENAS ingredientes de menuKey=liquids ou menuKey=lyeLiquids. Não inventar infusões que não existam.',
            'Fase 3 (phase3_trace): usar APENAS ingredientes de menuKey=traceAdditives, superfatOils ou essentialOils. O campo function deve refletir o subtipo (trace_additive | superfat_oil | essential_oil).',
            'Água e soda cáustica são calculadas pela app. Definir phase2_lye.naoh_calculated = 0 e phase2_lye.liquid.weight = 0.',
            'Justificação: preencher o campo rationale (array de strings) com as razões principais das escolhas.',
            'Se user_feedback estiver presente, incorporar essas notas na nova receita.',
            'Usar o valor target_lye_concentration_percent para technical.lye_concentration.',
            'assistant_message: responder ao utilizador em linguagem natural (curto), explicando se alterou algo.',
            'O valor target_oils_weight_g refere-se apenas ao peso total da fase 1 (phase1_base_fatty).'
        ].join('\n');
    }

    private groupIngredientsByPhase(availableIngredients: object[]) {
        const items = (availableIngredients || []) as IngredientLike[];
        const byKey = (menuKey: string) => items.filter((i) => i.menuKey === menuKey);
        const byKeys = (keys: string[]) => items.filter((i) => keys.includes(i.menuKey || ''));
        return {
            phase1_base_fatty: byKey('baseOils'),
            phase2_liquids: byKeys(['liquids', 'lyeLiquids']),
            phase3_trace_additives: byKey('traceAdditives'),
            phase3_superfat_oils: byKey('superfatOils'),
            phase3_essential_oils: byKey('essentialOils')
        };
    }

    private buildExamples(availableIngredients: object[], targetOilsWeight: number, targetLyeConcentration: number): ExampleRecipe[] {
        const items = (availableIngredients || []) as IngredientLike[];
        const baseOils = items.filter((i) => (i.menuKey === 'baseOils' || i.kind === 'oil') && (i.sapNaOH || 0) > 0);
        const liquids = items.filter((i) => i.menuKey === 'liquids' || i.menuKey === 'lyeLiquids' || i.kind === 'water');
        const essentialOils = items.filter((i) => i.menuKey === 'essentialOils');
        const traceAdditives = items.filter((i) => i.menuKey === 'traceAdditives');
        const superfatOils = items.filter((i) => i.menuKey === 'superfatOils');

        const pick = (list: IngredientLike[], count: number) => list.slice(0, count);
        const pickOffset = (list: IngredientLike[], offset: number, count: number) => list.slice(offset, offset + count);

        const example1Oils = pick(baseOils, 3);
        const example2Oils = pickOffset(baseOils, 3, 3).length ? pickOffset(baseOils, 3, 3) : pick(baseOils, 2);

        const water = liquids[0] || items[0];

        const makePhase1 = (oils: IngredientLike[], percents: number[]) => {
            return oils.map((oil, idx) => ({
                ingredientId: oil.id || oil.ingredientId || `oil_${idx}`,
                name: oil.name || `Óleo ${idx + 1}`,
                percentage: percents[idx],
                weight: parseFloat(((targetOilsWeight * percents[idx]) / 100).toFixed(1)),
                function: 'base_oil'
            }));
        };

        const buildExample = (name: string, oils: IngredientLike[], percents: number[], essential: IngredientLike[], trace: IngredientLike[], superfatList: IngredientLike[]): ExampleRecipe => {
            const phase1 = makePhase1(oils, percents);
            const superfat = 6;
            const lyeConcentration = targetLyeConcentration;
            const naoh = 0;
            const waterAmount = 0;
            const liquid: ExampleIngredient = {
                ingredientId: water?.id || water?.ingredientId || 'water',
                name: water?.name || 'Água',
                percentage: 0,
                weight: waterAmount,
                function: 'liquid'
            };

            const phase3: ExampleIngredient[] = [];
            if (trace[0]) {
                phase3.push({
                    ingredientId: trace[0].id || trace[0].ingredientId || 'trace',
                    name: trace[0].name || 'Aditivo Traço',
                    percentage: 0,
                    weight: 5,
                    function: 'trace_additive'
                });
            }
            if (superfatList[0]) {
                phase3.push({
                    ingredientId: superfatList[0].id || superfatList[0].ingredientId || 'superfat',
                    name: superfatList[0].name || 'Óleo Superfat',
                    percentage: 0,
                    weight: 20,
                    function: 'superfat_oil'
                });
            }
            const eoTotal = essential.length > 0 ? 2 : 0;
            if (essential[0]) {
                phase3.push({
                    ingredientId: essential[0].id || essential[0].ingredientId || 'eo',
                    name: essential[0].name || 'Óleo Essencial',
                    percentage: eoTotal,
                    weight: parseFloat(((targetOilsWeight * eoTotal) / 100).toFixed(1)),
                    function: 'essential_oil'
                });
            }

            return {
                metadata: {
                    recipeName: name,
                    clientId: 'CLIENT_ID',
                    createdAt: new Date().toISOString(),
                    source: 'ai'
                },
                phases: {
                    phase1_base_fatty: phase1,
                    phase2_lye: {
                        liquid,
                        lye_type: 'NaOH',
                        naoh_calculated: naoh,
                        compensations_applied: []
                    },
                    phase3_trace: phase3
                },
                technical: {
                    superfat_initial: superfat,
                    superfat_final: superfat,
                    lye_concentration: lyeConcentration,
                    citric_acid: {
                        used: false,
                        weight: 0,
                        naoh_adjustment: 0
                    },
                    essential_oils_total_percentage: eoTotal
                },
            curing: {
                days: 30,
                calculation_basis: 'média',
                estimated_ready_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            },
            technical_notes: ['Exemplo de receita válida para referência de formato.'],
            rationale: ['Escolhas alinhadas com o perfil do questionário e ingredientes disponíveis.'],
            assistant_message: 'Exemplo de resposta curta ao utilizador.'
        };
    };

        const example1 = buildExample(
            'Sabonete Suavizante para Pele Sensível',
            example1Oils.length ? example1Oils : pick(baseOils, 1),
            example1Oils.length >= 3 ? [50, 30, 20] : example1Oils.length === 2 ? [60, 40] : [100],
            essentialOils.slice(0, 1),
            traceAdditives.slice(0, 1),
            superfatOils.slice(0, 1)
        );

        const example2 = buildExample(
            'Sabonete Equilibrante Uso Diário',
            example2Oils.length ? example2Oils : pick(baseOils, 1),
            example2Oils.length >= 3 ? [40, 35, 25] : example2Oils.length === 2 ? [70, 30] : [100],
            essentialOils.slice(1, 2),
            traceAdditives.slice(1, 2),
            superfatOils.slice(1, 2)
        );

        return [example1, example2];
    }
}
