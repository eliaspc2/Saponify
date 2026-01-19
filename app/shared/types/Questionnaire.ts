export interface Questionnaire {
    id: string;
    clientId: string;
    clientName: string;
    date: string;

    // 1. Faixa etária
    ageGroup: string;

    // 2. Sobre ti e o uso do sabonete
    usageFrequency: string;
    usageZones: string[]; // Multiple choice
    previousReaction: string;
    extraSoapInfo?: string; // Open response

    // 3. Aspeto e sensação da pele
    oiliness: string;
    drynessAfterWash: string;
    irritationFrequency: string;
    skinCuriosity?: string; // Open response

    // 4. Problemas de pele
    skinProblems: string[]; // Multiple choice
    skinProblemsOther?: string;
    medications: string;
    medicationsOther?: string;
    extraSkinDetails?: string; // Open response

    // 5. Estilo de vida
    sleepQuality: string;
    dietType: string[]; // Multiple choice
    waterIntake: string;
    sweatIntensity: string;
    environmentType: string[]; // Multiple choice
    sunReaction: string;
    extraEnvironmentInfo?: string; // Open response

    // 6. Cuidados com a pele
    dailyProducts: string[]; // Multiple choice
    dailyProductsOther?: string;
    specialCareHabits?: string; // Open response

    // 7. Alergias e restrições
    allergies: string;
    allergiesOther?: string;
    animalProductRestrictions: string;
    animalProductRestrictionsOther?: string;
    personalConvictions?: string; // Open response

    createdAt: string;
    updatedAt: string;
}
