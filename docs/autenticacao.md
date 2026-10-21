# Autenticação

## Como funciona

- **Access token** (JWT, 15 min): vai no header `Authorization: Bearer <token>` de toda
  requisição protegida. Contém o id do usuário (`sub`) e o perfil (`role`).
- **Refresh token** (aleatório, 30 dias): serve só para pedir um novo par de tokens quando o
  access token expira. No banco guardamos apenas o hash dele (`refresh_tokens`).
- A cada refresh o token antigo é invalidado (rotação). Se um refresh token já usado for
  reaproveitado, todas as sessões do usuário são encerradas (proteção contra roubo).
  Essa troca é feita pela procedure `sp_rotate_refresh_token`, em transação.
- Cadastro, login (inclusive com falha) e logout ficam registrados no MongoDB
  (`access_logs`), ver [banco-nao-relacional.md](banco-nao-relacional.md).
- No app, os dois tokens ficam no **SecureStore** (Keychain/Keystore). O `api()` de
  `mobile/src/services/api.ts` renova a sessão sozinho quando recebe 401.

## Endpoints

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, phone }` | `201 { user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `200 { user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `200 { user, accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| POST | `/auth/forgot-password` | `{ email }` | `200 { message, expiresInMinutes, code? }` |
| POST | `/auth/reset-password` | `{ email, code, password }` | `204` |

O **telefone é obrigatório** no cadastro (com DDD; aceita com ou sem máscara e é guardado como
`(19) 99999-8888`). O cadastro público cria sempre um **CUSTOMER**. Proprietária e motoboys são criados de
outra forma (ver módulo da proprietária).

### Erros

Todas as rotas respondem erros no formato `{ "error": "mensagem" }`. Erros de validação
trazem também `issues: [{ field, message }]`.

| Status | Quando |
|---|---|
| 400 | Dados inválidos |
| 401 | Login/senha errados, token inválido ou expirado |
| 403 | Usuário desativado |
| 409 | E-mail já cadastrado |
| 429 | Login bloqueado por senhas erradas (ver abaixo) |

### Limite de tentativas de login

Proteção contra quem tenta adivinhar a senha (script `023_users_login_attempts.sql`):

- Até a 5ª senha errada seguida: só "E-mail ou senha inválidos".
- Da 6ª à 9ª: a mensagem avisa quantas tentativas restam ("Restam 4 tentativas antes do bloqueio de 10 minutos").
- Na 10ª: **429**, login bloqueado por **10 minutos**. Durante o bloqueio nem a senha certa entra
  (a senha nem é conferida) e a mensagem diz quanto falta.
- Passado o bloqueio, a pessoa ganha as 10 tentativas de novo. Acertar a senha zera o contador.

No banco, `users.failed_login_attempts` e `users.locked_until` (UTC). A soma e o bloqueio são feitos
pela procedure `sp_register_login_failure` num UPDATE só (duas tentativas ao mesmo tempo não se perdem);
`sp_reset_login_failures` zera tudo no login certo. Os dois campos nunca vão para o app. Cada tentativa
com a conta bloqueada é registrada no MongoDB como `LOGIN_LOCKED`. Limites em `auth.service.ts`
(`MAX_LOGIN_ATTEMPTS`, `WARN_AFTER_ATTEMPTS`, `LOCK_MINUTES`).

### Esqueci minha senha

Script `024_password_resets.sql`. Na tela de login, **Esqueci minha senha** abre a recuperação em dois passos:

1. `POST /auth/forgot-password { email }` gera um código de **6 números**, válido por **15 minutos**.
   Pedir outro invalida o anterior. E-mail sem conta ativa → 404.
2. `POST /auth/reset-password { email, code, password }` troca a senha. Código errado avisa quantas
   tentativas restam; no 5º erro o código deixa de valer.

**Simulação do e-mail (decisão da equipe):** o projeto não tem serviço de e-mail, então o código volta na
resposta (`code`) e o app mostra na tela, num quadro "E-mail (simulado)". Isso só acontece fora de produção
(`NODE_ENV` diferente de `production` e `SHOW_RESET_CODE` diferente de `false`). Para enviar de verdade, basta
mandar o código por e-mail em `PasswordResetService.requestCode` e não devolver mais na resposta.

No banco guardamos só o hash do código (`password_resets.code_hash`). A troca é feita pela procedure
`sp_complete_password_reset`, numa transação: troca a senha, marca o código como usado, **tira o bloqueio de
login**, **encerra todas as sessões abertas** (outros aparelhos precisam entrar de novo) e registra
`password` na `user_audit`.

## Usando no app

```ts
import { api } from '@/services/api';

// rota protegida: o token é enviado automaticamente
const pedidos = await api<Pedido[]>('/orders');

// rota pública
await api('/menus/today', { auth: false });
```

## Perfis e rotas protegidas (backend)

Perfis: `CUSTOMER` (cliente), `OWNER` (proprietária) e `COURIER` (motoboy).

Dois middlewares em `backend/src/shared/middlewares/`:

- `authenticate` — exige token válido e preenche `req.user = { id, role }`. Sem token ou
  token inválido/expirado → **401**.
- `authorize(...perfis)` — libera só para os perfis informados. Outro perfil → **403**.

```ts
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';

// módulo inteiro só da proprietária (em routes.ts)
routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);

// rota específica para mais de um perfil
router.get('/orders/:id', authenticate, authorize('CUSTOMER', 'OWNER'), ordersController.show);

// dentro do controller
const userId = req.user!.id;
```

### Perfil do usuário logado

| Método | Rota | Resposta |
|---|---|---|
| GET | `/users/me` | `200 { id, name, email, phone, role, active, createdAt, updatedAt }` |
| PUT | `/users/me` | `{ name, phone }` → `200` com o perfil atualizado (o e-mail não muda: é o login) |
| PUT | `/users/me/password` | `{ currentPassword, newPassword }` → `204` (senha atual errada → 400) |
| GET | `/users/me/access-logs` | `200 [{ event, success, user, device, createdAt }]` (últimos 20, MongoDB) |
| GET | `/users?role=COURIER` | `200 [{ ..., roleLabel, activeSessions }]` — **só OWNER** (view `vw_users`) |

Na tela **Meu perfil** do app (todos os perfis) dá para editar nome e telefone e trocar a senha.
No banco (script `025_users_profile.sql`), o trigger `trg_users_after_update` passou a registrar também
mudanças de **nome** e **telefone** na `user_audit`, e a troca de senha usa a procedure `sp_change_password`
(registra `password` na auditoria, sem guardar a senha).

## Criando usuários de teste (proprietária, motoboy)

O cadastro pelo app só cria clientes. Para os outros perfis:

```bash
cd backend
npm run user:create -- --name "Dona Maria" --email maria@teste.com --password 123456 --role OWNER
npm run user:create -- --name "João Motoboy" --email joao@teste.com --password 123456 --role COURIER
```
