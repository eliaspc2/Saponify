import React from 'react';
import { BasePage, BasePageState } from './BasePage';
import { Search } from 'lucide-react';

export interface BaseListPageState<T> extends BasePageState {
    data: T[];
    searchQuery: string;
    filter: string;
}

export abstract class BaseListPage<T, S extends BaseListPageState<T> = BaseListPageState<T>, P = {}> extends BasePage<P, S> {

    protected getInitialState(): Partial<S> {
        return {
            data: [],
            searchQuery: '',
            filter: 'all'
        } as unknown as Partial<S>;
    }

    public renderContent() {
        return (
            <div className="list-page">
                {/* 1. Control Pill (First element as requested) */}
                <div className="list-controls card">
                    <div className="search-bar">
                        <Search className="icon" size={18} />
                        <input
                            type="text"
                            placeholder="Pesquisar..."
                            value={this.state.searchQuery}
                            onChange={(e) => {
                                // @ts-ignore
                                this.setState({ searchQuery: e.target.value })
                            }}
                        />
                    </div>
                    {this.renderFilters()}
                </div>

                {/* 2. Stats Summary */}
                {this.renderStats()}

                <div className="list-content">
                    {this.state.data.length === 0 ? this.renderEmptyState() : this.renderTable()}
                </div>
            </div>
        );
    }

    abstract renderStats(): React.ReactNode;
    abstract renderFilters(): React.ReactNode;
    abstract renderTable(): React.ReactNode;

    protected renderEmptyState(): React.ReactNode {
        return (
            <div className="empty-state">
                <p>Nenhum registo encontrado.</p>
            </div>
        );
    }
}
