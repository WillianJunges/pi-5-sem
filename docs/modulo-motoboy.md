# Motoboy — entregas, conclusão offline e rastreamento

Etapa 2: logística no backend. Etapa 3: telas do motoboy e ações online.
Etapa 4: cache SQLite, conclusão local durável e sincronização por conta.
Etapa 5: GPS, última posição e Socket.IO, disponível para avaliação.
Etapa 6: chegada local e integração de notificações; push real aguarda configuração Expo/FCM.

## Preparação

Com MySQL disponível e `backend/.env` configurado:

```bash
cd backend
npm ci
npm run db:migrate
npm run dev
```

A migration `026_create_deliveries.sql` acrescenta apenas `deliveries` e dois triggers.
Não modifica as colunas de `orders`, os scripts 001–025 ou o MongoDB.
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

## Etapa 3 — telas e ações online do Motoboy

Após login, o perfil COURIER acessa as abas **Entregas**, **Histórico** e **Conta**.
O `Stack.Protected` existente continua separando os perfis. As telas do motoboy também
limpam seus dados quando a API responde 401/403/404. A troca de conta remonta os modelos
de tela para que dados e tentativas da sessão anterior não sejam reaproveitados.

- **Entregas**: lista paginada das atribuídas e em andamento. Cada cartão mostra cliente,
  endereço resumido, valor, estado do pedido e link para os detalhes.
- **Histórico**: concluídas e canceladas, com paginação independente.
- **Detalhes** (`/courier/delivery/:id`): cliente, telefone selecionável, endereço completo,
  complemento/referência, observações, pagamento/troco e datas disponíveis.
- **Copiar endereço**: usa Expo Clipboard; o texto copiado é o mesmo mostrado na tela,
  com complemento, bairro, cidade, UF e CEP. Há seleção manual como alternativa.
- **Conta**: perfil compartilhado e saída da sessão.

O botão **Iniciar entrega** aparece apenas com Delivery=ASSIGNED e Order=READY. O botão
**Concluir entrega** aparece apenas com Delivery=IN_PROGRESS e Order=OUT_FOR_DELIVERY.
Ambos pedem confirmação. O início aguarda a API; a conclusão passa pela fila durável da
etapa 4. Toques repetidos são bloqueados enquanto uma ação está em curso. As regras
definitivas permanecem no backend.

Ao voltar para uma tela ou para o app, os dados são consultados novamente. Entregas
ativas também consultam status a cada 30s, somente com a tela em foco e o app em
foreground. Esse polling não executa tarefa de background nem coleta localização.
Uma atualização interrompe a paginação antiga, evitando misturar resultados atrasados.
Quando uma leitura falha por conexão, os dados já carregados ficam visíveis com aviso;
o início fica bloqueado até uma leitura válida. Uma entrega já iniciada e salva no
aparelho pode ser concluída localmente pelo fluxo da etapa 4.

Uma conclusão enviada recebe UUID pelo Expo Crypto. Se a resposta se perder, o app
consulta o estado atual: uma conclusão confirmada aparece como concluída; uma entrega
ainda ativa mantém a mesma chave e horário para eventual reenvio. Na implementação
inicial da etapa 3, essa tentativa existia só na memória. A etapa 4 substitui esse
caminho no aplicativo pelo gateway com fila SQLite, descrito abaixo. Cancelamento ou
perda de atribuição continuam sendo reconciliados pela API.

### Arquivos para manutenção

| Caminho | Responsabilidade |
|---|---|
| `mobile/app/(app)/courier/_layout.tsx` | Stack de abas e detalhes |
| `mobile/app/(app)/courier/(tabs)/` | Entregas, histórico e conta |
| `mobile/app/(app)/courier/delivery/[id].tsx` | Detalhes, cópia e confirmação das ações |
| `mobile/src/services/deliveries.service.ts` | Contratos e chamadas à API da etapa 2 |
| `mobile/src/features/courier/models.ts` | Estado, concorrência e reconciliação do fluxo online |
| `mobile/src/features/courier/presentation.ts` | Disponibilidade das ações e endereço copiável |
| `mobile/src/features/courier/useCourierRefresh.ts` | Atualização por foco/foreground |
| `mobile/tests/courier.test.ts` | Testes do fluxo online sem módulos nativos |

### Validação do mobile

```bash
cd mobile
npm ci
npm run typecheck
npm test
npm start
```

Na etapa 3 foram verificados instalação pelo lockfile, TypeScript e 21 testes de estado/concorrência:
filtros, paginação atrasada, deduplicação, perda de conexão/autorização, toque duplicado,
timeout da conclusão, reenvio com a mesma operação, cancelamento, endereço e ações permitidas.
O bundle Android foi gerado com `expo export --platform android --max-workers 2`, incluindo
as novas rotas. Isso valida a geração do JavaScript/Hermes, não a execução em dispositivo.
A navegação visual, o clipboard nativo e o login no aparelho devem ser conferidos na
matriz de dispositivos da etapa 7.

Roteiro manual quando houver um aparelho configurado:

1. Entrar como COURIER, conferir lista vazia, perfil e saída da sessão.
2. Com um pedido DELIVERY confirmado, usar a API OWNER de atribuição da etapa 2.
3. Atualizar a lista do motoboy e abrir os detalhes; conferir endereço e pagamento.
4. Copiar e colar o endereço em outro app; comparar complemento e CEP.
5. Antes de READY, conferir ausência do botão de início; após READY, iniciar online.
6. Confirmar conclusão online e conferir sua passagem para o histórico.
7. Cortar conexão e conferir aviso, ausência de falsa conclusão e recuperação após atualizar.
8. Reatribuir/cancelar pela proprietária e conferir remoção do acesso/ações na atualização.
9. Entrar como CUSTOMER ou OWNER e conferir bloqueio das rotas COURIER.

## Etapa 4 — conclusão offline e sincronização durável

A aba **Pendências** mostra confirmações locais ainda não aceitas e conflitos que
precisam de revisão. As entregas concluídas localmente saem da lista ativa e aparecem
no histórico com o selo **Concluída neste aparelho — aguardando sincronização**.
O status oficial do pedido continua vindo da API; a interface não inventa DELIVERED.

### Banco local

O arquivo privado do aplicativo `courier-deliveries.db` usa `PRAGMA user_version=1` e
contém apenas estas estruturas novas:

| Tabela | Conteúdo |
|---|---|
| `courier_cache` | Snapshot autorizado da entrega, separado por `user_id` e `delivery_id` |
| `courier_completions` | Pedido/entrega, UUID da operação, horário original, tentativas, próxima tentativa, reserva de envio e mensagem de conflito |
| `courier_accounts` | Bloqueio local de uma conta cujo acesso foi recusado explicitamente pelo backend |

O schema é criado sem apagar dados. O carrinho, cache do cliente, MongoDB e schema
MySQL não são alterados. A API idempotente da etapa 2 é reutilizada.

Cada entrega tem uma única intenção local por conta. Uma transação verifica o snapshot
iniciado e grava a intenção antes de qualquer envio, inclusive quando há internet.
Se faltar espaço ou o SQLite falhar, o app mostra erro e não afirma ter concluído
localmente. Chave e horário não são recriados no reinício ou em reenvios.

O cache contém só os campos da entrega necessários às telas; tokens e senhas não entram
no SQLite. Editar o cache com uma resposta de rede nunca apaga a fila. Uma leitura
atrasada de entrega ativa também não reabre uma conclusão já confirmada.

### Envio e confirmação

O worker funciona com sessão COURIER, aplicativo em foreground e conexão disponível.
Ele tenta ao abrir/retomar o aplicativo, ao recuperar a conexão, a cada 20s enquanto
ativo e pelo botão de sincronização. Não há tarefa de execução com o aplicativo
fechado nesta etapa: ao reabrir, as intenções persistidas são recuperadas.

Uma reserva de envio de 60s evita dois workers reclamarem a mesma operação. Se o
processo morrer durante o envio, outro ciclo recupera a operação após a reserva expirar.
Falhas temporárias usam espera progressiva de 5s até 5min, respeitada pelos ciclos;
recuperação de rede, retomada e tentativa manual podem antecipar uma tentativa ainda
não reservada. Não há descarte por atingir um limite de tentativas.

Somente um POST de conclusão confirmado pode remover a intenção. Atualizar o cache
para COMPLETED/DELIVERED e remover a fila ocorre na mesma transação SQLite. Se a API
aceitar e sua resposta se perder, a mesma operação é reenviada. Um GET que mostre a
entrega concluída não apaga silenciosamente uma operação diferente.

| Resposta/situação | Tratamento |
|---|---|
| Sem rede, timeout ou 5xx | Preserva a operação e tenta depois |
| 401/sessão alterada | Pausa; mantém a fila para a conta responsável entrar novamente |
| 403/conta sem permissão | Pausa e bloqueia uso do cache até revalidação online |
| 404/perda de atribuição | Remove o endereço do cache e mantém referência da pendência para revisão |
| 400, 409 ou 422 | Marca conflito; não altera o estado remoto nem repete automaticamente |
| Confirmação válida | Atualiza o cache e remove a intenção atomicamente |

O botão **Revisar e tentar novamente** pede confirmação e reapresenta a mesma operação
ao backend. Ele não força cancelamento, troca de motoboy ou horário incompatível a
virar entrega concluída. Se a recusa persistir, a pendência continua visível para
correção junto à proprietária.

### Isolamento de sessão

Listas, snapshots e pendências são filtrados pela conta que os originou. Sair não
apaga as intenções; a tela de conta avisa quando há pendências. Outra conta no mesmo
aparelho não as recebe nem as sincroniza.

O gateway HTTP verifica o usuário do token antes de enviar/repetir cada operação. Uma
mudança de sessão invalida requisições que ainda aguardavam leitura de credenciais.
Requisições já enviadas podem receber resposta após logout; a confirmação é gravada
somente na fila da conta original, sem iniciar o próximo envio dessa sessão.

Para evitar corridas de refresh/login/logout, os tokens permanecem no SecureStore,
agora como um único par JSON em `auth.tokens`. A leitura é compatível com as chaves
legadas e o próximo salvamento as migra. A limpeza antiga não pode ressuscitar uma
sessão encerrada. Um refresh atrasado não sobrescreve outro login; erro temporário
no refresh não apaga as credenciais. A leitura local do identificador JWT não substitui
a verificação de assinatura/permissões no backend.

### Arquivos e verificação

O módulo `mobile/src/features/courier/offline/` contém a porta SQL, implementação do
SQLite, gateway/worker e provider de sessão/rede/foreground. Os componentes continuam
usando os modelos testáveis da etapa 3. Não foram adicionados GPS, socket ou push.

```bash
cd mobile
npm ci
npm run typecheck
npm test
npx expo export --platform android --max-workers 2
```

Os testes de persistência usam `node:sqlite` com arquivos reais no host (Node 24 no
ambiente preparado). A suíte tem 66 testes, incluindo os 21 anteriores. Ela verifica
reabertura, rollback, reservas após interrupção, reenvios, backoff, perda de conexão,
troca de conta, cancelamento/conflitos, migração segura de tokens e falha de armazenamento.
Isso não simula o comportamento do driver nativo em um telefone.

Também foi executado um smoke com SQLite, HTTP e MySQL reais em bancos de teste:
concluir offline, enviar, perder a resposta após o commit e reenviar preservou uma
única conclusão e o mesmo horário de recebimento. Os dados temporários foram removidos.

Roteiro adicional para a etapa de dispositivos:

1. Iniciar online, abrir os detalhes e desligar a rede.
2. Concluir e conferir o selo local, a saída das ativas e a aba Pendências.
3. Fechar/reabrir o app sem rede; conferir a mesma intenção e o endereço salvo.
4. Recuperar rede e conferir DELIVERED no cliente somente após confirmação.
5. Sair com pendências, entrar em outra conta e conferir seu isolamento; voltar à conta original.
6. Simular cancelamento/reatribuição/recusa e conferir revisão explícita, sem sobrescrita.
7. Testar falta de espaço e interrupção durante envio; nunca apresentar falso sucesso local.

## Etapa 5 — rastreamento disponível para teste

O motoboy ativa o compartilhamento em **Conta** ou nos detalhes de uma entrega em
andamento. Pode escolher somente com o app aberto ou também em segundo plano.
Permissões são solicitadas após essa escolha; segundo plano tem uma explicação
antes de abrir o diálogo/configurações do sistema. Recusar localização não impede
consultar, iniciar ou concluir entregas.

### Alteração no banco

A migration nova `027_delivery_last_locations.sql` cria `delivery_last_locations`:
uma linha por `delivery_id`, com `sample_id`, latitude, longitude, precisão em metros,
horário da coleta (`captured_at`) e de recebimento (`received_at`), ambos UTC com
milissegundos. A FK aponta para `deliveries` com exclusão em cascata; constraints
validam coordenadas e precisão. Não altera colunas existentes, MongoDB nem SQLite.
Não cria histórico de trajetos. A última linha permanece após a conclusão para
consistência interna, mas a API retorna `position: null` quando a entrega encerra.

### Contrato e autorização

| Transporte | Contrato |
|---|---|
| REST | `POST /deliveries/:id/location`, apenas COURIER atribuído e entrega em andamento |
| REST | `GET /deliveries/:id/location`, OWNER, cliente dono ou COURIER atribuído |
| Socket.IO | Autenticação por `auth: { token: accessToken }` na porta HTTP da API |
| Socket.IO | `delivery:subscribe` recebe UUID da entrega e acknowledgment `{ ok, data }` ou `{ ok: false, status, message }` |
| Socket.IO | `delivery:location` recebe a mesma estrutura do GET; `tracking:error` informa recusa/erro |
| Socket.IO | `delivery:unsubscribe` remove a assinatura atual |

Cada conexão acompanha uma entrega por vez, na sala `delivery:<id>`. Antes de
entrar e **antes de cada emissão**, são revalidados JWT, conta, perfil, relação com
o pedido e estado da entrega. Não há broadcast direto da sala sem autorização.
O servidor também revalida a cada 5s quando o GPS não está enviando. Na conclusão
oficial, publica estado inativo e remove a assinatura. Reconectar exige nova
assinatura; tokens expirados podem ser renovados pelo REST existente no aplicativo.

Corpo do POST:

```json
{
  "sampleId": "53851560-e3bd-4443-97e0-fc31b49d4257",
  "latitude": -23.088,
  "longitude": -47.216,
  "accuracy": 12,
  "capturedAt": "2026-10-22T14:30:00.000Z"
}
```

Resposta: `{ deliveryId, active, position, stale }`. `position` inclui os campos
acima, `deliveryId` e `receivedAt`, ou é nula. O exemplo de horário deve ser
substituído pelo instante real da coleta. O servidor rejeita idade superior a 2min,
relógio mais de 30s no futuro e precisão acima de 100m. Retorna 429 para novas
posições recebidas em menos de 3s. Duplicatas e posições fora de ordem devolvem a
última posição sem fazê-la retroceder. Validação e escrita compartilham os locks
Order → Delivery das transições, impedindo gravar GPS depois de concluir.

### Mobile e ciclo de vida

- Expo Location/Task Manager com precisão alta, intervalo solicitado de 10s e
  deslocamento de 15m. São parâmetros iniciais, não frequência garantida pelo SO.
- Com consentimento, rastreia todas as entregas em andamento presentes no cache da
  conta. Concluir localmente remove imediatamente aquela entrega dos próximos
  envios; se não restarem outras, desliga o coletor. A fila offline da etapa 4 é
  consultada inclusive nos callbacks da tarefa nativa.
- O envio usa REST vinculado à conta. Socket.IO distribui ao cliente. Isso evita
  depender de conexão socket persistente no processo em segundo plano.
- No foreground, usa watcher; em background, uma tarefa global nativa. No Android,
  há serviço de localização com aviso persistente; no iOS, indicador de localização.
- Não acumula trajetos offline. Um lote nativo usa apenas a coleta mais recente;
  dados antigos/imprecisos ou marcados como simulados pelo aparelho são descartados.
  Esse filtro não é uma garantia antifraude.
- Logout/desativação param o coletor e retiram a autorização local. Troca de conta,
  perda de atribuição, recusa de acesso e conclusão remota são reconciliadas sem
  enviar posições com credenciais de outra conta.
- No iOS, credenciais e autorização de rastreamento usam Keychain deste aparelho
  acessível após o primeiro desbloqueio. Ativar background atualiza também sessões
  antigas; isso permite autenticação com a tela bloqueada, sem mover tokens ao SQLite.

No pedido do cliente, durante OUT_FOR_DELIVERY, o painel recebe atualizações
automaticamente, mostra horário e precisão, identifica posição sem atualização
recente e permite abrir a última coordenada em mapa externo. O hook
`useDeliveryTracking` fornece a posição para a integração do mapa interno do
Willian, responsabilidade indicada na especificação. Este protótipo não acrescenta
mapa nativo interno nem cálculo de rotas. REST inicial, reconexão e consulta de
recuperação a cada 15s funcionam apenas com a tela em foco e app ativo.

### Preparação e limites do teste

Veja [teste-etapa5.md](teste-etapa5.md) para comandos e critérios de revisão.
O `app.json` inclui permissões e plugin de localização. **É necessário gerar e
instalar um novo build nativo**; apenas atualizar JavaScript/Expo Go não valida
segundo plano ou tela bloqueada. Não foram executados testes em aparelho nesta
etapa. Encerramento forçado, economia de bateria e restrições do fabricante podem
interromper a tarefa; não se promete rastreamento com o processo encerrado.

O servidor Socket.IO atual usa uma única instância, sem adaptador distribuído.
Múltiplas instâncias exigirão distribuição de eventos/salas e configuração do
balanceador. Nenhum deploy foi realizado nesta etapa.

### Evidências desta versão

Instalações pelo lockfile, checagens TypeScript e build backend passaram. Os 161
testes unitários backend e 36 de integração de entregas/rastreamento passaram,
incluindo MySQL, HTTP e Socket.IO reais. A suíte mobile passou com 95 testes:
os anteriores mais política de coleta, permissões/lifecycle simulados, isolamento
de contas e revogação pelo GPS concorrendo com leitura do cache.

Exportação Android/Hermes e inspeção da configuração nativa passaram. A migration
027 foi aplicada e repetida no banco local sem duplicação. Nenhum desses resultados
substitui GPS/background/tela bloqueada em telefone: esses cenários permanecem sem
execução real e têm roteiro explícito para revisão.

## Etapa 6 — chegada e notificações

O cartão **Notificações**, na Conta do motoboy, permite ativar separadamente alertas
locais de chegada e avisos remotos de pedidos. O cliente também tem o controle de
avisos de pedidos. Permissão de notificação é solicitada somente por uma ação explícita;
negá-la não bloqueia GPS ou ações logísticas.

### Chegada ao destino

A tarefa GPS já existente avalia proximidade **antes do envio HTTP**, inclusive sem
rede. O raio inicial é 100m: distância calculada por Haversine mais a margem de precisão
deve caber nesse raio. Exige precisão até 40m, coleta de no máximo 30s e duas amostras
válidas separadas por pelo menos 5s, sem intervalo superior a 60s. Amostras antigas,
fora de ordem, simuladas ou sem precisão adequada não disparam o aviso. Os parâmetros
precisam ser ajustados por ensaio real, principalmente em prédios e áreas com sinal ruim.

O aviso é **“Você chegou ao destino. O pedido foi entregue?”**. Tocar abre os detalhes;
a ação existente ainda pede confirmação explícita e pode usar a conclusão offline.
Nenhuma distância, push ou toque isolado conclui a entrega.

O SQLite `courier-deliveries.db` migra de `user_version=1` para `2`, preservando cache
e fila existentes. `courier_arrivals` mantém candidato, última amostra, UUID do evento,
reserva de 30s e confirmação de alerta, por usuário/entrega. `notification_inbox`
deduplica apresentação em foreground e abertura por toque, separadamente. Não armazena
trajetos, senhas, tokens ou conteúdo privado de push. Uma reserva interrompida pode
ser recuperada; falha nativa de agendamento libera nova tentativa com o mesmo evento.
O identificador nativo determinístico também reduz repetições; avisos continuam sujeitos
às garantias do sistema operacional.

Cada entrega tem seu controle. Conclusão offline exclui o alvo mesmo antes do servidor
confirmar e remove alertas locais apresentados/agendados na reconciliação. Encerrar a
última entrega desliga o GPS; encerrar uma entre duas mantém a outra. Cancelamento,
revogação e troca de conta não autorizam avisos sobre dados da sessão anterior.

### Migration MySQL 028

`028_delivery_notifications.sql` acrescenta apenas três tabelas e um trigger adicional:

| Tabela | Campos e garantias principais |
|---|---|
| `push_devices` | UUID de instalação, hash do segredo, usuário/token/plataforma, versão de vínculo, ativo e datas; token único e FK de usuário |
| `delivery_notification_events` | UUID, sequência monotônica, entrega, destinatário, tipo e data; FKs e índice para reconhecer evento substituído |
| `push_notification_attempts` | Evento/dispositivo/versão, estado, contadores, próxima tentativa, lease, ticket e código resumido; UNIQUE evento/dispositivo |

Usuário, token e plataforma podem ser nulos em um **tombstone de revogação**: ele
impede que o primeiro registro, atrasado na rede, reative uma instalação já desativada.
Nenhum registro existente de pedidos, entregas, localização ou MongoDB é reescrito.

`trg_deliveries_notifications`, AFTER UPDATE, registra somente mudanças efetivas:

| Mudança | Evento/destinatário |
|---|---|
| Atribuir motoboy | ASSIGNED para o novo motoboy |
| Trocar motoboy | UNASSIGNED para o anterior e ASSIGNED para o novo |
| Cancelar entrega atribuída | CANCELLED para o motoboy vinculado |
| Iniciar entrega | OUT_FOR_DELIVERY para o cliente do pedido |

O evento participa da transação, inclusive no cancelamento iniciado pelo trigger
de `orders`. Falhar ao gravar o evento desfaz a mudança. Reenvios idempotentes não
produzem eventos novos; a migration não inventa avisos históricos.

### Dispositivos e sessão

`PUT /notifications/device` exige JWT, conta ativa e perfil CUSTOMER ou COURIER.
Corpo: `{ installationId, installationKey, bindingVersion, token, platform }`, com
UUID, segredo aleatório de 32 bytes em hexadecimal, versão inteira positiva,
ExpoPushToken/ExponentPushToken e `android` ou `ios`. A conta vem da sessão.
Retorna 204; conflito de instalação, token ou versão retorna 409. O segredo só fica
no SecureStore do aparelho; o backend persiste SHA-256, sem registrar valores em logs.

`POST /notifications/device/revoke` recebe apenas instalação, segredo e versão;
retorna 204 sem revelar existência do dispositivo. Esse endpoint usa uma capacidade
secreta de **desativação**, em vez do JWT antigo, permitindo sincronizar logout offline
depois que a sessão expirar. Não permite consultar, registrar ou ativar dispositivo.
Só uma versão igual ou mais recente, com segredo correto, desativa o vínculo. Logout
antigo não afeta um vínculo novo; registro atrasado na mesma versão revogada é recusado.

O aplicativo persiste vínculo/revogações no SecureStore antes da rede. Retoma ao abrir,
recuperar conexão e a cada 30s em foreground. Revogações pendentes são processadas
antes de novos registros. Login de outra conta exige nova ativação; token atualizado
é reconciliado sem pedir permissão novamente. Em logout, suprime ações locais da
sessão e tenta limpar avisos do aparelho. Aviso genérico já em trânsito pode aparecer
no sistema enquanto offline: o toque sempre revalida conta e entrega.

Payload: `{ version:1, eventId, userId, deliveryId, orderId, type }`, sem endereço,
telefone, coordenadas ou rota arbitrária. Ao receber em foreground, o app consulta a
lista oficial; ao tocar, consulta a entrega antes de navegar. Só o aviso local ARRIVAL
pode usar contexto offline validado e sem conclusão pendente. Um push remoto sem rede
pede nova consulta. Dados de outra conta, entrega divergente ou sessão alterada durante
a resposta são recusados. Nunca há transição de estado a partir do payload.

### Worker e limites de entrega

O worker é ativado por `EXPO_PUSH_ENABLED=true` no backend; o padrão é desligado.
`EXPO_ACCESS_TOKEN` é opcional, para projetos que protegem o serviço Expo Push.
Ele materializa eventos confirmados para aparelhos vinculados antes do evento,
revalida conta/perfil/vínculo/versão e estado atual imediatamente antes de enviar,
descarta avisos substituídos ou com mais de 24h e não envia notificações históricas
ao registrar um aparelho novo.

Processa até 20 trabalhos por ciclo de 5s, com lease persistente de 60s e recuperação
de interrupções. Erros transitórios têm espera exponencial; cada fase permite até
8 tentativas e respeita o prazo de 24h. Após um ticket aceito, consulta recibo em 15min
e repete consultas ainda pendentes. `DeviceNotRegistered` desativa somente a versão
rejeitada; erro de credencial não apaga o token do cliente. Códigos de erro não incluem
tokens/segredos. Tentativas FAILED/SKIPPED ficam disponíveis para inspeção no banco.

`TICKET` significa aceite inicial do Expo. `DELIVERED` na tabela de tentativas significa
recibo positivo do provedor, **não comprovação de exibição ou leitura no telefone**.
Consulta de recibo não envia mensagem nova e pode continuar depois de mudar o estado
da entrega. Não há promessa de recebimento exatamente uma vez: resposta perdida pode
produzir push duplicado; o app deduplica os identificadores que consegue observar.

### Configuração e validação

Veja [teste-etapa6.md](teste-etapa6.md). Estão implementados transporte Expo, controles
locais, registro e filas, mas faltam `android.package`, EAS `projectId`, configuração
Firebase e credenciais FCM v1 para o projeto real. Nada foi inventado nem enviado a
uma conta externa. É preciso novo build nativo; Expo Go/exportação JavaScript não
comprovam notificações com tela bloqueada.

Os testes usam MySQL/HTTP/Socket.IO e SQLite reais, com transporte push e ponte de
notificações simulados. Nenhuma notificação foi comprovada em aparelho nesta etapa.
As limitações de background, bateria e precisão da etapa 5 continuam pendentes.

Nesta versão passaram: instalação mobile pelo lockfile, checagens TypeScript,
build backend, 172 testes unitários backend, 46 de integração de entregas e 124
testes mobile. A exportação Android/Hermes e a inspeção de configuração nativa
também passaram. A migration 028 foi aplicada no banco local e uma segunda execução
confirmou que já estava atualizado. O worker local permanece desligado, sem envio
de pushes externos e sem deploy.

## Próxima etapa — aguarda aprovação

7. Validação em dispositivos reais e documentação das limitações observadas.
