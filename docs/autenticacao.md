# Autenticação

## Como funciona

- **Access token** (JWT, 15 min): vai no header `Authorization: Bearer <token>` de toda
  requisição protegida. Contém o id do usuário (`sub`) e o perfil (`role`).
- **Refresh token** (aleatório, 30 dias): serve só para pedir um novo par de tokens quando o
  access token expira. No banco guardamos apenas o hash dele (`refresh_tokens`).
- A cada refresh o token antigo é invalidado (rotação). Se um refresh token já usado for
  reaproveitado, todas as sessões do usuário são encerradas (proteção contra roubo).
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
