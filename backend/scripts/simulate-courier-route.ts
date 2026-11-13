/**
 * Simula o motoboy andando até o cliente, para testar o mapa do cliente (ponto 8b) sem sair de moto.
 * Entra como o motoboy pela API (o servidor precisa estar rodando) e envia uma posição a cada 5 s,
 * em linha reta da marmitaria até o endereço da entrega em andamento. Por ir pelo HTTP, o servidor
 * também emite os eventos do Socket.IO, igual ao celular do motoboy.
 *
 * Uso: npm run sim:route -- [email] [senha] [passos]
 *   padrão: motoboy@example.com, senha de COURIER_PASSWORD no ambiente, 24 passos (2 minutos)
 * A entrega precisa estar "em andamento" (motoboy tocou em "Iniciar entrega").
 */
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

const API = process.env.SIM_API_URL ?? `http://localhost:${process.env.PORT ?? 3333}`;
const STORE = {
  latitude: Number(process.env.STORE_LATITUDE ?? -23.085755),
  longitude: Number(process.env.STORE_LONGITUDE ?? -47.202467),
};
const INTERVAL_MS = 5_000; // o backend recusa posições com menos de 3 s de intervalo

interface Point { latitude: number; longitude: number }
interface DeliveryRow { id: string; status: string; orderStatus: string; address: Point & { street: string; number: string } }

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} em ${path}: ${(data as { message?: string }).message ?? res.statusText}`);
  return data as T;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const [email = 'motoboy@example.com', password = process.env.COURIER_PASSWORD, stepsArg] = process.argv.slice(2);
  if (!password) throw new Error('Informe a senha: npm run sim:route -- motoboy@example.com SENHA');
  const steps = Math.max(2, Number(stepsArg ?? 24));

  const { accessToken } = await call<{ accessToken: string }>('/auth/login', { method: 'POST', body: { email, password } });
  const { deliveries } = await call<{ deliveries: DeliveryRow[] }>('/deliveries/me?active=true', { token: accessToken });
  const delivery = deliveries.find(d => d.status === 'IN_PROGRESS' && d.orderStatus === 'OUT_FOR_DELIVERY');
  if (!delivery) throw new Error('Nenhuma entrega em andamento. No app do motoboy, toque em "Iniciar entrega".');

  const end = delivery.address;
  // O seed usa a própria Fatec como destino; sem deslocar, o motoboy "não andaria".
  const start = Math.abs(end.latitude - STORE.latitude) + Math.abs(end.longitude - STORE.longitude) < 0.003
    ? { latitude: end.latitude + 0.012, longitude: end.longitude - 0.01 }
    : STORE;

  console.log(`Entrega ${delivery.id} → ${end.street}, ${end.number}`);
  console.log(`${steps} posições a cada ${INTERVAL_MS / 1000} s. Abra o pedido no app do cliente. Ctrl+C para parar.`);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Pequena oscilação lateral para o trajeto não parecer uma régua.
    const wobble = Math.sin(t * Math.PI * 3) * 0.0008 * (1 - t);
    const point = {
      sampleId: randomUUID(),
      latitude: start.latitude + (end.latitude - start.latitude) * t + wobble,
      longitude: start.longitude + (end.longitude - start.longitude) * t - wobble,
      accuracy: 8 + Math.round(Math.random() * 10),
      capturedAt: new Date().toISOString(),
    };
    try {
      await call(`/deliveries/${delivery.id}/location`, { method: 'POST', body: point, token: accessToken });
      console.log(`  ${i}/${steps}  ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`);
    } catch (err) {
      console.log(`  ${i}/${steps}  recusada: ${(err as Error).message}`);
    }
    if (i < steps) await sleep(INTERVAL_MS);
  }
  console.log('Chegou. Conclua a entrega pelo app do motoboy.');
}

main().catch(err => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
