/**
 * Temas visuais do cardápio online (DeliveryCardapio).
 * Um único layout; classes alternadas por `theme_mode` na delivery_config JSON.
 */
export type DeliveryCardapioThemeMode = 'dark_premium' | 'light_red';

export function normalizeDeliveryCardapioThemeMode(raw: unknown): DeliveryCardapioThemeMode {
  const s = String(raw || '').trim();
  if (s === 'light_red') return 'light_red';
  return 'dark_premium';
}

export type DeliveryCardapioTheme = {
  mode: DeliveryCardapioThemeMode;
  pageLoading: { wrap: string; spin: string; text: string };
  pageEmpty: string;
  shell: { root: string; inner: string };
  header: {
    bar: string;
    navBtn: string;
    navBtnActive: string;
    cartFab: string;
    cartFabIcon: string;
  };
  hero: { gridBg: string; cellBg: string; fallbackLetter: string };
  lojaBlock: string;
  statusPillOpen: string;
  statusPillClosed: string;
  menuDropdown: string;
  menuItem: string;
  menuItemActive: string;
  /** Categoria selecionada no dropdown (contraste explícito no fundo escuro/claro). */
  menuCategoryActive: string;
  menuCategoryCountActive: string;
  menuCategoryCountIdle: string;
  searchToggle: string;
  searchInput: string;
  vitrine: {
    showcaseCard: string;
    compactCard: string;
    compactOfferBg: string;
    imageBg: string;
    compactThumb: string;
    noPhoto: string;
    title: string;
    desc: string;
    hint: string;
    priceFrom: string;
    priceMain: string;
    priceMainPromo: string;
    btnAdd: string;
    btnAddDisabled: string;
    qtyBadge: string;
    favBtn: string;
    favIcon: string;
    badgeCyan: string;
  };
  sacola: {
    overlay: string;
    panel: string;
    headerRow: string;
    title: string;
    subtitle: string;
    closeBtn: string;
    footer: string;
    primaryBtn: string;
    secondaryBtn: string;
    resumoBox: string;
    resumoLabel: string;
    resumoBadge: string;
    suggestAddBtn: string;
  };
  checkout: {
    overlay: string;
    panel: string;
    header: string;
    title: string;
    subtitle: string;
    closeBtn: string;
    stepActive: string;
    stepDone: string;
    stepIdle: string;
    stepLabelActive: string;
    stepLabelDone: string;
    stepLabelIdle: string;
    stepLineDone: string;
    stepLineTodo: string;
    card: string;
    cardTitle: string;
    cardMuted: string;
    modeCard: string;
    modeCardActive: string;
    modeIconActive: string;
    modeIconIdle: string;
    modeTitle: string;
    modeDesc: string;
    hintBoxEntrega: string;
    hintBoxRetirada: string;
    hintBoxLocal: string;
    hintBoxDefault: string;
    addressBtnOn: string;
    addressBtnOff: string;
    zonaBadgeFree: string;
    zonaBadgePaid: string;
    inputBase: string;
    pixOptionOuter: string;
    pixOptionOuterOn: string;
    pixOptionInner: string;
    pixOptionInnerOn: string;
    pixIconBoxOn: string;
    pixIconBoxOff: string;
    pixTitleOn: string;
    pixTitleOff: string;
    pixSubOn: string;
    pixSubOff: string;
    radioOn: string;
    radioOff: string;
    pixPanel: string;
    pixPanelTitle: string;
    pixDetailBox: string;
    pixCopyBtn: string;
    pixCopyBtnDone: string;
    payDinheiroExpand: string;
    trocoToggleOn: string;
    trocoToggleOff: string;
    trocoInput: string;
    cupomBox: string;
    cupomTitle: string;
    cupomInput: string;
    cupomApply: string;
    obsBox: string;
    footerBar: string;
    footerBack: string;
    footerPrimary: string;
    footerPrimaryDisabled: string;
    resumoCard: string;
    clienteCard: string;
    cartaoRow: string;
    cartaoRowOn: string;
  };
  modalOpcoes: {
    sheet: string;
    headerBg: string;
    closeBtn: string;
    title: string;
    desc: string;
    pricePanel: string;
    pricePanelPromo: string;
    scroll: string;
    section: string;
    sectionHeader: string;
    row: string;
    rowSelected: string;
    footer: string;
    footerBtn: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    qtyBar: string;
    qtyBtn: string;
    qtyBtnPlus: string;
    footerHintOk: string;
    footerHintWait: string;
  };
  barraFlutuante: string;
  barraFlutuanteIconWrap: string;
  barraFlutuanteIcon: string;
  barraFlutuanteBadge: string;
  barraFlutuanteTotal: string;
  resumoLinhas: {
    line: string;
    lineStrong: string;
    accent: string;
    accentBold: string;
    amber: string;
    amberMuted: string;
    aux: string;
    totalRow: string;
    totalLabel: string;
    totalValue: string;
  };
  lojaInfo: {
    card: string;
    iconWrap: string;
    label: string;
    value: string;
  };
};

const darkPremium: DeliveryCardapioTheme = {
  mode: 'dark_premium',
  pageLoading: {
    wrap: 'min-h-screen bg-zinc-950 flex items-center justify-center',
    spin: 'w-10 h-10 border-2 border-zinc-800 border-t-cyan-500 rounded-full animate-spin',
    text: 'text-sm text-zinc-200',
  },
  pageEmpty: 'min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-600',
  shell: {
    root: 'relative min-h-screen bg-zinc-950 text-zinc-100',
    inner: 'relative z-10 min-h-screen',
  },
  header: {
    bar: 'sticky top-0 z-40 border-b border-white/12 bg-zinc-950/95 backdrop-blur-xl pt-[env(safe-area-inset-top)] shadow-[0_20px_60px_rgba(0,0,0,0.38)]',
    navBtn:
      'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition-colors hover:bg-white/10 hover:text-white',
    navBtnActive:
      'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition-colors bg-white/12 text-white',
    cartFab:
      'absolute right-0 top-1/2 flex min-h-[48px] min-w-[48px] shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-white via-white to-cyan-100 p-3 text-zinc-950 shadow-[0_6px_26px_rgba(34,211,238,0.42)] ring-2 ring-cyan-400/55 transition-all hover:from-cyan-200 hover:to-white hover:shadow-[0_8px_32px_rgba(34,211,238,0.55)] hover:ring-cyan-300/70 active:scale-95',
    cartFabIcon: 'text-zinc-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]',
  },
  hero: {
    gridBg: 'grid w-full grid-cols-2 gap-0.5 bg-zinc-950 lg:grid-cols-4',
    cellBg: 'relative aspect-[4/3] w-full overflow-hidden bg-zinc-950',
    fallbackLetter: 'flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950',
  },
  lojaBlock: 'bg-zinc-900/95 px-5 pb-5 pt-8 sm:px-6 sm:pt-10',
  statusPillOpen: 'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 border border-emerald-400/30 bg-emerald-500/12 text-emerald-100',
  statusPillClosed: 'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 border border-white/10 bg-white/5 text-zinc-100',
  menuDropdown:
    'absolute left-0 top-[calc(100%+12px)] z-20 w-[280px] rounded-[24px] border border-white/12 bg-zinc-950 p-3 text-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.38)]',
  menuItem:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10 hover:text-white active:bg-white/[0.12]',
  menuItemActive:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold bg-[#f4f4f5] text-zinc-950 shadow-sm ring-1 ring-white/25 transition-colors hover:bg-[#ececee]',
  menuCategoryActive:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold bg-red-500 text-white shadow-sm ring-1 ring-red-400/50 transition-colors hover:bg-red-600 hover:text-white',
  menuCategoryCountActive: 'text-xs font-black tabular-nums text-white/80',
  menuCategoryCountIdle: 'text-xs font-bold tabular-nums text-zinc-400',
  searchToggle:
    'inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-zinc-950 px-4 py-3 text-sm font-bold text-zinc-100 transition-colors hover:bg-white/8',
  searchInput:
    'w-full rounded-2xl border border-white/12 bg-zinc-950 py-4 pl-12 pr-10 text-sm text-white shadow-[0_14px_30px_rgba(0,0,0,0.24)] placeholder:text-zinc-300 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20',
  vitrine: {
    showcaseCard:
      'group flex h-[min(348px,52vh)] min-h-0 w-[min(calc(100vw-2rem),320px)] max-w-full shrink-0 flex-col overflow-hidden rounded-[30px] border border-white/14 bg-[linear-gradient(180deg,rgba(52,52,60,0.98),rgba(28,28,34,1))] shadow-[0_24px_56px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.04] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-cyan-400/35 hover:shadow-[0_28px_64px_rgba(34,211,238,0.18)] sm:h-[348px] sm:min-w-[280px] sm:max-w-[320px]',
    compactCard:
      'group flex min-h-[184px] w-[min(calc(100vw-2rem),320px)] max-w-full shrink-0 items-stretch gap-0 overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(39,39,42,0.98),rgba(24,24,27,1))] shadow-[0_20px_52px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.04] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-400/32 hover:shadow-[0_26px_60px_rgba(34,211,238,0.14)] sm:min-w-[290px]',
    compactOfferBg: 'border-rose-500/15 bg-[linear-gradient(135deg,rgba(39,39,42,1),rgba(39,39,42,0.98),rgba(76,5,25,0.88))]',
    imageBg: 'relative h-44 cursor-pointer overflow-hidden bg-zinc-800',
    compactThumb: 'relative min-h-[184px] w-[122px] shrink-0 cursor-pointer overflow-hidden bg-zinc-800 self-stretch',
    noPhoto: 'flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950',
    title: 'line-clamp-2 min-h-[2.5rem] break-words text-lg font-black leading-tight tracking-tight text-white drop-shadow-sm',
    desc: 'line-clamp-1 text-sm leading-relaxed text-zinc-200/95',
    hint: 'mt-1.5 line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300',
    priceFrom: 'text-[10px] font-semibold uppercase tracking-wide text-zinc-300',
    priceMain:
      'mt-0.5 text-[30px] font-black tabular-nums leading-none text-cyan-200 drop-shadow-[0_0_22px_rgba(34,211,238,0.28)]',
    priceMainPromo:
      'text-[30px] font-black tabular-nums leading-none text-emerald-400 drop-shadow-[0_0_24px_rgba(52,211,153,0.35)]',
    btnAdd:
      'flex shrink-0 min-h-[48px] items-center gap-2 rounded-2xl border border-white/15 bg-[linear-gradient(135deg,#4ade80,#22d3ee)] px-4 py-2 text-sm font-black text-zinc-950 shadow-[0_14px_36px_rgba(34,211,238,0.35)] ring-1 ring-cyan-300/35 transition-all duration-300 ease-out hover:brightness-110 hover:shadow-[0_20px_48px_rgba(52,211,153,0.25)] disabled:border-transparent disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:ring-0',
    btnAddDisabled: '',
    qtyBadge: 'absolute bottom-3 left-3 min-w-[34px] rounded-full bg-cyan-400 px-2.5 py-1 text-center text-xs font-black text-zinc-950 shadow-lg',
    favBtn: 'shrink-0 self-start rounded-full border border-white/12 bg-white/8 p-2 transition-all hover:border-white/20 hover:bg-white/12',
    favIcon: 'text-zinc-200',
    badgeCyan: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100',
  },
  sacola: {
    overlay: 'absolute inset-0 bg-black/70 backdrop-blur-sm',
    panel:
      'relative flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-white/14 bg-zinc-950 pb-[env(safe-area-inset-bottom)] text-zinc-100 shadow-[0_32px_90px_rgba(0,0,0,0.62)] ring-1 ring-cyan-500/10 sm:rounded-[28px] sm:pb-0',
    headerRow: 'flex shrink-0 items-start justify-between gap-3 border-b border-white/12 px-4 py-4 sm:px-5',
    title: 'text-lg font-black tracking-tight text-white',
    subtitle: 'mt-0.5 text-xs text-zinc-400',
    closeBtn:
      'shrink-0 rounded-2xl border border-white/18 bg-black/50 p-2.5 text-zinc-100 shadow-md backdrop-blur transition-colors hover:border-white/28 hover:bg-black/65',
    footer: 'shrink-0 border-t border-white/12 bg-zinc-950/98 px-4 py-4 sm:px-5',
    primaryBtn: 'w-full py-4 bg-white hover:bg-cyan-300 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-500 rounded-2xl font-black transition-all active:scale-[0.98]',
    secondaryBtn: 'mt-2 w-full py-3 rounded-2xl border border-white/10 bg-transparent text-sm font-bold text-zinc-300 hover:bg-white/5',
    resumoBox: 'rounded-[24px] border border-white/10 bg-zinc-900/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] space-y-3',
    resumoLabel: 'text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300',
    resumoBadge: 'rounded-full bg-cyan-400 px-2.5 py-1 text-xs font-black text-zinc-950',
    suggestAddBtn: 'px-3 py-2 bg-white text-zinc-950 text-xs font-bold rounded-xl hover:bg-cyan-300 transition-colors',
  },
  checkout: {
    overlay: 'absolute inset-0 bg-black/70 backdrop-blur-sm',
    panel:
      'relative flex max-h-[min(94dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-white/14 bg-zinc-950 pb-[env(safe-area-inset-bottom)] text-zinc-100 shadow-[0_32px_90px_rgba(0,0,0,0.62)] ring-1 ring-cyan-500/10 sm:rounded-[28px] sm:pb-0',
    header: 'shrink-0 border-b border-white/12 bg-zinc-950/98 px-4 pb-3 pt-4 sm:px-5',
    title: 'text-lg font-black tracking-tight text-white',
    subtitle: 'mt-0.5 text-xs font-medium text-zinc-400',
    closeBtn:
      'shrink-0 rounded-2xl border border-white/18 bg-black/50 p-2.5 text-zinc-100 shadow-md backdrop-blur transition-colors hover:border-white/28 hover:bg-black/65',
    stepActive: 'bg-cyan-400 text-zinc-950 shadow-[0_0_20px_rgba(34,211,238,0.35)]',
    stepDone: 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
    stepIdle: 'border border-white/14 bg-white/5 text-zinc-400',
    stepLabelActive: 'text-cyan-200',
    stepLabelDone: 'text-emerald-200/90',
    stepLabelIdle: 'text-zinc-500',
    stepLineDone: 'bg-emerald-500/50',
    stepLineTodo: 'bg-white/10',
    card: 'bg-zinc-900 rounded-3xl p-4 border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.22)]',
    cardTitle: 'mt-1 text-lg font-black text-white',
    cardMuted: 'text-sm text-zinc-200',
    modeCard: 'rounded-[28px] border p-4 text-left transition-all border-white/10 bg-zinc-950 hover:border-white/20',
    modeCardActive:
      'rounded-[28px] border p-4 text-left transition-all border-cyan-400 bg-cyan-500/10 shadow-[0_18px_40px_rgba(34,211,238,0.14)]',
    modeIconActive: 'flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400 text-zinc-950',
    modeIconIdle: 'flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-100',
    modeTitle: 'mt-4 text-base font-black text-white',
    modeDesc: 'mt-2 text-sm text-zinc-200',
    hintBoxEntrega: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    hintBoxRetirada: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-white/10 bg-zinc-950 text-zinc-200',
    hintBoxLocal: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
    hintBoxDefault: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-amber-500/20 bg-amber-500/10 text-amber-100',
    addressBtnOn: 'w-full text-left p-3 rounded-xl border transition-all border-cyan-400 bg-cyan-500/10',
    addressBtnOff: 'w-full text-left p-3 rounded-xl border transition-all border-white/10 bg-zinc-950 hover:border-white/20',
    zonaBadgeFree: 'mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
    zonaBadgePaid:
      'mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-white/10 bg-zinc-950 text-zinc-300',
    inputBase:
      'w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3.5 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all',
    pixOptionOuter: 'w-full overflow-hidden rounded-2xl border transition-all border-white/10 hover:border-white/20',
    pixOptionOuterOn: 'w-full overflow-hidden rounded-2xl border transition-all border-cyan-400',
    pixOptionInner: 'flex items-center justify-between p-4 bg-zinc-900',
    pixOptionInnerOn: 'flex items-center justify-between p-4 bg-cyan-500/10',
    pixIconBoxOn: 'flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600',
    pixIconBoxOff: 'flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800',
    pixTitleOn: 'text-sm font-black text-cyan-100',
    pixTitleOff: 'text-sm font-black text-white',
    pixSubOn: 'text-[11px] text-cyan-200',
    pixSubOff: 'text-[11px] text-zinc-400',
    radioOn: 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all border-cyan-600 bg-cyan-600',
    radioOff: 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-zinc-500',
    pixPanel: 'space-y-3 rounded-2xl border border-cyan-500/25 bg-zinc-900/90 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
    pixPanelTitle: 'text-center text-[11px] font-black uppercase tracking-wider text-cyan-200/90',
    pixDetailBox: 'space-y-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-3 text-sm',
    pixCopyBtn: 'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all bg-cyan-500 text-zinc-950 hover:bg-cyan-400',
    pixCopyBtnDone: 'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all bg-emerald-600 text-white',
    payDinheiroExpand: 'space-y-3 border-t border-white/10 bg-zinc-950 px-4 pb-4 pt-3',
    trocoToggleOn: 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-zinc-950',
    trocoToggleOff: 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-zinc-800 text-zinc-300',
    trocoInput:
      'w-full rounded-xl border border-white/10 bg-zinc-900 py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-cyan-400 transition-all',
    cupomBox: 'rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]',
    cupomTitle: 'flex items-center gap-2 text-sm font-black text-white',
    cupomInput:
      'flex-1 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm font-mono uppercase text-white focus:outline-none focus:border-cyan-400',
    cupomApply:
      'whitespace-nowrap rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-500',
    obsBox: 'rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]',
    footerBar: 'shrink-0 border-t border-white/12 bg-zinc-950/98 px-4 py-3 sm:px-5',
    footerBack:
      'inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/18 bg-white/5 px-4 py-3.5 text-sm font-bold text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-50',
    footerPrimary:
      'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-cyan-500 py-3.5 text-sm font-black text-zinc-950 shadow-[0_12px_36px_rgba(34,211,238,0.28)] transition-all hover:bg-cyan-400 active:scale-[0.98] disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none',
    footerPrimaryDisabled: 'disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none',
    resumoCard: 'rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-200',
    clienteCard: 'flex items-center gap-3 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3',
    cartaoRow: 'flex w-full items-center justify-between rounded-2xl border p-4 transition-all border-white/10 bg-zinc-900 hover:border-white/20',
    cartaoRowOn: 'flex w-full items-center justify-between rounded-2xl border p-4 transition-all border-cyan-400 bg-cyan-500/10',
  },
  modalOpcoes: {
    sheet:
      'relative flex w-full max-w-xl min-h-0 flex-col overflow-hidden rounded-t-[32px] border border-white/16 bg-zinc-950 text-zinc-100 shadow-[0_32px_90px_rgba(0,0,0,0.58)] ring-1 ring-cyan-500/10 sm:rounded-[32px]',
    headerBg: 'shrink-0 border-b border-white/14 bg-zinc-950',
    closeBtn:
      'absolute right-3 top-3 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-white/18 bg-black/60 p-2 text-zinc-100 shadow-lg backdrop-blur transition-colors hover:border-white/25 hover:bg-black/75 hover:text-white sm:right-4 sm:top-4',
    title: 'text-2xl font-black leading-tight tracking-tight text-white drop-shadow-sm',
    desc: 'mt-2 text-sm leading-relaxed text-zinc-100/95',
    pricePanel:
      'rounded-[22px] border px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.25)] border-white/18 bg-[linear-gradient(180deg,rgba(48,48,54,0.98),rgba(22,22,26,1))]',
    pricePanelPromo:
      'rounded-[22px] border px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.25)] border-emerald-400/35 bg-[linear-gradient(145deg,rgba(6,95,70,0.28),rgba(20,24,22,0.99))]',
    scroll: 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950 py-4',
    section: 'mx-4 mb-4 overflow-hidden rounded-[24px] border border-white/16 bg-zinc-900/92 shadow-[0_12px_36px_rgba(0,0,0,0.22)]',
    sectionHeader: 'border-b border-white/14 bg-zinc-900/98 p-4',
    row: 'flex cursor-pointer items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.06]',
    rowSelected: 'flex cursor-pointer items-center gap-4 px-4 py-4 transition-colors bg-cyan-500/[0.14] ring-1 ring-inset ring-cyan-400/30',
    footer: 'shrink-0 border-t border-white/12 bg-zinc-950 p-4',
    footerBtn:
      'flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#4ade80,#22d3ee)] py-4 text-sm font-black text-zinc-950 shadow-[0_14px_36px_rgba(34,211,238,0.35)] transition-all hover:brightness-110 disabled:opacity-40',
    textPrimary: 'text-white',
    textSecondary: 'text-zinc-200',
    textMuted: 'text-zinc-200',
    qtyBar: 'flex shrink-0 items-center gap-2 rounded-full border border-white/14 bg-zinc-900 p-1 shadow-inner shadow-black/25',
    qtyBtn: 'flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition-colors hover:bg-white/14 hover:text-rose-300',
    qtyBtnPlus:
      'flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400 text-zinc-950 shadow-[0_10px_20px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-300',
    footerHintOk: 'text-cyan-100',
    footerHintWait: 'text-amber-100',
  },
  barraFlutuante:
    'w-full py-4 bg-white text-zinc-950 hover:bg-cyan-100 rounded-2xl font-black shadow-[0_24px_60px_rgba(0,0,0,0.45)] flex items-center justify-between px-5 active:scale-[0.98] transition-all border border-cyan-400/35 ring-1 ring-cyan-400/25',
  barraFlutuanteIconWrap:
    'flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]',
  barraFlutuanteIcon: 'text-cyan-200',
  barraFlutuanteBadge: 'bg-zinc-950/[0.08] px-2.5 py-1 rounded-xl text-sm font-black text-zinc-900',
  barraFlutuanteTotal: 'tabular-nums font-black text-cyan-800',
  resumoLinhas: {
    line: 'flex justify-between text-sm text-zinc-200',
    lineStrong: 'font-semibold text-zinc-100',
    accent: 'flex justify-between text-sm text-cyan-300',
    accentBold: 'font-bold',
    amber: 'flex justify-between text-sm text-amber-300',
    amberMuted: 'text-[11px] text-amber-300',
    aux: 'text-xs font-medium leading-relaxed text-zinc-50',
    totalRow: 'flex justify-between border-t border-white/15 pt-3 font-black',
    totalLabel: 'text-zinc-100',
    totalValue:
      'text-xl tabular-nums text-cyan-200 drop-shadow-[0_0_20px_rgba(34,211,238,0.2)]',
  },
  lojaInfo: {
    card: 'flex items-start gap-3 rounded-2xl border border-white/14 bg-zinc-900/95 px-4 py-3 shadow-[0_14px_32px_rgba(0,0,0,0.22)]',
    iconWrap:
      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-zinc-100 shadow-inner shadow-black/25',
    label: 'text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-200',
    value: 'mt-1 text-sm font-semibold text-zinc-50',
  },
};

const lightRed: DeliveryCardapioTheme = {
  ...darkPremium,
  mode: 'light_red',
  pageLoading: {
    wrap: 'min-h-screen bg-[#f6f6f4] flex items-center justify-center',
    spin: 'w-10 h-10 border-2 border-zinc-200 border-t-red-600 rounded-full animate-spin',
    text: 'text-sm text-zinc-700',
  },
  pageEmpty: 'min-h-screen bg-[#f6f6f4] flex items-center justify-center text-zinc-400',
  shell: {
    root: 'relative min-h-screen bg-[#f6f6f4] text-zinc-900',
    inner: 'relative z-10 min-h-screen',
  },
  header: {
    bar: 'sticky top-0 z-40 border-b border-red-800/35 bg-red-600 pt-[env(safe-area-inset-top)] shadow-[0_10px_28px_rgba(185,28,28,0.38)]',
    navBtn:
      'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 py-2.5 text-[15px] font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white',
    navBtnActive:
      'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 py-2.5 text-[15px] font-semibold text-red-700 transition-colors bg-white shadow-sm ring-1 ring-white/80 hover:bg-white hover:text-red-800',
    cartFab:
      'absolute right-0 top-1/2 flex min-h-[48px] min-w-[48px] shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-white p-3 text-red-600 shadow-[0_6px_22px_rgba(0,0,0,0.2)] ring-2 ring-white/90 transition-all hover:bg-red-50 hover:shadow-[0_8px_26px_rgba(0,0,0,0.22)] active:scale-95',
    cartFabIcon: 'text-red-600 drop-shadow-sm',
  },
  hero: {
    gridBg: 'grid w-full grid-cols-2 gap-0.5 bg-zinc-100 lg:grid-cols-4',
    cellBg: 'relative aspect-[4/3] w-full overflow-hidden bg-zinc-100',
    fallbackLetter: 'flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-white',
  },
  lojaBlock: 'bg-white px-5 pb-5 pt-8 sm:px-6 sm:pt-10 border-t border-zinc-100',
  statusPillOpen: 'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 border border-emerald-200 bg-emerald-50 text-emerald-800',
  statusPillClosed: 'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 border border-zinc-200 bg-zinc-50 text-zinc-700',
  menuDropdown:
    'absolute left-0 top-[calc(100%+12px)] z-20 w-[280px] rounded-[24px] border border-white/12 bg-zinc-950 p-3 text-zinc-100 shadow-[0_24px_70px_rgba(0,0,0,0.38)] ring-1 ring-red-950/20',
  menuItem:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10 hover:text-white active:bg-white/[0.12]',
  menuItemActive:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold bg-[#f4f4f5] text-zinc-950 shadow-sm ring-1 ring-red-200/90 transition-colors hover:bg-[#ececee]',
  menuCategoryActive:
    'flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-semibold bg-red-500 text-white shadow-sm ring-1 ring-red-400/50 transition-colors hover:bg-red-600 hover:text-white',
  menuCategoryCountActive: 'text-xs font-black tabular-nums text-white/80',
  menuCategoryCountIdle: 'text-xs font-bold tabular-nums text-zinc-400',
  searchToggle:
    'inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-50',
  searchInput:
    'w-full rounded-2xl border border-zinc-200 bg-white py-4 pl-12 pr-10 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/15',
  vitrine: {
    ...darkPremium.vitrine,
    showcaseCard:
      'group flex h-[min(348px,52vh)] min-h-0 w-[min(calc(100vw-2rem),320px)] max-w-full shrink-0 flex-col overflow-hidden rounded-[30px] border border-zinc-200/90 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_22px_48px_rgba(220,38,38,0.12)] sm:h-[348px] sm:min-w-[280px] sm:max-w-[320px]',
    compactCard:
      'group flex min-h-[184px] w-[min(calc(100vw-2rem),320px)] max-w-full shrink-0 items-stretch gap-0 overflow-hidden rounded-[28px] border border-zinc-200/90 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.03] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[0_18px_40px_rgba(220,38,38,0.1)] sm:min-w-[290px]',
    compactOfferBg: 'border-rose-200 bg-gradient-to-br from-white via-white to-rose-50/80',
    imageBg: 'relative h-44 cursor-pointer overflow-hidden bg-zinc-100',
    compactThumb: 'relative min-h-[184px] w-[122px] shrink-0 cursor-pointer overflow-hidden bg-zinc-100 self-stretch',
    noPhoto: 'flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-100',
    title: 'line-clamp-2 min-h-[2.5rem] break-words text-lg font-black leading-tight tracking-tight text-zinc-900',
    desc: 'line-clamp-1 text-sm leading-relaxed text-zinc-600',
    hint: 'mt-1.5 line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500',
    priceFrom: 'text-[10px] font-semibold uppercase tracking-wide text-zinc-500',
    priceMain: 'mt-0.5 text-[30px] font-black tabular-nums leading-none text-red-700',
    priceMainPromo: 'mt-0.5 text-[30px] font-black tabular-nums leading-none text-emerald-600',
    btnAdd:
      'flex shrink-0 min-h-[48px] items-center gap-2 rounded-2xl border border-red-700/20 bg-red-600 px-4 py-2 text-sm font-black text-white shadow-[0_10px_28px_rgba(220,38,38,0.28)] transition-all duration-300 ease-out hover:bg-red-700 hover:shadow-[0_14px_34px_rgba(220,38,38,0.22)] disabled:border-transparent disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none',
    qtyBadge: 'absolute bottom-3 left-3 min-w-[34px] rounded-full bg-red-600 px-2.5 py-1 text-center text-xs font-black text-white shadow-md',
    favBtn: 'shrink-0 self-start rounded-full border border-zinc-200 bg-white p-2 transition-all hover:border-zinc-300 hover:bg-zinc-50',
    favIcon: 'text-zinc-400',
    badgeCyan: 'border-red-200 bg-red-50 text-red-800',
  },
  sacola: {
    overlay: 'absolute inset-0 bg-black/50 backdrop-blur-sm',
    panel:
      'relative flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-stone-700/70 bg-[#231f1d] pb-[env(safe-area-inset-bottom)] text-stone-100 shadow-[0_32px_88px_rgba(0,0,0,0.45)] ring-1 ring-black/30 sm:rounded-[28px] sm:pb-0',
    headerRow: 'flex shrink-0 items-start justify-between gap-3 border-b border-stone-600/70 bg-[#231f1d] px-4 py-4 sm:px-5',
    title: 'text-lg font-black tracking-tight text-white',
    subtitle: 'mt-0.5 text-xs text-stone-400',
    closeBtn:
      'shrink-0 rounded-2xl border border-stone-600 bg-stone-800/90 p-2.5 text-stone-200 shadow-sm transition-colors hover:border-stone-500 hover:bg-stone-700 hover:text-white',
    footer: 'shrink-0 border-t border-stone-600/70 bg-[#1c1917] px-4 py-4 sm:px-5',
    primaryBtn:
      'w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-stone-700 text-white disabled:text-stone-500 rounded-2xl font-black transition-all active:scale-[0.98]',
    secondaryBtn:
      'mt-2 w-full py-3 rounded-2xl border border-stone-600 bg-stone-900/40 text-sm font-bold text-stone-200 hover:bg-stone-800/80 hover:border-stone-500',
    resumoBox:
      'rounded-[24px] border border-stone-500/45 bg-[#faf6f0] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] space-y-3 ring-1 ring-stone-400/20',
    resumoLabel: 'text-[11px] font-bold uppercase tracking-[0.18em] text-red-900/75',
    resumoBadge: 'rounded-full bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-sm',
    suggestAddBtn: 'px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors',
  },
  checkout: {
    ...darkPremium.checkout,
    overlay: 'absolute inset-0 bg-black/50 backdrop-blur-sm',
    panel:
      'relative flex max-h-[min(94dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] text-zinc-900 shadow-[0_32px_80px_rgba(0,0,0,0.2)] sm:rounded-[28px] sm:pb-0',
    header: 'shrink-0 border-b border-zinc-100 bg-white px-4 pb-3 pt-4 sm:px-5',
    title: 'text-lg font-black tracking-tight text-zinc-900',
    subtitle: 'mt-0.5 text-xs font-medium text-zinc-500',
    closeBtn:
      'shrink-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 text-zinc-700 shadow-sm transition-colors hover:bg-white hover:border-zinc-300',
    stepActive: 'bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,0.35)]',
    stepDone: 'border border-emerald-300 bg-emerald-50 text-emerald-800',
    stepIdle: 'border border-zinc-200 bg-zinc-50 text-zinc-400',
    stepLabelActive: 'text-red-800',
    stepLabelDone: 'text-emerald-800',
    stepLabelIdle: 'text-zinc-400',
    stepLineDone: 'bg-red-300',
    stepLineTodo: 'bg-zinc-200',
    card: 'rounded-3xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm',
    cardTitle: 'mt-1 text-lg font-black text-zinc-900',
    cardMuted: 'text-sm text-zinc-600',
    modeCard: 'rounded-[28px] border p-4 text-left transition-all border-zinc-200 bg-white hover:border-zinc-300',
    modeCardActive:
      'rounded-[28px] border p-4 text-left transition-all border-red-400 bg-red-50 shadow-[0_12px_32px_rgba(220,38,38,0.12)]',
    modeIconActive: 'flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white',
    modeIconIdle: 'flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700',
    modeTitle: 'mt-4 text-base font-black text-zinc-900',
    modeDesc: 'mt-2 text-sm text-zinc-600',
    hintBoxEntrega: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-red-200 bg-red-50 text-red-900',
    hintBoxRetirada: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-zinc-200 bg-zinc-50 text-zinc-700',
    hintBoxLocal: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-emerald-200 bg-emerald-50 text-emerald-900',
    hintBoxDefault: 'mt-4 rounded-2xl border px-4 py-3 text-sm border-amber-200 bg-amber-50 text-amber-900',
    addressBtnOn: 'w-full text-left p-3 rounded-xl border transition-all border-red-400 bg-red-50',
    addressBtnOff: 'w-full text-left p-3 rounded-xl border transition-all border-zinc-200 bg-white hover:border-zinc-300',
    zonaBadgeFree: 'mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-800',
    zonaBadgePaid: 'mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-zinc-200 bg-zinc-50 text-zinc-600',
    inputBase:
      'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15 transition-all',
    pixOptionOuter: 'w-full overflow-hidden rounded-2xl border transition-all border-zinc-200 hover:border-zinc-300',
    pixOptionOuterOn: 'w-full overflow-hidden rounded-2xl border transition-all border-red-500',
    pixOptionInner: 'flex items-center justify-between p-4 bg-zinc-50',
    pixOptionInnerOn: 'flex items-center justify-between p-4 bg-red-50',
    pixIconBoxOn: 'flex h-10 w-10 items-center justify-center rounded-xl bg-red-600',
    pixIconBoxOff: 'flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-200',
    pixTitleOn: 'text-sm font-black text-red-900',
    pixTitleOff: 'text-sm font-black text-zinc-900',
    pixSubOn: 'text-[11px] text-red-700',
    pixSubOff: 'text-[11px] text-zinc-500',
    radioOn: 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all border-red-600 bg-red-600',
    radioOff: 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300',
    pixPanel: 'space-y-3 rounded-2xl border border-red-200 bg-white p-4 shadow-sm',
    pixPanelTitle: 'text-center text-[11px] font-black uppercase tracking-wider text-red-800',
    pixDetailBox: 'space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm',
    pixCopyBtn: 'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all bg-red-600 text-white hover:bg-red-700',
    pixCopyBtnDone: 'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all bg-emerald-600 text-white',
    payDinheiroExpand: 'space-y-3 border-t border-zinc-200 bg-zinc-50 px-4 pb-4 pt-3',
    trocoToggleOn: 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-red-600 text-white',
    trocoToggleOff: 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-zinc-200 text-zinc-600',
    trocoInput:
      'w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm text-zinc-900 focus:outline-none focus:border-red-500 transition-all',
    cupomBox: 'rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm',
    cupomTitle: 'flex items-center gap-2 text-sm font-black text-zinc-900',
    cupomInput:
      'flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono uppercase text-zinc-900 focus:outline-none focus:border-red-500',
    cupomApply:
      'whitespace-nowrap rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:bg-zinc-200 disabled:text-zinc-400',
    obsBox: 'rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm',
    footerBar: 'shrink-0 border-t border-zinc-100 bg-white px-4 py-3 sm:px-5',
    footerBack:
      'inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm font-bold text-zinc-800 transition-colors hover:bg-white disabled:opacity-50',
    footerPrimary:
      'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 py-3.5 text-sm font-black text-white shadow-[0_10px_28px_rgba(220,38,38,0.28)] transition-all hover:bg-red-700 active:scale-[0.98] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none',
    resumoCard: 'rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700',
    clienteCard: 'flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 px-4 py-3',
    cartaoRow: 'flex w-full items-center justify-between rounded-2xl border p-4 transition-all border-zinc-200 bg-zinc-50 hover:border-zinc-300',
    cartaoRowOn: 'flex w-full items-center justify-between rounded-2xl border p-4 transition-all border-red-500 bg-red-50',
  },
  modalOpcoes: {
    ...darkPremium.modalOpcoes,
    rowSelected:
      'flex cursor-pointer items-center gap-4 px-4 py-4 transition-colors bg-red-500/[0.16] ring-1 ring-inset ring-red-400/40',
    footerBtn:
      'flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-4 text-sm font-black text-white shadow-[0_14px_36px_rgba(220,38,38,0.35)] transition-all hover:bg-red-500 disabled:opacity-40',
    qtyBtnPlus:
      'flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_10px_22px_rgba(239,68,68,0.35)] transition-colors hover:bg-red-400',
    footerHintOk: 'text-red-200',
    footerHintWait: 'text-amber-200',
  },
  barraFlutuante:
    'w-full py-4 bg-red-600 text-white hover:bg-red-700 rounded-2xl font-black shadow-[0_20px_50px_rgba(220,38,38,0.35)] flex items-center justify-between px-5 active:scale-[0.98] transition-all border border-red-700/20',
  barraFlutuanteIconWrap:
    'flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner',
  barraFlutuanteIcon: 'text-white',
  barraFlutuanteBadge: 'bg-white/20 px-2.5 py-1 rounded-xl text-sm font-black text-white',
  barraFlutuanteTotal: 'tabular-nums font-black text-white',
  resumoLinhas: {
    line: 'flex justify-between text-sm text-stone-700',
    lineStrong: 'font-semibold text-stone-900 tabular-nums',
    accent: 'flex justify-between text-sm text-red-800',
    accentBold: 'font-bold tabular-nums',
    amber: 'flex justify-between text-sm text-amber-800',
    amberMuted: 'text-[11px] text-amber-800',
    aux: 'text-xs font-medium leading-relaxed text-stone-600',
    totalRow:
      'mt-3 flex justify-between items-center gap-3 rounded-[14px] border border-red-300/65 bg-gradient-to-br from-red-50 via-[#fff8f6] to-[#faf0ed] px-3.5 py-3.5 font-black shadow-[0_2px_10px_rgba(185,28,28,0.1)]',
    totalLabel: 'text-sm text-stone-900 tracking-tight',
    totalValue: 'text-2xl tabular-nums tracking-tight text-red-800',
  },
  lojaInfo: {
    card: 'flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm',
    iconWrap:
      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 shadow-inner',
    label: 'text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500',
    value: 'mt-1 text-sm font-semibold text-zinc-900',
  },
};

export function buildDeliveryCardapioTheme(mode: DeliveryCardapioThemeMode): DeliveryCardapioTheme {
  return mode === 'light_red' ? lightRed : darkPremium;
}
