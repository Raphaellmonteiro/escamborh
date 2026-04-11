/**
 * Testes manuais do casamento bairro x zona (rodar: npm run test:delivery-zona).
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
  findDeliveryZoneByBairro(zonas, 'Feit\u00f3sa')?.nome === 'Feitosa Barre',
  'Acento no bairro deve casar'
);
assert(
  findDeliveryZoneByBairro([{ nome: 'Jos\u00e9 Bonif\u00e1cio', taxa: 1 }], 'Jose Bonifacio')?.nome === 'Jos\u00e9 Bonif\u00e1cio',
  'Zona com acento vs bairro sem acento'
);
assert(
  findDeliveryZoneByBairro([{ nome: 'Jatiuca', taxa: 3 }], 'Jati\u00faca')?.taxa === 3,
  'Jatiuca deve casar com Jatiuca com acento'
);

// Virgula + cidade
assert(
  findDeliveryZoneByBairro(zonas, 'Feitosa, Macei\u00f3')?.nome === 'Feitosa Barre',
  'Feitosa, Maceio deve casar pela parte antes da virgula'
);

// Prefixo "bairro"
assert(
  findDeliveryZoneByBairro(zonas, 'bairro Feitosa')?.nome === 'Feitosa Barre',
  'Prefixo bairro deve ser ignorado na normalizacao'
);

// Normalizacao explicita
assert(normalizeBairroForZonaMatch('  Bairro  Feit\u00f3sa!!  ') === 'feitosa', 'normalizeBairroForZonaMatch');

// Candidatos
const cand = bairroMatchCandidates('Feitosa, Macei\u00f3');
assert(cand.includes('feitosa') && cand.includes('feitosa maceio'), 'bairroMatchCandidates virgula');

// Match direto
assert(deliveryBairroZonaMatch('feitosa barre', 'feitosa'), 'deliveryBairroZonaMatch includes');
assert(!deliveryBairroZonaMatch('feitosa barre', 'ab'), 'substring curto demais nao deve casar por includes');
assert(deliveryBairroZonaMatch('ab', 'ab'), 'igualdade exata mesmo com trecho curto');

// Nao casar bairros claramente diferentes
assert(findDeliveryZoneByBairro(zonas, 'Ponta Verde') === null, 'bairro diferente nao deve casar');

console.log('OK: test-delivery-bairro-zona (todos passaram)');
