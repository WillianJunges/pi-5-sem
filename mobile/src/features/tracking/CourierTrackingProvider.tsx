import { type ReactNode, useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useCourierOffline } from '../courier/offline/CourierOfflineProvider';
import { reconcileTracking, stopCourierTracking } from './nativeTracking';

function ActiveTracking() {
  const service = useCourierOffline();
  useEffect(() => {
    const reconcile = () => { void reconcileTracking().catch(() => undefined); };
    const local = service.subscribeLocal(reconcile);
    const app = AppState.addEventListener('change', reconcile);
    const timer = setInterval(reconcile, 10_000);
    reconcile();
    return () => { local(); app.remove(); clearInterval(timer); };
  }, [service]);
  return null;
}
export function CourierTrackingProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && user?.role !== 'COURIER') void stopCourierTracking().catch(() => undefined);
  }, [user?.id, user?.role, loading]);
  return <>{user?.role === 'COURIER' ? <ActiveTracking key={user.id} /> : null}{children}</>;
}
