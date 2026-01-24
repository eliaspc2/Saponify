import pkg from '../../../../package.json';

export const getAppVersion = (): string => {
    return (pkg as { version?: string }).version || '0.0.0';
};
