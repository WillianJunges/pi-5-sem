import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

/** Consulta status apenas com a tela visível; não coleta GPS nem executa tarefa de background. */
export function useCourierRefresh(refresh: () => Promise<void>, cancelReads: () => void, poll: boolean) {
  const latest = useRef({ refresh, cancelReads });
  latest.current = { refresh, cancelReads };
  useFocusEffect(useCallback(() => {
    // Na inicialização da ponte nativa, currentState pode ainda estar nulo.
    const reload = () => { if (AppState.currentState === 'active' || AppState.currentState == null) void latest.current.refresh(); };
    reload();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') reload();
      else latest.current.cancelReads();
    });
    // Polling temporário para refletir preparo/cancelamento até a etapa de notificações.
    const timer = poll ? setInterval(reload, 30_000) : null;
    return () => {
      if (timer) clearInterval(timer);
      subscription.remove();
      latest.current.cancelReads();
    };
  }, [poll]));
}
