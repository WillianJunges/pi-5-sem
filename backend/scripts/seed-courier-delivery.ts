/** Prepara uma entrega fictícia para testar o APK, sem consultar mapas externos. */
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../src/config/database';
import { env } from '../src/config/env';
import { closeMongo } from '../src/config/mongo';
import { addressesRepository } from '../src/modules/addresses/addresses.repository';
import { deliveriesService } from '../src/modules/deliveries/deliveries.service';
import { deliveryFeesService } from '../src/modules/delivery-fees/deliveryFees.service';
import { menusService } from '../src/modules/menus/menus.service';
import { ordersRepository } from '../src/modules/orders/orders.repository';
import { OrdersService } from '../src/modules/orders/orders.service';
import { ownerOrdersService } from '../src/modules/owner-orders/ownerOrders.service';
import { usersRepository } from '../src/modules/users/users.repository';

async function main() {
  if (env.nodeEnv !== 'development') {
    throw new Error('Este comando só pode ser usado com NODE_ENV=development.');
  }
  const courier = await usersRepository.findByEmail('motoboy@example.com');
  const owner = await usersRepository.findByEmail('proprietaria@example.com');
  if (!courier?.active || courier.role !== 'COURIER') {
    throw new Error('Crie primeiro a conta COURIER motoboy@example.com com user:create.');
  }
  if (!owner?.active || owner.role !== 'OWNER') {
    throw new Error('Crie primeiro a conta OWNER proprietaria@example.com com user:create.');
  }

  const customerEmail = 'cliente.entrega@example.com';
  let customer = await usersRepository.findByEmail(customerEmail);
  if (customer && (!customer.active || customer.role !== 'CUSTOMER')) {
    throw new Error('A conta cliente.entrega@example.com precisa ser um CUSTOMER ativo.');
  }
  const actor = { id: owner.id, role: owner.role };
  const notes = `[TESTE APK MOTOBOY ${courier.id}] Pedido fictício; não realizar entrega real.`;

  // Reutiliza o pedido ativo, inclusive após falha parcial; nunca reinicia uma entrega.
  const [existing] = await db.query<RowDataPacket[]>(
    `SELECT o.id FROM orders o JOIN users u ON u.id = o.customer_id
     WHERE u.email = ? AND o.notes = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED')
     ORDER BY o.created_at DESC LIMIT 1`,
    [customerEmail, notes],
  );
  let orderId = existing[0]?.id as string | undefined;
  if (!orderId) {
    const menu = await menusService.getToday();
    const variant = menu?.items[0]?.variations[0];
    if (!variant) throw new Error('Execute npm run db:seed:catalog para preparar o cardápio de hoje.');
    // Valida a faixa simulada antes de gravar os dados do pedido.
    if (!(await deliveryFeesService.quote(1000)).covered) {
      throw new Error('Cadastre uma faixa de entrega que cubra 1 km.');
    }
    if (!customer) {
      customer = await usersRepository.create({
        name: 'Cliente Entrega Teste', email: customerEmail, phone: null,
        passwordHash: await bcrypt.hash('Teste123456!', 10), role: 'CUSTOMER',
      });
    }
    const label = 'Destino fictício APK';
    const addresses = await addressesRepository.listByUser(customer.id);
    let addressId = addresses.find(address => address.label === label)?.id;
    if (!addressId) {
      addressId = await addressesRepository.create(customer.id, {
        label, street: 'Rua de Teste', number: '123', complement: 'Endereço fictício',
        district: 'Centro', city: 'Indaiatuba', state: 'SP', cep: '13330000',
        latitude: -23.085755, longitude: -47.202467,
      });
    }
    // Só esta instância do seed simula 1 km; preços, estados e atribuição usam as regras reais.
    const orders = new OrdersService(
      ordersRepository, addressesRepository, deliveryFeesService, undefined, async () => 1000,
    );
    const order = await orders.create(customer.id, {
      fulfillment: 'DELIVERY', addressId, paymentMethod: 'PIX', changeFor: null,
      notes, items: [{ variantId: variant.variantId, quantity: 1 }],
    });
    orderId = order.id;
  }

  let order = await ownerOrdersService.get(orderId);
  // As ações normais acionam os triggers de entrega e mantêm os horários do fluxo.
  for (const [status, action] of [
    ['PENDING', 'confirm'], ['CONFIRMED', 'prepare'], ['PREPARING', 'ready'],
  ] as const) {
    if (order.status === status) order = await ownerOrdersService.apply(orderId, action);
  }
  let delivery = await deliveriesService.forOrder(actor, orderId);
  if (delivery.status === 'WAITING_ASSIGNMENT') {
    delivery = await deliveriesService.assign(actor, delivery.id, courier.id);
  }
  if (delivery.courierId !== courier.id) {
    throw new Error('O pedido de teste foi atribuído a outra conta; nenhuma reatribuição foi feita.');
  }
  console.log(`Pedido de teste: ${orderId}`);
  console.log(`Entrega: ${delivery.id} (${delivery.status}); pedido: ${order.status}`);
  console.log('Motoboy: motoboy@example.com — atualize a lista no aplicativo.');
  console.log('Destino fictício em Indaiatuba; chegada real por GPS exige outro destino.');
}

main().catch(error => {
  console.error('Falha ao preparar entrega de teste:', (error as Error).message);
  process.exitCode = 1;
}).finally(async () => {
  await db.end();
  await closeMongo();
});
