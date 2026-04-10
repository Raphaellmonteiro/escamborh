import { motion } from 'motion/react';
import { MessageCircle, Zap } from 'lucide-react';
import { DeliveryConfigPanel } from './DeliveryScreen';
import { EmptyState } from '../components/ui/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import {
  adminOpsDashedWellClass,
  adminOpsSurfaceCardClass,
  adminScreenMetaHintClass,
  adminSectionEyebrowClass,
} from '../components/ui/screenChrome';

type WhatsAppIAScreenProps = {
  token: string;
  slug?: string;
};

export default function WhatsAppIAScreen({ token, slug }: WhatsAppIAScreenProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="h-full min-h-0 overflow-y-auto bg-fp-secondary">
      <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-6">
        <ScreenHeader
          titleAs="h1"
          titleClassName="flex flex-wrap items-center gap-2"
          title={
            <>
              <Zap size={24} className="shrink-0" />
              WhatsApp IA
            </>
          }
          subtitle="Base do modulo preparada para separar configuracao do canal e a futura operacao do chatbot."
          meta={<span className={adminScreenMetaHintClass}>Estrutura pronta para evoluir sem mexer no fluxo atual</span>}
        />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
              <p className={adminSectionEyebrowClass}>Modulo</p>
              <h2 className="mt-2 text-lg font-black text-fptext-primary">Canal dedicado e configuracao reutilizada</h2>
              <p className="mt-2 text-sm leading-relaxed text-fptext-muted">
                A configuracao existente continua disponivel, agora dentro de uma tela propria do WhatsApp IA.
                Isso deixa o modulo preparado para receber painel, atendimentos e a orquestracao do chatbot nas proximas etapas.
              </p>
            </section>

            <div className="min-w-0">
              <DeliveryConfigPanel token={token} slug={slug} initialSection="evolution" standaloneSection="evolution" />
            </div>
          </div>

          <aside className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
            <p className={adminSectionEyebrowClass}>Painel futuro</p>
            <h2 className="mt-2 text-lg font-black text-fptext-primary">Espaco reservado para a operacao do chatbot</h2>
            <p className="mt-2 text-sm leading-relaxed text-fptext-muted">
              Este container fica pronto para receber a visao do canal, contexto das conversas e indicadores do WhatsApp IA
              quando a evolucao do modulo avancar.
            </p>

            <div className={`${adminOpsDashedWellClass} mt-4`}>
              <EmptyState
                icon={MessageCircle}
                title="Painel do chatbot em preparacao"
                description="O FlowPDV continua com a configuracao atual funcionando, enquanto esta area fica reservada para a proxima etapa do modulo."
              />
            </div>
          </aside>
        </div>
      </div>
    </motion.div>
  );
}
