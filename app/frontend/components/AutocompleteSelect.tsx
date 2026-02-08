import { useEffect, useMemo, useRef, useState } from 'react';

type AutocompleteOption = {
    value: string;
    label: string;
};

type AutocompleteSelectProps = {
    options: AutocompleteOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
    inputClassName?: string;
};

export function AutocompleteSelect({
    options,
    value,
    onChange,
    placeholder,
    emptyText = 'Sem resultados',
    disabled,
    className,
    inputClassName
}: AutocompleteSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const blurTimerRef = useRef<number | null>(null);

    const selectedLabel = useMemo(() => {
        const selected = options.find((option) => option.value === value);
        return selected ? selected.label : '';
    }, [options, value]);

    useEffect(() => {
        if (!isOpen) {
            setQuery(selectedLabel);
        }
    }, [selectedLabel, isOpen]);

    useEffect(() => {
        return () => {
            if (blurTimerRef.current) {
                window.clearTimeout(blurTimerRef.current);
            }
        };
    }, []);

    const filteredOptions = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return options;

        return options.filter((option) => option.label.toLowerCase().includes(term));
    }, [options, query]);

    const closeDropdown = () => {
        setIsOpen(false);
        setHighlightedIndex(0);
        setQuery(selectedLabel);
    };

    const selectOption = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setHighlightedIndex(0);
    };

    return (
        <div className={`autocomplete-select${className ? ` ${className}` : ''}`}>
            <input
                type="text"
                className={inputClassName || 'form-control'}
                value={query}
                disabled={disabled}
                placeholder={placeholder}
                onFocus={() => {
                    setIsOpen(true);
                    setHighlightedIndex(0);
                }}
                onBlur={() => {
                    blurTimerRef.current = window.setTimeout(() => {
                        closeDropdown();
                    }, 120);
                }}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setIsOpen(true);
                    setHighlightedIndex(0);
                }}
                onKeyDown={(event) => {
                    if (!isOpen) return;

                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredOptions.length - 1)));
                        return;
                    }

                    if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                        return;
                    }

                    if (event.key === 'Enter') {
                        event.preventDefault();
                        const option = filteredOptions[highlightedIndex];
                        if (option) {
                            selectOption(option.value);
                        }
                        return;
                    }

                    if (event.key === 'Escape') {
                        event.preventDefault();
                        closeDropdown();
                    }
                }}
            />

            {isOpen && (
                <div className="autocomplete-select-menu">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option, index) => (
                            <button
                                key={`${option.value}-${index}`}
                                type="button"
                                className={`autocomplete-select-option${index === highlightedIndex ? ' is-active' : ''}`}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectOption(option.value);
                                }}
                            >
                                {option.label}
                            </button>
                        ))
                    ) : (
                        <div className="autocomplete-select-empty">{emptyText}</div>
                    )}
                </div>
            )}
        </div>
    );
}

export type { AutocompleteOption };
