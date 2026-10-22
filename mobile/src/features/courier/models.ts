import type { DeliveriesGateway, Delivery, DeliveryCompletion } from '../../services/deliveries.service';
import { canCompleteDelivery, canStartDelivery, isDeliveryActive } from './presentation';
import { CourierLocalError } from './offline/types';

/** Pequeno store observável: permite testar concorrência sem carregar módulos nativos. */
class Store<State> {
  private listeners = new Set<() => void>();
  constructor(protected state: State) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  protected update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function accessDenied(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403 || status === 404 || (error instanceof CourierLocalError && error.code === 'access_changed');
}

export interface DeliveriesListState {
  deliveries: Delivery[] | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  pageError: unknown;
  fromCache: boolean;
}

/** Cada aba tem seu store; respostas antigas não misturam entregas e histórico. */
export class DeliveriesListModel extends Store<DeliveriesListState> {
  private version = 0;
  private nextOffset = 0;
  constructor(private api: Pick<DeliveriesGateway, 'list' | 'cachedList' | 'cachedGet'>, private active: boolean) {
    super({ deliveries: null, hasMore: false, loading: false, loadingMore: false, error: null, pageError: null, fromCache: false });
  }

  async reload(): Promise<void> {
    if (this.state.loading) return;
    const version = ++this.version;
    this.update({ loading: true, loadingMore: false, pageError: null });
    try {
      if (this.api.cachedList && this.state.deliveries === null) {
        try {
          const cached = await this.api.cachedList(this.active);
          if (version === this.version) this.update({ deliveries: cached.deliveries, fromCache: true });
        } catch { /* A leitura de rede ainda pode confirmar/revalidar a conta. */ }
      }
      const page = await this.api.list(this.active);
      if (version !== this.version) return;
      this.nextOffset = page.nextOffset ?? page.deliveries.length;
      this.update({ deliveries: page.deliveries, hasMore: page.hasMore, error: page.warning ?? null, fromCache: !!page.fromCache });
    } catch (error) {
      if (version !== this.version) return;
      this.update({ error, ...(accessDenied(error) ? { deliveries: null, hasMore: false } : {}) });
    } finally {
      if (version === this.version) this.update({ loading: false });
    }
  }

  async loadMore(): Promise<void> {
    if (!this.state.deliveries || !this.state.hasMore || this.state.loading || this.state.loadingMore) return;
    const version = this.version;
    this.update({ loadingMore: true, pageError: null });
    try {
      const page = await this.api.list(this.active, this.nextOffset);
      if (version !== this.version) return;
      const ids = new Set(this.state.deliveries?.map(delivery => delivery.id));
      // Offset conta os registros recebidos, inclusive repetidos por inserções concorrentes.
      this.nextOffset = page.nextOffset ?? this.nextOffset + page.deliveries.length;
      this.update({ deliveries: [...(this.state.deliveries ?? []), ...page.deliveries.filter(delivery => !ids.has(delivery.id))], hasMore: page.hasMore });
    } catch (error) {
      if (version === this.version) {
        if (accessDenied(error)) this.update({ deliveries: null, hasMore: false, error });
        else this.update({ pageError: error });
      }
    } finally {
      if (version === this.version) this.update({ loadingMore: false });
    }
  }

  cancelReads() { ++this.version; this.update({ loading: false, loadingMore: false }); }

  /** Reaplica os estados locais sem disparar outra chamada de rede a cada evento de cache. */
  async refreshLocal(): Promise<void> {
    if (!this.api.cachedGet || !this.api.cachedList || !this.state.deliveries || this.state.loading) return;
    const version = this.version;
    try {
      const rows = await Promise.all(this.state.deliveries.map(row => this.api.cachedGet!(row.id)));
      const deliveries = rows.filter((row): row is Delivery => !!row && isDeliveryActive(row) === this.active);
      if (!this.active) {
        for (const row of (await this.api.cachedList(false)).deliveries) {
          if (row.localCompletion && !deliveries.some(existing => existing.id === row.id)) deliveries.unshift(row);
        }
      }
      if (version === this.version) this.update({ deliveries });
    } catch (error) {
      if (version === this.version) this.update({ error, ...(accessDenied(error) ? { deliveries: null } : {}) });
    }
  }
}

export interface DeliveryDetailsState {
  delivery: Delivery | null;
  loading: boolean;
  busy: 'start' | 'complete' | null;
  error: unknown;
  stale: boolean;
  pendingCompletion: boolean;
}

/**
 * O gateway offline persiste antes de devolver uma conclusão local à tela.
 * A variante online continua guardando a tentativa em memória para testes/compatibilidade.
 */
export class DeliveryDetailsModel extends Store<DeliveryDetailsState> {
  private version = 0;
  private completion: DeliveryCompletion | null = null;
  constructor(
    private api: Pick<DeliveriesGateway, 'get' | 'start' | 'complete' | 'cachedGet'>,
    private id: string,
    private newOperation: () => DeliveryCompletion,
  ) {
    super({ delivery: null, loading: false, busy: null, error: null, stale: true, pendingCompletion: false });
  }

  private accept(delivery: Delivery) {
    if (!isDeliveryActive(delivery)) this.completion = null;
    this.update({ delivery, stale: !!delivery.fromCache, error: delivery.warning ?? null, pendingCompletion: !!delivery.localCompletion || this.completion !== null });
  }

  async reload(): Promise<void> {
    if (this.state.loading || this.state.busy) return;
    const version = ++this.version;
    this.update({ loading: true });
    try {
      if (this.api.cachedGet && !this.state.delivery) {
        try {
          const cached = await this.api.cachedGet(this.id);
          if (cached && version === this.version) this.accept(cached);
        } catch { /* O servidor pode restabelecer o acesso da conta. */ }
      }
      const delivery = await this.api.get(this.id);
      if (version === this.version) this.accept(delivery);
    } catch (error) {
      if (version === this.version) this.update({ error, stale: true, ...(accessDenied(error) ? { delivery: null } : {}) });
    } finally {
      if (version === this.version) this.update({ loading: false });
    }
  }

  start() { return this.perform('start'); }
  complete() { return this.perform('complete'); }

  private async perform(action: 'start' | 'complete'): Promise<void> {
    const current = this.state.delivery;
    if (!current || this.state.busy) return;
    if ((this.state.loading || this.state.stale) && (action === 'start' || !this.api.cachedGet)) return;
    if (action === 'start' ? !canStartDelivery(current) : !canCompleteDelivery(current)) return;
    try {
      if (action === 'complete') this.completion ??= this.newOperation();
    } catch (error) {
      this.update({ error });
      return;
    }
    // Uma leitura anterior à ação não pode sobrescrever seu resultado quando chegar atrasada.
    ++this.version;
    this.update({ busy: action, loading: false, error: null, pendingCompletion: this.completion !== null });
    try {
      const delivery = action === 'start'
        ? await this.api.start(this.id)
        : await this.api.complete(this.id, { ...this.completion! });
      this.accept(delivery);
    } catch (error) {
      this.update({ error, stale: true, ...(accessDenied(error) ? { delivery: null } : {}) });
      if (!accessDenied(error)) {
        // Também reconcilia 409: a proprietária pode ter cancelado ou trocado o motoboy.
        try {
          const delivery = await this.api.get(this.id);
          this.accept(delivery);
          if (isDeliveryActive(delivery)) this.update({ error });
        } catch (readError) {
          this.update({ error: readError, stale: true, ...(accessDenied(readError) ? { delivery: null } : {}) });
        }
      }
    } finally { this.update({ busy: null }); }
  }

  cancelReads() { ++this.version; this.update({ loading: false }); }

  async refreshLocal(): Promise<void> {
    if (!this.api.cachedGet) return;
    const version = this.version;
    try {
      const delivery = await this.api.cachedGet(this.id);
      if (version === this.version && delivery) this.update({ delivery, pendingCompletion: !!delivery.localCompletion });
      if (version === this.version && !delivery && this.state.delivery) this.update({ delivery: null, stale: true,
        error: { status: 404, message: 'Entrega sem acesso nesta conta.' } });
    } catch (error) {
      if (version === this.version) this.update({ error, stale: true, ...(accessDenied(error) ? { delivery: null } : {}) });
    }
  }
}
