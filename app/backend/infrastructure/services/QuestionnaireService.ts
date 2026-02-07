import { Questionnaire } from '../../../shared/types/Questionnaire';
import { AbstractConfigService } from '../../shared/config/AbstractConfigService';
import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { DeletionBackupStorage } from '../storage/DeletionBackupStorage';

export type QuestionnaireState = Questionnaire[];

export class QuestionnaireService extends AbstractConfigService<QuestionnaireState> {
    private static instance: QuestionnaireService;

    private constructor() {
        super('QuestionnaireService', StorageKeys.QUESTIONNAIRES, [], { silentParseErrors: true });
    }

    static getInstance(): QuestionnaireService {
        if (!QuestionnaireService.instance) {
            QuestionnaireService.instance = new QuestionnaireService();
        }
        return QuestionnaireService.instance;
    }

    static replaceAll(questionnaires: Questionnaire[]): void {
        QuestionnaireService.getInstance().replaceAll(questionnaires);
    }

    static async getQuestionnaires(): Promise<Questionnaire[]> {
        return QuestionnaireService.getInstance().getQuestionnaires();
    }

    static async saveQuestionnaire(questionnaire: Questionnaire): Promise<void> {
        await QuestionnaireService.getInstance().saveQuestionnaire(questionnaire);
    }

    static async deleteQuestionnaire(id: string): Promise<void> {
        await QuestionnaireService.getInstance().deleteQuestionnaire(id);
    }

    static async getQuestionnaireById(id: string): Promise<Questionnaire | undefined> {
        return QuestionnaireService.getInstance().getQuestionnaireById(id);
    }

    replaceAll(questionnaires: Questionnaire[]): void {
        this.setData((questionnaires || []).map(item => ({ ...item })));
    }

    async getQuestionnaires(): Promise<Questionnaire[]> {
        return JSON.parse(JSON.stringify(this.getData() || []));
    }

    async saveQuestionnaire(questionnaire: Questionnaire): Promise<void> {
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

        this.setData(questionnaires);
    }

    async deleteQuestionnaire(id: string): Promise<void> {
        const questionnaires = await this.getQuestionnaires();
        const filtered = questionnaires.filter(q => q.id !== id);
        if (filtered.length < questionnaires.length) {
            DeletionBackupStorage.captureSnapshot(`delete:${StorageKeys.QUESTIONNAIRES}:${id}`);
        }
        this.setData(filtered);
    }

    async getQuestionnaireById(id: string): Promise<Questionnaire | undefined> {
        const questionnaires = await this.getQuestionnaires();
        return questionnaires.find(q => q.id === id);
    }
}
