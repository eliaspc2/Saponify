import { StorageKeys } from '../../../shared/constants/StorageKeys';

const DATA_VERSION_KEY = StorageKeys.DATA_VERSION;

export const touchDataVersion = () => {
    try {
        const previous = Number(localStorage.getItem(DATA_VERSION_KEY));
        const now = Date.now();
        const next = Number.isSafeInteger(previous) && previous >= now
            ? previous + 1
            : now;
        localStorage.setItem(DATA_VERSION_KEY, String(next));
    } catch {
        // Ignore storage errors
    }
};

export const getDataVersion = () => {
    try {
        return localStorage.getItem(DATA_VERSION_KEY) || '';
    } catch {
        return '';
    }
};
