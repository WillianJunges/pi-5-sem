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
| POST | `/auth/register` | `{ name, email, password, phone? }` | `201 { user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `200 { user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `200 { user, accessToken, refreshToken }` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |

O cadastro público cria sempre um **CUSTOMER**. Proprietária e motoboys são criados de
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
| GET | `/users/me/access-logs` | `200 [{ event, success, user, device, createdAt }]` (últimos 20, MongoDB) |
| GET | `/users?role=COURIER` | `200 [{ ..., roleLabel, activeSessions }]` — **só OWNER** (view `vw_users`) |

## Criando usuários de teste (proprietária, motoboy)

O cadastro pelo app só cria clientes. Para os outros perfis:

```bash
cd backend
npm run user:create -- --name "Dona Maria" --email maria@teste.com --password 123456 --role OWNER
npm run user:create -- --name "João Motoboy" --email joao@teste.com --password 123456 --role COURIER
```
