import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useCart } from '../../contexts/CartContext';
import { api } from '../../services/api';
import { customerMenuService } from '../../services/customerMenu.service';
import type { Order } from '../../services/orders.service';
import { getErrorMessage } from '../../utils/errors';
import { colors, spacing } from '../../theme';

type Category = 'MISSING' | 'WRONG' | 'OTHER';
type Extras = { estimatedMinutes: number | null; receiptConfirmedAt: string | null; review: { rating: number; comment: string | null } | null; requests: { id: string; category: Category; description: string; status: string }[] };
export function OrderExtras({ order }: { order: Order }) {
  const [data, setData] = useState<Extras | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<Category>('MISSING');
  const [description, setDescription] = useState('');
  const [support, setSupport] = useState(false);
  const { add, items: cartItems } = useCart();
  const load = useCallback(async () => { setData(await api<Extras>(`/orders/${order.id}/extras`)); }, [order.id]);
  useEffect(() => { load().catch(e => setError(getErrorMessage(e))); }, [load, order.status]);
  useEffect(() => { if (data?.review) { setRating(data.review.rating); setComment(data.review.comment ?? ''); } }, [data?.review?.rating, data?.review?.comment]);
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); } }
  async function repeat() {
    const menu = await customerMenuService.getToday();
    if (!menu) throw new Error('Não há cardápio disponível agora.');
    const missing: string[] = [];
    let added = 0;
    for (const item of order.items) {
      const product = menu.items.find(p => p.variations.some(v => v.variantId === item.variantId && v.availability !== 'SOLD_OUT'));
      const variant = product?.variations.find(v => v.variantId === item.variantId);
      if (!product || !variant || (cartItems.find(i => i.variantId === item.variantId)?.quantity ?? 0) + item.quantity > 50) { missing.push(item.productName); continue; }
      await add({ productId: product.productId, variantId: variant.variantId, name: product.name, variation: variant.name, unitPrice: variant.price, menuDate: menu.date }, item.quantity);
      added++;
    }
    Alert.alert('Repetir pedido', `${added ? 'Itens disponíveis adicionados ao carrinho.' : 'Nenhum item disponível hoje.'}${missing.length ? ` Indisponíveis ou acima do limite de 50 unidades: ${missing.join(', ')}.` : ''}`);
    if (added) router.push('/customer/(tabs)/cart');
  }
  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm } as const;
  const text = { color: colors.text, fontSize: 15 } as const;
  const title = { color: colors.text, fontSize: 16, fontWeight: 'bold' as const };
  const active = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const due = data?.estimatedMinutes ? new Date(new Date(order.createdAt).getTime() + data.estimatedMinutes * 60000) : null;
  return <>
    {active && due ? <View style={card}><Text style={title}>Previsão {order.fulfillment === 'PICKUP' ? 'para retirada' : 'de entrega'}</Text><Text style={text}>Até {due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · prazo médio de {data!.estimatedMinutes} min</Text><Text style={text}>É uma estimativa; seu pedido pode ficar pronto antes.</Text></View> : null}
    {data && order.status === 'DELIVERED' && order.fulfillment === 'DELIVERY' ? <View style={card}><Text style={title}>Você recebeu seu pedido?</Text>{data?.receiptConfirmedAt ? <Text style={text}>Recebimento confirmado.</Text> : <><Button title="Sim, recebi" loading={busy} onPress={() => run(() => api(`/orders/${order.id}/receipt`, { method: 'POST' }))} /><Button title="Não recebi" variant="outline" onPress={() => { setCategory('OTHER'); setDescription('Não recebi meu pedido.'); setSupport(true); }} /></>}</View> : null}
    {order.status === 'DELIVERED' ? <View style={card}><Text style={title}>Avalie seu pedido</Text><Text style={text}>Nota: {rating} de 5</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[1,2,3,4,5].map(n => <Text key={n} onPress={() => setRating(n)} style={{ color: colors.primary, fontSize: 26 }}>{n <= rating ? '★' : '☆'}</Text>)}</View><TextField label="Comentário (opcional)" value={comment} onChangeText={setComment} maxLength={500} multiline /><Button title={data?.review ? 'Atualizar avaliação' : 'Enviar avaliação'} loading={busy} onPress={() => run(() => api(`/orders/${order.id}/review`, { method: 'PUT', body: { rating, comment } }))} /></View> : null}
    <Button title="Repetir pedido" variant="outline" loading={busy} onPress={() => run(repeat)} />
    <View style={card}><Text style={title}>Ajuda com o pedido</Text>{!support ? <Button title="Relatar um problema" variant="outline" onPress={() => setSupport(true)} /> : <><Text style={text}>Selecione o problema:</Text>{(['MISSING','WRONG','OTHER'] as Category[]).map(c => <Button key={c} title={`${category === c ? '✓ ' : ''}${c === 'MISSING' ? 'Item faltando' : c === 'WRONG' ? 'Pedido errado' : 'Outro problema'}`} variant="outline" onPress={() => setCategory(c)} />)}<TextField label="Descreva o problema" value={description} onChangeText={setDescription} maxLength={1000} multiline /><Button title="Enviar solicitação" loading={busy} onPress={() => run(async () => { await api(`/orders/${order.id}/support`, { method: 'POST', body: { category, description } }); setDescription(''); setSupport(false); })} /><Button title="Voltar" variant="outline" onPress={() => setSupport(false)} /></>}{data?.requests.map(r => <Text key={r.id} style={text}>• {r.description} · {r.status === 'OPEN' ? 'Em aberto' : 'Resolvido'}</Text>)}</View>
    {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
  </>;
}
