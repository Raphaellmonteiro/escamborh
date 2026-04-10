import { motion } from 'motion/react';
import { Bot, MessageCircle, Zap } from 'lucide-react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import WhatsAppChatbotPanel from './WhatsAppChatbotPanel';
import {
  adminOpsInsetPanelClass,
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
          subtitle="Configuracao do chatbot Groq por tenant, alinhada ao contrato atual do modulo WhatsApp IA."
          meta={<span className={adminScreenMetaHintClass}>Painel administrativo conectado ao contrato atual de /api/whatsapp/ai</span>}
        />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <section className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
            <p className={adminSectionEyebrowClass}>Modulo</p>
            <h2 className="mt-2 text-lg font-black text-fptext-primary">Configuracao dedicada do chatbot</h2>
            <p className="mt-2 text-sm leading-relaxed text-fptext-muted">
              Esta tela consome o contrato atual do chatbot e concentra provider, modelo, prompt e credenciais
              por tenant. O inbound e a operacao do canal seguem nas trilhas proprias do modulo WhatsApp.
            </p>
          </section>

          <aside className={`${adminOpsSurfaceCardClass} p-4 sm:p-5`}>
            <p className={adminSectionEyebrowClass}>Contrato atual</p>
            <h2 className="mt-2 text-lg font-black text-fptext-primary">Recorte deste painel</h2>
            <div className="mt-4 space-y-3">
              <div className={`${adminOpsInsetPanelClass} flex items-start gap-3 p-3`}>
                <Bot size={16} className="mt-0.5 shrink-0 text-fptext-muted" />
                <div>
                  <p className="text-sm font-bold text-fptext-primary">Configurado aqui</p>
                  <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                    Leitura via <code>GET /api/whatsapp/ai</code> e salvamento via <code>PUT /api/whatsapp/ai</code> da configuracao
                    de provider, modelo, prompt e credenciais do chatbot.
                  </p>
                </div>
              </div>

              <div className={`${adminOpsInsetPanelClass} flex items-start gap-3 p-3`}>
                <MessageCircle size={16} className="mt-0.5 shrink-0 text-fptext-muted" />
                <div>
                  <p className="text-sm font-bold text-fptext-primary">Operado em outras trilhas</p>
                  <p className="mt-1 text-xs leading-relaxed text-fptext-muted">
                    Inbound, visao de conversas, roteamento e atendimento humano continuam no backend e nas telas
                    operacionais do modulo, sem configuracao adicional nesta pagina.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <WhatsAppChatbotPanel token={token} />
      </div>
    </motion.div>
  );
}
