import React from 'react';
import LegalPublicDocumentPage from './LegalPublicDocumentPage';
import { PRIVACY_POLICY_SECTIONS } from '../../legal/documentSectionsPtBr';

export default function PrivacyPolicyPublicPage() {
  return (
    <LegalPublicDocumentPage
      title="Política de Privacidade"
      updatedLabel="Última atualização: consulte a versão no rodapé do sistema ou comunique-se com o suporte."
      intro="Esta página resume a política aplicável ao uso da plataforma FlowPDV. O operador do serviço deve publicar dados de contato, CNPJ e canal de privacidade atualizados junto a este documento."
      sections={PRIVACY_POLICY_SECTIONS}
    />
  );
}
