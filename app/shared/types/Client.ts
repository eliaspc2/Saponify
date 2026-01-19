export interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;

    // Mandatory Consents
    consentCureProcess: boolean;
    consentDataTruth: boolean;
    consentRGPD: boolean;

    // Optional Consents
    consentFutureContact: boolean;
    consentAdvertising: boolean;

    createdAt: string;
    updatedAt: string;
}
