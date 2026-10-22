const listeners = new Set<(userId: string) => void>();
/** Aviso solicita uma consulta canônica; nunca aplica o status informado pelo push. */
export const notificationRefresh = {
  subscribe(listener: (userId: string) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  request(userId: string) {
    for (const listener of listeners) listener(userId);
  },
};
