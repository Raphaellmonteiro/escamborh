import React from 'react';
import { PUBLIC_SEGMENT_NOTE, PUBLIC_SEGMENT_OPTIONS } from '../config/publicSegments';

const HIGHLIGHTS = [
  'Mesmo sistema para balcão, mesa, delivery e retirada',
  'Cliente pede pelo cardápio online (link ou QR Code)',
  'Caixa e estoque no ritmo do dia a dia',
];

const MODULES = [
  'Vender no balcão, na mesa e para levar',
  'Cozinha vê a fila de pedidos',
  'Delivery e pedido pelo cardápio online',
  'Mesas e comanda',
  'Estoque e fechamento de caixa',
];

export default function PublicLandingRevamp({
  onShowSolicitacao,
}: {
  onShowSolicitacao: () => void;
}) {
  const goToLogin = () => {
    window.location.href = '/login';
  };

  const goToSolicitar = onShowSolicitacao;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const segmentLine = PUBLIC_SEGMENT_OPTIONS.map((s) => s.label).join(' · ');

  return (
    <div className="pratori-public-light min-h-screen bg-fp-app text-fptext-primary">
      <header className="sticky top-0 z-20 border-b border-fp-border bg-fp-card/96 shadow-[0_4px_20px_rgba(63,62,62,0.05)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="pratori-text-brand text-2xl font-extrabold tracking-tight sm:text-[1.7rem]">Pratory</div>
            <p className="mt-0.5 text-xs font-medium tracking-wide text-fptext-secondary">Restaurante e delivery</p>
          </div>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={goToLogin}
              className="rounded-xl border border-transparent px-4 py-2.5 text-sm font-semibold text-fptext-primary transition-colors hover:bg-fp-hover"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={goToSolicitar}
              className="pratori-btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(156,5,11,0.18)] transition-all hover:-translate-y-[1px]"
            >
              Pedir teste
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(330px,0.82fr)] lg:items-start lg:gap-12">
          <section>
            <p className="pratori-text-eyebrow text-[11px] font-bold uppercase">Venda, cozinha e caixa</p>
            <h1 className="mt-4 max-w-[18ch] text-balance text-[2rem] font-extrabold leading-[1.06] tracking-tight text-fptext-primary sm:max-w-[20ch] sm:text-[2.8rem] lg:text-[3.1rem]">
              Balcão, mesa e <span className="pratori-mark font-black">delivery</span> no mesmo sistema.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-fptext-secondary sm:text-[1.08rem]">
              Pedido vai para a cozinha, o caixa fecha certo e o cliente pode pedir pelo cardápio no celular. Tudo
              num lugar só, fácil no dia a dia.
            </p>

            <ul className="mt-10 space-y-4 text-sm leading-relaxed text-fptext-primary sm:text-[0.96rem]">
              {HIGHLIGHTS.map((line) => (
                <li key={line} className="flex gap-3.5 rounded-lg px-1 py-0.5">
                  <span className="pratori-bullet mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(234,29,44,0.11)]" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-11 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={goToSolicitar}
                className="pratori-btn-primary rounded-xl px-6 py-3.5 text-sm font-semibold shadow-[0_14px_30px_rgba(156,5,11,0.2)] transition-all hover:-translate-y-[1px]"
              >
                Teste grátis por 7 dias
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('lp-modulos')}
                className="pratori-btn-secondary rounded-xl px-6 py-3.5 text-sm font-semibold shadow-[0_6px_18px_rgba(63,62,62,0.05)] transition-colors"
              >
                Ver o que inclui
              </button>
            </div>

            <p className="mt-8 max-w-2xl rounded-2xl border border-[#f6d9dc] bg-[#fff9fa] px-4 py-3.5 text-xs leading-relaxed text-fptext-secondary shadow-[0_8px_24px_rgba(63,62,62,0.04)] sm:px-5">
              Teste sem cartão · ajuda para começar · serve restaurante, lanchonete, bar e delivery.
            </p>
          </section>

          <aside className="relative overflow-hidden rounded-3xl border border-fp-border bg-fp-card p-6 shadow-[0_24px_60px_rgba(63,62,62,0.1)] sm:p-7">
            <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#fff3f5]" aria-hidden />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f2d6d9] bg-[#fff7f8] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#a02331]">
                <span className="h-2 w-2 rounded-full bg-[#EA1D2C]" aria-hidden />
                Pronto para operação
              </div>
              <h2 className="mt-4 text-[1.35rem] font-extrabold leading-tight tracking-tight text-fptext-primary sm:text-[1.5rem]">
                Visual claro, comercial e direto
              </h2>
            </div>
            <div className="mt-6 space-y-3.5">
              {[
                'PDV com pedido, pagamento e atendimento no mesmo fluxo',
                'Operação organizada por etapas, com leitura rápida',
                'Landing com CTA forte e apresentação mais profissional',
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-fp-border bg-[#FAFAFB] px-4 py-3.5 text-sm leading-relaxed text-fptext-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                >
                  {item}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={goToSolicitar}
              className="pratori-btn-primary mt-7 w-full rounded-xl px-5 py-3.5 text-sm font-semibold shadow-[0_12px_28px_rgba(156,5,11,0.2)] transition-all hover:-translate-y-[1px]"
            >
              Pedir teste agora
            </button>
          </aside>
        </div>
      </main>

      <section
        id="lp-modulos"
        className="border-t border-fp-border bg-[#FAFAFB] py-14 sm:py-16"
        aria-labelledby="lp-modulos-heading"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2
            id="lp-modulos-heading"
            className="text-center text-[1.5rem] font-extrabold tracking-tight text-fptext-primary sm:text-[1.95rem]"
          >
            O que a plataforma entrega hoje
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-fptext-secondary sm:text-[0.97rem]">
            O que já vem pronto para usar.
          </p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {MODULES.map((m) => (
              <li
                key={m}
                className="rounded-2xl border border-fp-border bg-fp-card px-5 py-4 text-sm leading-snug text-fptext-primary shadow-[0_12px_28px_rgba(63,62,62,0.05)]"
              >
                {m}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="lp-segmentos"
        className="border-t border-fp-border bg-fp-app py-12 sm:py-14"
        aria-labelledby="lp-segmentos-heading"
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2 id="lp-segmentos-heading" className="text-xl font-bold tracking-tight text-fptext-primary sm:text-2xl">
            Tipos de estabelecimento
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-fptext-secondary">{segmentLine}</p>
          <div className="pratori-card-soft mt-6 rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-semibold text-fptext-primary">Leia antes de contratar</p>
            <p className="mt-2 text-sm leading-relaxed text-fptext-secondary">{PUBLIC_SEGMENT_NOTE}</p>
          </div>
        </div>
      </section>

      <section className="pratori-cta-band py-12 sm:py-14">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <div className="mx-auto max-w-2xl rounded-3xl border border-fp-border bg-fp-card px-5 py-8 shadow-[0_18px_44px_rgba(63,62,62,0.08)] sm:px-8">
            <p className="pratori-text-eyebrow text-[11px] font-bold uppercase">Teste na sua loja</p>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-fptext-primary sm:text-2xl">
              7 dias grátis, sem cartão
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fptext-secondary">
              Use na operação e veja se pedidos, cozinha e caixa ficam do jeito que você precisa.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={goToSolicitar}
                className="pratori-btn-primary rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                Pedir teste
              </button>
              <button
                type="button"
                onClick={goToLogin}
                className="pratori-btn-secondary rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                Já tenho login
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-fp-border bg-fp-card py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center text-sm text-fptext-secondary">
          <div>
            <span className="pratori-text-brand font-bold">Pratory</span>
            <span className="text-fptext-secondary"> · RM Tecnologia</span>
          </div>
          <p className="text-xs text-fptext-secondary">
            © {new Date().getFullYear()} RM Tecnologia. Todos os direitos reservados.
          </p>
          <div className="pratori-footer-links flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
            <a href="/privacidade" className="font-medium underline-offset-4 hover:underline">
              Privacidade
            </a>
            <a href="/termos" className="font-medium underline-offset-4 hover:underline">
              Termos de uso
            </a>
            <button type="button" onClick={goToSolicitar} className="font-medium underline-offset-4 hover:underline">
              Pedir teste
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
