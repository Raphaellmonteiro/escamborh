/**
 * Gera HTML estático de exemplo do cardápio moderno em public/previews/.
 * Uso: npx tsx scripts/generate-cardapio-preview.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCardapioPdfHtml } from '../src/utils/cardapioPdfHtml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'previews');
const outFile = path.join(outDir, 'cardapio-moderno-exemplo.html');

const html = buildCardapioPdfHtml({
  mode: 'modern',
  autoPrint: false,
  estabelecimentoNome: 'Flow Bistro — exemplo',
  origin: 'https://exemplo.flowpdv.app',
  deliverySlug: 'demo-loja',
  logoUrl: null,
  includeDate: true,
  products: [
    {
      name: 'Burger artesanal clássico',
      price: 32.9,
      category: 'Lanches',
      active: 1,
      descricao: 'Blend 180g, queijo prato, maionese da casa e pão brioche.',
      destaque: 1,
      em_promocao: 0,
      preco_original: null,
      ordem: 1,
    },
    {
      name: 'Batata rústica com cheddar',
      price: 18.5,
      category: 'Lanches',
      active: 1,
      descricao: 'Porção generosa com bacon crocante.',
      destaque: 0,
      em_promocao: 1,
      preco_original: 24.9,
      ordem: 2,
    },
    {
      name: 'Refrigerante lata',
      price: 6,
      category: 'Bebidas',
      active: 1,
      descricao: '350 ml — sabores tradicionais.',
      destaque: 0,
      em_promocao: 0,
      preco_original: null,
      ordem: 1,
    },
    {
      name: 'Brownie com sorvete',
      price: 22,
      category: 'Sobremesas',
      active: 1,
      descricao: 'Brownie quente, sorvete de creme e calda de chocolate.',
      destaque: 0,
      em_promocao: 0,
      preco_original: null,
      ordem: 1,
      mais_vendido: 1,
    },
  ],
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log('Escrito:', outFile);
