const DATA_VERSION_KEY = 'saponify_data_version';

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
