import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Layout } from './core/Layout';
import { BackupService } from '../orchestrator/services/BackupService';
import { SettingsService } from '../orchestrator/services/SettingsService';
import { AppController } from '../orchestrator/services/AppController';
import { FirestoreSyncProvider } from '../orchestrator/services/FirestoreSyncProvider';

const HomePage = lazy(() => import('./pages/Home/HomePage').then((m) => ({ default: m.HomePage })));
const CalculatorPage = lazy(() => import('./pages/Calculator/CalculatorPage').then((m) => ({ default: m.CalculatorPage })));
const IngredientsPage = lazy(() => import('./pages/Ingredients/IngredientsPage').then((m) => ({ default: m.IngredientsPage })));
const ClientsPage = lazy(() => import('./pages/CRM/Clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const QuestionnairesPage = lazy(() => import('./pages/CRM/Questionnaires/QuestionnairesPage').then((m) => ({ default: m.QuestionnairesPage })));
const SavedRecipesPage = lazy(() => import('./pages/CRM/Recipes/SavedRecipesPage').then((m) => ({ default: m.SavedRecipesPage })));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function App() {
    const [activePage, setActivePage] = useState('home');
    const [pageParams, setPageParams] = useState<any>(null);
    const controllerRef = useRef<AppController | null>(null);

    useEffect(() => {
        if (!controllerRef.current) {
            controllerRef.current = new AppController({
                backupService: BackupService.getInstance(),
                syncProvider: new FirestoreSyncProvider(),
                settingsService: SettingsService.getInstance()
            });
        }
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
        setActivePage(page);
        setPageParams(params);
    };

    const renderPage = () => {
        switch (activePage) {
            case 'home':
                return <HomePage title="Dashboard" onNavigate={handleNavigate} />;
            case 'calculator':
                return <CalculatorPage
                    title="Calculadora de Receitas"
                    recipeId={pageParams?.recipeId}
                />;
            case 'ingredients':
                return <IngredientsPage title="Base de Ingredientes" />;
            case 'clients':
                return <ClientsPage title="Gestão de Clientes" onNavigate={handleNavigate} />;
            case 'questionnaires':
                return <QuestionnairesPage title="Questionários" />;
            case 'recipes':
                return <SavedRecipesPage
                    title="Receitas Guardadas"
                    onNavigate={handleNavigate}
                />;
            case 'settings':
                return <SettingsPage title="Configurações" />;
            default:
                // Fallback for pages not yet implemented
                return (
                    <div className="card">
                        <h2>Em Desenvolvimento</h2>
                        <p>A página "{activePage}" será implementada em breve.</p>
                    </div>
                );
        }
    };

    return (
        <Layout activePage={activePage} onNavigate={handleNavigate}>
            <Suspense fallback={<div className="card">A carregar...</div>}>
                {renderPage()}
            </Suspense>
        </Layout>
    );
}

export default App;
