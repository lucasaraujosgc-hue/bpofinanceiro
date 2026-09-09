# Auditoria de segurança — bpofinanceiro (Sistema Financeiro Pro)

Revisão do código em `1c687fd` (branch `main`). Foco nos pontos levantados +
achados adicionais. Referências no formato `arquivo:linha`.

Legenda: 🔴 crítico · 🟠 alto · 🟡 médio · ⚪ baixo / higiene

---

## Status (branch `security/urgent-fixes`)

| Item | Estado |
|------|--------|
| §0.1 `.gitignore` + `.dockerignore` | ✅ criados (`.env` protegido; `.env.example` recriado sem segredos) |
| §0.2 `NODE_ENV=production` no Dockerfile + vite só em dev | ✅ `ENV NODE_ENV=production` após o build; `import('vite')` dinâmico; `npm ci`; `USER node` |
| §0.3 `blocked` deixa de ser cosmético | ✅ `authenticateToken` consulta `users.blocked` (cache 30 s) |
| §1.2 IDOR `DELETE /api/forecasts/:id` | ✅ `user_id` em todas as queries da rota |
| §1.3 IDOR `POST /api/transactions` (saldo) | ✅ `assertUserOwns()` nas FKs + `UPDATE banks ... AND user_id` |
| §2/§4 `JWT_SECRET` / `ENCRYPTION_KEY` fail-fast | ✅ aborta o boot em produção se ausentes |
| §3 CORS aberto | ✅ allowlist via `CORS_ORIGINS` (nega cross-site em prod; libera em dev) |
| §4 AES-CBC → AES-GCM | ✅ escreve `v2:` GCM autenticado; **lê** o formato CBC legado; `decrypt` não devolve mais ciphertext em falha |
| §12 deps + build | ✅ `sqlite3` (não usado) + `pluggy-sdk` + `react-pluggy-connect` removidos; Tailwind CDN → build real (Tailwind v4 + `@tailwindcss/vite`); importmap `esm.sh` removido → `npm audit` 19→6 (0 critical) |
| **Pluggy** — integração inteira | ✅ **removida** (server + widget + deps). Rotas `/api/pluggy/*` e `PluggyConnectWidget.tsx` deletadas. §1.1 IDOR ficou sem objeto |
| Tema | ✅ **light default + toggle claro/escuro** (`next-themes`), tokens idênticos ao `cliente_final` (`index.css` `@theme` + `.dark`). ~19 componentes convertidos de classes `slate-*` fixas para tokens semânticos (`bg-ground/surface/sunken`, `text-ink/muted/faint`, `border-line`, `brand`, `ok/warn/danger/info`). Gráficos recharts agora usam `var(--color-*)` |
| Logo | ✅ wordmark "Vírgula," (`components/Logo.tsx`, Fraunces) em Login + Layout; `ThemeToggle` no chrome; favicon = a vírgula |
| §1.4 IDOR (posse de FK) | ✅ `assertUserOwns()` em `POST/PUT` de `transactions`, `forecasts`, `credit-cards`, `keyword-rules` |
| §6 Host header injection | ✅ links de e-mail usam `APP_URL` (ou `CORS_ORIGINS[0]`), nunca `req.get('host')` |
| §6 token de signup eterno | ✅ expira em 72 h (`validate-signup-token` + `complete-signup`) |
| §6 reset token em texto plano | ✅ guarda só `sha256(token)`; senha mínima de 8 chars no reset e no signup |
| §7 CSP desligada | ✅ CSP restrita em produção (`default-src 'self'`, script `'self'`, fontes Google); off em dev (Vite usa eval) |
| §8 rate limiting genérico | ✅ limiter dedicado: 8/15 min em `/api/login` e nos fluxos de senha (conta só falhas), 15/h em signup |
| §7 upload de logo do admin | ✅ `saveBankLogo()`: só PNG/JPG/WebP, valida magic bytes, cap 512 KB, nome aleatório, SVG rejeitado |
| §13 `GET /api/integration/settings` | ✅ DTO (sem `SELECT *`); token NFe cifrado em repouso (`encrypt`/`decrypt`) |
| §13 logs de erro do DB | ✅ não imprimem mais `params` (hash, tokens, PII) — só `err.code` + 120 chars da query |
| §7 auditoria | ✅ `logAudit()` em block/unblock/delete de usuário e CRUD de bancos globais; `GET /api/admin/audit` (só admin) + aba "Auditoria" no painel mostra a trilha |
| tabela órfã `pluggy_connections` | ✅ `DROP TABLE IF EXISTS` no `db_init` |
| favicon / título | ✅ favicon → `virgulacontabil.com.br/.../icon-192.png`; `<title>` = "Ferramenta Financeira \| Vírgula Contábil" |
| DRE / plano de contas | ✅ reescrito conforme art. 187 (ver `docs/RELATORIOS.md`); grupos contábeis, análise vertical/horizontal, ponto de equilíbrio |
| §9 `server.js` monolítico | ✅ **split** (branch `refactor/split-server`): `src/server/{config,db,schema,accounting}.js` + `middleware/` + `services/` + `lib/` + `routes/*.routes.js` (10 módulos). `server.js` virou bootstrap de ~100 linhas. Handlers movidos verbatim, rotas/ordem preservadas. Shim SQLite→PG segue em `db.js` (documentado) |
| §2 modelo de sessão | ✅ **access curto (15 min) + refresh rotativo (~90 d) com detecção de reuso** — tabela `auth_sessions` (digest sha256), `POST /api/auth/refresh` + `/api/auth/logout`, reset de senha e block/delete revogam a sessão. Frontend: patch de `window.fetch` (`lib/http.ts`) renova em 401 de forma transparente (single-flight). Token inválido → 401 `token_expired` (era 403) |
| §5 validação de entrada | ✅ **zod** em todo endpoint de escrita (`src/server/schemas.js` + `middleware/validate.js`). Campos perigosos travados: `value` finito ≥ 0 (rejeita NaN/negativo/Infinity), `type` ∈ {credito,debito}, `date` AAAA-MM-DD **e dia real do calendário** (`2026-13-99` → 400, não 500 no `::date`), `email` com formato. `.loose()` deixa passar chave extra p/ não quebrar telas. `limit` de `audit-signups` com teto 200 |
| §10 schema no boot | ✅ **migrations versionadas** (`src/server/migrations/*.sql` + `migrate.js` + `migrate-cli.js`). `0001_baseline.sql` = schema atual, idempotente (roda tanto em banco vazio quanto no de produção). Tracking em `schema_migrations`, cada migration numa transação, advisory lock serializa runners. `db_init`/`ensureColumn` **removidos**. `npm run migrate` + hook `prestart` (deploy falha se a migration falhar); server aplica pendentes no boot como rede de segurança |

**Verificação (contra PGlite via `preview-boot.mjs` — dados simulados):**
`npm run build` OK · boot produção OK · login OK · IDOR `POST /api/forecasts`
com `bankId` alheio → **403** · 9 logins errados → **429** · header CSP presente
em produção sem violações no SPA · DRE/Análise/Fluxo renderizam com dados reais.
Split + sessão + zod + migrations: **68 checagens de API** (24 base + 13 helpers
+ 14 sessão + 17 validação) + navegador (renovação transparente, single-flight,
logout forçado, forms) + migrations testadas em banco vazio E em banco "legado"
simulado (colunas novas adicionadas, seed não duplicado, 2ª run = no-op).

### Pendente (não feito)

- QA visual das telas internas nos dois temas.
- Matar o shim SQLite→PG (`db.js`) — ~40 queries ainda passam por `_convertQuery`
  (§9). Não é bug; é dívida.
- Hardening de query param nos relatórios (`year`/`month` sem `parseInt` guard —
  baixo risco: valores vêm de dropdown).
- `.env`: conferir que `ENCRYPTION_KEY` é hex de 32 bytes e `PASSWORD_ADMIN` é
  forte (o usuário disse já ter ajustado).

---

## 0. Achados que não estavam na lista e são os mais urgentes

### 0.1 🔴 Não existe `.gitignore` nem `.dockerignore`

- Nenhum arquivo `.gitignore` no repo. O `.env` que você acabou de criar **não
  está sendo ignorado** — o próximo `git add -A` / `git commit` sobe
  `JWT_SECRET`, `ENCRYPTION_KEY`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_API_KEY`,
  `PASSWORD_ADMIN` e as credenciais SMTP para o GitHub.
- `Dockerfile:18` faz `COPY . .` sem `.dockerignore` → a imagem Docker embute
  `.git/` (histórico inteiro) e qualquer `.env` presente no build.

**Ação imediata (antes de qualquer commit):**

```
# .gitignore
node_modules/
dist/
.env
.env.*
!.env.example
*.log
backup/
logo/
```

```
# .dockerignore
node_modules
dist
.git
.env
.env.*
*.log
backup
```

Se o `.env` real já tiver sido commitado alguma vez, considere as chaves
vazadas e rotacione todas.

### 0.2 🔴 Produção roda o dev server do Vite

`server.js:1616` só monta `express.static(dist/)` quando
`process.env.NODE_ENV === "production"`. O `Dockerfile` **nunca define
`NODE_ENV`**, então em produção o processo cai no ramo `createViteServer()` e
serve a aplicação pelo **dev server do Vite** (sem minificação, com source maps,
com o middleware de transformação de módulos exposto).

Isso também torna explorável a CVE moderada do `esbuild`/`vite` (o dev server
aceita requisições cross-origin e devolve o conteúdo transformado de arquivos
locais — ver §12).

**Ação:** `ENV NODE_ENV=production` no `Dockerfile` (e garantir que
`npm run build` gerou `dist/`). Conferir que o EasyPanel/Cloud Run não
sobrescreve para `development`.

### 0.3 🟠 `blocked` é puramente cosmético — bloqueio não revoga acesso

`authenticateToken` (`server.js:246`) só faz `jwt.verify`; nunca consulta o
banco. Nenhuma rota verifica `users.blocked`. O `blocked` só é lido no
`/api/login` e o frontend (`App.tsx:67`, `:275`) decide mostrar o modal.

→ Um usuário bloqueado que já tenha um token (validade de 24 h, sem revogação)
**continua com acesso total à API** até o token expirar. Basta ele chamar
`/api/transactions`, `/api/banks` etc. direto.

**Ação:** checar `blocked` (e idealmente uma `token_version`) no
`authenticateToken`, com um `SELECT` leve ou cache curto. Ou migrar para o
modelo do `cliente_final` (access token curto + refresh rotativo + tabela de
sessões).

---

## 1. 🔴 BOLA / IDOR

O padrão geral (`WHERE id = ? AND user_id = ?`) está presente na maioria das
rotas de `UPDATE`/`DELETE`. Mas há brechas concretas:

### 1.1 🔴 `POST /api/pluggy/item` — sequestro de conexão bancária alheia

`server.js:843`

```sql
INSERT INTO pluggy_connections (user_id, item_id, status, ...)
VALUES ($1, $2, ...)
ON CONFLICT (item_id) DO UPDATE SET user_id = EXCLUDED.user_id
```

O `itemId` vem do corpo da requisição (`PluggyConnectWidget.tsx:50`). Qualquer
usuário autenticado pode `POST /api/pluggy/item` com o `item_id` de outro
usuário; o `ON CONFLICT ... DO UPDATE SET user_id` **transfere a posse** da
conexão para o atacante. Em seguida `GET /api/pluggy/accounts` (`server.js:862`)
chama `pluggyClient.fetchAccounts(item_id)` e devolve **dados reais de conta
bancária** (saldos, números de conta) da vítima.

Mitigante: `item_id` é UUID (difícil de adivinhar). Mas o
`/api/pluggy/webhook` é público e insere `item_id`s, e IDs podem vazar em logs.

**Ação:** nunca aceitar `itemId` do cliente para associar posse. Associe pelo
`clientUserId` que você já manda no `createConnectToken` (`server.js:807`),
buscando os itens desse `clientUserId` na API da Pluggy. No mínimo: `ON
CONFLICT (item_id) DO NOTHING` quando o `user_id` existente for diferente, e
recusar.

### 1.2 🔴 `DELETE /api/forecasts/:id?mode=future|all` — apaga previsão de outro usuário

`server.js:741`

```js
db.get(`SELECT group_id, date FROM forecasts WHERE id = ?`, [req.params.id], (err, current) => {
    if(!current || !current.group_id)
        return db.run(`DELETE FROM forecasts WHERE id = ?`, [req.params.id], ...); // <-- sem user_id
    ...
```

Tanto o `SELECT` quanto o `DELETE` de fallback não filtram por `user_id`. Se a
previsão-alvo não tiver `group_id` (caso comum — lançamento avulso), qualquer
usuário autenticado apaga a previsão de qualquer outro por ID sequencial.
O ramo `mode === 'single'` (`server.js:744`) está correto; o resto não.

**Ação:** `WHERE id = ? AND user_id = ?` em todas as queries dessa rota,
inclusive o `SELECT` inicial.

### 1.3 🟠 `POST /api/transactions` — corrompe saldo de banco alheio

`server.js:655` insere com `bank_id` / `category_id` / `credit_card_id` vindos
do corpo, **sem validar posse**. Não há FK em `bank_id` (`schema` só tem FK em
`user_id`). Depois:

`server.js:663` → `UPDATE banks SET balance = balance + ? WHERE id = ?`
**sem `user_id`**.

→ Atacante cria uma transação própria referenciando o `bank_id` da vítima e
altera diretamente a coluna `banks.balance` dela. Também "polui" os relatórios
da vítima (os JOINs em `reports/*` são `LEFT JOIN ... ON t.x = c.id` sem
`c.user_id`).

**Ação:** validar que `bankId`/`categoryId`/`creditCardId` pertencem a
`req.userId` antes do insert; `UPDATE banks ... WHERE id = ? AND user_id = ?`.

### 1.4 🟠 Mesma classe em `POST /api/forecasts`, `/api/credit-cards`, `/api/keyword-rules`, `/api/ofx-imports`

Todos aceitam `bankId`/`categoryId` do corpo sem checar posse. Impacto menor
(integridade / vazamento de nome de categoria/banco em relatórios via JOIN),
mas mesma correção: validar as FKs contra `req.userId`.

### 1.5 ⚪ `recalculateBankBalance(bankId)` (`server.js:709`)

Sem checagem de usuário, mas recalcula a partir das transações do próprio banco,
então é auto-corretivo. Só vira problema em conjunto com 1.3.

---

## 2. 🟠 JWT em localStorage

`App.tsx` — tokens em `localStorage`/`sessionStorage`.

**Estado:** access token agora vive 15 min (era 24 h / admin 12 h) e existe
`auth_sessions` com refresh rotativo + detecção de reuso + revogação
server-side (reset de senha, block, delete). Um token roubado ainda vale até o
access expirar (janela de 15 min, aceita como troca por não bater no banco a
cada request — mesmo modelo do `cliente_final`); o refresh roubado é detectado
na primeira rotação e mata a sessão.

Restante:
- Persistência em `localStorage` continua exposta a XSS. Mitigado pela CSP real
  em produção (§7) e pela remoção dos scripts de terceiros do `index.html`.
- `JWT_SECRET` já é fail-fast em produção (§0/§4).

**Ação restante (longo prazo):**
- Cookie `httpOnly; Secure; SameSite=Lax` para o refresh + token anti-CSRF, em
  vez de `localStorage`.

---

## 3. 🟠 CORS liberado (`cors()`)

`server.js:98` → `Access-Control-Allow-Origin: *`, todos os métodos, sem
credenciais.

Como a auth é `Authorization: Bearer` (não cookie), o `*` **não** deixa um site
terceiro ler respostas autenticadas sem antes roubar o token — o impacto é
menor que em auth por cookie. Ainda assim: qualquer origem fala com a API, não
há allowlist, e os endpoints públicos (`/api/global-banks`, `/api/pluggy/webhook`)
ficam abertos a todos.

**Ação:** allowlist explícita por env, no modelo `CORS_ORIGINS` do
`cliente_final`:

```js
app.use(cors({ origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean) }));
```

---

## 4. 🟠 AES-256-CBC em vez de GCM (dados LGPD: CNPJ, razão social, telefone)

`server.js:61-83`.

1. **Sem autenticação** (CBC puro, sem HMAC/tag) → ciphertext maleável, sem
   integridade.
2. `decrypt()` no `catch` **retorna a entrada intacta** (`catch (e) { return text; }`,
   `server.js:82`). Consequências:
   - dado corrompido passa silenciosamente como se fosse "texto plano";
   - se `ENCRYPTION_KEY` mudar/sumir, todas as leituras de PII devolvem
     ciphertext sem erro nenhum (o AdminPanel mostra lixo);
3. **`ENCRYPTION_KEY` é opcional** (`server.js:49-57`). Sem a env,
   `keyBuffer = crypto.randomBytes(32)` **por processo**. Em Cloud Run
   (efêmero, N instâncias) cada instância tem uma chave diferente → dado
   cifrado pela instância A é ilegível na B, e todo restart perde o histórico.
   Isso é **perda de dados latente**, não só "hygiene de cripto".

**Ação:**
- `ENCRYPTION_KEY` obrigatório (32 bytes hex), fail-fast se ausente/!=32.
- Migrar para `aes-256-gcm` (IV de 12 bytes + authTag), com prefixo de versão
  no blob (`v2:iv:tag:ct`) para permitir leitura do formato antigo durante a
  migração.
- `decrypt()` deve **lançar** em falha, não devolver o input.

---

## 5. 🟠 Validação de entrada da API

**✅ CORRIGIDO.** `src/server/schemas.js` (um schema zod por endpoint de
escrita) + `middleware/validate.js` (`validateBody`). Aplicado em auth, banks,
cartões, categorias, transactions, forecasts, ofx, keyword-rules,
integration/settings e admin. Os schemas são `.loose()` (chave extra passa,
não quebra tela) mas travam os campos abaixo. `audit-signups?limit=` agora tem
teto 200. O texto original do achado segue para referência:

---

**Não existe** nenhuma validação de schema (sem zod / express-validator). Os
corpos são desestruturados e vão direto pra query. SQL é parametrizado (sem
SQLi), mas:

- `value` sem coerção/checagem → negativo, `NaN`, `1e308`, string. A coluna
  `NUMERIC(15,2)` rejeita não-numérico com **500**; valor negativo corrompe a
  matemática de saldo.
- `type` não restrito a `credito|debito`.
- `date` é `TEXT`; um valor inválido quebra `t.date::date` nos relatórios →
  500 (DoS auto-infligido).
- `email` nunca validado como email; `request-signup` / `recover-password`
  aceitam qualquer string.
- `express.json({ limit: '10mb' })` (`server.js:99`) — 10 MB é grande para
  payloads sem nenhum limite por rota.
- `parseInt(req.query.limit)` em `/api/admin/audit-signups` (`server.js:1531`)
  sem teto → `?limit=99999999`.

**Ação:** adotar zod (padrão do `cliente_final`): um schema por endpoint de
escrita, com `validateBody()` no middleware. Prioridade: `transactions`,
`forecasts`, `banks`, `integration/settings`, auth.

---

## 6. 🟠 Fluxo de recuperação / criação de senha

`server.js:444-534`, `FinalizeSignUp.tsx`, `ResetPassword.tsx`.

- 🟠 **Host header injection / reset poisoning.** `server.js:461` e `:520`
  montam o link do e-mail com `` `${req.protocol}://${req.get('host')}/...` ``.
  `Host` é controlado pelo cliente e `req.protocol` confia em
  `X-Forwarded-Proto` (`trust proxy = 1`). Atacante faz
  `POST /api/request-signup` (ou `/api/recover-password`) com
  `Host: evil.com` → a vítima recebe um e-mail com
  `https://evil.com/?action=reset&token=<token real>` → token phishado.
  **Ação:** usar `APP_URL` de env para montar o link; nunca `req.get('host')`.
- 🟠 **Token de signup nunca expira.** `complete-signup` (`server.js:491`)
  seleciona `WHERE token = ?` sem checar `created_at`. O link de ativação vale
  para sempre. **Ação:** expirar em 24–72 h.
- 🟡 **Reset token em texto plano no banco.** `server.js:518` grava
  `reset_token` cru; vazamento de DB → account takeover na janela de 1 h.
  **Ação:** guardar `sha256(token)`, comparar pelo hash.
- 🟡 **Sem política de senha** (nenhum comprimento mínimo, cliente ou
  servidor). `complete-signup` / `reset-password-confirm` aceitam qualquer
  coisa. **Ação:** mínimo 8–10 chars no servidor.
- 🟡 `validate-signup-token` (`server.js:484`) devolve `email` + `razaoSocial`
  (PII descriptografada) para quem tiver o token. Token é forte, mas o link
  vaza por referer/proxy/compartilhamento.
- ⚪ `reset-password-confirm` não limpa `reset_token_expires` (só põe
  `reset_token = NULL`, o que já basta).
- ✅ `recover-password` responde sempre `200` com o mesmo corpo — sem
  enumeração de usuário. Bom.

---

## 7. 🟠 Proteção dos endpoints administrativos

**Autorização em si está OK:** todas as rotas `/api/admin/*` têm
`authenticateToken, checkAdmin` (`server.js:1486-1612`). Não há rota de
self-update de perfil, então **não há escalonamento para `role: 'admin'`** via
API. `checkAdmin` (`server.js:259`) confere `req.user.role`.

Fraquezas em volta:

- 🟠 **CSP desligada.** `server.js:97` — `helmet({ contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false })`. Nenhum header CSP → nada restringe
  origem de script; casa mal com token em localStorage (§2). Provavelmente
  desligaram por causa do Tailwind CDN + importmap `esm.sh` no `index.html`.
  **Ação:** CSP real (`default-src 'self'`; liberar só os hosts necessários) e,
  de preferência, remover o Tailwind CDN / importmap (§12).
- 🟠 **Credencial de admin única, em texto plano na env** (`PASSWORD_ADMIN`,
  `server.js:44`), comparada com `===` não-constante (`server.js:415`), **sem
  2FA** (o `cliente_final` tem 2FA por e-mail pro contador).
- 🟠 **Sem trilha de auditoria nas ações sensíveis.** `logAudit()` só é chamado
  em 3 lugares: login, login admin, signup (`server.js:417,429,508`).
  `DELETE /api/admin/users/:id` (hard delete de usuário + todos os dados,
  `server.js:1593`), `block`, alterações de bancos globais — **nada é
  registrado**. A tabela `audit_logs` existe e quase não é usada; não há
  endpoint pra lê-la.
- 🟡 `DELETE /api/admin/users/:id` — hard delete, sem soft-delete nem
  confirmação. Um bug no frontend apaga um cliente inteiro.
- 🟡 `POST/PUT /api/admin/banks` (`server.js:1547-1582`): grava logo a partir
  de base64. A regex `^data:image\/([A-Za-z-+\/]+);base64,(.+)$` deixa o grupo
  1 conter `/` → `fileName = bank_<ts>.a/b/c` → `path.join` escreve em
  subpastas não previstas (`..` é bloqueado, `/` não). Aceita SVG → servido
  como estático em `/logo/*.svg`; aberto direto executa script na mesma origem
  → **XSS armazenado** (disparável só por admin, mas o arquivo é público).
  **Ação:** whitelist de extensão (`png|jpg|jpeg|webp`), validar magic bytes,
  nome 100% aleatório, cap de tamanho.

---

## 8. 🟡 Rate limiting genérico demais

`server.js:101-106` — um único limiter, **500 req / 15 min / IP** em todo
`/api/`.

- Brute force de login: 500 tentativas / 15 min é permissivo demais.
- Sem limiter dedicado (mais apertado) em `/api/login`,
  `/api/recover-password`, `/api/reset-password-confirm`,
  `/api/request-signup` (bombardeio de e-mail), `/api/pluggy/webhook`.
- `express-rate-limit` com store em memória: zera no restart, **não é
  compartilhado entre instâncias** (Cloud Run escala → o limite real é
  N×500).

**Ação:** limiter estrito por rota sensível (ex.: 5–10/15 min em
`/api/login` e nos fluxos de senha, keyed por email+IP); store compartilhado
(Redis) se rodar multi-instância.

---

## 9. 🟡 `server.js` monolítico + shim SQLite→PG por regex

**Estado:** o monólito foi quebrado (branch `refactor/split-server`) em
`src/server/{config,db,schema,accounting}.js` + `middleware/` + `services/` +
`lib/` + `routes/*.routes.js`. `server.js` é bootstrap. O shim `db.*` foi
isolado em `src/server/db.js` (com comentário do porquê) mas **não** foi
removido — as ~40 queries que o usam continuam passando por `_convertQuery`.
Os modos de falha abaixo seguem válidos até o shim morrer.

`src/server/db.js` (`db` adapter) + `_convertQuery`.

Modos de falha concretos:

- `sql.replace(/\?/g, () => '$' + (i++))` troca **todo** `?`, inclusive dentro
  de string literal e dos operadores JSONB do Postgres (`?`, `?|`, `?&`,
  `->>`… hoje não usados, mas é uma armadilha).
- `/\bINTEGER\b/g → INT` e `/\bREAL\b/g → NUMERIC(15,2)` rodam em **toda**
  query, inclusive `SELECT`. Um literal `SELECT 'INTEGER'` quebra. Hoje o
  impacto é baixo porque o DDL virou `pool.query` cru, mas a conversão continua
  ligada em tudo.
- `db.get` tem caso especial para coluna chamada `count` (`server.js:183`).
- Existem **dois caminhos** com semântica diferente: o adapter `db.*` (que
  ainda adivinha `RETURNING id` por match de string em `server.js:146`) e
  `pool.query` cru. Difícil raciocinar sobre o conjunto — e cada correção de
  segurança acima fica mais arriscada por causa disso.

**Ação:** não é urgência de segurança, mas é bomba-relógio de correção. São
~40 queries: portar para `pool.query` com `$n` direto e **deletar o shim**;
quebrar `server.js` em `routes/` + `services/` como no `cliente_final`.
Enquanto o shim existir, toda mudança precisa ser testada contra o Postgres
real.

---

## 10. 🟡 `db_init()` altera schema no boot

**✅ CORRIGIDO.** `src/server/migrations/*.sql` (numeradas) + `migrate.js`
(runner: tracking em `schema_migrations`, 1 transação por migration, advisory
lock contra runners concorrentes) + `migrate-cli.js`. `0001_baseline.sql` é
idempotente e reconcilia o DB de produção que já existe. `npm run migrate` e o
hook `prestart` aplicam como passo de deploy (deploy falha se a migration
falhar); o server aplica pendentes no boot como rede de segurança e, em prod,
**aborta** se falhar (nada de schema meio-migrado silencioso). `ensureColumn`
(que engolia erros) foi removido. O texto original segue para referência:

---

`server.js:337-401` — `CREATE TABLE IF NOT EXISTS` + `ensureColumn`
(`ALTER TABLE ADD COLUMN IF NOT EXISTS`) a cada startup. É o **oposto** da regra
do `cliente_final` (schema só por migration; `initDb()` só testa conexão).

- `ensureColumn` engole erros (`server.js:226`) → drift de schema passa
  despercebido.
- Sem versão de schema, sem down migration, sem histórico → impossível saber
  em que estado um DB está.
- **Race em deploy concorrente:** Cloud Run sobe a instância nova enquanto a
  velha roda → dois processos rodando `CREATE TABLE` / `ALTER TABLE`
  simultâneos. `ALTER TABLE` pega lock `ACCESS EXCLUSIVE`; erros são engolidos;
  pior caso, um boot segue com schema meio-migrado.
- Seed de `global_banks` (`server.js:391`) tem a mesma race.

**Ação:** adotar migrations (drizzle-kit ou node-pg-migrate). `db_init` passa a
só testar conexão. Rodar `migrate` como passo separado do deploy (o
`cliente_final` faz `prestart`/`predev`).

---

## 11. 🟠 Webhook Pluggy sem verificação de assinatura

`server.js:817-841` — `POST /api/pluggy/webhook`, público, sem nenhuma
verificação.

Impacto: qualquer um forja `item/created` / `item/updated` / `item/error`:

- insere linhas arbitrárias em `pluggy_connections` (sem `user_id` nesse
  caminho) — inserção ilimitada de linhas;
- `item/error` seta `status = 'ERROR'` em qualquer `item_id` conhecido →
  desliga a integração da vítima (`/api/pluggy/accounts` filtra
  `status != 'ERROR'`);
- só o limiter global protege.

**Ação:** validar a assinatura do webhook conforme doc da Pluggy, ou exigir um
segredo longo aleatório no path/header. Rate-limit dedicado. Não logar o corpo
cru.

---

## 12. Dependências e build

`npm audit`: **1 crítica / 11 altas / 4 moderadas / 3 baixas.**

- A maioria (`tar` crítica, `cacache`, `node-gyp`, `make-fetch-happen`,
  `@tootallnate/once`, `http-proxy-agent`, e a própria `sqlite3` alta) vem de
  **`sqlite3`, que não é mais usado** (migrou pra Postgres). Remover `sqlite3`
  do `package.json` mata quase todo o relatório **e** permite tirar
  `python3 make g++` do `Dockerfile`.
- `esbuild`/`vite` moderada: o dev server aceita requisição de qualquer site e
  devolve o conteúdo transformado de arquivos locais. **Explorável em produção**
  por causa do §0.2 (dev server rodando em prod). Corrigir o `NODE_ENV` já
  neutraliza; atualizar o Vite também.
- `nodemailer` alta, `express` moderada, `postcss` alta, `nanoid` alta:
  atualizar (`express` e `postcss` têm fix não-major).
- `index.html:8` carrega **Tailwind via CDN** (`cdn.tailwindcss.com`) em
  produção — script de terceiro com acesso total ao DOM em toda página,
  inclusive login. `index.html:57-83` tem um **importmap apontando todas as
  deps pra `esm.sh`** (resíduo do template do AI Studio; inclui até `express`,
  `sqlite3`, `jsonwebtoken`), e a versão de React no importmap (19) diverge do
  `package.json` (18.2). **Ação:** usar o Tailwind do build (plugin PostCSS,
  que já está nas devDeps) e remover o importmap.
- `Dockerfile`: roda como **root**, `npm install` (não `npm ci`, sem
  `--omit=dev`), `chmod 777 /backup`. **Ação:** `npm ci`, `USER node`, permissão
  mínima no volume.
- `nginx.conf` tem 4 bytes de lixo binário (`b1 ea ef 7a`) e não é usado pelo
  `Dockerfile` (que faz `npm start` → node). Arquivo morto — remover ou
  preencher.

---

## 13. Outros

- 🟡 **Logs vazam segredos.** `server.js:159,171,187,213` logam
  `err.message + query + params` em toda falha de DB. `params` contém hash
  bcrypt, `reset_token`, PII cifrada, token de integração → tudo nos logs do
  Cloud Run. **Ação:** não logar `params`; logar só o código do erro.
- 🟡 **`GET /api/integration/settings`** (`server.js:886`) devolve `rows[0]`
  cru, incluindo o `token` NFe em texto plano — mesmo anti-padrão que o
  `cliente_final` proíbe ("nunca devolver row crua"). O `token` também é
  gravado sem cifra (`integration_settings.token`). **Ação:** DTO; cifrar o
  token com o mesmo mecanismo da PII.
- ⚪ `sendEmail` retorna `true` quando `MAIL_SERVER` não está setado
  (`server.js:273`) — signup/reset "dão certo" sem enviar nada. Operacional.
- ⚪ `PluggyConnectWidget.tsx:87` — `includeSandbox={true}` em produção.
- ⚪ `/api/pluggy/webhook` e `console.log` do `event.event` — log injection
  menor.

---

## Ordem sugerida de trabalho

**Agora (antes de qualquer commit / deploy):**
1. `.gitignore` + `.dockerignore` (§0.1); rotacionar chaves se `.env` já subiu.
2. `NODE_ENV=production` no Dockerfile (§0.2).
3. Corrigir os 3 IDOR: `pluggy/item` (§1.1), `forecasts DELETE` (§1.2),
   `transactions` balance (§1.3).
4. `blocked` + `JWT_SECRET`/`ENCRYPTION_KEY` obrigatórios com fail-fast
   (§0.3, §2, §4).

**Sprint 1:**
5. Host header injection no reset (§6) + expiração do token de signup.
6. Assinatura do webhook Pluggy (§11).
7. Rate limiter dedicado nas rotas de auth (§8).
8. Remover `sqlite3`, atualizar `express`/`postcss`/`vite`/`nodemailer` (§12).
9. CSP real + remover Tailwind CDN/importmap (§7, §12).

**Sprint 2 (estrutural):**
10. ✅ zod em todos os endpoints de escrita (§5).
11. ✅ Migrations no lugar do `db_init` (§10).
12. ~~Quebrar `server.js` em módulos~~ ✅ (`refactor/split-server`); matar o shim SQLite→PG ainda pendente (§9).
13. ✅ AES-GCM + leitura do formato CBC legado (§4).
14. ✅ Modelo de sessão: access 15 min + refresh rotativo com detecção de reuso + `auth_sessions` (§2).
15. ✅ `logAudit` nas ações de admin + `GET /api/admin/audit` (§7).
