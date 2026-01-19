import { useState } from 'react';
import { Layout } from './core/Layout';
import { HomePage } from './pages/Home/HomePage';
import { CalculatorPage } from './pages/Calculator/CalculatorPage';
import { IngredientsPage } from './pages/Ingredients/IngredientsPage';
import { ClientsPage } from './pages/CRM/Clients/ClientsPage';
import { QuestionnairesPage } from './pages/CRM/Questionnaires/QuestionnairesPage';
import { SavedRecipesPage } from './pages/CRM/Recipes/SavedRecipesPage';
import { SettingsPage } from './pages/Settings/SettingsPage';

function App() {
    const [activePage, setActivePage] = useState('home');
    const [pageParams, setPageParams] = useState<any>(null);

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
            {renderPage()}
        </Layout>
    );
}

export default App;
