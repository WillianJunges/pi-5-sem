# Módulo da Proprietária (Lucas)

Primeira entrega do módulo: **produtos e variações**, **cardápios com preço especial** e
**faixas de taxa de entrega** (itens 2, 3 e 7 da divisão de atividades), mais a rota pública
do **cardápio do dia**, usada pelo app do Cliente.

> **Dinheiro em reais** na API e no banco (`22.5` = R$ 22,50; `DECIMAL(10,2)` no MySQL).
> Por dentro, as regras de negócio calculam em centavos para não errar arredondamento.
> **Distância em km** na API e em metros no banco.

## Como testar rápido

```bash
cd backend
npm run db:migrate          # aplica os scripts 009 a 015
npm run db:seed:catalog     # produtos do Di Casa, faixas de taxa e um cardápio ATIVO para hoje
npm run dev
# GET http://localhost:3333/menus/today  → cardápio do dia, sem login
```

Para as rotas `/owner`, faça login com uma conta de proprietária
(`npm run user:create -- --name "Dona Maria" --email maria@email.com --password 123456 --role OWNER`)
e envie `Authorization: Bearer <accessToken>`.

## Regras

**Produtos e variações** (escopo, seção 7)
- Produto: nome único (sem diferenciar maiúsculas e acentos), descrição e categoria opcionais, e ao menos uma variação.
- Cada variação (ex.: Pequena, Média, Grande) tem seu **preço padrão**.
- Produto ou variação **já usado em pedido não é excluído**, só desativado (preserva o histórico).
- Produto ativo precisa de ao menos uma variação ativa.

**Cardápios** (seção 8)
- Montado com variações do catálogo; cada item pode ter **preço especial**, que **não altera o preço padrão**.
- Estados **DRAFT → ACTIVE → CLOSED**. Só rascunho pode ser excluído; encerrado não muda (garantido também por trigger).
- **Um cardápio ativo por vez** (garantido pela procedure `sp_activate_menu`, com bloqueio). *A confirmar com a equipe: o escopo não diz.*
- Cardápio ativo não pode ficar vazio.
- Produto desativado durante o dia **some do cardápio do cliente na hora**.

**Faixas de taxa** (seção 19)
- A faixa cobre distâncias **maiores** que o início e **até** o fim. Com 0–5 km e 5–10 km, exatamente 5 km fica na primeira.
- Faixas não podem se sobrepor (encostar na ponta pode). Garantido também por trigger.
- Nenhuma faixa cobre a distância → **fora da área atendida**.
- Remover só desativa (os pedidos guardam a taxa aplicada).

## Rota pública: cardápio do dia — `GET /menus/today`

Devolve o cardápio **ativo cuja data é hoje** (fuso de São Paulo), só com itens disponíveis,
agrupados por produto. Sem cardápio hoje: **404** `{ "error": "Nenhum cardápio disponível hoje" }`.

```json
{
  "menuId": "5faa92bc-...",
  "date": "2026-10-15",
  "status": "ACTIVE",
  "items": [
    {
      "productId": "8c1e...",
      "name": "Marmita de Frango",
      "description": "Frango grelhado com arroz, feijão e salada",
      "category": "marmitas",
      "price": 20,
      "variations": [
        { "variantId": "a1...", "name": "Pequena", "price": 20, "standardPrice": 20 },
        { "variantId": "b2...", "name": "Média", "price": 22.9, "standardPrice": 25 },
        { "variantId": "c3...", "name": "Grande", "price": 30, "standardPrice": 30 }
      ]
    }
  ]
}
```

- `price` do produto = menor preço entre as variações ("a partir de").
- `variations[].price` = preço que vale (já com o preço especial). `standardPrice` permite mostrar "de R$ 25,00 por R$ 22,90".
- **Diferença para o mock atual do app do Cliente:** lá `variations` é uma lista de nomes e o preço é único
  por produto. Pelo escopo, **cada variação tem seu preço**, então `variations` vem como objeto. No app,
  ao escolher a variação, use `variation.price` como `unitPrice` e guarde o `variantId` no carrinho —
  o pedido precisa dele (escopo, seção 9: o item do pedido registra produto **e variação**).

### Para o módulo de pedidos (Cliente)

- **Preço do item:** `menusService.priceForOrder(variantId)` devolve o preço que vale hoje (em centavos)
  ou erro 409 se o item não estiver no cardápio. O backend nunca deve confiar no preço vindo do app.
- **Taxa:** `deliveryFeesService.quote(distanciaEmMetros)` → `{ covered, feeCents }`, ou a function
  `fn_delivery_fee(distancia_metros)` direto no SQL (NULL = fora da área).
- **Histórico:** a tabela de itens do pedido deve se chamar `order_items` e ter a coluna `variant_id`.
  É ela que impede excluir produto já vendido.

## Rotas da proprietária — `/owner` (perfil OWNER)

| Método | Rota | Corpo / observação |
|---|---|---|
| GET | `/owner/products` | Lista (inclui desativados) |
| POST | `/owner/products` | `{ name, description?, category?, variants: [{ name, price }] }` |
| GET · PUT · DELETE | `/owner/products/:id` | PUT: `{ name, description?, category? }` |
| PATCH | `/owner/products/:id/active` | `{ active: true \| false }` |
| POST | `/owner/products/:id/variants` | `{ name, price }` |
| PUT · DELETE | `/owner/variants/:id` | PUT: `{ name, price }` |
| PATCH | `/owner/variants/:id/active` | `{ active }` |
| GET | `/owner/menus?status=ACTIVE` | Lista (status opcional) |
| POST | `/owner/menus` | `{ name, menuDate: "2026-10-15" }` |
| GET · PUT · DELETE | `/owner/menus/:id` | GET traz os itens com nomes, preços e `available` |
| POST | `/owner/menus/:id/activate` · `/close` | Muda o estado |
| POST | `/owner/menus/:id/items` | `{ variantId, specialPrice? }` |
| PATCH | `/owner/menus/:id/items/:itemId` | `{ specialPrice }` (ou `null` para tirar) |
| DELETE | `/owner/menus/:id/items/:itemId` | Retira o item |
| GET | `/owner/delivery-fees` | Lista em km e reais |
| POST · PUT | `/owner/delivery-fees` · `/:id` | `{ minKm, maxKm, fee }` |
| DELETE | `/owner/delivery-fees/:id` | Desativa |
| GET | `/owner/delivery-fees/quote?distanceKm=3.2` | Simula a taxa |

Erros seguem o padrão do módulo base: `{ "error": "mensagem" }` (e `issues` quando os dados são inválidos).

## Banco de dados

Scripts `009` a `015` em `database/schema/`. Detalhes em [banco-de-dados.md](banco-de-dados.md).
O cardápio do dia também é copiado no MongoDB (coleção `menus`), ver [banco-nao-relacional.md](banco-nao-relacional.md).

## Testes

```bash
cd backend
npm test                   # 83 testes de regra de negócio, sem banco
npm run test:integration   # 13 testes HTTP → Controller → Service → Repository → MySQL, com login real
```

Os testes de integração criam e apagam um banco separado, `marmitaria_test`. O usuário do banco
precisa de permissão para isso; se não tiver, rode uma vez como root:
`CREATE DATABASE marmitaria_test; GRANT ALL ON marmitaria_test.* TO 'marmitaria'@'%';`

## Próximos passos do módulo

- Telas da proprietária no app (`mobile/app/(app)/owner/`)
- Cadastro e gestão de motoboys (usa `users` e `sp_create_user` do módulo base)
- Administração de pedidos e atribuição de entregas (depende de pedidos e entregas)
- Notificações da proprietária
