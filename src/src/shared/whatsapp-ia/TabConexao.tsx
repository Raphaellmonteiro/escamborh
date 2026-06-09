/**
 * TabConexao.tsx
 * Aba de Conexão do módulo WhatsApp IA.
 * Apenas envolve o painel já existente — nenhuma lógica duplicada.
 */
import WhatsAppConnectionPanel from '../WhatsAppConnectionPanel';

type Props = { token: string };

export default function TabConexao({ token }: Props) {
  return <WhatsAppConnectionPanel token={token} />;
}
