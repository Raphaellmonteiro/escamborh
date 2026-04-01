/**
 * Testes manuais do casamento bairro × zona (rodar: npm run test:delivery-zona).
 */
import {
  normalizeBairroForZonaMatch,
  findDeliveryZoneByBairro,
  deliveryBairroZonaMatch,
  bairroMatchCandidates,
} from '../src/utils/deliveryBairroZona';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const zonas = [{ nome: 'Feitosa Barre', taxa: 5 }];

// Feitosa vs Feitosa Barre (CEP curto)
assert(
  findDeliveryZoneByBairro(zonas, 'Feitosa')?.nome === 'Feitosa Barre',
  'Feitosa deve casar com zona Feitosa Barre'
);

// Acento
assert(
  findDeliveryZoneByBairro(zonas, 'Feitósa')?.nome === 'Feitosa Barre',
  'Acento no bairro deve casar'
);
assert(
  findDeliveryZoneByBairro([{ nome: 'José Bonifácio', taxa: 1 }], 'Jose Bonifacio')?.nome === 'José Bonifácio',
  'Zona com acento vs bairro sem acento'
);

// Vírgula + cidade
assert(
  findDeliveryZoneByBairro(zonas, 'Feitosa, Maceió')?.nome === 'Feitosa Barre',
  'Feitosa, Maceió deve casar pela parte antes da vírgula'
);

// Prefixo "bairro"
assert(
  findDeliveryZoneByBairro(zonas, 'bairro Feitosa')?.nome === 'Feitosa Barre',
  'Prefixo bairro deve ser ignorado na normalização'
);

// Normalização explícita
assert(normalizeBairroForZonaMatch('  Bairro  Feitósa!!  ') === 'feitosa', 'normalizeBairroForZonaMatch');

// Candidatos
const cand = bairroMatchCandidates('Feitosa, Maceió');
assert(cand.includes('feitosa') && cand.includes('feitosa maceio'), 'bairroMatchCandidates vírgula');

// Match direto
assert(deliveryBairroZonaMatch('feitosa barre', 'feitosa'), 'deliveryBairroZonaMatch includes');
assert(!deliveryBairroZonaMatch('feitosa barre', 'ab'), 'substring curto demais não deve casar por includes');
assert(deliveryBairroZonaMatch('ab', 'ab'), 'igualdade exata mesmo com trecho curto');

// Não casar bairros claramente diferentes (mesmo com token comum curto seria perigoso — aqui strings não se contêm)
assert(findDeliveryZoneByBairro(zonas, 'Ponta Verde') === null, 'bairro diferente não deve casar');

console.log('OK: test-delivery-bairro-zona (todos passaram)');
