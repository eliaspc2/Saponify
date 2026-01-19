import React from 'react';
import { BasePage, BasePageState } from './BasePage';

export interface BaseDetailPageState<T> extends BasePageState {
    formData: T;
    isDirty: boolean;
    isValid: boolean;
}

export abstract class BaseDetailPage<T> extends BasePage<{ id?: string }, BaseDetailPageState<T>> {

    protected abstract getInitialData(): T;

    protected getInitialState(): Partial<BaseDetailPageState<T>> {
        return {
            formData: this.getInitialData(),
            isDirty: false,
            isValid: true
        };
    }

    protected renderActions(): React.ReactNode {
        return (
            <div className="actions-toolbar">
                <button className="btn btn-secondary" onClick={() => this.handleCancel()}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => this.handleSave()} disabled={!this.state.isDirty}>Guardar</button>
            </div>
        );
    }

    protected renderContent() {
        return (
            <div className="detail-page card">
                <form onSubmit={(e) => { e.preventDefault(); this.handleSave(); }}>
                    {this.renderForm()}
                </form>
            </div>
        );
    }

    abstract renderForm(): React.ReactNode;

    protected handleSave() {
        console.log('Saving...', this.state.formData);
    }

    protected handleCancel() {
        console.log('Cancelled');
    }
}
