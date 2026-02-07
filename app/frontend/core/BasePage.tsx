import React from 'react';

export interface BasePageProps {
    title?: string;
    isActive?: boolean;
}

export interface BasePageState {
    isLoading: boolean;
    error: string | null;
}

/**
 * Superclass for all pages.
 * Handles common functionality like loading states, error handling, and titles.
 */
export abstract class BasePage<P = {}, S = {}> extends React.Component<P & BasePageProps, S & BasePageState> {
    constructor(props: P & BasePageProps) {
        super(props);
        this.state = {
            isLoading: false,
            error: null,
            ...this.getInitialState()
        } as S & BasePageState;
    }

    // Hook for subclasses to set their initial state
    protected abstract getInitialState(): Partial<S>;

    // Hook for subclasses to add custom CSS classes
    protected getPageContainerClass(): string {
        return '';
    }

    // Common render wrapper
    render() {
        const customClass = this.getPageContainerClass();
        return (
            <div className={`page-container ${customClass}`.trim()}>
                {this.renderHeader()}
                <div className="page-content">
                    {this.state.isLoading ? this.renderLoading() : this.renderContent()}
                </div>
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        return (
            <header className="page-header">
                <h1>{this.props.title || 'Saponify'}</h1>
                <div className="page-header-actions">{this.renderActions()}</div>
            </header>
        );
    }

    protected renderActions(): React.ReactNode {
        return null; // Override in subclasses
    }

    protected renderLoading(): React.ReactNode {
        return <div className="loading-spinner">Carregando...</div>;
    }

    // Main content method to be implemented by subclasses
    abstract renderContent(): React.ReactNode;
}
