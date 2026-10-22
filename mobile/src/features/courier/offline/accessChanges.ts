type Rejection = { userId: string; deliveryId: string; status: 403 | 404 };
const listeners = new Set<(event: Rejection) => Promise<void>>();

/** A tarefa GPS avisa o gateway ativo antes de gravar uma revogação no cache compartilhado. */
export const courierAccessChanges = {
  subscribe(listener: (event: Rejection) => Promise<void>) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  async reject(event: Rejection) {
    await Promise.allSettled([...listeners].map(listener => listener(event)));
  },
};
