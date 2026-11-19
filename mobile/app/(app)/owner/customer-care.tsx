import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { api } from '../../../src/services/api';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

type Ticket = { id: string; orderId: string; category: string; description: string; status: 'OPEN' | 'RESOLVED'; customerName: string; customerPhone: string | null; createdAt: string };
type Review = { orderId: string; rating: number; comment: string | null; customerName: string };
export default function CustomerCare() {
  const [minutes, setMinutes] = useState('60');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const [prefs, requests, ratings] = await Promise.all([api<{estimatedMinutes: number}>('/owner/preferences'), api<Ticket[]>('/owner/support'), api<Review[]>('/owner/reviews')]); setMinutes(String(prefs.estimatedMinutes)); setTickets(requests); setReviews(ratings); }, []);
  useFocusEffect(useCallback(() => { load().catch(e => setMessage(getErrorMessage(e))); }, [load]));
  async function run(action: () => Promise<unknown>, success: string) { setBusy(true); setMessage(''); try { await action(); await load(); setMessage(success); } catch(e) { setMessage(getErrorMessage(e)); } finally { setBusy(false); } }
  return <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, backgroundColor: colors.background }}>
    <View style={{ gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12 }}><Text style={{ fontWeight: 'bold', fontSize: 17, color: colors.text }}>Tempo médio geral</Text><Text style={{ color: colors.text }}>Prazo estimado em minutos para novos pedidos, tanto de entrega como de retirada.</Text><TextField label="Tempo em minutos (1 a 1440)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" /><Button title="Salvar prazo" loading={busy} onPress={() => run(() => api('/owner/preferences', { method: 'PUT', body: { estimatedMinutes: Number(minutes) } }), 'Prazo salvo.')} /></View>
    {message ? <Text style={{ color: colors.text }}>{message}</Text> : null}
    <Text style={{ fontWeight: 'bold', fontSize: 17, color: colors.text }}>Solicitações de ajuda</Text>
    {tickets.length === 0 ? <Text style={{ color: colors.muted }}>Nenhuma solicitação.</Text> : tickets.map(ticket => <View key={ticket.id} style={{ gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12 }}><Text style={{ color: colors.text, fontWeight: 'bold' }}>{ticket.customerName} · Pedido #{ticket.orderId.slice(0,8).toUpperCase()}</Text><Text style={{ color: colors.text }}>{ticket.category === 'MISSING' ? 'Item faltando' : ticket.category === 'WRONG' ? 'Pedido errado' : 'Outro problema'} · {ticket.status === 'OPEN' ? 'Em aberto' : 'Resolvido'}</Text><Text style={{ color: colors.text }}>{ticket.description}</Text>{ticket.customerPhone ? <Text style={{ color: colors.text }}>Telefone: {ticket.customerPhone}</Text> : null}<Button title={ticket.status === 'OPEN' ? 'Marcar como resolvido' : 'Reabrir'} variant="outline" loading={busy} onPress={() => run(() => api(`/owner/support/${ticket.id}`, { method: 'PATCH', body: { status: ticket.status === 'OPEN' ? 'RESOLVED' : 'OPEN' } }), 'Solicitação atualizada.')} /></View>)}
    <Text style={{ fontWeight: 'bold', fontSize: 17, color: colors.text }}>Avaliações recentes</Text>{reviews.length === 0 ? <Text style={{ color: colors.muted }}>Nenhuma avaliação.</Text> : reviews.map(review => <View key={review.orderId} style={{ gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12 }}><Text style={{ color: colors.text }}>{review.customerName} · Pedido #{review.orderId.slice(0,8).toUpperCase()} · {review.rating}/5</Text>{review.comment ? <Text style={{ color: colors.text }}>{review.comment}</Text> : null}</View>)}
  </ScrollView>;
}
