type OpenAIClientOptions = {
    apiKey: string;
    model: string;
    baseUrl?: string;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const normalizeBaseUrl = (value?: string): string => {
    const trimmed = (value || DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, '');
    if (trimmed.endsWith('/chat/completions')) {
        return trimmed.slice(0, -'/chat/completions'.length);
    }
    if (trimmed.endsWith('/models')) {
        return trimmed.slice(0, -'/models'.length);
    }
    return trimmed || DEFAULT_OPENAI_BASE_URL;
};

export class OpenAIClient {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options: OpenAIClientOptions) {
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.baseUrl = normalizeBaseUrl(options.baseUrl);
    }

    async generateJson(prompt: object): Promise<object> {
        if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
            throw new Error('Prompt inválido: esperado object.');
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: JSON.stringify(prompt) }]
            })
        });

        if (!response.ok) {
            let message = 'Erro ao comunicar com a OpenAI.';
            try {
                const errorBody = await response.json();
                message = errorBody?.error?.message || message;
            } catch {
                // ignore parse errors
            }
            throw new Error(message);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (typeof content !== 'string') {
            throw new Error('Resposta inválida da OpenAI: conteúdo ausente.');
        }

        const trimmed = content.trim();
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Resposta inválida da OpenAI: JSON não é object.');
            }
            return parsed;
        } catch {
            throw new Error('Resposta inválida da OpenAI: JSON inválido.');
        }
    }

    async listModels(): Promise<string[]> {
        const response = await fetch(`${this.baseUrl}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.apiKey}`
            }
        });

        if (!response.ok) {
            let message = 'Erro ao obter modelos da OpenAI.';
            try {
                const errorBody = await response.json();
                message = errorBody?.error?.message || message;
            } catch {
                // ignore parse errors
            }
            throw new Error(message);
        }

        const data = await response.json();
        const models = Array.isArray(data?.data) ? data.data : [];
        const ids = models
            .map((item: any) => item?.id)
            .filter((id: any) => typeof id === 'string' && id.trim().length > 0);

        if (!ids.length) {
            throw new Error('Nenhum modelo disponível.');
        }

        return ids;
    }
}
