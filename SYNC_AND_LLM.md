# Sincronizacao e LLM

## Sincronizacao

O Firestore guarda um backup completo, encriptado com a password de sincronizacao.
Os dispositivos devem usar a mesma conta Google e a mesma password. A rececao
e verificada a cada 30 segundos. Dados recebidos ficam separados dos backups
locais ate a importacao ser validada.

A aplicacao atualiza as paginas durante a sessao. A calculadora e os formularios
em edicao adiam a importacao para preservar os rascunhos. Um aviso indica os
dados pendentes; sair da calculadora permite concluir a importacao quando nao
existem alteracoes locais concorrentes.

Cada envio compara a revisao remota numa transacao. Se dois dispositivos tiverem
alteracoes, o envio e bloqueado e os dados locais permanecem disponiveis. Nas
Configuracoes:

- **Puxar Remoto** pede confirmacao e descarrega uma copia dos dados locais antes
  de substituir os dados pela versao remota.
- **Enviar versao local** pede confirmacao para substituir o remoto; uma nova
  alteracao remota durante o envio volta a bloquear a operacao.
- **Sincronizar Agora** tenta enviar os dados atuais sem ignorar conflitos.

Falhas de rede mantem o envio pendente e desencadeiam novas tentativas. Falhas
permanentes de permissoes ou tamanho sao apresentadas ao utilizador. O limite
de um documento Firestore continua a aplicar-se; backups grandes devem ser
exportados como ficheiro.

Atualizar a app em todos os dispositivos: clientes antigos nao verificam revisoes
antes de escrever. Esta alteracao nao publica regras Firestore nem migra dados
na conta do utilizador. Os testes usam dados ficticios e APIs simuladas; falta
validar com duas sessoes Google reais no ambiente de producao.

## LLM

As Configuracoes suportam OpenAI compativel, Anthropic e Ollama nativo. O modelo
pode ser escrito diretamente ou escolhido na lista devolvida pelo servidor.
As configuracoes OpenAI antigas sao migradas preservando o endpoint e modelo.
Alterar o fornecedor ou URL limpa a chave do formulario para evitar enviar a
chave anterior a outro servidor.

O atalho Codex Router usa `http://127.0.0.1:18430/api/openai/v1`. A chave deve ser
introduzida nas Configuracoes. Servidores OpenAI compativeis locais podem funcionar
sem chave. As chamadas partem do navegador: o servidor deve permitir a origem
da app por CORS e estar acessivel nesse computador. O localhost de um telemovel
nao aponta para o computador onde esta o servidor.

## Validacao

`npm test` executa os testes locais de backups, importacao, controlador, LLM e
Firestore com dependencias simuladas. `npm run build` valida TypeScript e Vite.

`npm run test:browser` usa Playwright e uma instancia Vite de desenvolvimento
em `http://127.0.0.1:5187`. Podem ser definidos `APP_URL`, `PLAYWRIGHT_MODULE`
(caminho do modulo instalado) e `CHROME_BIN`. O teste cria um contexto isolado,
desativa a sincronizacao real e testa rececao, rascunhos e configuracoes LLM.
