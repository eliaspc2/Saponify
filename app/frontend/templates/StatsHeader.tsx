import React from 'react';

interface StatCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    color?: string;
    icon?: React.ReactNode;
    onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subtext, color = 'var(--color-primary)', icon, onClick }) => (
    <div
        className="card"
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : -1}
        onClick={onClick}
        onKeyDown={(event) => {
            if (!onClick) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
            }
        }}
        style={{
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            cursor: onClick ? 'pointer' : 'default',
            transition: onClick ? 'transform 0.15s ease, box-shadow 0.15s ease' : undefined
        }}
        aria-label={onClick ? `Abrir ${label}` : undefined}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <h4 style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</h4>
            {icon && <div style={{ color: color, opacity: 0.8 }}>{icon}</div>}
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: color }}>{value}</div>
        {subtext && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', fontWeight: 500, marginTop: '0.25rem' }}>{subtext}</p>}
    </div>
);

interface StatsHeaderProps {
    stats: StatCardProps[];
}

export const StatsHeader: React.FC<StatsHeaderProps> = ({ stats }) => {
    return (
        <div className="stats-grid">
            {stats.map((stat, i) => (
                <StatCard key={i} {...stat} />
            ))}
        </div>
    );
};
