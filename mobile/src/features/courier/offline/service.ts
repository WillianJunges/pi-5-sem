import type { DeliveriesGateway, Delivery, DeliveryCompletion, DeliveryPage } from '../../../services/deliveries.service';
import { CourierLocalError, type CourierLocalStorage, type PendingCompletion } from './types';

export interface CourierSyncState { pending: PendingCompletion[]; syncing: boolean; error: unknown; online: boolean; ready: boolean }
const statusOf = (error: unknown) => (error as { status?: number } | null)?.status;
const networkFailure = (error: unknown) => !(error instanceof CourierLocalError)
  && (error instanceof TypeError || statusOf(error) === 0 || (statusOf(error) ?? 0) >= 500);
const localFinished = (delivery: Delivery) => !!delivery.localCompletion;
const active = (delivery: Delivery) => !localFinished(delivery) && (delivery.status === 'ASSIGNED' || delivery.status === 'IN_PROGRESS');

/** Cache e worker têm uma conta fixa; não procuram "o usuário atual" para escolher destinatário. */
export class CourierOfflineService implements DeliveriesGateway {
  private state: CourierSyncState = { pending: [], syncing: false, error: null, online: true, ready: false };
  private listeners = new Set<() => void>();
  private localListeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private enabled = false;
  private foreground = true;
  // Revogação conhecida invalida respostas que ainda estavam em trânsito.
  private accessRevision = 0;
  constructor(
    readonly userId: string,
    private api: DeliveriesGateway,
    private storage: CourierLocalStorage,
    private currentSession: () => Promise<boolean>,
    private leaseId: () => string,
    private now: () => number = Date.now,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeLocal = (listener: () => void) => { this.localListeners.add(listener); return () => { this.localListeners.delete(listener); }; };
  private update(patch: Partial<CourierSyncState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private async changed() {
    this.update({ pending: await this.storage.pending(this.userId), ready: true });
    for (const listener of this.localListeners) listener();
  }
  private async session() {
    if (!await this.currentSession()) throw new CourierLocalError('Entre com a conta responsável por esta entrega para continuar.', 401);
  }
  private async allowed() {
    await this.session();
    if (await this.storage.isBlocked(this.userId)) throw new CourierLocalError('Conta sem permissão. Conecte-se e entre novamente para conferir o acesso.', 403);
  }
  private currentRead(revision: number) {
    if (revision !== this.accessRevision) throw new CourierLocalError('O acesso à entrega foi atualizado. Consulte novamente.', 409, 'access_changed');
  }
  private async revoke(id: string) { ++this.accessRevision; await this.storage.revoke(this.userId, id); }
  private async block() { ++this.accessRevision; await this.storage.block(this.userId, true); }
  private overlay(delivery: Delivery, items: PendingCompletion[], cached: boolean, warning?: unknown): Delivery {
    const item = items.find(row => row.deliveryId === delivery.id);
    return { ...delivery, fromCache: cached, warning,
      localCompletion: item ? { status: item.status, completedAt: item.completedAt, message: item.message } : undefined };
  }

  async activate(): Promise<void> {
    this.enabled = true;
    try { await this.session(); await this.changed(); await this.sync(true); }
    catch (error) { this.update({ error, ready: true }); }
  }
  deactivate() { this.enabled = false; }
  setForeground(value: boolean) { this.foreground = value; if (value) void this.sync(true); }
  setOnline(value: boolean) {
    const recovered = !this.state.online && value;
    this.update({ online: value });
    if (value) void this.sync(recovered);
  }

  async cachedGet(id: string): Promise<Delivery | null> {
    const revision = this.accessRevision;
    await this.allowed();
    const delivery = await this.storage.get(this.userId, id);
    const pending = await this.storage.pending(this.userId);
    await this.session();
    this.currentRead(revision);
    return delivery ? this.overlay(delivery, pending, true) : null;
  }
  async cachedList(filter: boolean, offset = 0): Promise<DeliveryPage> {
    const revision = this.accessRevision;
    await this.allowed();
    const items = await this.storage.pending(this.userId);
    const rows = (await this.storage.list(this.userId)).map(row => this.overlay(row, items, true))
      .filter(row => active(row) === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    await this.session();
    this.currentRead(revision);
    return { deliveries: rows.slice(offset, offset + 20), hasMore: rows.length > offset + 20, nextOffset: offset + 20, fromCache: true };
  }

  private async rejectedRead(error: unknown, id?: string) {
    if (statusOf(error) === 403) await this.block();
    if (statusOf(error) === 404 && id) await this.revoke(id);
    await this.changed();
  }
  async get(id: string): Promise<Delivery> {
    const revision = this.accessRevision;
    await this.session();
    try {
      if (!this.state.online) throw new TypeError('offline');
      const delivery = await this.api.get(id);
      await this.session();
      this.currentRead(revision);
      await this.storage.save(this.userId, [delivery]);
      this.currentRead(revision);
      await this.storage.block(this.userId, false);
      await this.changed();
      const current = await this.storage.get(this.userId, id);
      this.currentRead(revision);
      if (!current) throw new CourierLocalError('Entrega não disponível para esta conta.', 404);
      return this.overlay(current, this.state.pending, false);
    } catch (error) {
      if (networkFailure(error)) {
        const cached = await this.cachedGet(id);
        if (cached) return { ...cached, warning: error };
      } else await this.rejectedRead(error, id);
      throw error;
    }
  }
  async list(filter: boolean, offset = 0): Promise<DeliveryPage> {
    const revision = this.accessRevision;
    await this.session();
    try {
      if (!this.state.online) throw new TypeError('offline');
      const page = await this.api.list(filter, offset);
      await this.session();
      this.currentRead(revision);
      await this.storage.save(this.userId, page.deliveries);
      this.currentRead(revision);
      await this.storage.block(this.userId, false);
      // Quando recebemos a lista ativa inteira, desaparecimentos são verificados individualmente.
      if (filter && offset === 0 && !page.hasMore) {
        const visible = new Set(page.deliveries.map(row => row.id));
        for (const cached of await this.storage.list(this.userId)) {
          if (cached.status === 'ASSIGNED' || cached.status === 'IN_PROGRESS') {
            if (!visible.has(cached.id)) {
              try { await this.get(cached.id); } catch (error) { if (statusOf(error) !== 404) throw error; }
            }
          }
        }
      }
      await this.changed();
      const current = new Map((await this.storage.list(this.userId)).map(row => [row.id, row]));
      // Uma página solicitada antes do ACK não pode reabrir a entrega após a confirmação.
      const mapped = page.deliveries.filter(row => current.has(row.id)).map(row => this.overlay(current.get(row.id)!, this.state.pending, false));
      if (!filter && offset === 0) {
        const cached = (await this.storage.list(this.userId)).filter(row => this.state.pending.some(item => item.deliveryId === row.id));
        for (const row of cached) if (!mapped.some(item => item.id === row.id)) mapped.unshift(this.overlay(row, this.state.pending, false));
      }
      this.currentRead(revision);
      return { deliveries: mapped.filter(row => active(row) === filter), hasMore: page.hasMore, nextOffset: offset + page.deliveries.length };
    } catch (error) {
      if (networkFailure(error)) return { ...await this.cachedList(filter, offset), warning: error };
      await this.rejectedRead(error);
      throw error;
    }
  }

  async start(id: string): Promise<Delivery> {
    await this.allowed();
    if (!this.state.online) throw new CourierLocalError('Conecte-se para iniciar a entrega.', 409);
    const delivery = await this.api.start(id);
    await this.session();
    await this.storage.save(this.userId, [delivery]);
    await this.changed();
    return this.overlay(delivery, this.state.pending, false);
  }
  async complete(id: string, input: DeliveryCompletion): Promise<Delivery> {
    await this.allowed();
    // Persistir vem antes de qualquer envio: erro de SQLite nunca é mostrado como conclusão local.
    const item = await this.storage.enqueue(this.userId, id, input);
    await this.changed();
    await this.session();
    const delivery = await this.cachedGet(id);
    if (!delivery) throw new CourierLocalError('Não foi possível recuperar a entrega salva.', 507);
    if (item.status === 'pending') void this.sync();
    return delivery;
  }
  async retry(id?: string): Promise<void> {
    try {
      await this.session();
      await this.storage.retry(this.userId, id);
      await this.changed();
      await this.sync();
    } catch (error) { this.update({ error }); }
  }
  sync(force = false): Promise<void> {
    if (!this.enabled || !this.foreground || !this.state.online) return Promise.resolve();
    if (this.running) { this.rerun ||= force; return this.running; }
    this.running = this.synchronize(force).catch(error => { this.update({ error }); })
      .finally(async () => {
        this.running = null;
        this.update({ syncing: false });
        // Uma recuperação de rede durante o envio não pode perder seu gatilho de retomada.
        const repeat = this.rerun;
        this.rerun = false;
        if (repeat) await this.sync(true);
      });
    return this.running;
  }
  private async synchronize(force: boolean) {
    if (!this.enabled || !this.foreground || !this.state.online) return;
    await this.allowed();
    if (force) await this.storage.retry(this.userId);
    this.update({ syncing: true, error: null });
    for (let n = 0; n < 20 && this.enabled && this.foreground && this.state.online; n++) {
      await this.session();
      const item = await this.storage.claim(this.userId, this.now(), this.leaseId());
      if (!item) break;
      try {
        await this.session();
        const delivery = await this.api.complete(item.deliveryId, { operationId: item.operationId, completedAt: item.completedAt });
        // Uma resposta em voo pode chegar após logout; só confirma a operação da conta original.
        await this.storage.acknowledge(this.userId, item.operationId, delivery);
      } catch (error) {
        const status = statusOf(error);
        const conflict = status === 400 || status === 404 || status === 409 || status === 422;
        const message = conflict ? 'A entrega mudou ou a confirmação foi recusada. Confira com a proprietária.'
          : status === 401 || status === 403 ? 'Entre novamente com a conta responsável para sincronizar.'
            : 'A confirmação ainda não chegou. Vamos tentar novamente em instantes.';
        const delay = Math.min(300_000, 5_000 * 2 ** Math.min(item.attempts - 1, 6));
        await this.storage.fail(item, message, conflict, this.now() + delay);
        if (status === 404) await this.revoke(item.deliveryId);
        if (status === 403) await this.block();
        if (status === 401 || status === 403 || networkFailure(error) || error instanceof CourierLocalError) break;
      } finally { await this.changed(); }
    }
  }
}
