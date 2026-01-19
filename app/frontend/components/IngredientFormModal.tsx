import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Ingredient } from '../../shared/types/Ingredient';

interface IngredientFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Ingredient | null;
    onSave: (ingredient: Ingredient) => void;
}

import { INGREDIENT_CATEGORIES } from '../../shared/constants/Categories';

// Remove local CATEGORIES definition and use imported one

const DEFAULT_INGREDIENT: Ingredient = {
    id: '',
    name: '',
    inci: '',
    category: 'Óleos Base',
    sapNaOH: 0,
    sapKOH: 0,
    iodine: 0,
    ins: 0,
    properties: {
        hardness: 0,
        cleansing: 0,
        bubbly: 0,
        stable: 0,
        conditioning: 0,
        solubility: 0,
        drying: 0
    },
    fattyAcids: {
        lauric: 0,
        myristic: 0,
        palmitic: 0,
        stearic: 0,
        ricinoleic: 0,
        oleic: 0,
        linoleic: 0,
        linolenic: 0
    }
};

export const IngredientFormModal: React.FC<IngredientFormModalProps> = ({ isOpen, onClose, initialData, onSave }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'properties' | 'fattyAcids'>('general');
    const [formData, setFormData] = useState<Ingredient>(DEFAULT_INGREDIENT);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({ ...initialData });
            } else {
                setFormData({ ...DEFAULT_INGREDIENT, id: `new_${Date.now()}` });
            }
            setActiveTab('general');
        }
    }, [isOpen, initialData]);

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    const handleChange = (field: keyof Ingredient, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handlePropertyChange = (field: keyof typeof DEFAULT_INGREDIENT.properties, value: number) => {
        setFormData(prev => ({
            ...prev,
            properties: { ...prev.properties, [field]: value }
        }));
    };

    const handleFattyAcidChange = (field: keyof typeof DEFAULT_INGREDIENT.fattyAcids, value: number) => {
        setFormData(prev => ({
            ...prev,
            fattyAcids: { ...prev.fattyAcids, [field]: value }
        }));
    };

    const TabButton = ({ id, label }: { id: typeof activeTab, label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                flex: 1,
                padding: '0.9rem',
                border: 'none',
                background: activeTab === id ? 'var(--color-primary-light)' : 'transparent',
                color: activeTab === id ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                borderBottom: activeTab === id ? '2px solid var(--color-primary)' : '1px solid #e5e7eb',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
                letterSpacing: '0.025em'
            }}
        >
            {label}
        </button>
    );

    const InputGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-main)' }}>
                {label}
            </label>
            {children}
        </div>
    );

    const NumberInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => (
        <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontFamily: 'monospace'
            }}
        />
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? "Editar Ingrediente" : "Novo Ingrediente"}
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave}>Guardar Ingrediente</button>
                </>
            }
        >
            <div style={{ display: 'flex', marginBottom: '2rem', background: '#F9FAFB', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', overflow: 'hidden' }}>
                <TabButton id="general" label="Geral" />
                <TabButton id="properties" label="Qualidade" />
                <TabButton id="fattyAcids" label="Perfil Graxo" />
            </div>

            <div style={{ minHeight: '400px', padding: '0 0.5rem' }}>
                {activeTab === 'general' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="Nome">
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleChange('name', e.target.value)}
                                    className="form-control"
                                    style={{ width: '100%' }}
                                />
                            </InputGroup>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="INCI (Nome Científico)">
                                <input
                                    type="text"
                                    value={formData.inci}
                                    onChange={(e) => handleChange('inci', e.target.value)}
                                    className="form-control"
                                    style={{ width: '100%' }}
                                />
                            </InputGroup>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="Descrição Curta">
                                <input
                                    type="text"
                                    value={formData.descriptionFragment || ''}
                                    onChange={(e) => handleChange('descriptionFragment', e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                                />
                            </InputGroup>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="Origem">
                                <input
                                    type="text"
                                    value={formData.origin || ''}
                                    onChange={(e) => handleChange('origin', e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                                />
                            </InputGroup>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="Categoria">
                                <select
                                    value={formData.category}
                                    onChange={(e) => handleChange('category', e.target.value)}
                                    className="form-control"
                                    style={{ width: '100%' }}
                                >
                                    {INGREDIENT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </InputGroup>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', gridColumn: '1 / -1' }}>
                            <InputGroup label="SAP NaOH">
                                <NumberInput value={formData.sapNaOH} onChange={(v) => handleChange('sapNaOH', v)} />
                            </InputGroup>
                            <InputGroup label="SAP KOH">
                                <NumberInput value={formData.sapKOH} onChange={(v) => handleChange('sapKOH', v)} />
                            </InputGroup>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', gridColumn: '1 / -1' }}>
                            <InputGroup label="Iodo">
                                <NumberInput value={formData.iodine || 0} onChange={(v) => handleChange('iodine', v)} />
                            </InputGroup>
                            <InputGroup label="INS">
                                <NumberInput value={formData.ins || 0} onChange={(v) => handleChange('ins', v)} />
                            </InputGroup>
                            <InputGroup label="% Água">
                                <NumberInput value={formData.waterPercent || 0} onChange={(v) => handleChange('waterPercent', v)} />
                            </InputGroup>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <InputGroup label="Notas">
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => handleChange('notes', e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', minHeight: '80px' }}
                                />
                            </InputGroup>
                        </div>
                    </div>
                )}

                {activeTab === 'properties' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {Object.keys(formData.properties).map(prop => (
                            <InputGroup key={prop} label={prop.charAt(0).toUpperCase() + prop.slice(1)}>
                                <NumberInput
                                    value={(formData.properties as any)[prop]}
                                    onChange={(v) => handlePropertyChange(prop as any, v)}
                                />
                            </InputGroup>
                        ))}
                    </div>
                )}

                {activeTab === 'fattyAcids' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {Object.keys(formData.fattyAcids).map(acid => (
                            <InputGroup key={acid} label={acid.charAt(0).toUpperCase() + acid.slice(1)}>
                                <NumberInput
                                    value={(formData.fattyAcids as any)[acid]}
                                    onChange={(v) => handleFattyAcidChange(acid as any, v)}
                                />
                            </InputGroup>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
};
