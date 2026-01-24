type OpenAIClientOptions = {
    apiKey: string;
    model: string;
    baseUrl?: string;
};

export class OpenAIClient {
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options: OpenAIClientOptions) {
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.baseUrl = options.baseUrl || 'https://api.openai.com/v1/chat/completions';
    }

    async generateJson(prompt: object): Promise<object> {
        if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
            throw new Error('Prompt inválido: esperado object.');
        }

        const response = await fetch(this.baseUrl, {
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

}
