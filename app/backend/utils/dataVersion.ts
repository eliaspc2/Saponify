import { StorageKeys } from '../../shared/constants/StorageKeys';

const DATA_VERSION_KEY = StorageKeys.DATA_VERSION;

export const touchDataVersion = () => {
    try {
        localStorage.setItem(DATA_VERSION_KEY, String(Date.now()));
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
