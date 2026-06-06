/**
 * TabIA.tsx
 * Aba de Inteligência Artificial — configuração do chatbot.
 * Reutiliza o painel existente (WhatsAppChatbotPanel) e expandirá
 * para GPT/OpenAI na Fase 8.
 */
import WhatsAppChatbotPanel from '../WhatsAppChatbotPanel';

type Props = { token: string };

export default function TabIA({ token }: Props) {
  return <WhatsAppChatbotPanel token={token} />;
}
