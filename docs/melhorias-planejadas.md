# Melhorias planejadas — Projeto Integrador

Lista debatida pela equipe. A pedido do Willian, as melhorias da administradora
foram agrupadas em uma entrega; as demais continuam por perfil.

## Cliente

- **Produto esgotado / promoção / últimos restantes:** definir como a proprietária
  marca cada situação e como o cliente a visualiza. Item esgotado não pode ser comprado.
- **Confirmar recebimento:** cliente informa que recebeu o pedido. Definir a relação
  com a conclusão pelo motoboy e como lidar com divergências.
- **SAC:** relatar item faltando, pedido errado ou outro problema.
- **Repetir pedido:** adicionar novamente ao carrinho itens de pedido anterior.
- **Observações:** a observação geral já existe no checkout; avaliar e implementar
  a observação por item.
- **Avaliação:** avaliar pedido e/ou entrega.
- **Retirada pronta:** destacar para o cliente quando o pedido estiver pronto para buscar.
- **Resumo antes de confirmar:** melhorar a revisão existente de itens, entrega ou
  retirada, pagamento e valor total.

## Administradora / proprietária

- **Painel do dia (implementado):** pedidos criados hoje; vendas e ticket médio
  consideram os que já foram entregues ou retirados, incluindo a taxa de entrega.
- **Busca e filtros (implementado):** pesquisar pedidos por status, cliente, número ou data.
- **Duplicar cardápio (implementado):** copia itens e preços especiais para um rascunho.
- **Uma proprietária:** limitar o sistema a uma única conta OWNER, inclusive
  quando estiver desativada; migration 030 implementa a regra.
- **Motivo de cancelamento (implementado):** opções comuns e opção Outro com campo de texto;
  mostrar o motivo ao cliente. Conferir também o relato de cancelamento sem confirmação.
- **Horário de funcionamento (implementado):** configurar na aba Conta e mostrar ao
  cliente. É informativo, com abertura e fechamento no mesmo dia; não ativa cardápios.

## Motoboy

- **Histórico e resumo do dia:** quantidade de entregas e total das taxas.
- **Navegação:** abrir o endereço no Google Maps ou Waze.

## Geral

- **Ações sensíveis:** revisar confirmações para evitar exclusões ou encerramentos acidentais.
- **README:** atualizar as instruções para rodar o projeto.
- **Nome, ícone e tela de abertura:** deixar para a etapa final.

## Decisão da equipe

- Aviso de carrinho desatualizado por mudança de preço/esgotamento: fora da lista
  por enquanto. O bloqueio de compra de item esgotado continua necessário.
- Hospedagem, VM e preparação da apresentação ficam para depois do polimento.
