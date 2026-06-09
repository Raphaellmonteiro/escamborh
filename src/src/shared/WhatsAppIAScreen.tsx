import React, { lazy, Suspense, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bot,
  History,
  Megaphone,
  Plug,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { adminScreenMetaHintClass } from '../components/ui/screenChrome';

// Carregamento lazy de cada aba para manter o bundle inicial leve
const TabConexao     = lazy(() => import('./whatsapp-ia/TabConexao'));
const TabIA          = lazy(() => import('./whatsapp-ia/TabIA'));
const TabCardapio    = lazy(() => import('./whatsapp-ia/TabCardapio'));
const TabPedidos     = lazy(() => import('./whatsapp-ia/TabPedidos'));
const TabDisparos    = lazy(() => import('./whatsapp-ia/TabDisparos'));
const TabIntegracoes = lazy(() => import('./whatsapp-ia/TabIntegracoes'));
const TabLogs        = lazy(() => import('./whatsapp-ia/TabLogs'));

type WhatsAppIATab =
  | 'conexao'
  | 'ia'
  | 'cardapio'
  | 'pedidos'
  | 'disparos'
  | 'integracoes'
  | 'logs';

type TabDef = {
  key: WhatsAppIATab;
  label: string;
  icon: React.ReactNode;
};

const TABS: TabDef[] = [
  { key: 'conexao',     label: 'Conexão',     icon: <Smartphone   size={14} /> },
  { key: 'ia',          label: 'IA',           icon: <Bot          size={14} /> },
  { key: 'cardapio',    label: 'Cardápio',     icon: <UtensilsCrossed size={14} /> },
  { key: 'pedidos',     label: 'Pedidos',      icon: <ShoppingBag  size={14} /> },
  { key: 'disparos',    label: 'Disparos',     icon: <Megaphone    size={14} /> },
  { key: 'integracoes', label: 'Integrações',  icon: <Plug         size={14} /> },
  { key: 'logs',        label: 'Logs',         icon: <History      size={14} /> },
];

type WhatsAppIAScreenProps = {
  token: string;
  slug?: string;
};

function TabFallback() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center text-sm text-fptext-muted">
      Carregando…
    </div>
  );
}

export default function WhatsAppIAScreen({ token, slug }: WhatsAppIAScreenProps) {
  const [activeTab, setActiveTab] = useState<WhatsAppIATab>('conexao');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full min-h-0 overflow-y-auto bg-fp-secondary"
    >
      <div className="mx-auto max-w-7xl min-w-0 space-y-0 p-3 sm:p-4 lg:p-6">
        <ScreenHeader
          titleAs="h1"
          titleClassName="flex flex-wrap items-center gap-2"
          title={
            <>
              <Zap size={24} className="shrink-0" />
              WhatsApp IA
            </>
          }
          subtitle="Gerencie a conexão, inteligência artificial, cardápio, pedidos, campanhas e integrações do módulo WhatsApp IA."
          meta={
            <span className={adminScreenMetaHintClass}>
              Conectado a /api/whatsapp/*
            </span>
          }
        />

        {/* ── Barra de abas ─────────────────────────────────────────────── */}
        <div className="mt-4 border-b border-fp-border">
          <nav
            className="-mb-px flex gap-1 overflow-x-auto pb-0 scrollbar-none"
            aria-label="Módulos do WhatsApp IA"
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold
                  transition-colors whitespace-nowrap
                  ${
                    activeTab === tab.key
                      ? 'border-fp-accent text-fp-accent'
                      : 'border-transparent text-fptext-muted hover:border-fp-border hover:text-fptext-primary'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Conteúdo da aba ──────────────────────────────────────────── */}
        <div className="mt-4">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'conexao'     && <TabConexao     token={token} />}
            {activeTab === 'ia'          && <TabIA          token={token} />}
            {activeTab === 'cardapio'    && <TabCardapio    token={token} />}
            {activeTab === 'pedidos'     && <TabPedidos     token={token} />}
            {activeTab === 'disparos'    && <TabDisparos    token={token} />}
            {activeTab === 'integracoes' && <TabIntegracoes token={token} />}
            {activeTab === 'logs'        && <TabLogs        token={token} />}
          </Suspense>
        </div>
      </div>
    </motion.div>
  );
}
