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
      <header className="sticky top-0 z-20 border-b border-fp-border bg-fp-card/96 shadow-[0_1px_0_rgba(63,62,62,0.05)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:py-5">
          <div className="min-w-0">
            <div className="pratori-text-brand text-xl font-bold tracking-tight">Pratori</div>
            <p className="mt-0.5 text-xs font-medium text-fptext-secondary">Restaurante e delivery</p>
          </div>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={goToLogin}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-fptext-primary transition-colors hover:bg-fp-hover"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={goToSolicitar}
              className="pratori-btn-primary rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            >
              Pedir teste
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-start lg:gap-10">
          <section>
            <p className="pratori-text-eyebrow text-[11px] font-bold uppercase">Venda, cozinha e caixa</p>
            <h1 className="mt-3 max-w-[20ch] text-balance text-3xl font-bold leading-tight tracking-tight text-fptext-primary sm:max-w-none sm:text-[2.5rem] sm:leading-[1.1]">
              Balcão, mesa e delivery no mesmo sistema.
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-fptext-secondary sm:text-[1.05rem]">
              Pedido vai para a cozinha, o caixa fecha certo e o cliente pode pedir pelo cardápio no celular. Tudo
              num lugar só, fácil no dia a dia.
            </p>

            <ul className="mt-9 space-y-3.5 text-sm leading-relaxed text-fptext-primary">
              {HIGHLIGHTS.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="pratori-bullet mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goToSolicitar}
                className="pratori-btn-primary rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                Teste grátis por 7 dias
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('lp-modulos')}
                className="pratori-btn-secondary rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
              >
                Ver o que inclui
              </button>
            </div>

            <p className="mt-8 max-w-xl rounded-r-xl border-l-4 border-[#EA1D2C] bg-[#FFF7F8] pl-4 pr-4 py-3 text-xs leading-relaxed text-fptext-secondary">
              Teste sem cartão · ajuda para começar · serve restaurante, lanchonete, bar e delivery.
            </p>
          </section>

          <aside className="rounded-3xl border border-fp-border bg-fp-card p-5 shadow-[0_14px_40px_rgba(63,62,62,0.08)] sm:p-6">
            <p className="pratori-text-eyebrow text-[11px] font-bold uppercase">Pronto para operação</p>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-fptext-primary">Visual claro, comercial e direto</h2>
            <div className="mt-5 space-y-3">
              {[
                'PDV com pedido, pagamento e atendimento no mesmo fluxo',
                'Operação organizada por etapas, com leitura rápida',
                'Landing com CTA forte e apresentação mais profissional',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-fp-border bg-[#FAFAFB] px-4 py-3 text-sm text-fptext-primary">
                  {item}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={goToSolicitar}
              className="pratori-btn-primary mt-6 w-full rounded-xl px-5 py-3 text-sm font-semibold transition-colors"
            >
              Pedir teste agora
            </button>
          </aside>
        </div>
      </main>

      <section
        id="lp-modulos"
        className="border-t border-fp-border bg-[#FAFAFB] py-12 sm:py-14"
        aria-labelledby="lp-modulos-heading"
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2 id="lp-modulos-heading" className="text-xl font-bold tracking-tight text-fptext-primary sm:text-2xl">
            O que o sistema faz hoje
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fptext-secondary">
            O que já vem pronto para usar.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {MODULES.map((m) => (
              <li
                key={m}
                className="rounded-2xl border border-fp-border bg-fp-card px-4 py-4 text-sm leading-snug text-fptext-primary shadow-sm shadow-[0_10px_24px_rgba(63,62,62,0.04)]"
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
            <span className="pratori-text-brand font-bold">Pratori</span>
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
