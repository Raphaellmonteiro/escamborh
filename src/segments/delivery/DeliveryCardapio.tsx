// src/segments/delivery/DeliveryCardapio.tsx
// Cardápio online premium — design limpo, login por telefone
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart, Plus, Minus, MapPin, Smartphone, Banknote,
  CreditCard, CheckCircle2, Search, Package, User, LogOut,
  History, ArrowLeft, Trash2, Home, ChevronRight, Clock,
  Bike, Heart, X, Pencil, AlertCircle,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface OpcaoItem { id: number; nome: string; preco_adicional: number; }
interface GrupoOpcao {
  id: number; nome: string; tipo: 'radio'|'checkbox'|'quantidade';
  min_selecoes: number; max_selecoes: number; obrigatorio: boolean;
  modo_preco?: 'adicional'|'final'; // 'final' = item define o preço total, não adiciona ao base
  itens: OpcaoItem[];
}
interface Produto {
  id: number; name: string; price: number; category: string;
  photo_url?: string; description?: string;
  grupos_opcao?: GrupoOpcao[];
}
interface Categoria { nome: string; itens: Produto[]; }
interface Config { taxa_entrega: number; pedido_minimo: number; tempo_preparo: number; pix_chave?: string; pix_nome?: string; pix_cidade?: string; whatsapp?: string; horario_abertura?: string; horario_fechamento?: string; desconto_pix?: number; zonas_entrega?: Array<{nome: string; taxa: number}>; }

// Seleção de opções: mapa grupoId → {itemId: quantidade}
type Selecoes = Record<number, Record<number, number>>;

interface CartItem extends Produto {
  qty: number;
  selecoes?: Selecoes;        // opções selecionadas
  preco_final: number;        // preço base + adicionais
  obs_opcoes?: string;        // descrição textual das opções (para o pedido)
  cart_key: string;           // chave única para diferenciar variações do mesmo produto
}
interface Endereco { id: number; label: string; logradouro: string; numero?: string; complemento?: string; bairro?: string; referencia?: string; principal: number; }
interface ClienteAuth { id: number; nome: string; telefone: string; email?: string; favoritos: number[]; }
interface PedidoHist { id: number; order_number: string; status: string; total_amount: number; created_at: string; resumo_itens: string; itens_raw?: string; }
type Tela = 'cardapio'|'cart'|'checkout'|'confirmado'|'conta'|'identificar'|'historico'|'enderecos'|'novo_endereco'|'editar_perfil';

const fmt = (v: number) => `R$ ${(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}`;
const STATUS_COR: Record<string,string> = { 'Pedido Recebido':'bg-blue-100 text-blue-700 border border-blue-200','Em Preparo':'bg-amber-100 text-amber-700 border border-amber-200','Pronto para Entrega':'bg-purple-100 text-purple-700 border border-purple-200','Saiu para Entrega':'bg-orange-100 text-orange-700 border border-orange-200','Entregue':'bg-emerald-100 text-emerald-700 border border-emerald-200','Cancelado':'bg-red-100 text-red-700 border border-red-200' };
const STATUS_TXT: Record<string,string> = { 'Pedido Recebido':'Recebido','Em Preparo':'Em Preparo','Pronto para Entrega':'Pronto','Saiu para Entrega':'A caminho 🛵','Entregue':'Entregue ✓','Cancelado':'Cancelado' };

// Calcula o preço mínimo possível de um produto com opções
function calcPrecoMinimo(produto: Produto): number {
  const grupos = produto.grupos_opcao || [];
  let precoBase = produto.price;
  let extraAdicional = 0;
  let maxFinal = 0;
  let temFinal = false;

  for (const g of grupos) {
    if (!g.obrigatorio || !g.itens.length) continue;
    if (g.modo_preco === 'final' && g.tipo === 'radio') {
      temFinal = true;
      const minFinal = Math.min(...g.itens.map(it => it.preco_adicional));
      maxFinal = Math.max(maxFinal, minFinal);
    } else if (g.tipo === 'radio') {
      extraAdicional += Math.min(...g.itens.map(it => it.preco_adicional));
    }
  }
  return temFinal ? maxFinal : precoBase + extraAdicional;
}

// Gera seleção inicial — pré-seleciona o item mais barato de cada grupo radio obrigatório
function gerarSelecaoInicial(grupos: GrupoOpcao[]): Selecoes {
  const sel: Selecoes = {};
  for (const g of grupos) {
    if (!g.obrigatorio || g.tipo !== 'radio' || !g.itens.length) continue;
    const maisBarato = g.itens.reduce((a, b) => a.preco_adicional <= b.preco_adicional ? a : b);
    sel[g.id] = { [maisBarato.id]: 1 };
  }
  return sel;
}
function gerarCartKey(prodId: number, selecoes: Selecoes): string {
  const partes = Object.entries(selecoes).map(([gId, itens]) =>
    `${gId}:${Object.entries(itens).filter(([,q])=>q>0).map(([iId,q])=>`${iId}x${q}`).join(',')}`
  ).join('|');
  return `${prodId}_${partes}`;
}

// Calcula adicional total das seleções
// modo 'adicional' (padrão): soma preco_adicional ao preço base do produto
// modo 'final': o item selecionado É o preço total; subtrai o preço base para obter o "delta"
function calcAdicionais(grupos: GrupoOpcao[], selecoes: Selecoes, precoBase: number = 0): number {
  let delta = 0;
  for (const g of grupos) {
    const itensSel: Record<number,number> = selecoes[g.id] || {};
    if (g.modo_preco === 'final') {
      // Pega o maior preço_adicional selecionado neste grupo (representa o preço final do produto)
      let maxFinal = 0;
      for (const item of g.itens) {
        const qty = (itensSel[item.id] as number) || 0;
        if (qty > 0 && item.preco_adicional > maxFinal) maxFinal = item.preco_adicional;
      }
      if (maxFinal > 0) delta = Math.max(delta, maxFinal - precoBase);
    } else {
      // Modo padrão: soma adicionais
      for (const item of g.itens) {
        const qty = (itensSel[item.id] as number) || 0;
        delta += item.preco_adicional * qty;
      }
    }
  }
  return delta;
}

// Gera texto legível das seleções
function descreverSelecoes(grupos: GrupoOpcao[], selecoes: Selecoes): string {
  const partes: string[] = [];
  for (const g of grupos) {
    const itensSel: Record<number,number> = selecoes[g.id] || {};
    const selecionados = g.itens.filter(it => ((itensSel[it.id] as number)||0) > 0)
      .map(it => g.tipo === 'quantidade' && ((itensSel[it.id] as number)||0) > 1
        ? `${it.nome} x${itensSel[it.id]}`
        : it.nome);
    if (selecionados.length) partes.push(`${g.nome}: ${selecionados.join(', ')}`);
  }
  return partes.join(' | ');
}

function getSlug() {
  const m = window.location.pathname.match(/^\/delivery\/([^/]+)/);
  if (m) return m[1];
  const sp = new URLSearchParams(window.location.search);
  return sp.get('delivery_slug') || sp.get('_delivery_slug') || '';
}

function useClienteAuth(slug: string) {
  const KEY = `dc_token_${slug}`;
  const [token, setToken] = useState<string|null>(() => localStorage.getItem(KEY));
  const [cliente, setCliente] = useState<ClienteAuth|null>(null);
  const [carregando, setCarregando] = useState(true);
  const salvar = useCallback((t: string, c: ClienteAuth) => { localStorage.setItem(KEY, t); setToken(t); setCliente(c); }, [KEY]);
  const logout = useCallback(() => { localStorage.removeItem(KEY); setToken(null); setCliente(null); }, [KEY]);
  const atualizarFavoritos = useCallback((favs: number[]) => { setCliente(c => c ? { ...c, favoritos: favs } : c); }, []);
  useEffect(() => {
    if (!token || !slug) { setCarregando(false); return; }
    fetch(`/public/delivery/${slug}/cliente/perfil`, { headers: { Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCliente({ id:d.id, nome:d.nome, telefone:d.telefone, email:d.email, favoritos: Array.isArray(d.favoritos)?d.favoritos:[] }); else logout(); })
      .catch(() => logout()).finally(() => setCarregando(false));
  }, [token, slug]);
  return { token, cliente, carregando, salvar, logout, atualizarFavoritos };
}

export default function DeliveryCardapio() {
  const slug = getSlug();
  const { token: cliToken, cliente, carregando: authLoad, salvar: salvarToken, logout, atualizarFavoritos } = useClienteAuth(slug);
  const [nome, setNome] = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [config, setConfig] = useState<Config>({ taxa_entrega:0, pedido_minimo:0, tempo_preparo:40 });
  const [ativo, setAtivo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tela, setTela] = useState<Tela>('cardapio');
  const [search, setSearch] = useState('');
  const [catAtiva, setCatAtiva] = useState('');
  const [pedidoOk, setPedidoOk] = useState<{orderNumber:string;waLink:string|null;total:number;orderId:number;pagamento_tipo:string;mapsUrl?:string;itens?:any[]}|null>(null);
  const [abaCardapio, setAbaCardapio] = useState<'todos'|'favoritos'>('todos');
  const [produtoModal, setProdutoModal] = useState<Produto|null>(null); // modal de opções
  const catRefs = useRef<Record<string, HTMLDivElement|null>>({});

  useEffect(() => {
    if (!slug) return;
    fetch(`/public/delivery/${slug}/cardapio`).then(r=>r.json()).then(d => {
      setNome(d.estabelecimento||''); setAtivo(d.ativo);
      setCategorias(d.categorias||[]); setConfig(d.config||{});
      if (d.categorias?.length) setCatAtiva(d.categorias[0].nome);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [slug]);

  const subtotal = useMemo(() => cart.reduce((a,i)=>a+i.preco_final*i.qty,0), [cart]);
  const total = subtotal + (config.taxa_entrega||0);
  const totalItens = cart.reduce((a,i)=>a+i.qty,0);
  // Abre modal de opções se produto tiver grupos, senão adiciona direto
  const handleAddProduto = (p: Produto) => {
    if (!ativo) return;
    if (p.grupos_opcao && p.grupos_opcao.length > 0) {
      setProdutoModal(p);
    } else {
      // Sem opções — adiciona direto
      const cartKey = `${p.id}_`;
      setCart(prev => {
        const ex = prev.find(i => i.cart_key === cartKey);
        return ex
          ? prev.map(i => i.cart_key === cartKey ? {...i, qty: i.qty+1} : i)
          : [...prev, {...p, qty:1, preco_final: p.price, cart_key: cartKey}];
      });
    }
  };

  const addCartItem = (item: CartItem) => {
    setCart(prev => {
      const ex = prev.find(i => i.cart_key === item.cart_key);
      return ex
        ? prev.map(i => i.cart_key === item.cart_key ? {...i, qty: i.qty+1} : i)
        : [...prev, item];
    });
  };

  const removeCart = (cartKey: string) => setCart(prev => {
    const ex = prev.find(i => i.cart_key === cartKey);
    if (!ex) return prev;
    return ex.qty === 1 ? prev.filter(i => i.cart_key !== cartKey) : prev.map(i => i.cart_key === cartKey ? {...i, qty: i.qty-1} : i);
  });

  const cartQty = (id: number) => cart.filter(i=>i.id===id).reduce((a,i)=>a+i.qty,0);

  const toggleFav = async (prodId: number) => {
    if (!cliToken || !cliente) { setTela('identificar'); return; }
    const favs = cliente.favoritos.includes(prodId) ? cliente.favoritos.filter(f=>f!==prodId) : [...cliente.favoritos, prodId];
    atualizarFavoritos(favs);
    fetch(`/public/delivery/${slug}/cliente/favoritos`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${cliToken}`}, body:JSON.stringify({favoritos:favs}) });
  };

  const prodsFiltrados = useMemo(() => {
    let cats = categorias;
    if (search) { const t=search.toLowerCase(); cats=cats.map(c=>({...c,itens:c.itens.filter(p=>p.name.toLowerCase().includes(t)||(p.description||'').toLowerCase().includes(t))})).filter(c=>c.itens.length>0); }
    if (abaCardapio==='favoritos'&&cliente?.favoritos.length) cats=cats.map(c=>({...c,itens:c.itens.filter(p=>cliente.favoritos.includes(p.id))})).filter(c=>c.itens.length>0);
    return cats;
  }, [categorias, search, abaCardapio, cliente?.favoritos]);

  const onPedidoOk = (d:{orderNumber:string;waLink:string|null;total:number;orderId:number;pagamento_tipo:string;mapsUrl?:string;itens?:any[]}) => { setCart([]); setPedidoOk(d); setTela('confirmado'); };

  if (loading||authLoad) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-zinc-100 border-t-emerald-500 rounded-full animate-spin"/>
        <p className="text-zinc-400 text-sm">Carregando cardápio...</p>
      </div>
    </div>
  );
  if (!slug) return <div className="min-h-screen bg-white flex items-center justify-center text-zinc-300"><Package size={48}/></div>;

  if (tela==='confirmado'&&pedidoOk) return <TelaConfirmado pedidoOk={pedidoOk} config={config} slug={slug} onNovo={()=>{setPedidoOk(null);setTela('cardapio');}} />;
  if (tela==='identificar') return <TelaIdentificar slug={slug} onSuccess={(t,c)=>{salvarToken(t,c);setTela('cardapio');}} onBack={()=>setTela('cardapio')} />;
  if (tela==='conta') return <TelaConta slug={slug} token={cliToken} cliente={cliente} onLogout={()=>{logout();setTela('cardapio');}} onBack={()=>setTela('cardapio')} onHistorico={()=>setTela('historico')} onEnderecos={()=>setTela('enderecos')} onEditarPerfil={()=>setTela('editar_perfil')} />;
  if (tela==='editar_perfil') return <TelaEditarPerfil slug={slug} token={cliToken} cliente={cliente} onSaved={(c)=>{salvarToken(cliToken!,c);setTela('conta');}} onBack={()=>setTela('conta')} />;
  if (tela==='historico') return <TelaHistorico slug={slug} token={cliToken} onBack={()=>setTela('conta')} onRepetir={(its)=>{its.forEach(i=>addCartItem({...i,qty:1,preco_final:i.price,cart_key:`${i.id}_`,selecoes:{}}));setTela('cart');}} categorias={categorias} />;
  if (tela==='enderecos') return <TelaEnderecos slug={slug} token={cliToken} onBack={()=>setTela('conta')} onNovo={()=>setTela('novo_endereco')} />;
  if (tela==='novo_endereco') return <TelaNovo Endereco slug={slug} token={cliToken} onBack={()=>setTela('enderecos')} onSaved={()=>setTela('enderecos')} />;
  if (tela==='cart') return <TelaCart cart={cart} config={config} onAdd={(p)=>addCartItem({...p,qty:1})} onRemove={(key)=>removeCart(key)} onBack={()=>setTela('cardapio')} onCheckout={()=>{if(!cliente){setTela('identificar');return;}setTela('checkout');}} />;
  if (tela==='checkout') return <TelaCheckout slug={slug} cart={cart} config={config} cliToken={cliToken} cliente={cliente!} onBack={()=>setTela('cart')} onSuccess={onPedidoOk} />;

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-zinc-900 tracking-tight">{nome}</h1>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-zinc-500"><Clock size={11}/>{config.tempo_preparo||40}–{(config.tempo_preparo||40)+10}min</span>
              {config.taxa_entrega>0
                ? <span className="flex items-center gap-1 text-xs text-zinc-500"><Bike size={11}/>{fmt(config.taxa_entrega)}</span>
                : <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><Bike size={11}/>Entrega grátis</span>}
              <span className={`flex items-center gap-1 text-xs font-semibold ${ativo?'text-emerald-600':'text-red-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ativo?'bg-emerald-500 animate-pulse':'bg-red-500'}`}/>
                {ativo?'Aberto agora':'Fechado'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={()=>setTela(cliente?'conta':'identificar')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition-all ${cliente?'bg-emerald-500 text-white hover:bg-emerald-600':'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
              <User size={14}/>{cliente?cliente.nome.split(' ')[0]:'Entrar'}
            </button>
            <button onClick={()=>setTela('cart')} className="relative p-2.5 bg-zinc-900 rounded-full text-white hover:bg-zinc-700 transition-all active:scale-95">
              <ShoppingCart size={16}/>
              {totalItens>0&&<motion.span initial={{scale:0}} animate={{scale:1}} className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full text-[10px] font-black flex items-center justify-center">{totalItens}</motion.span>}
            </button>
          </div>
        </div>
      </header>

      {/* Aviso fechado */}
      {!ativo && (
        <div className="bg-red-500 text-white text-sm font-semibold text-center py-2.5 px-4 flex items-center justify-center gap-2">
          <Clock size={14}/> Delivery fechado no momento {config.horario_abertura&&`• Abre às ${config.horario_abertura}`}
        </div>
      )}

      {/* Banner cliente */}
      {cliente && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm font-medium">Olá, {cliente.nome.split(' ')[0]}! 👋 Bem-vindo de volta.</p>
            <button onClick={()=>setTela('conta')} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full font-bold transition-all">Minha conta →</button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-4">
        {/* Busca */}
        <div className="relative">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar no cardápio..."
            className="w-full pl-11 pr-10 py-3.5 bg-white border border-zinc-200 rounded-2xl text-sm shadow-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all"/>
          {search&&<button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 rounded-full"><X size={14}/></button>}
        </div>

        {/* Abas */}
        {cliente && !search && (
          <div className="flex gap-2">
            {([{k:'todos',l:'Todos'},{k:'favoritos',l:`♥ Favoritos (${cliente.favoritos.length})`}] as const).map(a=>(
              <button key={a.k} onClick={()=>setAbaCardapio(a.k)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${abaCardapio===a.k?'bg-zinc-900 text-white shadow':'bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300'}`}>
                {a.l}
              </button>
            ))}
          </div>
        )}

        {/* Categorias */}
        {!search && abaCardapio==='todos' && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            {categorias.map(c=>(
              <button key={c.nome}
                onClick={()=>{ setCatAtiva(c.nome); catRefs.current[c.nome]?.scrollIntoView({behavior:'smooth',block:'start'}); }}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all ${catAtiva===c.nome?'bg-zinc-900 text-white shadow':'bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-300'}`}>
                {c.nome}
              </button>
            ))}
          </div>
        )}

        {/* Produtos */}
        {prodsFiltrados.length===0
          ? <div className="text-center py-20 text-zinc-400">
              <Heart size={40} className="mx-auto mb-3 opacity-20"/>
              <p className="font-semibold text-sm">{abaCardapio==='favoritos'?'Nenhum favorito — toque no ♥ para salvar':'Nenhum produto encontrado'}</p>
            </div>
          : prodsFiltrados.map(cat=>(
            <div key={cat.nome} ref={el=>{catRefs.current[cat.nome]=el}}>
              <div className="flex items-center gap-3 mb-3 pt-2">
                <h2 className="text-base font-black text-zinc-900">{cat.nome}</h2>
                <div className="flex-1 h-px bg-zinc-200"/>
                <span className="text-xs text-zinc-400">{cat.itens.length}x</span>
              </div>
              <div className="space-y-2">
                {cat.itens.map(p=>{
                  const qty=cartQty(p.id);
                  const isFav=cliente?.favoritos.includes(p.id)||false;
                  const temOpcoes = p.grupos_opcao && p.grupos_opcao.length > 0;
                  const precoMinimo = calcPrecoMinimo(p);
                  const temPrecoVariavel = precoMinimo > p.price; // grupos obrigatórios adicionam valor
                  return (
                    <div key={p.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 transition-all ${qty>0?'border-emerald-300':'border-transparent hover:border-zinc-100 hover:shadow-md'}`}>
                      <div className="flex items-stretch">
                        {p.photo_url && (
                          <div className="w-[90px] relative flex-shrink-0 overflow-hidden cursor-pointer" onClick={()=>handleAddProduto(p)}>
                            <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover"/>
                            {qty>0&&<div className="absolute bottom-1.5 left-1.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-black shadow">{qty}</div>}
                          </div>
                        )}
                        <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-zinc-900 text-sm leading-tight cursor-pointer" onClick={()=>handleAddProduto(p)}>{p.name}</p>
                              <button onClick={()=>toggleFav(p.id)} className="shrink-0 mt-0.5 p-0.5 active:scale-125 transition-transform">
                                <Heart size={14} className={isFav?'fill-red-500 text-red-500':'text-zinc-300 hover:text-zinc-400 transition-colors'}/>
                              </button>
                            </div>
                            {p.description&&<p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{p.description}</p>}
                            {temOpcoes && <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">⚙️ Personalizável</p>}
                          </div>
                          <div className="flex items-center justify-between mt-2.5">
                            {/* Preço: mostra "a partir de" se grupos obrigatórios têm preço adicional */}
                            <div>
                              {temPrecoVariavel ? (
                                <div>
                                  <span className="text-[10px] text-zinc-400 font-medium">a partir de</span>
                                  <p className="font-black text-emerald-600 text-base leading-tight">{fmt(precoMinimo)}</p>
                                </div>
                              ) : (
                                <span className="font-black text-emerald-600 text-base">{fmt(p.price)}</span>
                              )}
                            </div>
                            {/* Se tem opções: sempre mostra botão "Adicionar" que abre modal */}
                            {temOpcoes ? (
                              <button onClick={()=>ativo&&handleAddProduto(p)} disabled={!ativo}
                                className="flex items-center gap-1 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-200 text-white disabled:text-zinc-400 rounded-full text-xs font-bold transition-all active:scale-95">
                                {qty>0?<><span className="bg-white/20 px-1.5 rounded-md font-black">{qty}</span> Adicionar</>:<><Plus size={12}/>Adicionar</>}
                              </button>
                            ) : qty===0 ? (
                              <button onClick={()=>ativo&&handleAddProduto(p)} disabled={!ativo}
                                className="flex items-center gap-1 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-200 text-white disabled:text-zinc-400 rounded-full text-xs font-bold transition-all active:scale-95">
                                <Plus size={12}/>Adicionar
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5">
                                <button onClick={()=>removeCart(`${p.id}_`)} className="w-7 h-7 bg-white rounded-full shadow-sm flex items-center justify-center text-zinc-700 hover:text-red-500 transition-colors active:scale-95"><Minus size={11}/></button>
                                <span className="w-5 text-center font-black text-sm text-zinc-900">{qty}</span>
                                <button onClick={()=>handleAddProduto(p)} className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center text-white hover:bg-emerald-600 transition-colors active:scale-95"><Plus size={11}/></button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        }
      </div>

      {/* Carrinho fixo */}
      <AnimatePresence>
        {cart.length>0&&(
          <motion.div initial={{y:100,opacity:0}} animate={{y:0,opacity:1}} exit={{y:100,opacity:0}} className="fixed bottom-5 left-4 right-4 max-w-2xl mx-auto z-30">
            <button onClick={()=>setTela('cart')}
              className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-black shadow-2xl flex items-center justify-between px-5 active:scale-[0.98] transition-all">
              <span className="bg-white/20 px-2.5 py-1 rounded-xl text-sm font-black">{totalItens}</span>
              <span className="flex items-center gap-2"><ShoppingCart size={16}/>Ver Carrinho</span>
              <span className="text-emerald-400">{fmt(subtotal)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de opções do produto */}
      <AnimatePresence>
        {produtoModal && (
          <ModalOpcoes
            produto={produtoModal}
            onClose={()=>setProdutoModal(null)}
            onAdicionar={(item)=>{ addCartItem(item); setProdutoModal(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL DE OPÇÕES DO PRODUTO
// ═══════════════════════════════════════════════════════════════════════════════
function ModalOpcoes({ produto, onClose, onAdicionar }: {
  produto: Produto;
  onClose: ()=>void;
  onAdicionar: (item: CartItem)=>void;
}) {
  const grupos = produto.grupos_opcao || [];
  const [selecoes, setSelecoes] = useState<Selecoes>(() => gerarSelecaoInicial(grupos));
  const [obs, setObs] = useState('');
  const [qty, setQty] = useState(1);
  const [erros, setErros] = useState<Record<number,string>>({});

  const adicional = calcAdicionais(grupos, selecoes, produto.price);
  const precoUnit = produto.price + adicional;
  const precoTotal = precoUnit * qty;

  const toggleRadio = (grupoId: number, itemId: number) => {
    setSelecoes(prev => ({ ...prev, [grupoId]: { [itemId]: 1 } }));
    setErros(prev => { const n={...prev}; delete n[grupoId]; return n; });
  };

  const toggleCheck = (grupoId: number, itemId: number, grupo: GrupoOpcao) => {
    setSelecoes(prev => {
      const cur: Record<number,number> = { ...(prev[grupoId]||{}) };
      if (cur[itemId]) { delete cur[itemId]; }
      else {
        const total = Object.values(cur).reduce((a,v)=>a+(v as number),0);
        if (total >= grupo.max_selecoes) return prev;
        cur[itemId] = 1;
      }
      return { ...prev, [grupoId]: cur };
    });
    setErros(prev => { const n={...prev}; delete n[grupoId]; return n; });
  };

  const setQtdItem = (grupoId: number, itemId: number, delta: number, grupo: GrupoOpcao) => {
    setSelecoes(prev => {
      const cur: Record<number,number> = { ...(prev[grupoId]||{}) };
      const novaQtd = Math.max(0, (cur[itemId]||0) + delta);
      const totalSemEste = Object.entries(cur).filter(([id])=>Number(id)!==itemId).reduce((a,[,v])=>a+(v as number),0);
      if (delta>0 && totalSemEste + novaQtd > grupo.max_selecoes) return prev;
      if (novaQtd === 0) delete cur[itemId]; else cur[itemId] = novaQtd;
      return { ...prev, [grupoId]: cur };
    });
  };

  const validarEAdicionar = () => {
    const novosErros: Record<number,string> = {};
    for (const g of grupos) {
      if (!g.obrigatorio) continue;
      const sel: Record<number,number> = selecoes[g.id] || {};
      const total = Object.values(sel).reduce((a,v)=>a+(v as number),0);
      if (total < g.min_selecoes) {
        novosErros[g.id] = g.tipo==='radio'
          ? 'Selecione uma opção'
          : `Selecione no mínimo ${g.min_selecoes} item(ns)`;
      }
    }
    if (Object.keys(novosErros).length) { setErros(novosErros); return; }
    const obsOpcoes = descreverSelecoes(grupos, selecoes);
    const cartKey = gerarCartKey(produto.id, selecoes) + (obs?`_${obs.substring(0,20)}`:'');
    onAdicionar({
      ...produto, qty, selecoes,
      preco_final: precoUnit,
      obs_opcoes: [obsOpcoes, obs].filter(Boolean).join(' | '),
      cart_key: cartKey,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>

      {/* Sheet */}
      <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}
        transition={{type:'spring',damping:30,stiffness:400}}
        className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100">
          <div className="flex-1 min-w-0 pr-3 flex gap-3">
            {produto.photo_url && (
              <img src={produto.photo_url} alt={produto.name} className="w-16 h-16 rounded-xl object-cover shrink-0"/>
            )}
            <div className="min-w-0">
              <h3 className="font-black text-zinc-900 text-lg leading-tight">{produto.name}</h3>
              {produto.description && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{produto.description}</p>}
              {/* Preço base visível quando > 0 */}
              {produto.price > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-zinc-500">Preço base:</span>
                  <span className="text-sm font-black text-zinc-800">{fmt(produto.price)}</span>
                  {grupos.some(g=>g.obrigatorio&&g.itens.some(it=>it.preco_adicional>0)) && (
                    <span className="text-[10px] text-zinc-400">+ personalizações</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-xl shrink-0"><X size={20} className="text-zinc-500"/></button>
        </div>

        {/* Grupos de opções */}
        <div className="flex-1 overflow-y-auto">
          {grupos.map(g => {
            const sel: Record<number,number> = selecoes[g.id] || {};
            const totalSel = Object.values(sel).reduce((a,v)=>a+(v as number),0);
            const temErro = !!erros[g.id];
            const completo = !g.obrigatorio || totalSel >= g.min_selecoes;
            return (
              <div key={g.id} className="mb-1">
                {/* ── Cabeçalho do grupo ── fundo escuro, destaque forte */}
                <div className={`px-5 py-3 flex items-center justify-between sticky top-0 z-10 ${
                  temErro ? 'bg-red-600' : 'bg-zinc-800'
                }`}>
                  <div>
                    <p className="font-black text-white text-sm tracking-wide uppercase">{g.nome}</p>
                    <p className={`text-[11px] mt-0.5 ${temErro ? 'text-red-200' : 'text-zinc-400'}`}>
                      {g.tipo==='radio' ? 'Escolha 1 opção'
                        : g.tipo==='quantidade' ? `Selecione de ${g.min_selecoes} a ${g.max_selecoes} itens`
                        : `Selecione até ${g.max_selecoes}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {g.obrigatorio && (
                      <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                        completo ? 'bg-emerald-500 text-white' : 'bg-red-100 text-red-700'
                      }`}>
                        {completo ? '✓ OK' : 'OBRIGATÓRIO'}
                      </span>
                    )}
                  </div>
                </div>
                {temErro && (
                  <div className="bg-red-50 px-5 py-1.5 flex items-center gap-1.5 border-b border-red-100">
                    <AlertCircle size={11} className="text-red-500 shrink-0"/>
                    <p className="text-xs text-red-600 font-semibold">{erros[g.id]}</p>
                  </div>
                )}

                {/* ── Itens — fundo branco, indentados */}
                <div className="bg-white divide-y divide-zinc-100">
                  {g.itens.map(item => {
                    const qtdItem = sel[item.id] || 0;
                    const selecionado = qtdItem > 0;
                    return (
                      <div key={item.id}
                        className={`pl-5 pr-4 py-3.5 flex items-center gap-4 transition-colors cursor-pointer ${
                          selecionado ? 'bg-emerald-50' : 'hover:bg-zinc-50'
                        }`}
                        onClick={()=>{
                          if (g.tipo==='radio') toggleRadio(g.id, item.id);
                          else if (g.tipo==='checkbox') toggleCheck(g.id, item.id, g);
                        }}
                      >
                        {/* Conteúdo do item */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold leading-snug ${selecionado?'text-emerald-800':'text-zinc-800'}`}>
                            {item.nome}
                          </p>
                          <p className={`text-xs mt-0.5 font-bold ${item.preco_adicional>0?'text-emerald-600':'text-zinc-400'}`}>
                            {g.modo_preco === 'final'
                              ? item.preco_adicional > 0 ? fmt(item.preco_adicional) : 'Incluso'
                              : item.preco_adicional > 0 ? `+${fmt(item.preco_adicional)}` : 'Incluso'
                            }
                          </p>
                        </div>

                        {/* Controle por tipo */}
                        {g.tipo === 'radio' && (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            selecionado ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300'
                          }`}>
                            {selecionado && <div className="w-2 h-2 rounded-full bg-white"/>}
                          </div>
                        )}
                        {g.tipo === 'checkbox' && (
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                            selecionado ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300'
                          }`}>
                            {selecionado && <span className="text-white text-[10px] font-black leading-none">✓</span>}
                          </div>
                        )}
                        {g.tipo === 'quantidade' && (
                          <div className="flex items-center gap-2 bg-zinc-100 rounded-full p-0.5 shrink-0"
                            onClick={e=>e.stopPropagation()}>
                            <button onClick={e=>{e.stopPropagation();setQtdItem(g.id,item.id,-1,g);}}
                              className="w-7 h-7 bg-white rounded-full shadow-sm flex items-center justify-center text-zinc-600 hover:text-red-500 active:scale-90 transition-all">
                              <Minus size={11}/>
                            </button>
                            <span className="w-5 text-center font-black text-sm text-zinc-900">{qtdItem}</span>
                            <button onClick={e=>{e.stopPropagation();setQtdItem(g.id,item.id,+1,g);}}
                              className="w-7 h-7 bg-zinc-800 rounded-full flex items-center justify-center text-white hover:bg-zinc-700 active:scale-90 transition-all">
                              <Plus size={11}/>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Observações */}
          <div className="px-5 py-4 bg-white border-t border-zinc-100">
            <p className="text-sm font-bold text-zinc-700 mb-2">Alguma observação?</p>
            <textarea value={obs} onChange={e=>setObs(e.target.value)} rows={2}
              placeholder="Ex: Sem cebola, ponto bem passado..."
              className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm resize-none focus:outline-none focus:border-emerald-400"/>
          </div>
        </div>

        {/* Footer — quantidade + adicionar */}
        <div className="p-4 border-t border-zinc-100 bg-white">
          {/* Detalhamento do preço quando modo adicional com base > 0 */}
          {produto.price > 0 && adicional > 0 && !grupos.some(g=>g.modo_preco==='final') && (
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 px-1">
              <span>Base {fmt(produto.price)} + adicional {fmt(adicional)}</span>
              <span className="font-bold text-zinc-600">{fmt(precoUnit)} un.</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {/* Seletor de quantidade */}
            <div className="flex items-center gap-2 bg-zinc-100 rounded-full p-0.5 shrink-0">
              <button onClick={()=>setQty(q=>Math.max(1,q-1))} className="w-9 h-9 bg-white rounded-full shadow-sm flex items-center justify-center text-zinc-700 hover:text-red-500 transition-colors">
                <Minus size={13}/>
              </button>
              <span className="w-6 text-center font-black text-base text-zinc-900">{qty}</span>
              <button onClick={()=>setQty(q=>q+1)} className="w-9 h-9 bg-zinc-900 rounded-full flex items-center justify-center text-white hover:bg-zinc-700 transition-colors">
                <Plus size={13}/>
              </button>
            </div>
            {/* Botão adicionar */}
            <button onClick={validarEAdicionar}
              className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black transition-all active:scale-[0.98] flex items-center justify-between px-4">
              <span>Adicionar {qty > 1 ? `(${qty}x)` : ''}</span>
              <span>{fmt(precoTotal)}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARRINHO
// ═══════════════════════════════════════════════════════════════════════════════
function TelaCart({ cart, config, onAdd, onRemove, onBack, onCheckout }: {
  cart: CartItem[]; config: Config;
  onAdd: (p: CartItem)=>void; onRemove: (key: string)=>void;
  onBack: ()=>void; onCheckout: ()=>void;
}) {
  const sub=cart.reduce((a,i)=>a+i.preco_final*i.qty,0);
  const tot=sub+(config.taxa_entrega||0);
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <div><p className="text-lg font-black text-zinc-900">Seu Carrinho</p><p className="text-xs text-zinc-400">{cart.reduce((a,i)=>a+i.qty,0)} itens</p></div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {cart.length===0?<div className="text-center py-20 text-zinc-400"><ShoppingCart size={48} className="mx-auto mb-4 opacity-20"/><p>Carrinho vazio</p></div>
        :cart.map(item=>(
          <div key={item.cart_key} className="bg-white rounded-2xl p-4 flex items-start gap-3 shadow-sm">
            {item.photo_url&&<img src={item.photo_url} alt={item.name} className="w-16 h-16 rounded-xl object-cover shrink-0"/>}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-zinc-900 text-sm">{item.name}</p>
              {item.obs_opcoes && <p className="text-[11px] text-zinc-500 mt-0.5">{item.obs_opcoes}</p>}
              <p className="text-emerald-600 font-black text-base mt-1">{fmt(item.preco_final*item.qty)}</p>
              {item.preco_final!==item.price && <p className="text-xs text-zinc-400">{fmt(item.preco_final)} un.</p>}
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full p-0.5 shrink-0">
              <button onClick={()=>onRemove(item.cart_key)} className="w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center text-zinc-700 hover:text-red-500 transition-colors"><Minus size={13}/></button>
              <span className="w-6 text-center font-black text-sm">{item.qty}</span>
              <button onClick={()=>onAdd({...item,qty:1})} className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white hover:bg-emerald-600 transition-colors"><Plus size={13}/></button>
            </div>
          </div>
        ))}
        {cart.length>0&&(
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex justify-between text-sm text-zinc-500"><span>Subtotal</span><span className="font-semibold text-zinc-700">{fmt(sub)}</span></div>
            {config.taxa_entrega>0?<div className="flex justify-between text-sm text-zinc-500"><span>Taxa de entrega</span><span className="font-semibold text-zinc-700">{fmt(config.taxa_entrega)}</span></div>
            :<div className="flex justify-between text-sm"><span className="text-zinc-500">Taxa de entrega</span><span className="text-emerald-600 font-bold">Grátis 🎉</span></div>}
            <div className="border-t border-zinc-100 pt-2 flex justify-between font-black text-zinc-900"><span>Total</span><span className="text-emerald-600 text-xl">{fmt(tot)}</span></div>
          </div>
        )}
      </div>
      {cart.length>0&&(
        <div className="p-4 bg-white border-t border-zinc-100 max-w-2xl mx-auto w-full">
          {sub<config.pedido_minimo&&<p className="text-xs text-amber-600 font-bold text-center mb-3 bg-amber-50 py-2 rounded-xl">Pedido mínimo: {fmt(config.pedido_minimo)}</p>}
          <button onClick={onCheckout} disabled={sub<config.pedido_minimo} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 text-white rounded-2xl font-black transition-all active:scale-[0.98]">Finalizar Pedido →</button>
        </div>
      )}
    </div>
  );
}

function TelaCheckout({ slug, cart, config, cliToken, cliente, onBack, onSuccess }: {
  slug:string; cart:CartItem[]; config:Config;
  cliToken:string|null; cliente:ClienteAuth;
  onBack:()=>void; onSuccess:(d:any)=>void;
}) {
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [endSel, setEndSel] = useState<number|'novo'|''>('');
  const [novoEnd, setNovoEnd] = useState('');
  const [pag, setPag] = useState('pix');
  const [obs, setObs] = useState('');
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [troco, setTroco] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  // Cupom
  const [cupomInput, setCupomInput] = useState('');
  const [cupomValido, setCupomValido] = useState<any>(null);
  const [cupomErro, setCupomErro] = useState('');
  const [validandoCupom, setValidandoCupom] = useState(false);

  const zonas = config.zonas_entrega || [];
  const temZonas = zonas.length > 0;

  // ── Detecta zona pelo bairro do endereço selecionado ─────────────────────────
  // Compara case-insensitive e também aceita match parcial (ex: "FEITOSA" bate em "Feitosa")
  const detectarZona = (bairro: string): { nome: string; taxa: number } | null => {
    if (!temZonas || !bairro.trim()) return null;
    const b = bairro.trim().toLowerCase();
    // 1. Match exato
    const exato = zonas.find(z => z.nome.trim().toLowerCase() === b);
    if (exato) return exato;
    // 2. Match parcial (o bairro do endereço contém o nome da zona ou vice-versa)
    const parcial = zonas.find(z =>
      b.includes(z.nome.trim().toLowerCase()) ||
      z.nome.trim().toLowerCase().includes(b)
    );
    return parcial || null;
  };

  // Bairro do endereço atualmente selecionado
  const bairroAtual = endSel === 'novo'
    ? '' // endereço livre — sem bairro estruturado
    : (() => {
        const e = enderecos.find(x => x.id === endSel);
        return e?.bairro || '';
      })();

  const zonaDetectada = detectarZona(bairroAtual);

  // Taxa efetiva: zona detectada > taxa padrão
  const taxaEntrega = temZonas
    ? (zonaDetectada ? zonaDetectada.taxa : config.taxa_entrega || 0)
    : (config.taxa_entrega || 0);

  const descontoPix = config.desconto_pix || 0;
  const sub = cart.reduce((a,i)=>a+i.preco_final*i.qty,0);
  const subComDesconto = pag==='pix' && descontoPix > 0 ? sub * (1 - descontoPix/100) : sub;
  const descontoCupom = cupomValido
    ? cupomValido.cupom.tipo === 'frete_gratis' ? taxaEntrega : cupomValido.desconto
    : 0;
  const taxaFinal = cupomValido?.cupom?.tipo === 'frete_gratis' ? 0 : taxaEntrega;
  const tot = subComDesconto + taxaFinal - (cupomValido?.cupom?.tipo !== 'frete_gratis' ? descontoCupom : 0);
  const economiaPix = pag==='pix' && descontoPix > 0 ? sub - subComDesconto : 0;
  const inp = "w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all";

  useEffect(()=>{
    if (!cliToken||!slug) return;
    fetch(`/public/delivery/${slug}/cliente/enderecos`,{headers:{Authorization:`Bearer ${cliToken}`}})
      .then(r=>r.ok?r.json():[]).then(d=>{
        if (Array.isArray(d)&&d.length>0) {
          setEnderecos(d);
          const p = d.find((e:Endereco)=>e.principal);
          setEndSel(p ? p.id : d[0].id);
        } else setEndSel('novo');
      });
  },[cliToken,slug]);

  const endStr = endSel==='novo' ? novoEnd
    : (() => { const e=enderecos.find(x=>x.id===endSel); return e?`${e.logradouro}${e.numero?', '+e.numero:''}${e.complemento?' — '+e.complemento:''}${e.bairro?' • '+e.bairro:''}${e.referencia?' — Ref: '+e.referencia:''}`.trim():''; })();

  const validarCupom = async () => {
    if (!cupomInput.trim()) return;
    setValidandoCupom(true); setCupomErro(''); setCupomValido(null);
    try {
      const r = await fetch(`/public/delivery/${slug}/cupom/validar`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ codigo: cupomInput, total: subComDesconto + taxaEntrega }),
      });
      const d = await r.json();
      if (d.valido) { setCupomValido(d); setCupomErro(''); }
      else { setCupomErro(d.mensagem || 'Cupom inválido'); }
    } catch { setCupomErro('Erro ao validar cupom'); }
    finally { setValidandoCupom(false); }
  };

const finalizar = async () => {
    setErro('');
    if (!endStr.trim()) { setErro('Selecione ou informe o endereço de entrega'); return; }
    if (pag==='dinheiro' && precisaTroco) {
      const trocoVal = parseFloat(troco.replace(',','.'));
      if (!trocoVal || trocoVal < tot) { setErro(`Troco deve ser maior que ${fmt(tot)}`); return; }
    }
    if (enviando) return;
    setEnviando(true);
    try {
      let obsCompleta = obs;
      if (pag==='dinheiro' && precisaTroco && troco) {
        obsCompleta = `Troco para R$ ${troco}${obs ? ` | ${obs}` : ''}`;
      }
      const body: any = {
        items: cart.map(i=>({product_id:i.id,quantity:i.qty,price_at_time:i.preco_final,name:i.name,obs_opcoes:i.obs_opcoes||''})),
        pagamento_tipo: pag,
        desconto_pix: pag==='pix' ? descontoPix : 0,
        observation: obsCompleta,
        cliente_nome: cliente.nome, cliente_tel: cliente.telefone,
        endereco: endStr, clienteToken: cliToken,
        cupom_codigo: cupomValido ? cupomValido.cupom.codigo : undefined,
      };
      if (typeof endSel==='number') body.endereco_id = endSel;
      const r = await fetch(`/public/delivery/${slug}/pedido`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d = await r.json();
      // CORREÇÃO: Pegamos o config_pix que vem do backend e mandamos para a próxima tela
      if (d.success) onSuccess({orderNumber:d.orderNumber,waLink:d.waLink,total:d.total,orderId:d.orderId,pagamento_tipo:pag,mapsUrl:d.mapsUrl,itens:cart, config_pix: d.config_pix});
      else setErro(d.error||'Erro ao enviar pedido');
    } catch { setErro('Erro de conexão. Tente novamente.'); }
    finally { setEnviando(false); }
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <div><p className="text-lg font-black text-zinc-900">Finalizar Pedido</p><p className="text-xs text-zinc-400">{fmt(sub)}</p></div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Resumo dos itens */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-black text-zinc-900 mb-2 text-sm">Resumo do pedido</p>
          {cart.map(i=>(
            <div key={i.cart_key} className="flex items-start justify-between py-2 border-b border-zinc-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-800">{i.qty}× {i.name}</p>
                {i.obs_opcoes && <p className="text-[11px] text-zinc-400 mt-0.5">{i.obs_opcoes}</p>}
              </div>
              <p className="text-sm font-bold text-zinc-700 shrink-0 ml-2">{fmt(i.preco_final*i.qty)}</p>
            </div>
          ))}
        </div>
        {/* Cliente */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0">{cliente.nome[0]}</div>
          <div><p className="font-bold text-emerald-900 text-sm">{cliente.nome}</p><p className="text-xs text-emerald-600">{cliente.telefone}</p></div>
        </div>

        {/* Endereço */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-black text-zinc-900 mb-3 flex items-center gap-2"><MapPin size={15} className="text-emerald-500"/>Endereço de entrega</p>
          {enderecos.length>0&&(
            <div className="space-y-2 mb-2">
              {enderecos.map(e=>(
                <button key={e.id} onClick={()=>setEndSel(e.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${endSel===e.id?'border-emerald-400 bg-emerald-50':'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}>
                  <p className={`text-sm font-bold ${endSel===e.id?'text-emerald-700':'text-zinc-700'}`}>
                    {e.label}
                    {e.principal===1&&<span className="ml-1 text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">Principal</span>}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{e.logradouro}{e.numero?', '+e.numero:''}{e.bairro?' • '+e.bairro:''}</p>
                  {/* Mostra a taxa detectada para este endereço */}
                  {temZonas && e.bairro && (() => {
                    const z = detectarZona(e.bairro);
                    return z ? (
                      <p className={`text-[11px] font-bold mt-1 ${z.taxa===0?'text-emerald-600':'text-zinc-500'}`}>
                        {z.taxa===0 ? '🎉 Entrega grátis neste bairro' : `🛵 Taxa de entrega: ${fmt(z.taxa)}`}
                      </p>
                    ) : null;
                  })()}
                </button>
              ))}
              <button onClick={()=>setEndSel('novo')}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all ${endSel==='novo'?'border-emerald-400 bg-emerald-50':'border-dashed border-zinc-200'}`}>
                <p className="text-sm font-bold text-emerald-600">+ Usar outro endereço</p>
              </button>
            </div>
          )}
          {(endSel==='novo'||enderecos.length===0) && (
            <textarea value={novoEnd} onChange={e=>setNovoEnd(e.target.value)}
              placeholder="Rua, número, bairro, referência..." rows={3} className={`${inp} resize-none`}/>
          )}

          {/* Badge da zona detectada automaticamente */}
          {temZonas && zonaDetectada && endSel !== 'novo' && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${
              zonaDetectada.taxa === 0
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-zinc-50 border border-zinc-200 text-zinc-600'
            }`}>
              <Bike size={14}/>
              <span>
                {zonaDetectada.taxa === 0
                  ? `Entrega grátis para ${zonaDetectada.nome} 🎉`
                  : `Taxa para ${zonaDetectada.nome}: ${fmt(zonaDetectada.taxa)}`}
              </span>
            </div>
          )}

          {/* Aviso se bairro não está nas zonas cadastradas */}
          {temZonas && !zonaDetectada && bairroAtual && endSel !== 'novo' && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-700">
              <AlertCircle size={14}/>
              <span>Bairro fora das zonas cadastradas. Taxa padrão: {fmt(config.taxa_entrega||0)}</span>
            </div>
          )}
        </div>
        {/* ── Pagamento ── */}
        <div className="space-y-2">
          {/* PIX — destaque principal */}
          <button onClick={()=>setPag('pix')}
            className={`w-full rounded-2xl border-2 transition-all overflow-hidden ${pag==='pix'?'border-emerald-400':'border-zinc-200 hover:border-zinc-300'}`}>
            {/* Banner de desconto se configurado */}
            {descontoPix > 0 && (
              <div className="bg-emerald-500 px-4 py-1.5 flex items-center justify-between">
                <span className="text-white text-xs font-black">🎉 Pague com Pix e economize {descontoPix}%</span>
                <span className="text-white text-xs font-black bg-white/20 px-2 py-0.5 rounded-full">-{fmt(sub * descontoPix/100)}</span>
              </div>
            )}
            <div className={`p-4 flex items-center justify-between ${pag==='pix'?'bg-emerald-50':'bg-white'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pag==='pix'?'bg-emerald-500':'bg-zinc-100'}`}>
                  <Smartphone size={18} className={pag==='pix'?'text-white':'text-zinc-500'}/>
                </div>
                <div className="text-left">
                  <p className={`font-black text-sm ${pag==='pix'?'text-emerald-900':'text-zinc-800'}`}>Pix</p>
                  <p className={`text-[11px] ${pag==='pix'?'text-emerald-600':'text-zinc-400'}`}>
                    {descontoPix > 0 ? `${descontoPix}% de desconto • Pague agora` : 'Pague agora via Pix Copia e Cola'}
                  </p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${pag==='pix'?'border-emerald-500 bg-emerald-500':'border-zinc-300'}`}>
                {pag==='pix'&&<div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
            </div>
          </button>

          {/* Dinheiro */}
          <button onClick={()=>setPag('dinheiro')}
            className={`w-full rounded-2xl border-2 transition-all overflow-hidden ${pag==='dinheiro'?'border-zinc-700':'border-zinc-200 hover:border-zinc-300'}`}>
            <div className={`p-4 flex items-center justify-between ${pag==='dinheiro'?'bg-zinc-50':'bg-white'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pag==='dinheiro'?'bg-zinc-800':'bg-zinc-100'}`}>
                  <Banknote size={18} className={pag==='dinheiro'?'text-white':'text-zinc-500'}/>
                </div>
                <div className="text-left">
                  <p className="font-black text-sm text-zinc-800">Dinheiro</p>
                  <p className="text-[11px] text-zinc-400">Pague na entrega</p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${pag==='dinheiro'?'border-zinc-800 bg-zinc-800':'border-zinc-300'}`}>
                {pag==='dinheiro'&&<div className="w-2 h-2 rounded-full bg-white"/>}
              </div>
            </div>
            {/* Troco — expande ao selecionar dinheiro */}
            {pag==='dinheiro' && (
              <div className="bg-zinc-50 border-t border-zinc-100 px-4 pb-4 pt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-700 font-semibold">Precisa de troco?</span>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={e=>{e.stopPropagation();setPrecisaTroco(false);setTroco('');}}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!precisaTroco?'bg-zinc-800 text-white':'bg-zinc-200 text-zinc-600'}`}>
                      Não
                    </button>
                    <button onClick={e=>{e.stopPropagation();setPrecisaTroco(true);}}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${precisaTroco?'bg-zinc-800 text-white':'bg-zinc-200 text-zinc-600'}`}>
                      Sim
                    </button>
                  </div>
                </div>
                {precisaTroco && (
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Troco para quanto?</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">R$</span>
                      <input
                        type="number" step="0.01" min={tot}
                        value={troco} onChange={e=>setTroco(e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        placeholder={`Mín. ${tot.toFixed(2)}`}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-400 transition-all"
                      />
                    </div>
                    {troco && parseFloat(troco.replace(',','.')) > tot && (
                      <p className="text-xs text-emerald-600 font-semibold mt-1.5">
                        Troco: {fmt(parseFloat(troco.replace(',','.'))-tot)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </button>

          {/* Cartão */}
          <button onClick={()=>setPag('cartao')}
            className={`w-full rounded-2xl border-2 transition-all p-4 flex items-center justify-between ${pag==='cartao'?'border-zinc-700 bg-zinc-50':'border-zinc-200 bg-white hover:border-zinc-300'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pag==='cartao'?'bg-zinc-800':'bg-zinc-100'}`}>
                <CreditCard size={18} className={pag==='cartao'?'text-white':'text-zinc-500'}/>
              </div>
              <div className="text-left">
                <p className="font-black text-sm text-zinc-800">Cartão</p>
                <p className="text-[11px] text-zinc-400">Débito ou crédito na entrega</p>
              </div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${pag==='cartao'?'border-zinc-800 bg-zinc-800':'border-zinc-300'}`}>
              {pag==='cartao'&&<div className="w-2 h-2 rounded-full bg-white"/>}
            </div>
          </button>
        </div>

        {/* Cupom de desconto */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-black text-zinc-900 mb-2 text-sm flex items-center gap-2">
            🏷️ Cupom de desconto <span className="text-zinc-400 font-normal text-xs">(opcional)</span>
          </p>
          {cupomValido ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0"/>
              <div className="flex-1">
                <p className="text-sm font-black text-emerald-700">{cupomValido.cupom.codigo}</p>
                <p className="text-xs text-emerald-600">
                  {cupomValido.cupom.tipo==='frete_gratis' ? 'Frete grátis!' : `-${fmt(cupomValido.desconto)} de desconto`}
                </p>
              </div>
              <button onClick={()=>{ setCupomValido(null); setCupomInput(''); }}
                className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-600">
                <X size={14}/>
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={cupomInput} onChange={e=>setCupomInput(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==='Enter'&&validarCupom()}
                placeholder="CÓDIGO DO CUPOM"
                className="flex-1 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:border-emerald-400 uppercase"/>
              <button onClick={validarCupom} disabled={validandoCupom||!cupomInput.trim()}
                className="px-4 py-3 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-700 disabled:opacity-50 transition-all whitespace-nowrap">
                {validandoCupom ? '...' : 'Aplicar'}
              </button>
            </div>
          )}
          {cupomErro && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><X size={11}/>{cupomErro}</p>}
        </div>

        {/* Obs geral */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="font-black text-zinc-900 mb-2 text-sm">Observação <span className="text-zinc-400 font-normal text-xs">(opcional)</span></p>
          <textarea value={obs} onChange={e=>setObs(e.target.value)} placeholder="Deixar na portaria, campainha não funciona..." rows={2} className={`${inp} resize-none text-sm`}/>
        </div>
        {erro&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2"><X size={14}/>{erro}</div>}
      </div>
      <div className="bg-white border-t border-zinc-100 p-4 max-w-2xl mx-auto w-full">
        <div className="flex justify-between text-sm text-zinc-500 mb-1"><span>Subtotal</span><span>{fmt(sub)}</span></div>
        {economiaPix > 0 && <div className="flex justify-between text-sm text-emerald-600 mb-1 font-semibold"><span>🎉 Desconto Pix ({descontoPix}%)</span><span>-{fmt(economiaPix)}</span></div>}
        {cupomValido && cupomValido.cupom.tipo === 'frete_gratis' && (
          <div className="flex justify-between text-sm text-emerald-600 mb-1 font-semibold"><span>🏷️ Frete grátis ({cupomValido.cupom.codigo})</span><span>-{fmt(taxaEntrega)}</span></div>
        )}
        {cupomValido && cupomValido.cupom.tipo !== 'frete_gratis' && (
          <div className="flex justify-between text-sm text-emerald-600 mb-1 font-semibold"><span>🏷️ Cupom ({cupomValido.cupom.codigo})</span><span>-{fmt(descontoCupom)}</span></div>
        )}
        {taxaFinal > 0
          ? <div className="flex justify-between text-sm text-zinc-500 mb-1"><span>Taxa de entrega{zonaDetectada ? ` · ${zonaDetectada.nome}` : ''}</span><span>{fmt(taxaFinal)}</span></div>
          : taxaEntrega > 0 && <div className="flex justify-between text-sm text-emerald-600 mb-1 font-semibold"><span>Taxa de entrega</span><span>Grátis 🎉</span></div>
        }
        <div className="flex justify-between font-black text-zinc-900 mb-4"><span>Total</span><span className="text-xl text-emerald-600">{fmt(Math.max(0, tot))}</span></div>
        <button onClick={finalizar} disabled={enviando} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
          {enviando?<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<CheckCircle2 size={18}/>}
          {enviando?'Enviando...':'Confirmar Pedido'}
        </button>
      </div>
    </div>
  );
}

// ── Injeta valor em payload Pix estático (QR do banco, campo aberto) ──────────
function injetarValorPix(payload: string, valor: number): string {
  try {
    const campos: {id:string;len:number;val:string;raw:string}[] = [];
    let pos = 0;
    const semCrc = payload.slice(0, -8); // remove '6304XXXX'
    while (pos < semCrc.length) {
      const id = semCrc.slice(pos, pos+2);
      const len = parseInt(semCrc.slice(pos+2, pos+4));
      const val = semCrc.slice(pos+4, pos+4+len);
      campos.push({ id, len, val, raw: semCrc.slice(pos, pos+4+len) });
      pos += 4 + len;
    }
    // Remove campo 54 existente, injeta novo após campo 53 (moeda)
    const sem54 = campos.filter(c => c.id !== '54');
    const v = valor.toFixed(2);
    const campo54 = { id:'54', len: v.length, val: v, raw: '54' + String(v.length).padStart(2,'0') + v };
    const idx53 = sem54.findIndex(c => c.id === '53');
    sem54.splice(idx53 + 1, 0, campo54);
    const base = sem54.map(c => c.raw).join('') + '6304';
    let crc = 0xFFFF;
    for (let i=0; i<base.length; i++) { crc ^= base.charCodeAt(i)<<8; for(let j=0;j<8;j++) crc=(crc&0x8000)?(crc<<1)^0x1021:(crc<<1); }
    return base + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4,'0');
  } catch { return payload; }
}

// ── Gerador de payload Pix Copia e Cola (BR Code EMV — padrão Banco Central) ──
function gerarPixPayload(chave: string, nome: string, cidade: string, valor: number): string {
  const v = valor.toFixed(2);
  const emv = (id: string, val: string) => { const len = String(val.length).padStart(2,'0'); return `${id}${len}${val}`; };
  const gui = emv('00','BR.GOV.BCB.PIX') + emv('01', chave);
  const merchantInfo = emv('26', gui);
  const addInfo = emv('62', emv('05','FlowDelivery'));
  const nomeClean = nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 ]/g,'').substring(0,25).toUpperCase();
  const cidadeClean = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 ]/g,'').substring(0,15).toUpperCase() || 'BRASIL';
  let payload = '000201'+'010212'+merchantInfo+'52040000'+'5303986'+emv('54',v)+'5802BR'+emv('59',nomeClean)+emv('60',cidadeClean)+addInfo+'6304';
  let crc = 0xFFFF;
  for (let i=0;i<payload.length;i++){ crc^=payload.charCodeAt(i)<<8; for(let j=0;j<8;j++) crc=(crc&0x8000)?(crc<<1)^0x1021:(crc<<1); }
  return payload + (crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0');
}

// Deep links dos principais bancos brasileiros para pagamento Pix
const BANCOS_DEEPLINK = [
  { nome:'Nubank',    cor:'#820AD1', logo:'💜', link:(payload:string)=>`nubank://pix/copy-paste?payload=${encodeURIComponent(payload)}` },
  { nome:'Inter',     cor:'#FF7A00', logo:'🟠', link:(payload:string)=>`bancointer://pix?payload=${encodeURIComponent(payload)}` },
  { nome:'C6 Bank',   cor:'#1A1A1A', logo:'⬛', link:(payload:string)=>`c6bank://pix?copiaecola=${encodeURIComponent(payload)}` },
  { nome:'Bradesco',  cor:'#CC0000', logo:'🔴', link:(payload:string)=>`bradesco://pix?payload=${encodeURIComponent(payload)}` },
  { nome:'Itaú',      cor:'#EC7000', logo:'🟧', link:(payload:string)=>`itau://pix?payload=${encodeURIComponent(payload)}` },
  { nome:'BB',        cor:'#FAAE00', logo:'🟡', link:(payload:string)=>`bb://pix?payload=${encodeURIComponent(payload)}` },
  { nome:'Caixa',     cor:'#005CA9', logo:'🔵', link:(payload:string)=>`caixa://pix?payload=${encodeURIComponent(payload)}` },
  { nome:'Picpay',    cor:'#21C25E', logo:'💚', link:(payload:string)=>`picpay://pix?payload=${encodeURIComponent(payload)}` },
];

function TelaConfirmado({ pedidoOk, config, slug, onNovo }: { pedidoOk:any;config:Config;slug:string;onNovo:()=>void }) {
  const isPix = pedidoOk.pagamento_tipo === 'pix';
  const [pixPago, setPixPago] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pixPayload, setPixPayload] = useState('');

  // CORREÇÃO: Utiliza o config_pix que acabamos de receber e aceita QR Code Estático
  const pxConf = pedidoOk.config_pix || config as any;
  const temPix = pxConf.pix_chave || pxConf.pix_payload_estatico;

  useEffect(() => {
    if (!isPix) return;
    if (pxConf.pix_payload_estatico) {
      setPixPayload(injetarValorPix(pxConf.pix_payload_estatico, pedidoOk.total));
      return;
    }
    if (pxConf.pix_chave) {
      setPixPayload(gerarPixPayload(
        pxConf.pix_chave,
        pxConf.pix_nome || 'Estabelecimento',
        pxConf.pix_cidade || 'Brasil',
        pedidoOk.total
      ));
    }
  }, [isPix, pxConf, pedidoOk.total]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(pixPayload); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = pixPayload; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopiado(true); setTimeout(()=>setCopiado(false), 4000);
  };

  const confirmarPagamento = async () => {
    setConfirmando(true);
    try {
      await fetch(`/public/delivery/${slug}/pedido/${pedidoOk.orderId}/confirmar-pix`, { method:'POST' });
      setPixPago(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    setConfirmando(false);
  };

  const waNumber = pxConf.whatsapp?.replace(/\D/g,'');
  const waMsgPix = waNumber ? `https://wa.me/55${waNumber}?text=${encodeURIComponent(`🧾 *Comprovante Pix — Pedido #${pedidoOk.orderNumber}*\n\nOlá! Acabei de realizar o pagamento de *${fmt(pedidoOk.total)}* via Pix.\n\n📎 Segue o comprovante em anexo.`)}` : null;
  const waMsgEntrega = waNumber ? `https://wa.me/55${waNumber}?text=${encodeURIComponent(`✅ *Pedido Confirmado #${pedidoOk.orderNumber}*\n\nOlá! Meu pedido foi confirmado. Aguardo a entrega!\n💰 Pagarei *${fmt(pedidoOk.total)}* ${pedidoOk.pagamento_tipo === 'dinheiro' ? 'em dinheiro' : 'no cartão'} na entrega.`)}` : null;

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <div className={`${pixPago||!isPix?'bg-emerald-500':'bg-amber-500'} px-4 pt-12 pb-8 text-center`}>
        <motion.div initial={{scale:0}} animate={{scale:1}} transition={{delay:0.1,type:'spring'}}
          className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          {pixPago||!isPix ? <CheckCircle2 size={36} className="text-white"/> : <Smartphone size={36} className="text-white"/>}
        </motion.div>
        <h2 className="text-2xl font-black text-white">
          {isPix && !pixPago ? 'Pague via Pix' : 'Pedido confirmado!'}
        </h2>
        <p className="text-white/80 text-sm mt-1">#{pedidoOk.orderNumber}</p>
        <p className="text-4xl font-black text-white mt-2">{fmt(pedidoOk.total)}</p>
      </div>

      <div className="max-w-sm mx-auto px-4 py-5 space-y-4">

        {/* ── FLUXO PIX ── */}
        {isPix && !pixPago && temPix && (
          <>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <p className="font-black text-amber-800 text-sm">Como pagar agora</p>
              </div>
              <div className="p-4 space-y-3">
                {[
                  'Abra o app do seu banco',
                  'Escolha Pix → Pagar → "Copia e Cola"',
                  'Cole o código abaixo',
                  'Confirme o pagamento',
                ].map((s,i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">{i+1}</span>
                    <span className="text-sm text-zinc-700">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-black text-zinc-500 uppercase tracking-wider mb-3">Abrir direto no seu banco</p>
              <div className="grid grid-cols-4 gap-2">
                {BANCOS_DEEPLINK.map(b => (
                  <a key={b.nome} href={b.link(pixPayload)} className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-zinc-100 hover:bg-zinc-50 transition-all active:scale-95">
                    <span className="text-xl leading-none">{b.logo}</span>
                    <span className="text-[9px] font-bold text-zinc-500 text-center leading-tight">{b.nome}</span>
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 text-center mt-2">Toque no banco para abrir direto no app</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-black text-zinc-500 uppercase tracking-wider">Pix Copia e Cola</p>
              <div className="flex justify-center">
                <div className="p-2 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&data=${encodeURIComponent(pixPayload)}`}
                    alt="QR Code Pix" width={160} height={160}
                    className="rounded-lg"
                    onError={e=>{(e.target as HTMLImageElement).style.display='none';}}
                  />
                </div>
              </div>
              <div className="bg-zinc-50 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Chave Pix</span>
                  <span className="font-bold text-zinc-800 font-mono">{pxConf.pix_chave || 'Código Estático QR'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Valor</span>
                  <span className="font-black text-emerald-600">{fmt(pedidoOk.total)}</span>
                </div>
                {pxConf.pix_nome && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Recebedor</span>
                    <span className="font-bold text-zinc-700">{pxConf.pix_nome}</span>
                  </div>
                )}
              </div>
              <button onClick={copiar}
                className={`w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 ${copiado?'bg-emerald-500 text-white':'bg-zinc-900 hover:bg-zinc-800 text-white'}`}>
                {copiado ? '✓ Código copiado!' : '📋 Copiar código Pix'}
              </button>
            </div>

            <button onClick={confirmarPagamento} disabled={confirmando}
              className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2 shadow-lg ${
                copiado ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
              }`}>
              {confirmando ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle2 size={20}/>}
              {confirmando ? 'Confirmando...' : 'Já fiz o pagamento ✓'}
            </button>
            <p className="text-xs text-zinc-400 text-center -mt-2">O botão libera após copiar o código Pix</p>

            {waMsgPix && (
              <a href={waMsgPix} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm transition-all">
                <Smartphone size={16}/>Enviar comprovante pelo WhatsApp
              </a>
            )}
          </>
        )}

        {/* ── PIX CONFIRMADO ── */}
        {isPix && pixPago && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
              <p className="font-black text-emerald-800 text-lg">Pagamento confirmado! ✓</p>
              <p className="text-emerald-600 text-sm mt-1">Seu pedido foi registrado e está sendo preparado</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Clock size={20} className="text-amber-500"/></div>
              <div><p className="text-xs text-zinc-400">Tempo estimado</p><p className="font-black text-zinc-900">{config.tempo_preparo||35}–{(config.tempo_preparo||35)+10} min</p></div>
            </div>
            {waMsgPix && (
              <a href={waMsgPix} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm transition-all">
                <Smartphone size={16}/>Enviar comprovante pelo WhatsApp
              </a>
            )}
          </div>
        )}

        {/* ── DINHEIRO / CARTÃO ── */}
        {!isPix && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><Clock size={20} className="text-amber-500"/></div>
                <div><p className="text-xs text-zinc-400">Tempo estimado</p><p className="font-black text-zinc-900">{config.tempo_preparo||35}–{(config.tempo_preparo||35)+10} min</p></div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 flex items-center gap-3">
                {pedidoOk.pagamento_tipo==='dinheiro' ? <Banknote size={20} className="text-zinc-500 shrink-0"/> : <CreditCard size={20} className="text-zinc-500 shrink-0"/>}
                <div>
                  <p className="text-xs text-zinc-400">Pagamento na entrega</p>
                  <p className="font-bold text-zinc-800">{pedidoOk.pagamento_tipo==='dinheiro'?'Dinheiro':'Cartão'} — <span className="text-emerald-600">{fmt(pedidoOk.total)}</span></p>
                </div>
              </div>
            </div>
            {pedidoOk.waLink && (
              <a href={pedidoOk.waLink} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-green-100">
                <Smartphone size={16}/>Confirmar no WhatsApp
              </a>
            )}
            {waMsgEntrega && !pedidoOk.waLink && (
              <a href={waMsgEntrega} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm transition-all">
                <Smartphone size={16}/>Acompanhar pedido no WhatsApp
              </a>
            )}
          </div>
        )}

        {/* ── Cupom do Pedido ── */}
        {pedidoOk.itens && pedidoOk.itens.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-zinc-100">
            <div className="bg-zinc-800 px-4 py-3 flex items-center justify-between">
              <p className="font-black text-white text-sm">🧾 Cupom #{pedidoOk.orderNumber}</p>
              <p className="text-zinc-400 text-xs">{new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>
            </div>
            <div className="p-4 space-y-2">
              {pedidoOk.itens.map((it: any, i: number) => (
                <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-zinc-50 last:border-0">
                  <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-800">{it.qty}× {it.name}</p>
                        {it.obs_opcoes && <p className="text-[10px] text-zinc-400 mt-0.5">{it.obs_opcoes}</p>}
                      </div>
                  <p className="text-sm font-bold text-zinc-700 shrink-0">{fmt(it.preco_final*it.qty)}</p>
                </div>
              ))}
              <div className="pt-2 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-500">
                  <span>Pagamento</span>
                  <span className="font-semibold capitalize">{pedidoOk.pagamento_tipo === 'pix' ? '💚 Pix' : pedidoOk.pagamento_tipo === 'dinheiro' ? '💵 Dinheiro' : '💳 Cartão'}</span>
                </div>
                <div className="flex justify-between font-black text-zinc-900 text-base pt-1 border-t border-zinc-100">
                  <span>Total</span>
                  <span className="text-emerald-600">{fmt(pedidoOk.total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <button onClick={onNovo} className="w-full py-3 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-2xl font-bold text-sm transition-all">
          Fazer novo pedido
        </button>
      </div>
    </div>
  );
}

function TelaIdentificar({ slug, onSuccess, onBack }: { slug:string;onSuccess:(t:string,c:ClienteAuth)=>void;onBack:()=>void }) {
  const [etapa, setEtapa] = useState<'tel'|'dados'>('tel');
  const [tel, setTel] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [endLogradouro, setEndLogradouro] = useState('');
  const [endNumero, setEndNumero] = useState('');
  const [endBairro, setEndBairro] = useState('');
  const [endRef, setEndRef] = useState('');
  const [load, setLoad] = useState(false);
  const [erro, setErro] = useState('');
  const [telNorm, setTelNorm] = useState('');
  const inp="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all";

  const verificarTel=async()=>{
    setErro('');setLoad(true);
    try{
      const r=await fetch(`/public/delivery/${slug}/auth/identificar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefone:tel})});
      const d=await r.json();
      if(!d.success){setErro(d.error||'Erro');return;}
      if(d.novo){setTelNorm(d.telefone);setEtapa('dados');}else onSuccess(d.token,d.cliente);
    }catch{setErro('Erro de conexão');}finally{setLoad(false);}
  };

  const cadastrar=async()=>{
    setErro('');
    if(!nome.trim()){setErro('Informe seu nome');return;}
    if(!endLogradouro.trim()){setErro('Informe a rua/avenida');return;}
    setLoad(true);
    try{
      const r=await fetch(`/public/delivery/${slug}/auth/cadastrar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telefone:telNorm,nome,email})});
      const d=await r.json();
      if(!d.success){setErro(d.error||'Erro');return;}
      await fetch(`/public/delivery/${slug}/cliente/enderecos`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${d.token}`},body:JSON.stringify({label:'Casa',logradouro:endLogradouro,numero:endNumero,bairro:endBairro,referencia:endRef,principal:true})});
      onSuccess(d.token,d.cliente);
    }catch{setErro('Erro de conexão');}finally{setLoad(false);}
  };

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={etapa==='dados'?()=>setEtapa('tel'):onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <div><p className="text-lg font-black text-zinc-900">{etapa==='tel'?'Entrar / Criar conta':'Complete seu cadastro'}</p>
        {etapa==='dados'&&<p className="text-xs text-zinc-400">Preencha os dados para finalizar</p>}</div>
      </header>
      <div className="flex-1 flex flex-col justify-center px-5 max-w-sm mx-auto w-full py-8 space-y-5">
        {etapa==='tel'?(
          <>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200"><Smartphone size={28} className="text-white"/></div>
              <h3 className="text-xl font-black text-zinc-900">Qual é o seu número?</h3>
              <p className="text-sm text-zinc-400 mt-1">Para identificar sua conta e enviar atualizações</p>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Telefone / WhatsApp</label>
              <input value={tel} onChange={e=>setTel(e.target.value)} placeholder="(85) 99999-0000" type="tel" className={inp} onKeyDown={e=>e.key==='Enter'&&verificarTel()}/>
            </div>
            {erro&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2"><X size={14}/>{erro}</div>}
            <button onClick={verificarTel} disabled={load||!tel.trim()} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
              {load?<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<>Continuar<ChevronRight size={16}/></>}
            </button>
            <p className="text-center text-xs text-zinc-400">Sem senha — rápido e simples!</p>
          </>
        ):(
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center"><Smartphone size={14} className="text-white"/></div>
              <div><p className="text-xs text-zinc-500">Número</p><p className="font-black text-emerald-700">{telNorm}</p></div>
            </div>
            {/* Dados pessoais */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="font-black text-zinc-900 text-sm flex items-center gap-2"><User size={14} className="text-emerald-500"/>Dados pessoais</p>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nome completo *</label><input value={nome} onChange={e=>setNome(e.target.value)} placeholder="João Silva" className={inp}/></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">E-mail (opcional)</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="joao@email.com" type="email" className={inp}/></div>
            </div>
            {/* Endereço */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="font-black text-zinc-900 text-sm flex items-center gap-2"><MapPin size={14} className="text-emerald-500"/>Endereço de entrega *</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Rua / Avenida *</label><input value={endLogradouro} onChange={e=>setEndLogradouro(e.target.value)} placeholder="Rua das Flores" className={inp}/></div>
                <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nº</label><input value={endNumero} onChange={e=>setEndNumero(e.target.value)} placeholder="123" className={inp}/></div>
              </div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Bairro</label><input value={endBairro} onChange={e=>setEndBairro(e.target.value)} placeholder="Centro" className={inp}/></div>
              <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Referência</label><input value={endRef} onChange={e=>setEndRef(e.target.value)} placeholder="Próximo ao mercado..." className={inp}/></div>
            </div>
            {erro&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2"><X size={14}/>{erro}</div>}
            <button onClick={cadastrar} disabled={load||!nome.trim()||!endLogradouro.trim()} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
              {load?<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<><CheckCircle2 size={16}/>Criar conta e continuar</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TelaConta({ slug, token, cliente, onLogout, onBack, onHistorico, onEnderecos, onEditarPerfil }: { slug:string;token:string|null;cliente:ClienteAuth|null;onLogout:()=>void;onBack:()=>void;onHistorico:()=>void;onEnderecos:()=>void;onEditarPerfil:()=>void }) {
  if(!cliente) return <div className="min-h-screen bg-white flex items-center justify-center"><button onClick={onBack} className="px-4 py-2 bg-zinc-100 rounded-xl text-sm">Voltar</button></div>;
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <p className="text-lg font-black text-zinc-900">Minha Conta</p>
      </header>
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-3">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white flex items-center gap-4 shadow-lg shadow-emerald-200">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-black">{cliente.nome[0].toUpperCase()}</div>
          <div className="flex-1 min-w-0"><p className="font-black text-xl truncate">{cliente.nome}</p><p className="text-emerald-100 text-sm">{cliente.telefone}</p>{cliente.email&&<p className="text-emerald-200 text-xs mt-0.5">{cliente.email}</p>}</div>
          <button onClick={onEditarPerfil} className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors"><Pencil size={15}/></button>
        </div>
        {[
          {icon:<History size={19}/>,color:'text-blue-500 bg-blue-50',label:'Histórico de Pedidos',sub:'Veja e repita pedidos anteriores',fn:onHistorico},
          {icon:<MapPin size={19}/>,color:'text-orange-500 bg-orange-50',label:'Meus Endereços',sub:'Gerencie seus endereços de entrega',fn:onEnderecos},
          {icon:<Heart size={19}/>,color:'text-red-500 bg-red-50',label:`Favoritos (${cliente.favoritos.length})`,sub:'Seus produtos curtidos',fn:onBack},
        ].map(item=>(
          <button key={item.label} onClick={item.fn} className="w-full bg-white border border-zinc-100 hover:shadow-md rounded-2xl p-4 flex items-center gap-4 transition-all text-left shadow-sm">
            <div className={`w-11 h-11 ${item.color} rounded-xl flex items-center justify-center shrink-0`}>{item.icon}</div>
            <div className="flex-1 min-w-0"><p className="font-bold text-zinc-900">{item.label}</p><p className="text-xs text-zinc-400">{item.sub}</p></div>
            <ChevronRight size={16} className="text-zinc-300 shrink-0"/>
          </button>
        ))}
        <button onClick={onLogout} className="w-full bg-white border border-red-100 hover:bg-red-50 rounded-2xl p-4 flex items-center gap-3 text-red-500 font-bold text-sm transition-all shadow-sm">
          <LogOut size={16}/>Sair da conta
        </button>
      </div>
    </div>
  );
}

function TelaEditarPerfil({ slug, token, cliente, onSaved, onBack }: { slug:string;token:string|null;cliente:ClienteAuth|null;onSaved:(c:ClienteAuth)=>void;onBack:()=>void }) {
  const [nome, setNome]=useState(cliente?.nome||'');
  const [email, setEmail]=useState(cliente?.email||'');
  const [load, setLoad]=useState(false);
  const [erro, setErro]=useState('');
  const inp="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all";
  const salvar=async()=>{
    if(!nome.trim()){setErro('Nome obrigatório');return;}
    setLoad(true);
    try{const r=await fetch(`/public/delivery/${slug}/cliente/perfil`,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({nome,email})});const d=await r.json();if(d.success)onSaved({...cliente!,nome:nome.trim(),email:email||undefined});else setErro(d.error||'Erro');}
    catch{setErro('Erro de conexão');}finally{setLoad(false);}
  };
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <p className="text-lg font-black text-zinc-900">Editar Perfil</p>
      </header>
      <div className="flex-1 p-5 max-w-sm mx-auto w-full space-y-4 pt-8">
        <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Nome completo</label><input value={nome} onChange={e=>setNome(e.target.value)} className={inp}/></div>
        <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">E-mail (opcional)</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" className={inp}/></div>
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-500 flex items-center gap-2"><Smartphone size={13} className="text-zinc-400"/>Telefone: <strong className="text-zinc-700">{cliente?.telefone}</strong> — fixo</div>
        {erro&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{erro}</div>}
        <button onClick={salvar} disabled={load} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-2xl font-black flex items-center justify-center transition-all">
          {load?<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:'Salvar'}
        </button>
      </div>
    </div>
  );
}

function TelaHistorico({ slug, token, onBack, onRepetir, categorias }: { slug:string;token:string|null;onBack:()=>void;onRepetir:(its:Produto[])=>void;categorias:Categoria[] }) {
  const [pedidos, setPedidos]=useState<PedidoHist[]>([]);
  const [load, setLoad]=useState(true);
  useEffect(()=>{if(!token)return;fetch(`/public/delivery/${slug}/cliente/pedidos`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():[]).then(d=>{if(Array.isArray(d))setPedidos(d);}).finally(()=>setLoad(false));},[token,slug]);
  const pm=useMemo(()=>{const m:Record<number,Produto>={};categorias.forEach(c=>c.itens.forEach(p=>{m[p.id]=p;}));return m;},[categorias]);
  const repetir=(p:PedidoHist)=>{if(!p.itens_raw)return;const its:Produto[]=[];p.itens_raw.split('||').forEach(raw=>{const[id]=raw.split(':');const n=parseInt(id);if(pm[n])its.push(pm[n]);});if(its.length)onRepetir(its);};
  const fd=(d:string)=>new Date(d.includes('T')?d:d.replace(' ','T')).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <div><p className="text-lg font-black text-zinc-900">Histórico</p><p className="text-xs text-zinc-400">{pedidos.length} pedidos</p></div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {load?<div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
        :pedidos.length===0?<div className="text-center py-16 text-zinc-400"><History size={48} className="mx-auto mb-4 opacity-20"/><p className="font-semibold">Nenhum pedido ainda</p></div>
        :pedidos.map(p=>(
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2"><span className="font-mono font-black text-zinc-800">#{p.order_number}</span><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_COR[p.status]||'bg-zinc-100 text-zinc-500'}`}>{STATUS_TXT[p.status]||p.status}</span></div>
            <p className="text-sm text-zinc-500 line-clamp-2 mb-2">{p.resumo_itens}</p>
            <div className="flex items-center justify-between"><span className="text-xs text-zinc-400">{fd(p.created_at)}</span><span className="font-black text-emerald-600">{fmt(p.total_amount)}</span></div>
            {p.status==='Entregue'&&p.itens_raw&&<button onClick={()=>repetir(p)} className="w-full mt-3 py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all">🔄 Repetir pedido</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TelaEnderecos({ slug, token, onBack, onNovo }: { slug:string;token:string|null;onBack:()=>void;onNovo:()=>void }) {
  const [ends, setEnds]=useState<Endereco[]>([]);
  const [load, setLoad]=useState(true);
  const load_=useCallback(()=>{if(!token)return;fetch(`/public/delivery/${slug}/cliente/enderecos`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():[]).then(d=>{if(Array.isArray(d))setEnds(d);}).finally(()=>setLoad(false));},[token,slug]);
  useEffect(()=>{load_();},[load_]);
  const del=async(id:number)=>{if(!confirm('Remover?'))return;await fetch(`/public/delivery/${slug}/cliente/enderecos/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});load_();};
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button><p className="text-lg font-black text-zinc-900">Meus Endereços</p></div>
        <button onClick={onNovo} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 text-white rounded-full text-sm font-bold hover:bg-zinc-800 transition-all"><Plus size={14}/>Adicionar</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {load?<div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>
        :ends.length===0?<div className="text-center py-16 text-zinc-400"><MapPin size={48} className="mx-auto mb-4 opacity-20"/><p className="font-semibold mb-4">Nenhum endereço</p><button onClick={onNovo} className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-bold">Adicionar</button></div>
        :ends.map(e=>(
          <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center shrink-0"><Home size={18} className="text-orange-500"/></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-zinc-900 flex items-center gap-2">{e.label}{e.principal===1&&<span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Principal</span>}</p>
              <p className="text-sm text-zinc-500 mt-0.5">{e.logradouro}{e.numero?', '+e.numero:''}{e.complemento?' — '+e.complemento:''}</p>
              {e.bairro&&<p className="text-xs text-zinc-400">{e.bairro}</p>}
              {e.referencia&&<p className="text-xs text-zinc-400 italic">Ref: {e.referencia}</p>}
            </div>
            <button onClick={()=>del(e.id)} className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={15}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelaNovo({ Endereco: _, slug, token, onBack, onSaved }: { Endereco?: any;slug:string;token:string|null;onBack:()=>void;onSaved:()=>void }) {
  const [form, setForm]=useState({label:'Casa',logradouro:'',numero:'',complemento:'',bairro:'',referencia:'',principal:false});
  const [saving, setSaving]=useState(false);
  const [erro, setErro]=useState('');
  const inp="w-full px-4 py-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 transition-all";
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm(f=>({...f,[k]:e.target.value}));
  const salvar=async()=>{
    if(!form.logradouro.trim()){setErro('Informe o logradouro');return;}
    setSaving(true);
    try{const r=await fetch(`/public/delivery/${slug}/cliente/enderecos`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(form)});const d=await r.json();if(d.success)onSaved();else setErro(d.error||'Erro');}
    catch{setErro('Erro de conexão');}finally{setSaving(false);}
  };
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-zinc-100 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-full"><ArrowLeft size={20} className="text-zinc-700"/></button>
        <p className="text-lg font-black text-zinc-900">Novo Endereço</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">
        <div><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Identificação</label>
        <div className="flex gap-2 flex-wrap">{['Casa','Trabalho','Familiar','Outro'].map(l=><button key={l} onClick={()=>setForm(f=>({...f,label:l}))} className={`px-4 py-2 rounded-full text-sm font-bold border-2 transition-all ${form.label===l?'border-emerald-400 bg-emerald-50 text-emerald-700':'border-zinc-200 bg-white text-zinc-500'}`}>{l}</button>)}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {[{k:'logradouro',l:'Rua / Avenida *',p:'Rua das Flores'},{k:'numero',l:'Número',p:'123'},{k:'complemento',l:'Complemento',p:'Apto 12'},{k:'bairro',l:'Bairro',p:'Centro'},{k:'referencia',l:'Referência',p:'Próximo ao mercado...'}].map(f=>(
            <div key={f.k}><label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">{f.l}</label><input value={(form as any)[f.k]} onChange={set(f.k)} placeholder={f.p} className={inp}/></div>
          ))}
        </div>
        <label className="flex items-center gap-3 cursor-pointer bg-white rounded-2xl p-4 shadow-sm">
          <div onClick={()=>setForm(f=>({...f,principal:!f.principal}))} className={`w-12 h-6 rounded-full relative transition-all ${form.principal?'bg-emerald-500':'bg-zinc-300'}`}>
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${form.principal?'left-6':'left-0.5'}`}/>
          </div>
          <span className="text-sm font-semibold text-zinc-700">Definir como principal</span>
        </label>
        {erro&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{erro}</div>}
        <button onClick={salvar} disabled={saving} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white rounded-2xl font-black flex items-center justify-center transition-all active:scale-[0.98]">
          {saving?<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:'Salvar Endereço'}
        </button>
      </div>
    </div>
  );
}