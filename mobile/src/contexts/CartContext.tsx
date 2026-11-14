import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type CartItem, cartStorage, type NewCartItem } from '../services/cartStorage';
import { todayISODate } from '../utils/date';
import { useAuth } from './AuthContext';
import { customerMenuService } from '../services/customerMenu.service';

interface CartContextValue {
  items: CartItem[];
  /** true enquanto lê o carrinho salvo no aparelho. */
  loading: boolean;
  /** Quantidade total de unidades (usado no selo da aba). */
  count: number;
  /** Soma de preço × quantidade. A taxa de entrega entra no checkout. */
  subtotal: number;
  add(item: NewCartItem, quantity: number): Promise<void>;
  setQuantity(id: string, quantity: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Grava os preços calculados pelo backend (variantId → preço em reais). */
  updatePrices(prices: Record<string, number>): Promise<void>;
  clear(): Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Carrinho do Cliente. Os dados ficam no SQLite (cartStorage); aqui fica o estado da tela. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    setItems(await cartStorage.getItems(userId, todayISODate()));
  }, [userId]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const value = useMemo<CartContextValue>(() => {
    async function requireAvailable(variantId: string, menuDate: string) {
      const menu = await customerMenuService.getToday();
      if (!menu || menu.date !== menuDate || !menu.items.some(item => item.variations.some(variation => variation.variantId === variantId))) {
        throw new Error('A marmitaria está fechada ou este item não está disponível agora.');
      }
    }
    // toda alteração grava no SQLite primeiro e depois relê, para a tela sempre mostrar o que está salvo
    async function run(change: (uid: string) => Promise<void>) {
      if (!userId) return;
      await change(userId);
      await reload();
    }

    return {
      items,
      loading,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      add: async (item, quantity) => { await requireAvailable(item.variantId, item.menuDate); await run((uid) => cartStorage.add(uid, item, quantity)); },
      setQuantity: async (id, quantity) => {
        const current = items.find(item => item.id === id);
        if (current && quantity > current.quantity) await requireAvailable(current.variantId, current.menuDate);
        await run((uid) => cartStorage.setQuantity(uid, id, quantity));
      },
      remove: (id) => run((uid) => cartStorage.setQuantity(uid, id, 0)),
      updatePrices: (prices) =>
        run(async (uid) => {
          for (const [id, price] of Object.entries(prices)) await cartStorage.setUnitPrice(uid, id, price);
        }),
      clear: () => run((uid) => cartStorage.clear(uid)),
    };
  }, [items, loading, userId, reload]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>');
  return ctx;
}
