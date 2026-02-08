import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Layout } from './core/Layout';
import { ToastViewport } from './components/Toast';
import { BackupService } from '../backend/application/backup/BackupService';
import { SettingsService } from '../backend/infrastructure/services/SettingsService';
import { AppController } from '../orchestrator/services/AppController';
import { FirestoreSyncProvider } from '../orchestrator/services/FirestoreSyncProvider';
import { createCalculatorUseCase } from '../orchestrator/services/CalculatorUseCaseFactory';
import { StorageKeys } from '../shared/constants/StorageKeys';
import type { Recipe, RecipeIngredient } from '../shared/types/Recipe';

const HomePage = lazy(() => import('./pages/Home/HomePage').then((m) => ({ default: m.HomePage })));
const CalculatorPage = lazy(() => import('./pages/Calculator/CalculatorPage').then((m) => ({ default: m.CalculatorPage })));
const IngredientsPage = lazy(() => import('./pages/Ingredients/IngredientsPage').then((m) => ({ default: m.IngredientsPage })));
const ClientsPage = lazy(() => import('./pages/CRM/Clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const QuestionnairesPage = lazy(() => import('./pages/CRM/Questionnaires/QuestionnairesPage').then((m) => ({ default: m.QuestionnairesPage })));
const SavedRecipesPage = lazy(() => import('./pages/CRM/Recipes/SavedRecipesPage').then((m) => ({ default: m.SavedRecipesPage })));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

type CalculatorDraftPayload = {
    recipe: Recipe;
    sourceRecipeId: string | null;
    updatedAt: string;
};

const CALCULATOR_DRAFT_STORAGE_KEY = StorageKeys.CALCULATOR_DRAFT;

const hasIngredientProgress = (items: RecipeIngredient[] | undefined): boolean => {
    if (!Array.isArray(items)) return false;

    return items.some((item) => {
        const hasSelectedIngredient = typeof item.ingredientId === 'string' && item.ingredientId.trim().length > 0;
        const amount = Number(item.amount) || 0;
        return hasSelectedIngredient || amount > 0;
    });
};

const hasRecipeProgress = (recipe: Recipe | null | undefined): boolean => {
    if (!recipe) return false;

    const hasText = (recipe.name || '').trim().length > 0 || (recipe.notes || '').trim().length > 0;
    const hasClient = !!recipe.clientId;
    const hasAiConversation = Array.isArray(recipe.aiConversation) && recipe.aiConversation.length > 0;
    const hasAnyIngredient = hasIngredientProgress(recipe.fats)
        || hasIngredientProgress(recipe.liquids)
        || hasIngredientProgress(recipe.functionalAdditives)
        || hasIngredientProgress(recipe.lyeAdditives)
        || hasIngredientProgress(recipe.traceAdditives)
        || hasIngredientProgress(recipe.superfatOils)
        || hasIngredientProgress(recipe.essentialOils);

    return hasText || hasClient || hasAiConversation || hasAnyIngredient;
};

const readCalculatorDraft = (): CalculatorDraftPayload | null => {
    try {
        const raw = localStorage.getItem(CALCULATOR_DRAFT_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<CalculatorDraftPayload> | null;
        if (!parsed || typeof parsed !== 'object' || !parsed.recipe || typeof parsed.recipe !== 'object') {
            return null;
        }

        return {
            recipe: parsed.recipe as Recipe,
            sourceRecipeId: typeof parsed.sourceRecipeId === 'string' ? parsed.sourceRecipeId : null,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
        };
    } catch {
        return null;
    }
};

function App() {
    const [activePage, setActivePage] = useState('home');
    const [pageParams, setPageParams] = useState<any>(null);
    const controllerRef = useRef<AppController | null>(null);

    if (!controllerRef.current) {
        controllerRef.current = new AppController({
            backupService: BackupService.getInstance(),
            syncProvider: new FirestoreSyncProvider(),
            settingsService: SettingsService.getInstance(),
            calculatorUseCase: createCalculatorUseCase()
        });
    }

    useEffect(() => {
        const run = async () => {
            try {
                const shouldReload = await controllerRef.current!.init();
                if (shouldReload) {
                    location.reload();
                }
            } catch (error) {
                console.warn('App init failed:', error);
            }
        };
        void run();
    }, []);

    const handleNavigate = (page: string, params: any = null) => {
        if (page === 'calculator' && params?.recipeId) {
            const targetRecipeId = String(params.recipeId);
            const draft = readCalculatorDraft();

            if (draft?.recipe) {
                const isSameRecipe = draft.sourceRecipeId === targetRecipeId || draft.recipe.id === targetRecipeId;
                const hasProgress = hasRecipeProgress(draft.recipe);

                if (!isSameRecipe && hasProgress) {
                    const confirmed = window.confirm('Tem uma receita em curso na calculadora. Abrir outra receita vai substituir o rascunho atual. Pretende continuar?');
                    if (!confirmed) {
                        return;
                    }
                    localStorage.removeItem(CALCULATOR_DRAFT_STORAGE_KEY);
                }
            }
        }

        setActivePage(page);
        setPageParams(params);
    };

    const renderPage = () => {
        switch (activePage) {
            case 'home':
                return <HomePage title="Dashboard" onNavigate={handleNavigate} appController={controllerRef.current!} />;
            case 'calculator':
                return <CalculatorPage
                    title="Calculadora de Receitas"
                    recipeId={pageParams?.recipeId}
                    appController={controllerRef.current!}
                />;
            case 'ingredients':
                return <IngredientsPage title="Base de Ingredientes" />;
            case 'clients':
                return <ClientsPage title="Gestão de Clientes" onNavigate={handleNavigate} appController={controllerRef.current!} />;
            case 'questionnaires':
                return <QuestionnairesPage title="Questionários" />;
            case 'recipes':
                return <SavedRecipesPage
                    title="Receitas Guardadas"
                    onNavigate={handleNavigate}
                    appController={controllerRef.current!}
                />;
            case 'settings':
                return <SettingsPage title="Configurações" appController={controllerRef.current!} />;
            default:
                return (
                    <div className="card">
                        <h2>Em Desenvolvimento</h2>
                        <p>A página "{activePage}" será implementada em breve.</p>
                    </div>
                );
        }
    };

    return (
        <>
            <Layout activePage={activePage} onNavigate={handleNavigate}>
                <Suspense fallback={<div className="card">A carregar...</div>}>
                    {renderPage()}
                </Suspense>
            </Layout>
            <ToastViewport />
        </>
    );
}

export default App;
