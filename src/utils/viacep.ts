export type ViaCepEndereco = {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export async function fetchViaCep(
  cep8: string,
  signal?: AbortSignal
): Promise<{ ok: true; data: ViaCepEndereco } | { ok: false }> {
  if (!/^\d{8}$/.test(cep8)) return { ok: false };
  const r = await fetch(`https://viacep.com.br/ws/${cep8}/json/`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return { ok: false };
  const j = (await r.json()) as Record<string, unknown>;
  if (j?.erro === true) return { ok: false };
  return {
    ok: true,
    data: {
      logradouro: String(j.logradouro ?? '').trim(),
      bairro: String(j.bairro ?? '').trim(),
      localidade: String(j.localidade ?? '').trim(),
      uf: String(j.uf ?? '').trim(),
    },
  };
}
