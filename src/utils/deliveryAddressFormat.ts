export type DeliveryAddressLike = {
  label?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  referencia?: string | null;
};

export function formatDeliveryAddressLine(addr: DeliveryAddressLike): string {
  const logradouro = String(addr.logradouro || '').trim();
  const numero = String(addr.numero || '').trim();
  const complemento = String(addr.complemento || '').trim();
  const bairro = String(addr.bairro || '').trim();
  const referencia = String(addr.referencia || '').trim();

  const firstLine = [logradouro, numero].filter(Boolean).join(', ').trim();
  const parts = [
    firstLine,
    complemento ? `Compl: ${complemento}` : '',
    bairro ? `Bairro: ${bairro}` : '',
    referencia ? `Ref: ${referencia}` : '',
  ].filter(Boolean);

  return parts.join(' · ');
}

