/**
 * TabCardapio.tsx
 * Aba de Cardápio — exibe o snapshot do cardápio que é injetado no
 * system-prompt da IA (Fase 2). Somente leitura.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Tag, UtensilsCrossed } from 'lucide-react';
import { Button } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import {
  adminOpsInsetPanelClass,
  adminOpsSurfaceCardClass,
  adminSectionEyebrowClass,
} from '../../components/ui/screenChrome';

type Additional = { name: string; price: number };
type Promotion   = { discount: number; label: string };

type MenuProduct = {
  id: number;
  name: string;
  price: number;
  category_id: number;
  category_name?: string;
  available: boolean;
  description?: string;
  additionals?: Additional[];
  promotions?: Promotion[];
};

type MenuCategory = { id: number; name: string; active: boolean };

type DeliveryConfig = {
  min_order?: number;
  delivery_fee?: number;
  estimated_time?: string;
};

type Pix = {
  enabled: boolean;
  key: string | null;
  key_type: string | null;
};

type MenuContextResponse = {
  success?: boolean;
  menu?: {
    categories: MenuCategory[];
    products: MenuProduct[];
    pix?: Pix;
    delivery_config?: DeliveryConfig;
  };
  error?: string;
};

type Props = { token: string };

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function TabCardapio({ token }: Props) {
  const [data,    setData]    = useState<MenuContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/ai/menu-context', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: MenuContextResponse = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Erro ao carregar cardápio.');
      } else {
        setData(json);
      }
    } catch {
      setError('Falha de conexão ao carregar cardápio.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const menu = data?.menu;

  // Agrupar produtos por categoria
  const byCategory = React.useMemo(() => {
    if (!menu) return new Map<number, { category: MenuCategory; products: MenuProduct[] }>();
    const map = new Map<number, { category: MenuCategory; products: MenuProduct[] }>();
    for (const cat of menu.categories) {
      map.set(cat.id, { category: cat, products: [] });
    }
    for (const product of menu.products) {
      const entry = map.get(product.category_id);
      if (entry) {
        entry.products.push(product);
      } else {
        // Produto sem categoria mapeada — categoria avulsa
        map.set(product.category_id, {
          category: { id: product.category_id, name: product.category_name ?? 'Sem categoria', active: true },
          products: [product],
        });
      }
    }
    // Remove categorias sem produtos
    for (const [key, val] of map) {
      if (val.products.length === 0) map.delete(key);
    }
    return map;
  }, [menu]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className={`${adminOpsSurfaceCardClass} flex items-start justify-between gap-4 p-4 sm:p-5`}>
        <div>
          <p className={adminSectionEyebrowClass}>Contexto da IA</p>
          <h2 className="mt-1 text-base font-black text-fptext-primary">
            Cardápio disponível à IA
          </h2>
          <p className="mt-1 text-sm text-fptext-muted">
            Estes dados são injetados automaticamente no prompt da IA antes de cada resposta.
            Somente produtos <strong>disponíveis</strong> são incluídos.
          </p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading} className="shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {loading && (
        <div className="flex min-h-[10rem] items-center justify-center">
          <Spinner />
        </div>
      )}

      {!loading && error && (
        <div className={`${adminOpsInsetPanelClass} p-4 text-sm text-red-600`}>{error}</div>
      )}

      {!loading && menu && (
        <>
          {/* Config de entrega + PIX */}
          <div className="grid gap-4 sm:grid-cols-2">
            {menu.delivery_config && (
              <div className={`${adminOpsSurfaceCardClass} p-4`}>
                <p className={adminSectionEyebrowClass}>Entrega</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {menu.delivery_config.min_order != null && (
                    <div className="flex justify-between">
                      <dt className="text-fptext-muted">Pedido mínimo</dt>
                      <dd className="font-semibold text-fptext-primary">{formatBRL(menu.delivery_config.min_order)}</dd>
                    </div>
                  )}
                  {menu.delivery_config.delivery_fee != null && (
                    <div className="flex justify-between">
                      <dt className="text-fptext-muted">Taxa de entrega</dt>
                      <dd className="font-semibold text-fptext-primary">{formatBRL(menu.delivery_config.delivery_fee)}</dd>
                    </div>
                  )}
                  {menu.delivery_config.estimated_time && (
                    <div className="flex justify-between">
                      <dt className="text-fptext-muted">Tempo estimado</dt>
                      <dd className="font-semibold text-fptext-primary">{menu.delivery_config.estimated_time}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {menu.pix && (
              <div className={`${adminOpsSurfaceCardClass} p-4`}>
                <p className={adminSectionEyebrowClass}>PIX</p>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-fptext-muted">Habilitado</dt>
                    <dd className={`font-semibold ${menu.pix.enabled ? 'text-emerald-600' : 'text-fptext-muted'}`}>
                      {menu.pix.enabled ? 'Sim' : 'Não'}
                    </dd>
                  </div>
                  {menu.pix.key && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-fptext-muted">Chave</dt>
                      <dd className="font-mono text-xs font-semibold text-fptext-primary">
                        {/* Mascarada — exibe apenas os 4 primeiros e 4 últimos caracteres */}
                        {menu.pix.key.length > 8
                          ? `${menu.pix.key.slice(0, 4)}···${menu.pix.key.slice(-4)}`
                          : '****'}
                      </dd>
                    </div>
                  )}
                  {menu.pix.key_type && (
                    <div className="flex justify-between">
                      <dt className="text-fptext-muted">Tipo</dt>
                      <dd className="font-semibold text-fptext-primary capitalize">{menu.pix.key_type}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

          {/* Produtos por categoria */}
          {byCategory.size === 0 ? (
            <div className={`${adminOpsSurfaceCardClass} flex flex-col items-center gap-3 p-10 text-center`}>
              <UtensilsCrossed size={32} className="text-fptext-muted" />
              <p className="text-sm text-fptext-muted">Nenhum produto disponível no cardápio.</p>
            </div>
          ) : (
            Array.from(byCategory.values()).map(({ category, products }) => (
              <div key={category.id} className={`${adminOpsSurfaceCardClass} overflow-hidden`}>
                <div className="flex items-center gap-2 border-b border-fp-border px-4 py-3">
                  <Tag size={13} className="shrink-0 text-fptext-muted" />
                  <h3 className="text-sm font-black text-fptext-primary">{category.name}</h3>
                  <span className="ml-auto text-xs text-fptext-muted">{products.length} produto(s)</span>
                </div>

                <ul className="divide-y divide-fp-border-soft">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-fptext-primary">{p.name}</span>
                          {!p.available && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                              Indisponível
                            </span>
                          )}
                          {p.promotions && p.promotions.length > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Promoção
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-fptext-muted line-clamp-2">{p.description}</p>
                        )}
                        {p.additionals && p.additionals.length > 0 && (
                          <p className="mt-1 text-[11px] text-fptext-muted">
                            Adicionais: {p.additionals.map((a) => a.name).join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-black text-fptext-primary">
                        {formatBRL(p.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <p className="text-center text-xs text-fptext-muted">
            Total: {menu.products.length} produto(s) em {menu.categories.length} categoria(s)
          </p>
        </>
      )}
    </div>
  );
}
