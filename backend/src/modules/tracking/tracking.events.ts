/** Notifica o servidor Socket.IO depois do commit, sem acoplar repository ao transporte. */
const listeners = new Set<(id: string) => void>();
export const trackingEvents = {
  subscribe(listener: (id: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  changed(id: string) { for (const listener of listeners) listener(id); },
};
