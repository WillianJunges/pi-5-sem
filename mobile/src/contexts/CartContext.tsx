import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type CartItem, cartStorage, type NewCartItem } from '../services/cartStorage';
import { todayISODate } from '../utils/date';
import { useAuth } from './AuthContext';

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
      add: (item, quantity) => run((uid) => cartStorage.add(uid, item, quantity)),
      setQuantity: (id, quantity) => run((uid) => cartStorage.setQuantity(uid, id, quantity)),
      remove: (id) => run((uid) => cartStorage.setQuantity(uid, id, 0)),
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
