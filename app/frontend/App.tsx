import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Layout } from './core/Layout';
import { FirestoreSyncService } from '../orchestrator/services/FirestoreSyncService';
import { BackupService } from '../orchestrator/services/BackupService';
import { SettingsService } from '../orchestrator/services/SettingsService';
import { getDataVersion } from '../orchestrator/utils/dataVersion';

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
    const lastDataVersion = useRef<string>(getDataVersion());
    const pendingBackupTimer = useRef<number | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                await FirestoreSyncService.getInstance().start();
                const pending = localStorage.getItem('saponify_sync_pending_import');
                if (pending === 'true') {
                    const data = localStorage.getItem('saponify_auto_backup');
                    let ok = false;
                    if (data && data.startsWith('ENCRYPTED:')) {
                        const settings = SettingsService.getInstance().getSettings();
                        ok = await BackupService.getInstance().restoreAutoBackup(settings.autoBackupPassword);
                    } else if (data) {
                        ok = await BackupService.getInstance().importAllData(data);
                    }
                    if (ok) {
                        localStorage.removeItem('saponify_sync_pending_import');
                        location.reload();
                    }
                }
            } catch (error) {
                console.warn('Firestore sync init failed:', error);
            }
        };
        void run();
    }, []);

    useEffect(() => {
        const interval = window.setInterval(() => {
            const currentVersion = getDataVersion();
            if (currentVersion && currentVersion !== lastDataVersion.current) {
                lastDataVersion.current = currentVersion;
                if (pendingBackupTimer.current) {
                    window.clearTimeout(pendingBackupTimer.current);
                }
                pendingBackupTimer.current = window.setTimeout(async () => {
                    const sync = FirestoreSyncService.getInstance();
                    if (!sync.isSyncActive()) return;
                    if (!sync.getCurrentUser()) return;
                    if (!sync.hasCompletedInitialSync()) return;
                    await BackupService.getInstance().performAutoBackupNow();
                }, 800);
            }
        }, 2000);

        return () => {
            window.clearInterval(interval);
            if (pendingBackupTimer.current) {
                window.clearTimeout(pendingBackupTimer.current);
            }
        };
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
