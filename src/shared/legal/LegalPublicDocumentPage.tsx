import React, { useEffect } from 'react';
import type { LegalDocSection } from '../../legal/documentSectionsPtBr';
import { LEGAL_BUNDLE_VERSION } from '../../legal/legalBundleVersion';

export default function LegalPublicDocumentPage({
  title,
  updatedLabel,
  intro,
  sections,
}: {
  title: string;
  updatedLabel: string;
  intro?: string;
  sections: LegalDocSection[];
}) {
  useEffect(() => {
    document.title = `${title} — FlowPDV`;
    return () => {
      document.title = 'FlowPDV';
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a
            href="/"
            className="text-sm font-bold text-zinc-900 transition-colors hover:text-zinc-600"
            style={{ fontFamily: "'Syne', system-ui, sans-serif" }}
          >
            Flow<span className="text-cyan-600">PDV</span>
          </a>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-600">
              Versão {LEGAL_BUNDLE_VERSION}
            </span>
            <a href="/privacidade" className="font-medium text-zinc-600 hover:text-zinc-900">
              Privacidade
            </a>
            <span className="text-zinc-300" aria-hidden>
              ·
            </span>
            <a href="/termos" className="font-medium text-zinc-600 hover:text-zinc-900">
              Termos
            </a>
            <a
              href="/login"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-800"
            >
              Entrar
            </a>
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-black leading-tight text-zinc-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{updatedLabel}</p>
        {intro ? (
          <p className="mt-8 text-base leading-relaxed text-zinc-700">{intro}</p>
        ) : null}

        <div className="mt-10 space-y-10">
          {sections.map((s) => (
            <section key={s.heading} className="scroll-mt-24">
              <h2 className="text-lg font-bold text-zinc-900 sm:text-xl">{s.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-700 sm:text-[15px]">
                {s.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-zinc-200 pt-8 text-center text-xs text-zinc-500">
          <p>FlowPDV — documento para fins informativos. Ajuste dados do controlador e foro no texto publicado pela sua empresa.</p>
        </footer>
      </article>
    </div>
  );
}
