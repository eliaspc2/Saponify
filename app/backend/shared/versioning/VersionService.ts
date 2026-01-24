import { getAppVersion } from './AppVersion';
import { getDataSchemaVersion } from './DataSchemaVersion';
import { getBuildTime, getRecipeDomainFingerprint } from './DomainFingerprint';
import type { VersionInfo } from './VersionInfo';

export const getVersionInfo = (): VersionInfo => ({
    appVersion: getAppVersion(),
    dataSchemaVersion: getDataSchemaVersion(),
    recipeDomainFingerprint: getRecipeDomainFingerprint(),
    buildTime: getBuildTime()
});
