import React from 'react';
import { BasePage, BasePageState } from './BasePage';
import { Search } from 'lucide-react';

export interface BaseListPageState<T> extends BasePageState {
    data: T[];
    searchQuery: string;
    filter: string;
    currentPage: number;
    pageSize: number;
}

type PaginationSlice<T> = {
    pageItems: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
    startItem: number;
    endItem: number;
};

export abstract class BaseListPage<T, S extends BaseListPageState<T> = BaseListPageState<T>, P = {}> extends BasePage<P, S> {

    protected getInitialState(): Partial<S> {
        return {
            data: [],
            searchQuery: '',
            filter: 'all',
            currentPage: 1,
            pageSize: 10
        } as unknown as Partial<S>;
    }

    protected getPaginatedData(items: T[]): PaginationSlice<T> {
        const totalItems = items.length;
        const rawPageSize = Number(this.state.pageSize) || 10;
        const pageSize = Math.max(1, rawPageSize);
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const rawCurrentPage = Number(this.state.currentPage) || 1;
        const currentPage = Math.min(Math.max(1, rawCurrentPage), totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageItems = items.slice(startIndex, endIndex);

        return {
            pageItems,
            totalItems,
            totalPages,
            currentPage,
            pageSize,
            startItem: totalItems === 0 ? 0 : startIndex + 1,
            endItem: totalItems === 0 ? 0 : Math.min(endIndex, totalItems)
        };
    }

    protected setCurrentPage(page: number) {
        this.setState({ currentPage: Math.max(1, page) } as Pick<S, 'currentPage'>);
    }

    protected setPageSize(pageSize: number) {
        const normalized = Math.max(1, pageSize);
        this.setState({ pageSize: normalized, currentPage: 1 } as Pick<S, 'pageSize' | 'currentPage'>);
    }

    protected renderPaginationControls(
        pagination: PaginationSlice<T>,
        itemLabel = 'registos'
    ): React.ReactNode {
        const { totalItems, totalPages, currentPage, pageSize, startItem, endItem } = pagination;
        if (totalItems <= pageSize) {
            return null;
        }

        const canGoPrev = currentPage > 1;
        const canGoNext = currentPage < totalPages;

        return (
            <div className="table-pagination" role="navigation" aria-label="Paginação da lista">
                <div className="table-pagination-summary">
                    {`A mostrar ${startItem}-${endItem} de ${totalItems} ${itemLabel}`}
                </div>

                <div className="table-pagination-controls">
                    <label className="table-pagination-size" htmlFor="table-page-size">
                        Linhas por página
                        <select
                            id="table-page-size"
                            value={pageSize}
                            onChange={(e) => this.setPageSize(Number(e.target.value) || 10)}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => this.setCurrentPage(currentPage - 1)}
                        disabled={!canGoPrev}
                    >
                        Anterior
                    </button>

                    <span className="table-pagination-page">{`Página ${currentPage} de ${totalPages}`}</span>

                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => this.setCurrentPage(currentPage + 1)}
                        disabled={!canGoNext}
                    >
                        Próxima
                    </button>
                </div>
            </div>
        );
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
                                this.setState({
                                    searchQuery: e.target.value,
                                    currentPage: 1
                                } as Pick<S, 'searchQuery' | 'currentPage'>);
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
