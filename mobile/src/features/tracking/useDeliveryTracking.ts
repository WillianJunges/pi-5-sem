import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../config/env';
import { api } from '../../services/api';
import { tokenStorage } from '../../services/tokenStorage';
import { mergeTracking, type TrackingView } from './policy';

/** Contrato reutilizável pelo mapa: REST inicial, socket e recuperação por REST. */
export function useDeliveryTracking(orderId: string) {
  const { user } = useAuth();
  const [view, setView] = useState<TrackingView | null>(null);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    setView(null); setConnected(false); setMessage(null);
    if (!user) return;
    const userId = user.id;
    const epoch = tokenStorage.getSessionEpoch();
    let active = true;
    let loading = false;
    let deliveryId: string | null = null;
    let socket: Socket | null = null;
    let ended = false;
    let accessBlocked = false;
    const current = () => active && epoch === tokenStorage.getSessionEpoch();
    function apply(next: TrackingView) {
      if (!current() || accessBlocked || next.deliveryId !== deliveryId) return;
      setView(old => mergeTracking(old, next));
      if (!next.active) { ended = true; socket?.disconnect(); setConnected(false); }
    }
    function rejected(error: unknown) {
      if (!current()) return;
      const status = (error as { status?: number })?.status;
      setMessage(status === 401 || status === 403 || status === 404 ? 'Rastreamento indisponível para esta sessão.' : 'Sem atualização de localização. Tentando reconectar.');
      setConnected(false);
      socket?.disconnect();
      if (status === 401 || status === 403 || status === 404) { accessBlocked = true; setView(null); }
    }
    async function connect() {
      if (!deliveryId || ended || !current() || AppState.currentState === 'background') return;
      const tokens = await tokenStorage.get();
      if (!tokens || !current()) return;
      if (socket) {
        if (!socket.connected) { socket.auth = { token: tokens.accessToken }; socket.connect(); }
        return;
      }
      socket = io(API_URL, { auth: { token: tokens.accessToken }, autoConnect: false, reconnection: true, timeout: 10_000 });
      socket.on('connect', () => {
        if (!current()) { socket?.disconnect(); return; }
        socket!.timeout(10_000).emit('delivery:subscribe', deliveryId, (error: Error | null, result: { ok: boolean; data?: TrackingView; status?: number }) => {
          if (!current()) return;
          if (error || !result?.ok || !result.data) { rejected(result ?? error); return; }
          setConnected(true); setMessage(null); apply(result.data);
        });
      });
      socket.on('delivery:location', (next: TrackingView) => { apply(next); if (current()) setMessage(null); });
      socket.on('tracking:error', rejected);
      socket.on('connect_error', () => { if (current()) { setConnected(false); setMessage('Reconectando ao rastreamento.'); } });
      socket.on('disconnect', () => { if (current()) setConnected(false); });
      socket.connect();
    }
    async function load() {
      if (!current() || loading || ended || AppState.currentState === 'background') return;
      loading = true;
      try {
        if (!deliveryId) {
          const delivery = await api<{ id: string }>(`/deliveries/order/${encodeURIComponent(orderId)}`, { expectedUserId: userId });
          if (!current()) return;
          deliveryId = delivery.id;
        }
        const next = await api<TrackingView>(`/deliveries/${deliveryId}/location`, { expectedUserId: userId });
        accessBlocked = false;
        apply(next);
        if (current()) setMessage(null);
        await connect();
      } catch (error) { rejected(error); }
      finally { loading = false; }
    }
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else { socket?.disconnect(); if (current()) setConnected(false); }
    });
    const timer = setInterval(() => { setNow(Date.now()); void load(); }, 15_000);
    void load();
    return () => { active = false; clearInterval(timer); app.remove(); socket?.disconnect(); };
  }, [orderId, user?.id]));
  return { view, connected, message, now };
}
