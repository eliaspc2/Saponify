import { RECIPE_DOMAIN_FINGERPRINT, BUILD_TIME } from './DomainFingerprint.generated';

export const getRecipeDomainFingerprint = (): string => RECIPE_DOMAIN_FINGERPRINT;
export const getBuildTime = (): string => BUILD_TIME;
