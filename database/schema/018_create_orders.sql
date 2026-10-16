-- 018 - Pedidos e itens do pedido — módulo do Cliente (Willian)
--
-- Escopo, seções 9, 10, 11, 18 e 19:
--   * o pedido só nasce quando o cliente finaliza o carrinho (o carrinho fica no SQLite do app)
--   * cada item guarda produto, variação, quantidade, preço unitário APLICADO e subtotal,
--     copiados no momento da compra: mudar o preço depois não altera pedidos antigos
--   * subtotal + taxa de entrega = total, os três guardados no pedido
--   * guarda a distância usada e a taxa aplicada (a faixa pode mudar depois)
--   * guarda uma CÓPIA do endereço (address_*): editar/excluir o endereço do cliente
--     não muda o pedido. address_id fica só como referência.
--   * horário de cada mudança de estado (confirmed_at, preparing_at...)
--
-- Pagamento na entrega (decisão da equipe; o escopo não define): dinheiro (com troco
-- opcional), Pix, cartão de crédito ou débito na maquininha do motoboy.
--
-- Os valores são calculados pelo backend (orders.service.ts); os CHECKs abaixo garantem
-- que nenhuma gravação, nem pelo Workbench, deixe os totais inconsistentes.

CREATE TABLE IF NOT EXISTS orders (
  id                  CHAR(36)      NOT NULL,             -- UUID gerado pela aplicação
  customer_id         CHAR(36)      NOT NULL,
  menu_id             CHAR(36)      NOT NULL,             -- cardápio do dia em que foi feito
  status              ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY',
                           'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',

  payment_method      ENUM('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD') NOT NULL,
  change_for          DECIMAL(10,2) NULL,                 -- "troco para R$ 50" (só dinheiro)
  notes               VARCHAR(300)  NULL,                 -- observações do cliente

  -- endereço de entrega copiado no momento do pedido
  address_id          CHAR(36)      NOT NULL,
  address_label       VARCHAR(40)   NULL,
  address_cep         CHAR(8)       NOT NULL,
  address_street      VARCHAR(160)  NOT NULL,
  address_number      VARCHAR(20)   NOT NULL,
  address_complement  VARCHAR(80)   NULL,
  address_district    VARCHAR(100)  NOT NULL,
  address_city        VARCHAR(100)  NOT NULL,
  address_state       CHAR(2)       NOT NULL,
  address_latitude    DECIMAL(9,6)  NOT NULL,
  address_longitude   DECIMAL(9,6)  NOT NULL,

  -- valores (em reais)
  distance_meters     INT           NOT NULL,             -- distância por vias (OSRM)
  subtotal            DECIMAL(10,2) NOT NULL,
  delivery_fee        DECIMAL(10,2) NOT NULL,
  total               DECIMAL(10,2) NOT NULL,

  -- horários das mudanças de estado (escopo, seção 11)
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at        DATETIME      NULL,
  preparing_at        DATETIME      NULL,
  ready_at            DATETIME      NULL,
  out_for_delivery_at DATETIME      NULL,
  delivered_at        DATETIME      NULL,
  cancelled_at        DATETIME      NULL,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_orders_customer (customer_id, created_at),
  KEY idx_orders_status (status, created_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES users (id),
  CONSTRAINT fk_orders_menu FOREIGN KEY (menu_id) REFERENCES menus (id),
  CONSTRAINT fk_orders_address FOREIGN KEY (address_id) REFERENCES addresses (id),
  CONSTRAINT chk_orders_values CHECK (
    subtotal > 0 AND delivery_fee >= 0 AND distance_meters >= 0 AND total = subtotal + delivery_fee
  ),
  -- troco só existe para dinheiro e precisa cobrir o total
  CONSTRAINT chk_orders_change CHECK (
    change_for IS NULL OR (payment_method = 'CASH' AND change_for >= total)
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id            CHAR(36)      NOT NULL,
  order_id      CHAR(36)      NOT NULL,
  product_id    CHAR(36)      NOT NULL,
  -- variant_id: o módulo da Proprietária usa esta coluna para não excluir variação já vendida
  variant_id    CHAR(36)      NOT NULL,
  product_name  VARCHAR(120)  NOT NULL,                   -- nomes copiados no momento da compra
  variant_name  VARCHAR(80)   NOT NULL,
  quantity      INT           NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,                   -- preço aplicado (já com preço especial)
  subtotal      DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_items_variant (order_id, variant_id),
  KEY idx_order_items_variant (variant_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id),
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id),
  CONSTRAINT chk_order_items_values CHECK (
    quantity > 0 AND unit_price > 0 AND subtotal = unit_price * quantity
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
