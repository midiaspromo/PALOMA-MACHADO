# NutriMatch seguro — Paloma Machado

## Rotas
- `/` — site público
- `/admin` — login/painel administrativo protegido
- `/api/quiz` — grava participantes no SQLite mediante consentimento
- `/api/admin/participants` — exige sessão autenticada
- `/api/admin/export.csv` — exige sessão autenticada

## Instalação
1. Node.js 20+ instalado.
2. `npm install`
3. Copie `.env.example` para `.env`.
4. Gere um `SESSION_SECRET` forte (por exemplo: `openssl rand -hex 32`) e substitua no `.env`.
5. Configure `ADMIN_USERNAME` e `ADMIN_INITIAL_PASSWORD`. Credenciais iniciais padrão: `admin` / `Paloma@Nutri2026!`.
6. `npm start`

No primeiro login, o painel exige a troca da senha temporária. Nunca reutilize a senha padrão em produção. Se a conta já existir no SQLite, mudar `.env` não altera sua senha; use o fluxo de troca de senha.

## Proteção incluída
- Senhas armazenadas com bcrypt, nunca em texto puro.
- Sessões no SQLite, cookie HttpOnly, SameSite=Strict e Secure em produção HTTPS.
- Token CSRF para ações autenticadas.
- Limite de tentativas no login e rate limit de API.
- Helmet, validação básica e endpoints administrativos protegidos.
- Banco e sessões no diretório persistente `DATA_DIR`.

## Hospedagem
SQLite exige disco persistente. Recomendado Coolify/VPS com volume persistente montado em `./data`. Configure HTTPS e `TRUST_PROXY=1` se estiver atrás do proxy confiável do Coolify. Não hospede o backend SQLite em Netlify como função serverless com filesystem efêmero.

## LGPD
Antes de coletar contatos reais, publique aviso de privacidade com controlador, finalidade, retenção, canal de direitos e contato. Colete apenas dados necessários; mantenha consentimento explícito e permita exclusão. O quiz evita solicitar dados clínicos sensíveis.

## Coolify — corrigir erro `open Dockerfile: no such file or directory`
Este pacote agora inclui um `Dockerfile` na raiz da aplicação.

No Coolify:
1. Confirme que o Root Directory é `/` (raiz do repositório, onde estão `Dockerfile`, `package.json` e `server.js`).
2. Build Pack: **Dockerfile**.
3. Dockerfile Location: `./Dockerfile`.
4. Exposed Port: `3000`.
5. Crie um Persistent Storage/Volume montado em `/app/data`.
6. Configure as variáveis do `.env.example` em Environment Variables no Coolify. Gere um `SESSION_SECRET` aleatório com pelo menos 32 caracteres.
7. Configure o domínio e HTTPS, depois redeploy.

Não coloque o conteúdo dentro de uma subpasta `nutrimatch/` no repositório, a menos que configure essa subpasta como Root Directory no Coolify.
