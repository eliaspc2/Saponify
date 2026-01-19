# Configuração do Ambiente Saponify

Para rodar esta aplicação profissional com a arquitetura definida (React, TypeScript, Vite), é necessário ter o **Node.js** instalado.

## O Erro que você viu
O erro "CORS policy" e "Failed to load resource" acontece porque:
1. Navegadores bloqueiam módulos modernos (`import/export`) quando abertos direto do disco (`file://`).
2. Navegadores não entendem arquivos `.tsx` (React TypeScript) nativamente. Eles precisam ser "traduzidos" pelo Vite.

## Passo a Passo para Resolver

1. **Instalar Node.js**
   - Baixe e instale a versão "LTS" do site oficial: [https://nodejs.org/](https://nodejs.org/)
   - Durante a instalação, garanta que a opção "Add to PATH" esteja marcada.
   - Após instalar, feche e reabra o seu terminal (ou VS Code).

2. **Instalar Dependências**
   Abra o terminal na pasta do projeto e rode:
   ```bash
   npm install
   ```

3. **Rodar a Aplicação**
   Para iniciar o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   
   O terminal mostrará um link (ex: `http://localhost:5173`). Clique nele para abrir a aplicação.
