import { Questionnaire } from '../../shared/types/Questionnaire';
import { touchDataVersion } from '../utils/dataVersion';

export class QuestionnaireService {
    private static STORAGE_KEY = 'saponify_questionnaires';

    static replaceAll(questionnaires: Questionnaire[]): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(questionnaires || []));
        touchDataVersion();
    }

    static async getQuestionnaires(): Promise<Questionnaire[]> {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return [];
        try {
            return JSON.parse(stored);
        } catch {
            return [];
        }
    }

    static async saveQuestionnaire(questionnaire: Questionnaire): Promise<void> {
        const questionnaires = await this.getQuestionnaires();
        const index = questionnaires.findIndex(q => q.id === questionnaire.id);

        const now = new Date().toISOString();
        const data = {
            ...questionnaire,
            updatedAt: now,
            createdAt: questionnaire.createdAt || now
        };

        if (index >= 0) {
            questionnaires[index] = data;
        } else {
            questionnaires.push(data);
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(questionnaires));
        touchDataVersion();
    }

    static async deleteQuestionnaire(id: string): Promise<void> {
        const questionnaires = await this.getQuestionnaires();
        const filtered = questionnaires.filter(q => q.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
        touchDataVersion();
    }

    static async getQuestionnaireById(id: string): Promise<Questionnaire | undefined> {
        const questionnaires = await this.getQuestionnaires();
        return questionnaires.find(q => q.id === id);
    }
}
