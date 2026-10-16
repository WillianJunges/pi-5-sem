# Banco não relacional (MongoDB) — desnormalização

Requisito da disciplina de Laboratório de Banco de Dados: *desnormalizar a base relacional
para um banco não relacional (MongoDB), com conexão e manipulação de dados*.

## Papel de cada banco

| | MySQL (relacional) | MongoDB (não relacional) |
|---|---|---|
| Função | Fonte da verdade: cadastros e transações | Leitura rápida, histórico e dados de alto volume |
| Modelo | Normalizado (tabelas + chaves estrangeiras) | Desnormalizado (documentos com dados embutidos) |
| Exemplos | usuários, produtos, pedidos, pagamentos | histórico de acessos, pedido "pronto para exibir", pontos de GPS |

**Regra:** o MySQL é gravado primeiro; o Mongo recebe uma cópia desnormalizada.
Se o Mongo estiver fora do ar, a operação principal **não falha** (só o histórico deixa de
ser gravado).

## O que é desnormalizar

Na base relacional, um pedido fica espalhado em várias tabelas ligadas por chaves:

```
orders ──┬── users (cliente)
         ├── addresses
         ├── order_items ── products
         └── deliveries ── users (motoboy)
```

Para mostrar um pedido são necessários vários JOINs. No MongoDB, o mesmo pedido vira **um
único documento** com tudo embutido. São cópias dos dados *no momento do pedido*: se o
preço do produto mudar amanhã, o pedido antigo continua mostrando o preço pago.

## Implementado no módulo base: `access_logs`

Histórico de acessos (cadastro, login, login com falha, logout).

```json
{
  "event": "LOGIN",
  "success": true,
  "email": "ana@email.com",
  "user": { "id": "f382...", "name": "Ana", "email": "ana@email.com", "role": "CUSTOMER" },
  "device": { "ip": "192.168.0.15", "userAgent": "okhttp/4.12" },
  "createdAt": "2026-10-15T16:30:36.000Z"
}
```

- `user` é uma **cópia embutida** (desnormalização): lê o histórico sem JOIN e preserva o
  nome/perfil que o usuário tinha na época.
- Índice `{ "user.id": 1, createdAt: -1 }` para buscar os acessos de um usuário.
- Índice **TTL** em `createdAt`: o MongoDB apaga sozinho registros com mais de 180 dias.
- Gravação: `AuthService` (`backend/src/modules/auth/auth.service.ts`).
- Leitura: `GET /users/me/access-logs` (últimos 20 acessos do usuário logado).

Código: `backend/src/config/mongo.ts` (conexão) e `backend/src/modules/access-logs/`.

## Proposta para os outros módulos

### `orders` — Cliente / Proprietária

```json
{
  "orderId": "uuid do MySQL",
  "status": "PREPARING",
  "customer": { "id": "...", "name": "Ana", "phone": "11999990001" },
  "address": { "street": "Rua X", "number": "100", "district": "Centro", "city": "Indaiatuba" },
  "items": [
    { "productId": "...", "name": "Marmita Grande", "variation": "Frango", "unitPrice": 25.0, "quantity": 2, "subtotal": 50.0 }
  ],
  "totals": { "subtotal": 50.0, "deliveryFee": 5.0, "total": 55.0 },
  "statusHistory": [
    { "status": "PENDING", "at": "2026-10-15T11:02:00Z" },
    { "status": "CONFIRMED", "at": "2026-10-15T11:05:00Z" }
  ],
  "delivery": { "courier": { "id": "...", "name": "João" }, "startedAt": null, "finishedAt": null },
  "createdAt": "2026-10-15T11:02:00Z"
}
```

Uso: histórico do cliente e painel da proprietária em **uma consulta**, sem JOIN.

### `menus` — Proprietária (implementado)

```json
{
  "menuId": "...",
  "date": "2026-10-15",
  "status": "ACTIVE",
  "items": [
    {
      "productId": "...", "name": "Marmita de Frango", "description": "...", "category": "marmitas",
      "price": 20.0,
      "variations": [
        { "variantId": "...", "name": "Pequena", "price": 20.0, "standardPrice": 20.0 },
        { "variantId": "...", "name": "Média",   "price": 22.9, "standardPrice": 25.0 }
      ]
    }
  ],
  "updatedAt": "2026-10-15T11:00:00Z"
}
```

Cada variação tem o próprio preço (escopo, seção 7). `price` do produto é o menor deles ("a partir de").
O documento é regravado sempre que o cardápio ativo ou o catálogo muda; ao encerrar, o status vira `CLOSED`.
Se o Mongo estiver fora do ar, `GET /menus/today` lê do MySQL (view `vw_menu_items`).
Código: `backend/src/modules/menus/menuSnapshots.repository.ts`.

Uso: o app do cliente busca o cardápio do dia com uma única leitura.

### `delivery_tracking` — Motoboy

```json
{
  "deliveryId": "...",
  "orderId": "...",
  "courier": { "id": "...", "name": "João" },
  "points": [
    { "lat": -23.09, "lng": -47.21, "at": "2026-10-15T11:40:05Z" },
    { "lat": -23.091, "lng": -47.212, "at": "2026-10-15T11:40:15Z" }
  ]
}
```

Uso: grande volume de pontos de GPS gravados a cada poucos segundos. Isso é custoso numa
tabela relacional e natural em documento (`$push` no array `points`).

## Como manipular (exemplo para os módulos)

```ts
import { getMongoDb } from '../../config/mongo';

const orders = (await getMongoDb()).collection('orders');

await orders.insertOne({ orderId, status: 'PENDING', customer: {...}, items: [...], createdAt: new Date() });
await orders.updateOne({ orderId }, { $set: { status: 'CONFIRMED' }, $push: { statusHistory: { status: 'CONFIRMED', at: new Date() } } });
const historico = await orders.find({ 'customer.id': userId }).sort({ createdAt: -1 }).toArray();
```

Siga o mesmo padrão de `modules/access-logs/`: interface do repository + implementação
Mongo + implementação "desligada" para quando `MONGO_URL` não estiver configurado.
