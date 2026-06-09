import React from 'react';
import LegalPublicDocumentPage from './LegalPublicDocumentPage';
import { TERMS_OF_USE_SECTIONS } from '../../legal/documentSectionsPtBr';

export default function TermsOfUsePublicPage() {
  return (
    <LegalPublicDocumentPage
      title="Termos de Uso"
      updatedLabel="Última atualização: consulte a versão no rodapé do sistema ou comunique-se com o suporte."
      intro="Estes termos regulam o uso da plataforma Pratory pelos estabelecimentos e usuários autorizados. Complemente com razão social, CNPJ, foro e contatos conforme seu contrato ou site institucional."
      sections={TERMS_OF_USE_SECTIONS}
    />
  );
}
