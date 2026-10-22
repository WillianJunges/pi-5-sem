# Motoboy — etapa 2: banco e API de entregas

Esta etapa implementa a logística no backend. As telas, fila SQLite offline, GPS,
Socket.IO e notificações dependem da aprovação das etapas seguintes.

## Preparação

Com MySQL disponível e `backend/.env` configurado:

```bash
cd backend
npm ci
npm run db:migrate
npm run dev
```

A migration `026_create_deliveries.sql` acrescenta apenas `deliveries` e dois triggers.
Não modifica as colunas de `orders`, os scripts 001–025, o MongoDB ou o mobile.
`npm run db:migrate` pula scripts já registrados em `schema_migrations`.

## Dados e integridade

`deliveries` guarda:

- UUID da entrega, pedido único (`order_id`) e motoboy atribuído (`courier_id`, inicialmente nulo).
- Status `WAITING_ASSIGNMENT`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED` ou `CANCELLED`.
- Snapshot JSON com label, rua, número, complemento, bairro, cidade, UF, CEP e coordenadas.
- Horários de criação, atribuição, início, conclusão, recebimento da conclusão e cancelamento.
- `completion_key` única para reconhecer reenvios de uma conclusão.

FKs validam pedido e usuário. Índices atendem consultas por motoboy/status. Constraints
impedem iniciar sem atribuição e concluir sem horários/chave. O trigger
`trg_deliveries_snapshot_immutable` preserva a identidade do pedido e o endereço original.
Os horários da aplicação são UTC; dinheiro é tratado em centavos no backend e reais no JSON.

O trigger `trg_orders_delivery_logistics` cria a entrega quando o pedido passa de
PENDING para CONFIRMED, usando UUID gerado no MySQL. A criação participa da transação
da confirmação. O cancelamento permitido até READY atualiza a entrega na mesma transação.
Pedidos PICKUP não geram entrega e continuam usando a rota de retirada existente.

A migration também cria entregas sem motoboy para pedidos DELIVERY antigos nos estados
CONFIRMED, PREPARING e READY, preservando os pedidos. Ela deixa PENDING, OUT_FOR_DELIVERY,
DELIVERED e CANCELLED intactos. Se houver pedidos antigos já na rua sem associação
confiável a motoboy, precisam de reconciliação específica antes de usar esta API; a
migration não inventa responsável, início ou conclusão.

## Estados e transações

| Operação | Pedido antes → depois | Entrega antes → depois |
|---|---|---|
| Confirmação pela proprietária | PENDING → CONFIRMED | Inexistente → WAITING_ASSIGNMENT |
| Atribuição/troca pela proprietária | CONFIRMED, PREPARING ou READY: mantém | WAITING_ASSIGNMENT/ASSIGNED → ASSIGNED |
| Início pelo motoboy atribuído | READY → OUT_FOR_DELIVERY | ASSIGNED → IN_PROGRESS |
| Conclusão pelo motoboy atribuído | OUT_FOR_DELIVERY → DELIVERED | IN_PROGRESS → COMPLETED |
| Cancelamento permitido pela proprietária | Até READY → CANCELLED | WAITING_ASSIGNMENT/ASSIGNED → CANCELLED |

Um motoboy pode ter várias entregas em andamento. A troca de motoboy termina quando a
entrega começa. Clientes consultam apenas entregas de seus pedidos; motoboys consultam
somente as atribuídas a eles; OWNER pode consultar e atribuir. Usuários desativados ou
com perfil diferente do token são recusados mesmo antes de o JWT expirar.

O service mantém as regras de negócio. O repository abre a transação e bloqueia primeiro
Order e depois Delivery, sempre nessa ordem. A decisão do service é executada com esse
estado bloqueado: uma leitura anterior à transação não autoriza uma mudança concorrente.
A sessão e a elegibilidade do motoboy também são revalidadas sob lock. Falhas em qualquer
UPDATE desfazem os dois estados. Use as rotas de transição para operar entregas; updates
manuais de status isolados não substituem essas transações.

## Contratos HTTP

Todas as rotas exigem `Authorization: Bearer <accessToken>` da autenticação existente.
`id` é o UUID da entrega; na rota `/order/:id`, é o UUID do pedido.

| Método e rota | Perfil | Finalidade |
|---|---|---|
| `GET /deliveries/me?active=true&limit=20&offset=0` | COURIER | Página de entregas atribuídas/em andamento |
| `GET /deliveries/me?active=false` | COURIER | Histórico de concluídas/canceladas |
| `GET /deliveries/order/:id` | OWNER, cliente dono ou motoboy atribuído | Descobrir a entrega de um pedido |
| `GET /deliveries/:id` | OWNER, cliente dono ou motoboy atribuído | Detalhes da entrega |
| `POST /owner/deliveries/:id/assign` | OWNER | Atribuir ou trocar motoboy antes do início |
| `PATCH /deliveries/:id/start` | COURIER atribuído | Iniciar com confirmação online |
| `POST /deliveries/:id/complete` | COURIER atribuído | Concluir com chave idempotente |

A listagem retorna `{ deliveries: [...], hasMore: boolean }`. `limit` aceita 1–50 e
`offset` começa em zero. Os detalhes incluem `id`, `orderId`, `courierId`, `courierName`,
`status`, `orderStatus`, `address`, `customer: { name, phone }`, `notes`, `paymentMethod`,
`total`, `changeFor` e as datas. `customerId` e a chave interna de conclusão não são expostos.

Corpo da atribuição:

```json
{ "courierId": "b03ba89b-e096-4b66-ad8f-f8d64994981d" }
```

Corpo da conclusão (exemplo ilustrativo; use o horário real do aparelho):

```json
{
  "operationId": "c809212e-c79f-4e8d-8e78-570c86be04c5",
  "completedAt": "2026-10-22T14:30:00.000Z"
}
```

A operação deve manter a mesma chave e o mesmo horário nos reenvios. Repetir uma
conclusão já confirmada retorna 200 com o resultado original, sem alterar o horário de
recebimento. Outra chave para a entrega concluída, outro horário para a mesma operação
ou uma chave usada em outra entrega retornam 409. UUIDs são normalizados para minúsculas.
O backend aceita até 60s de diferença entre os relógios e conclusões posteriores ao
início, inclusive recebidas dias depois; isso prepara a etapa offline, mas ainda não
implementa persistência ou sincronização no aparelho.

Repetir o início de uma entrega já em andamento retorna seu estado atual. Repetir a
mesma atribuição preserva seu horário original.

Respostas principais: 400 para corpo/query inválidos, 401 para token ausente/expirado,
403 para perfil ou conta sem permissão, 404 para entrega inexistente/alheia e 409 para
conflito de estado, motoboy indisponível ou duplicidade. Não se aceita um identificador
livre de motoboy no corpo de início/conclusão: o responsável vem da sessão.

## Validação da etapa

```bash
cd backend
npm run typecheck
npm run build
npm test
npm run test:integration
# Para executar apenas os testes desta etapa:
npm exec -- vitest run tests/integration/deliveries.integration.test.ts
```

Os testes usam exclusivamente `marmitaria_test`, que é recriado e removido pelo runner.
O usuário local precisa de permissão para criar/remover esse banco. Os 26 testes novos
cobrem migration em base antiga, repetição, snapshot, FKs, autorização, paginação,
atribuição, estados, relógio, múltiplas entregas, concorrência, idempotência e rollback
com falha simulada depois de atualizar Order.

Antes desta etapa, a suíte completa já apresentava duas falhas em
`auth.integration.test.ts`: as verificações de senha consultam registros de auditoria
deixados por testes anteriores. Elas permanecem registradas como problema anterior,
sem mudanças no módulo de autenticação nesta etapa.

## Próximas etapas — aguardam aprovação

3. Telas do Motoboy: lista, detalhes e estados de interface, usando estes contratos.
4. Conclusão offline: fila durável SQLite e sincronização com a mesma chave de operação.
5. Localização: Expo Location/Task Manager, persistência de posição e Socket.IO autorizado.
6. Chegada e notificações: proximidade local, eventos e dispositivos push.
7. Validação em dispositivos reais e documentação das limitações observadas.
