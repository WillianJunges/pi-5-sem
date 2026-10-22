# Banco de dados relacional (MySQL)

Requisitos da disciplina de Laboratório de Banco de Dados atendidos pelo módulo base:
**view, function, procedure e trigger**, com consistências, transação e tratamento de erros.
Os scripts ficam em `database/schema/` e são aplicados com `npm run db:migrate`.

## Tabelas

| Tabela | Script | Descrição |
|---|---|---|
| `users` | 001 | Usuários de todos os perfis (CUSTOMER, OWNER, COURIER) |
| `refresh_tokens` | 002 | Sessões do app (hash do refresh token) |
| `user_audit` | 003 | Histórico de mudanças em usuários |
| `products` / `product_variants` | 011 | Catálogo: produtos e variações com preço padrão (Proprietária) |
| `menus` / `menu_items` | 012 | Cardápios por dia e seus itens, com preço especial (Proprietária) |
| `delivery_fee_ranges` | 013 | Faixas de distância e taxa de entrega (Proprietária) |
| `deliveries` | 026 | Entrega por pedido, atribuição, endereço preservado, estados e conclusão idempotente (Motoboy) |
| `schema_migrations` | — | Controle de quais scripts já rodaram (criada pelo `db:migrate`) |

## Objetos programáveis

| Tipo | Nome | Script | O que faz | Onde é usado |
|---|---|---|---|---|
| Trigger | `trg_users_before_insert` | 004 | Padroniza e-mail (minúsculo, sem espaços) e nome | Todo INSERT em `users` |
| Trigger | `trg_users_before_update` | 004 | Mesma padronização no UPDATE | Todo UPDATE em `users` |
| Trigger | `trg_users_after_update` | 004 | Audita mudanças de perfil/e-mail/status; ao **desativar** usuário revoga todas as sessões | Desativação de motoboy (módulo da proprietária) |
| Function | `fn_role_label(role)` | 005 | Nome do perfil em português | `vw_users` |
| Function | `fn_active_sessions(user_id)` | 005 | Conta sessões válidas do usuário | `vw_users` |
| View | `vw_users` | 006 | Usuários sem a senha + nome do perfil + sessões ativas | `GET /users` (proprietária) |
| Procedure | `sp_create_user(...)` | 007 | Valida dados e cria usuário + auditoria em **transação** | Cadastro (`POST /auth/register`) e `npm run user:create` |
| Procedure | `sp_rotate_refresh_token(...)` | 008 | Renova a sessão de forma **atômica** (`SELECT ... FOR UPDATE`) | `POST /auth/refresh` |
| Function | `fn_effective_price(preço, especial)` | 014 | Preço que vale, com **CASE**: especial se houver, senão o padrão | `vw_menu_items` |
| Function | `fn_delivery_fee(metros)` | 014 | Taxa da faixa que cobre a distância (NULL = fora da área), com **CASE** para a faixa que começa em 0 | Módulo de pedidos |
| View | `vw_menu_items` | 015 | Item do cardápio + produto + variação, com preço que vale e disponibilidade (**CASE**) | `GET /menus/today` e tela de cardápio |
| Procedure | `sp_activate_menu(menu_id)` | 016 | Ativa o cardápio em **transação**: rascunho, com itens, todos disponíveis e nenhum outro ativo (`FOR UPDATE`) | `POST /owner/menus/:id/activate` |
| Trigger | `trg_menu_items_before_insert/update/delete` | 017 | Bloqueiam mudanças em cardápio encerrado | Itens do cardápio |
| Trigger | `trg_fee_ranges_before_insert/update` | 017 | Impedem faixas de taxa sobrepostas | Faixas de taxa |
| Trigger | `trg_orders_delivery_logistics` | 026 | Cria entrega ao confirmar pedido DELIVERY e coordena seu cancelamento | Confirmação/cancelamento de pedidos |
| Trigger | `trg_deliveries_snapshot_immutable` | 026 | Preserva identidade do pedido e endereço original da entrega | Atualizações em `deliveries` |

## Transações e tratamento de erros

As procedures seguem o mesmo padrão:

```sql
DECLARE EXIT HANDLER FOR SQLEXCEPTION
BEGIN
  ROLLBACK;   -- desfaz tudo que foi feito na transação
  RESIGNAL;   -- devolve o erro original para quem chamou
END;

-- validações → SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '...';
START TRANSACTION;
  ...
COMMIT;
```

O backend converte os erros do banco em respostas HTTP
(`backend/src/shared/errors/databaseErrors.ts`):

| Erro no banco | HTTP | Exemplo |
|---|---|---|
| `SIGNAL SQLSTATE '45000'` (errno 1644) | 400 | "E-mail inválido" |
| errno 1062 (duplicidade) | 409 | "E-mail já cadastrado" |
| `MYSQL_ERRNO = 5401` | 401 | "Sessão inválida" |

## Como cada módulo deve seguir

Cada integrante cria os objetos do seu módulo como novos scripts numerados, por exemplo:

- **Cliente**: `sp_create_order` (cria Order + OrderItems e calcula total em transação),
  `fn_order_total(order_id)`, `vw_customer_orders`.
- **Proprietária**: já criados os scripts 011–017 (catálogo, cardápio e taxas, ver tabela acima).
  Ainda previstos, quando os pedidos existirem: `sp_change_order_status` (valida transição de status),
  `trg_orders_after_update` (histórico de status), `vw_daily_sales`.
- **Motoboy**: a etapa 2 usa transações no repository, locks de pedido/entrega e chave
  única para concluir sem duplicidade, além dos triggers da migration 026.
  Contratos e detalhes em [modulo-motoboy.md](modulo-motoboy.md).

Funções e triggers em scripts precisam de `DELIMITER $$ ... DELIMITER ;` (como no
Workbench). O `db:migrate` entende essa diretiva.

## Configuração necessária

Com o log binário ligado (padrão do MySQL 8), o usuário da aplicação só consegue criar
triggers e functions com `log_bin_trust_function_creators = 1`. O `docker-compose.yml` e o
`database/setup-local.sql` já fazem isso.

## Testando no Workbench

```sql
CALL sp_create_user(UUID(), 'Teste', 'teste@x.com', NULL, 'hash', 'CUSTOMER');
CALL sp_create_user(UUID(), 'Teste', 'teste@x.com', NULL, 'hash', 'CUSTOMER'); -- erro: duplicado
CALL sp_create_user(UUID(), 'A', 'x@x.com', NULL, 'hash', 'CUSTOMER');         -- erro: nome
SELECT * FROM vw_users;
UPDATE users SET role = 'COURIER' WHERE email = 'teste@x.com';
SELECT * FROM user_audit;                                                       -- mudança registrada
```
