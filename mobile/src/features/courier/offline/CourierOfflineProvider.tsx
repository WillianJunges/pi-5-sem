import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { courierSessionGateway } from '../../../services/deliveries.service';
import { accessTokenUserId } from '../../../services/sessionTokens';
import { tokenStorage } from '../../../services/tokenStorage';
import { courierStorage } from './nativeStorage';
import { CourierOfflineService } from './service';

const Context = createContext<CourierOfflineService | null>(null);

/** O worker vive durante a sessão COURIER, inclusive quando o usuário abre seu perfil. */
export function CourierOfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.role === 'COURIER' ? user.id : null;
  const service = useMemo(() => userId ? new CourierOfflineService(
    userId, courierSessionGateway(userId), courierStorage,
    async () => {
      const tokens = await tokenStorage.get();
      return !!tokens && accessTokenUserId(tokens.accessToken) === userId;
    },
    () => Crypto.randomUUID(),
  ) : null, [userId]);

  useEffect(() => {
    if (!service) return;
    const foreground = () => AppState.currentState === 'active' || AppState.currentState == null;
    service.setForeground(foreground());
    const unsubscribe = NetInfo.addEventListener(state => {
      service.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    const app = AppState.addEventListener('change', () => service.setForeground(foreground()));
    void service.activate();
    // O SO não garante execução com o app fechado; o banco preserva a intenção até reabrir.
    const timer = setInterval(() => void service.sync(), 20_000);
    return () => { service.deactivate(); clearInterval(timer); unsubscribe(); app.remove(); };
  }, [service]);

  return <Context.Provider value={service}>{children}</Context.Provider>;
}

export function useCourierOffline(): CourierOfflineService {
  const value = useContext(Context);
  if (!value) throw new Error('A sessão do motoboy não está disponível');
  return value;
}
