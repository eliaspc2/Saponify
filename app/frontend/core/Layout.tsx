import React, { useEffect, useState } from 'react';
import { Home, Calculator, Database, Users, FileText, Save, Settings, Menu } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
    activePage: string;
    onNavigate: (page: string) => void;
}

const SidebarItem = ({
    icon: Icon,
    label,
    pageId,
    active = false,
    onClick
}: {
    icon: any,
    label: string,
    pageId: string,
    active?: boolean,
    onClick: (page: string) => void
}) => (
    <div
        className={`sidebar-item ${active ? 'active' : ''}`}
        onClick={() => onClick(pageId)}
        style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            gap: '0.75rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            backgroundColor: active ? 'var(--color-primary-light)' : 'transparent',
            color: active ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
            transition: 'all 0.2s'
        }}
    >
        <Icon size={20} />
        <span style={{ fontWeight: 500 }}>{label}</span>
    </div>
);

export const Layout: React.FC<LayoutProps> = ({ children, activePage, onNavigate }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        setSidebarOpen(false);
    }, [activePage]);

    const handleNavigate = (page: string) => {
        onNavigate(page);
        setSidebarOpen(false);
    };

    return (
        <div className="layout" style={{ display: 'flex', minHeight: 'var(--vh)' }}>
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="logo" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <img src={`${import.meta.env.BASE_URL}assets/brand/logo.png`} alt="Saponify Logo" style={{ width: '40px', height: '40px', borderRadius: '0.5rem', objectFit: 'cover' }} />
                    <div>
                        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary-dark)' }}>Saponify</h2>
                    </div>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    <SidebarItem icon={Home} label="Home" pageId="home" active={activePage === 'home'} onClick={handleNavigate} />
                    <SidebarItem icon={Calculator} label="Calculadora" pageId="calculator" active={activePage === 'calculator'} onClick={handleNavigate} />
                    <SidebarItem icon={Database} label="Ingredientes" pageId="ingredients" active={activePage === 'ingredients'} onClick={handleNavigate} />

                    <div style={{ margin: '1rem 0', borderTop: '1px solid #f3f4f6' }}></div>

                    <SidebarItem icon={Users} label="Clientes" pageId="clients" active={activePage === 'clients'} onClick={handleNavigate} />
                    <SidebarItem icon={FileText} label="Questionários" pageId="questionnaires" active={activePage === 'questionnaires'} onClick={handleNavigate} />
                    <SidebarItem icon={Save} label="Receitas Guardadas" pageId="recipes" active={activePage === 'recipes'} onClick={handleNavigate} />
                </nav>

                <div className="profile">
                    <SidebarItem icon={Settings} label="Configurações" pageId="settings" active={activePage === 'settings'} onClick={handleNavigate} />
                </div>
            </aside>

            <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(prev => !prev)}
                aria-label="Abrir menu"
            >
                <Menu size={20} />
            </button>
            <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)}></div>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
};
