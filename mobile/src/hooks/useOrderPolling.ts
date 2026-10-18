import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

/** De quanto em quanto tempo o app pergunta ao backend se o status mudou. */
export const ORDER_POLL_INTERVAL_MS = 60_000;

/**
 * Acompanhamento do pedido (ponto 8a): enquanto a tela está aberta e o pedido ainda
 * não terminou, pergunta ao backend a cada ORDER_POLL_INTERVAL_MS se algo mudou.
 * É silencioso (sem spinner) e para quando:
 *   - o pedido é entregue ou cancelado (`active` vira false);
 *   - a tela sai de foco (o cliente navega para outra);
 *   - o app vai para segundo plano (volta a perguntar quando reabre).
 *
 * INTEGRAÇÃO (ponto 8b, Yuri): quando existir o Socket.IO, trocar este polling por um
 * listener do evento de status; a tela do pedido não precisa mudar. O polling pode
 * continuar como reserva de quando a conexão em tempo real cair.
 */
export function useOrderPolling(refresh: () => void, active: boolean) {
  // guarda sempre a última versão de refresh sem reiniciar o timer a cada render
  const savedRefresh = useRef(refresh);
  savedRefresh.current = refresh;

  useFocusEffect(
    useCallback(() => {
      if (!active) return;

      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        timer ??= setInterval(() => savedRefresh.current(), ORDER_POLL_INTERVAL_MS);
      };
      const stop = () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      start();
      const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
      return () => {
        stop();
        sub.remove();
      };
    }, [active]),
  );
}
