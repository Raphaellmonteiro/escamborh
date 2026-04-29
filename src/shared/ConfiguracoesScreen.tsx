import React, { useState, useEffect, useRef } from 'react';
import {
  Settings, Upload, Trash2,
  CreditCard, Smartphone, Banknote, Image, Lock, Store, AlertTriangle,
  Printer, Wifi, CheckCircle2, XCircle, Loader, FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/ui/Modal';

export default function ConfiguracoesScreen({
  token,
  darkMode, setDarkMode,
}: {
  token: string;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
}) {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2600);
  };

  const [perfil, setPerfil] = useState({
    nome_estabelecimento: '',
    usuario_login: '',
    segmento: '',
    taxa_debito: 0,
    taxa_credito: 0,
    taxa_pix: 0,
  });
  const [senhaPadrao, setSenhaPadrao] = useState(false);
  const [loadingPerfil, setLoadingPerfil] = useState(true);

  useEffect(() => {
    fetch('/api/settings/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setPerfil({
          nome_estabelecimento: d.nome_estabelecimento || '',
          usuario_login:         d.usuario_login || '',
          segmento:             d.segmento             || '',
          taxa_debito:          d.taxa_debito          || 0,
          taxa_credito:         d.taxa_credito         || 0,
          taxa_pix:             d.taxa_pix             || 0,
        });
        setSenhaPadrao(!!d.senha_padrao);
      })
      .catch(() => {})
      .finally(() => setLoadingPerfil(false));
  }, [token]);

  // ── logo
  const [logoUrl, setLogoUrl]         = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings/logo', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setLogoUrl(d.logo_url || null))
      .catch(() => {});
  }, [token]);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('Somente imagens são aceitas', false); return; }
    setLogoLoading(true);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const r = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json();
      if (d.success) { setLogoUrl(d.logo_url); showToast('Logo atualizada'); }
      else showToast(d.message || 'Erro ao enviar logo', false);
    } catch { showToast('Erro de conexão', false); }
    finally { setLogoLoading(false); }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Remover a logo?')) return;
    setLogoLoading(true);
    try {
      await fetch('/api/settings/logo', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setLogoUrl(null); showToast('Logo removida');
    } catch { showToast('Erro ao remover logo', false); }
    finally { setLogoLoading(false); }
  };

  // ── taxas
  const [taxas, setTaxas]             = useState({ debito: '', credito: '', pix: '' });
  const [savingTaxas, setSavingTaxas] = useState(false);

  useEffect(() => {
    if (!loadingPerfil) {
      setTaxas({
        debito:  String(perfil.taxa_debito  || ''),
        credito: String(perfil.taxa_credito || ''),
        pix:     String(perfil.taxa_pix     || ''),
      });
    }
  }, [loadingPerfil]);

  const handleSaveTaxas = async () => {
    setSavingTaxas(true);
    try {
      const r = await fetch('/api/settings/taxas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taxa_debito:  parseFloat(taxas.debito  || '0'),
          taxa_credito: parseFloat(taxas.credito || '0'),
          taxa_pix:     parseFloat(taxas.pix     || '0'),
        }),
      });
      const d = await r.json();
      if (d.success) {
        showToast('Taxas salvas');
        // Persiste no localStorage para o App.tsx ler imediatamente
        localStorage.setItem('taxas_pagamento', JSON.stringify({
          debito:  parseFloat(taxas.debito  || '0'),
          credito: parseFloat(taxas.credito || '0'),
          pix:     parseFloat(taxas.pix     || '0'),
        }));
      } else showToast('Erro ao salvar taxas', false);
    } catch { showToast('Erro de conexão', false); }
    finally { setSavingTaxas(false); }
  };

  const [editando, setEditando]               = useState(false);
  const [savingPerfil, setSavingPerfil]       = useState(false);
  const [formPerfil, setFormPerfil]           = useState({
    nome: '',
    usuarioLogin: '',
    senhaNova: '',
    senhaCaixaNova: '',
    senhaAtualLogin: '',
    novaSenhaLogin: '',
    confirmarNovaSenhaLogin: '',
  });

  // ── Impressora Térmica ──────────────────────────────────────────────────────
  const [printerCfg, setPrinterCfg] = useState({
    tipo: 'rede',
    ip: '',
    porta: '9100',
    largura_papel: '48',
  });
  const [savingPrinter, setSavingPrinter]   = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [printerStatus, setPrinterStatus]   = useState<'idle' | 'ok' | 'erro'>('idle');
  const [printerErro, setPrinterErro]       = useState('');

  useEffect(() => {
    fetch('/api/settings/printer', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.config) {
          setPrinterCfg({
            tipo:          d.config.tipo          || 'rede',
            ip:            d.config.ip            || '',
            porta:         String(d.config.porta  || 9100),
            largura_papel: String(d.config.largura_papel || 48),
          });
        }
      })
      .catch(() => {});
  }, [token]);

  const handleSavePrinter = async () => {
    setSavingPrinter(true);
    try {
      const r = await fetch('/api/settings/printer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tipo:          printerCfg.tipo,
          ip:            printerCfg.ip,
          porta:         parseInt(printerCfg.porta)         || 9100,
          largura_papel: parseInt(printerCfg.largura_papel) || 48,
        }),
      });
      const d = await r.json();
      if (d.success) showToast('Configuração da impressora salva');
      else showToast(d.message || 'Erro ao salvar', false);
    } catch { showToast('Erro de conexão', false); }
    finally { setSavingPrinter(false); }
  };

  const handleTestPrinter = async () => {
    setTestingPrinter(true); setPrinterStatus('idle'); setPrinterErro('');
    try {
      const r = await fetch('/api/print/teste', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) { setPrinterStatus('ok'); showToast('Impressão de teste enviada!'); }
      else { setPrinterStatus('erro'); setPrinterErro(d.message || 'Erro desconhecido'); }
    } catch (e: any) { setPrinterStatus('erro'); setPrinterErro('Erro de conexão'); }
    finally { setTestingPrinter(false); }
  };

  // Abre formulário com valores atuais
  const abrirEdicao = () => {
    setFormPerfil({
      nome: perfil.nome_estabelecimento,
      usuarioLogin: perfil.usuario_login || '',
      senhaNova: '',
      senhaCaixaNova: '',
      senhaAtualLogin: '',
      novaSenhaLogin: '',
      confirmarNovaSenhaLogin: '',
    });
    setEditando(true);
  };

  const handleSavePerfil = async () => {
    if (!formPerfil.nome.trim()) { showToast('Nome não pode ser vazio', false); return; }
    const wantsLoginChange = formPerfil.usuarioLogin.trim().toLowerCase() !== (perfil.usuario_login || '').trim().toLowerCase();
    const wantsPasswordChange = !!formPerfil.novaSenhaLogin.trim() || !!formPerfil.confirmarNovaSenhaLogin.trim();
    const wantsCredentialChange = wantsLoginChange || wantsPasswordChange;
    if (wantsCredentialChange) {
      if (!formPerfil.senhaAtualLogin.trim()) {
        showToast('Informe a senha atual para alterar credenciais', false);
        return;
      }
      if (wantsPasswordChange) {
        if (formPerfil.novaSenhaLogin.length < 6) {
          showToast('Nova senha de login deve ter no mínimo 6 caracteres', false);
          return;
        }
        if (formPerfil.novaSenhaLogin !== formPerfil.confirmarNovaSenhaLogin) {
          showToast('Confirmação da nova senha não confere', false);
          return;
        }
      }
    }
    setSavingPerfil(true);
    try {
      const body: any = { nome_estabelecimento: formPerfil.nome.trim() };
      if (formPerfil.senhaNova.trim())      body.senha_admin = formPerfil.senhaNova.trim();
      if (formPerfil.senhaCaixaNova.trim()) body.senha_caixa = formPerfil.senhaCaixaNova.trim();
      let perfilOk = true;
      if (body.nome_estabelecimento || body.senha_admin || body.senha_caixa) {
        const r = await fetch('/api/settings/perfil', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        perfilOk = !!d.success;
        if (!perfilOk) {
          showToast(d.message || 'Erro ao salvar', false);
        }
      }

      let credenciaisOk = true;
      if (perfilOk && wantsCredentialChange) {
        const credentialsRes = await fetch('/api/settings/perfil/credenciais', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            senha_atual: formPerfil.senhaAtualLogin,
            novo_usuario: wantsLoginChange ? formPerfil.usuarioLogin.trim().toLowerCase() : '',
            nova_senha: formPerfil.novaSenhaLogin,
            confirmar_nova_senha: formPerfil.confirmarNovaSenhaLogin,
          }),
        });
        const credentialsData = await credentialsRes.json().catch(() => ({} as any));
        credenciaisOk = credentialsRes.ok && !!credentialsData.success;
        if (!credenciaisOk) {
          showToast(credentialsData.message || 'Erro ao atualizar credenciais', false);
        } else {
          showToast('Credenciais atualizadas. Faça login novamente.', true);
          localStorage.removeItem('token');
          localStorage.removeItem('user_nome');
          localStorage.removeItem('user_cargo');
          localStorage.removeItem('user_permissoes');
          window.location.href = '/login';
          return;
        }
      }

      if (perfilOk && credenciaisOk) {
        setPerfil(prev => ({
          ...prev,
          nome_estabelecimento: formPerfil.nome.trim(),
          usuario_login: wantsLoginChange ? formPerfil.usuarioLogin.trim().toLowerCase() : prev.usuario_login,
        }));
        // Se trocou qualquer senha, re-verifica o flag senha_padrao no servidor
        if (formPerfil.senhaNova.trim() || formPerfil.senhaCaixaNova.trim()) {
          fetch('/api/settings/profile', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(d => setSenhaPadrao(!!d.senha_padrao)).catch(() => {});
        }
        showToast('✓ Dados salvos');
        setEditando(false);
      }
    } catch { showToast('Erro de conexão', false); }
    finally { setSavingPerfil(false); }
  };

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-all duration-300 shrink-0 ${on ? 'bg-zinc-900' : 'bg-zinc-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-fp-card shadow transition-transform duration-300 ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  const Row = ({ icon, label, sub, children }: { icon: React.ReactNode; label: string; sub?: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-8 h-8 bg-fp-secondary rounded-xl flex items-center justify-center text-fptext-muted shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-fptext-primary">{label}</p>
        {sub && <p className="text-xs text-fptext-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );

  const legalDocsCard = (
    <div className="rounded-2xl border border-fp-border bg-fp-card overflow-hidden">
      <div className="px-4 py-3 border-b border-fp-border bg-fp-secondary/30">
        <p className="text-xs font-bold uppercase tracking-wider text-fptext-muted">Legal</p>
        <p className="text-sm font-bold text-fptext-primary mt-0.5">Privacidade e termos</p>
      </div>
      <Row
        icon={<FileText size={16} />}
        label="Política de Privacidade"
        sub="Texto público e informativo"
      >
        <a
          href="/privacidade"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-cyan-700 hover:text-cyan-900 shrink-0"
        >
          Abrir →
        </a>
      </Row>
      <div className="h-px bg-fp-border" />
      <Row
        icon={<FileText size={16} />}
        label="Termos de Uso"
        sub="Condições de uso da plataforma"
      >
        <a
          href="/termos"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-cyan-700 hover:text-cyan-900 shrink-0"
        >
          Abrir →
        </a>
      </Row>
    </div>
  );

  if (loadingPerfil) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-fp-border border-t-fptext-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto bg-fp-app">
      <div className="max-w-xl mx-auto p-6 space-y-6">

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className={`fixed top-5 right-5 z-50 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl ${toast.ok ? 'bg-zinc-900' : 'bg-red-600'}`}>
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2.5">
          <Settings size={20} className="text-fptext-muted" />
          <h1 className="text-xl font-black text-fptext-primary">Configurações</h1>
        </div>

        {legalDocsCard}

        {/* ── Aviso: senha padrão ─────────────────────────────────────────── */}
        <AnimatePresence>
          {senhaPadrao && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle size={16} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-amber-900">Senha padrão detectada</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                    Uma ou mais sub-senhas (<strong>Admin</strong> ou <strong>Caixa</strong>) ainda estão com o valor padrão <code className="bg-amber-100 px-1 rounded font-mono">123321</code>.
                    Altere agora na seção <strong>Estabelecimento → Editar</strong> para proteger o acesso ao sistema.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ESTABELECIMENTO ─────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black text-fptext-muted uppercase tracking-widest mb-2 px-1">Estabelecimento</p>
          <div className="bg-fp-card rounded-2xl border border-fp-border shadow-sm divide-y divide-fp-border-soft">

            <Row icon={<Store size={16} />} label="Nome" sub="Exibido nos recibos e no sistema">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fptext-secondary truncate max-w-[160px]">
                  {perfil.nome_estabelecimento || '—'}
                </span>
                <button onClick={abrirEdicao}
                  className="text-[10px] font-bold px-2 py-1 bg-fp-secondary hover:bg-fp-hover rounded-lg text-fptext-muted transition-all">
                  Editar
                </button>
              </div>
            </Row>
            <Row icon={<Lock size={16} />} label="Usuário de login" sub="Usado para acessar o sistema">
              <span className="text-sm font-mono font-bold text-fptext-secondary truncate max-w-[160px]">
                {perfil.usuario_login || '—'}
              </span>
            </Row>

            <Row icon={<span className="text-base">🏪</span>} label="Segmento" sub="Tipo do seu negócio">
              <span className="text-xs font-bold px-2.5 py-1 bg-fp-secondary text-fptext-secondary rounded-lg">
                {perfil.segmento || '—'}
              </span>
            </Row>

            {/* Logo */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-fp-secondary rounded-xl flex items-center justify-center text-fptext-muted shrink-0">
                  <Image size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-fptext-primary">Logo</p>
                  <p className="text-xs text-fptext-muted">Aparece nos recibos impressos</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden ${logoUrl ? 'border-fp-border' : 'border-fp-border bg-fp-app'}`}>
                  {logoUrl
                    ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                    : <Image size={24} className="text-fptext-muted" />}
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  <button onClick={() => fileRef.current?.click()} disabled={logoLoading}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50">
                    <Upload size={13} />
                    {logoLoading ? 'Enviando...' : logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                  </button>
                  {logoUrl && (
                    <button onClick={handleLogoDelete} disabled={logoLoading}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all">
                      <Trash2 size={13} /> Remover
                    </button>
                  )}
                  <p className="text-[10px] text-fptext-muted">PNG, JPG ou SVG · máx 2MB</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── TAXAS ───────────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black text-fptext-muted uppercase tracking-widest mb-2 px-1">Taxas de Pagamento (%)</p>
          <div className="bg-fp-card rounded-2xl border border-fp-border shadow-sm p-4 space-y-4">
            <p className="text-xs text-fptext-muted">Configure as taxas cobradas pelas operadoras. Usadas no cálculo de repasse.</p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { key: 'debito'  as const, label: 'Débito',  icon: <CreditCard size={13} /> },
                { key: 'credito' as const, label: 'Crédito', icon: <CreditCard size={13} /> },
                { key: 'pix'     as const, label: 'Pix',     icon: <Smartphone size={13} /> },
              ]).map(({ key, label, icon }) => (
                <div key={key}>
                  <label className="flex items-center gap-1 text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-1.5">
                    {icon} {label}
                  </label>
                  <div className="relative">
                    <input type="number" min="0" max="100" step="0.1"
                      value={taxas[key]}
                      onChange={e => setTaxas(p => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                      className="w-full pl-3 pr-6 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm font-bold text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)] text-center" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-fptext-muted font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleSaveTaxas} disabled={savingTaxas}
              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 active:scale-[.98]">
              {savingTaxas ? 'Salvando...' : 'Salvar Taxas'}
            </button>
          </div>
        </div>

        {/* ── SENHAS ──────────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black text-fptext-muted uppercase tracking-widest mb-2 px-1">Senhas do Sistema</p>
          <div className="bg-fp-card rounded-2xl border border-fp-border shadow-sm divide-y divide-fp-border-soft">
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 bg-fp-secondary rounded-xl flex items-center justify-center text-fptext-muted shrink-0"><Lock size={16} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-fptext-primary">Senha Admin</p>
                <p className="text-xs text-fptext-muted">Protege configurações e RH</p>
              </div>
              <span className="text-sm font-mono font-bold text-fptext-muted tracking-widest">••••••</span>
            </div>

            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 bg-fp-secondary rounded-xl flex items-center justify-center text-fptext-muted shrink-0"><Banknote size={16} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-fptext-primary">Senha do Caixa</p>
                <p className="text-xs text-fptext-muted">Solicitada ao abrir/fechar o caixa</p>
              </div>
              <span className="text-sm font-mono font-bold text-fptext-muted tracking-widest">••••••</span>
            </div>

            <div className="px-4 py-2.5 bg-fp-secondary border-t border-fp-border-soft">
              <button onClick={abrirEdicao}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors">
                ✏️ Alterar nome ou senhas
              </button>
            </div>
          </div>
        </div>

        {/* ── IMPRESSORA TÉRMICA ─────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black text-fptext-muted uppercase tracking-widest mb-2 px-1">Impressora Térmica</p>
          <div className="bg-fp-card rounded-2xl border border-fp-border shadow-sm p-4 space-y-4">
            <p className="text-xs text-fptext-muted">
              Configure a impressora para emissão de recibos e comandas. Modo <strong>Rede</strong> funciona com qualquer impressora conectada via Wi-Fi ou cabo de rede.
            </p>

            {/* Tipo de conexão */}
            <div>
              <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-2 block">Tipo de Conexão</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'rede',   label: 'Rede (Wi-Fi)',  sub: 'Mais universal' },
                  { key: 'qztray', label: 'QZ Tray',       sub: 'USB / Serial'   },
                  { key: 'epson',  label: 'Epson ePOS',    sub: 'Wi-Fi nativo'   },
                ] as const).map(op => (
                  <button key={op.key} onClick={() => setPrinterCfg(p => ({ ...p, tipo: op.key }))}
                    className={`flex flex-col items-center gap-0.5 py-3 px-2 rounded-xl border-2 text-center transition-all ${printerCfg.tipo === op.key ? 'border-fptext-primary bg-fptext-primary text-fp-card' : 'border-fp-border bg-fp-secondary text-fptext-secondary hover:border-fp-accent'}`}>
                    <span className="text-xs font-black">{op.label}</span>
                    <span className={`text-[10px] ${printerCfg.tipo === op.key ? 'text-fp-card opacity-80' : 'text-fptext-muted'}`}>{op.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modo Rede */}
            {printerCfg.tipo === 'rede' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-1.5 block">IP da Impressora</label>
                  <input value={printerCfg.ip} onChange={e => setPrinterCfg(p => ({ ...p, ip: e.target.value }))}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm font-mono text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-1.5 block">Porta</label>
                  <input value={printerCfg.porta} onChange={e => setPrinterCfg(p => ({ ...p, porta: e.target.value }))}
                    placeholder="9100"
                    className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm font-mono text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
                </div>
              </div>
            )}

            {/* Modo QZ Tray */}
            {printerCfg.tipo === 'qztray' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">Instalação necessária</p>
                <p>Baixe e instale o <strong>QZ Tray</strong> no PC onde a impressora está conectada. Ele cria uma ponte local entre o browser e a impressora USB/serial.</p>
                <a href="https://qz.io/download/" target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1 font-bold text-amber-700 hover:text-amber-900 underline">
                  Baixar QZ Tray →
                </a>
                <p className="text-amber-600 text-[10px] mt-1">A impressão via QZ Tray é feita diretamente no browser — o servidor não precisa ter acesso à impressora.</p>
              </div>
            )}

            {/* Modo Epson ePOS */}
            {printerCfg.tipo === 'epson' && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                  <p className="font-bold mb-1">Compatível com Epson TM série (TM-T20, TM-T88, etc.)</p>
                  <p>A impressora precisa estar na mesma rede e com ePOS-Print ativado no menu de configuração.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-1.5 block">IP da Impressora</label>
                    <input value={printerCfg.ip} onChange={e => setPrinterCfg(p => ({ ...p, ip: e.target.value }))}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm font-mono text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-1.5 block">Porta</label>
                    <input value={printerCfg.porta} onChange={e => setPrinterCfg(p => ({ ...p, porta: e.target.value }))}
                      placeholder="80"
                      className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm font-mono text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
                  </div>
                </div>
              </div>
            )}

            {/* Largura do papel */}
            <div>
              <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider mb-2 block">Largura do Papel</label>
              <div className="flex gap-2">
                {(['48', '32'] as const).map(w => (
                  <button key={w} onClick={() => setPrinterCfg(p => ({ ...p, largura_papel: w }))}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all ${printerCfg.largura_papel === w ? 'border-fptext-primary bg-fptext-primary text-fp-card' : 'border-fp-border bg-fp-secondary text-fptext-secondary hover:border-fp-accent'}`}>
                    {w === '48' ? '80mm (48 cols)' : '58mm (32 cols)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Status do teste */}
            {printerStatus !== 'idle' && (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold ${printerStatus === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {printerStatus === 'ok' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {printerStatus === 'ok' ? 'Impressão enviada com sucesso!' : `Erro: ${printerErro}`}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2">
              <button onClick={handleSavePrinter} disabled={savingPrinter}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                {savingPrinter ? 'Salvando...' : 'Salvar Configuração'}
              </button>
              <button onClick={handleTestPrinter} disabled={testingPrinter || !printerCfg.ip}
                className="flex items-center gap-2 px-4 py-2.5 bg-fp-secondary hover:bg-fp-hover text-fptext-primary rounded-xl text-sm font-bold transition-all disabled:opacity-40">
                {testingPrinter ? <Loader size={14} className="animate-spin" /> : <Printer size={14} />}
                Testar
              </button>
            </div>
          </div>
        </div>

        {/* ── APARÊNCIA ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black text-fptext-muted uppercase tracking-widest mb-2 px-1">Aparência</p>
          <div className="bg-fp-card rounded-2xl border border-fp-border shadow-sm">
            <Row icon={<span className="text-base">{darkMode ? '🌙' : '☀️'}</span>} label="Tema Escuro" sub="Interface escura em todo o sistema">
              <Toggle on={darkMode} onClick={() => {
                setDarkMode(!darkMode);
                showToast(!darkMode ? '🌙 Tema escuro ativado' : '☀️ Tema claro ativado');
              }} />
            </Row>
          </div>
        </div>

      </div>

      <Modal open={editando} onClose={() => setEditando(false)} title="Editar Dados" className="sm:max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Nome do Estabelecimento</label>
            <input value={formPerfil.nome} onChange={e => setFormPerfil(p => ({ ...p, nome: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Usuário de Login</label>
            <p className="text-[10px] text-fptext-muted mb-1">Letras minúsculas, números, ponto, hífen e underscore</p>
            <input value={formPerfil.usuarioLogin} onChange={e => setFormPerfil(p => ({ ...p, usuarioLogin: e.target.value }))}
              placeholder="seu.usuario"
              className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
          </div>
          <div className="border-t border-fp-border pt-3 space-y-3">
            <p className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Alterar senha de login</p>
            <div>
              <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Senha Atual</label>
              <input type="password" value={formPerfil.senhaAtualLogin}
                onChange={e => setFormPerfil(p => ({ ...p, senhaAtualLogin: e.target.value }))}
                placeholder="Obrigatória para alterar login/senha"
                className="mt-1 w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Nova senha de login</label>
              <input type="password" value={formPerfil.novaSenhaLogin}
                onChange={e => setFormPerfil(p => ({ ...p, novaSenhaLogin: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="mt-1 w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Confirmar nova senha</label>
              <input type="password" value={formPerfil.confirmarNovaSenhaLogin}
                onChange={e => setFormPerfil(p => ({ ...p, confirmarNovaSenhaLogin: e.target.value }))}
                placeholder="Repita a nova senha"
                className="mt-1 w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Nova Senha Admin</label>
            <p className="text-[10px] text-fptext-muted mb-1">Deixe em branco para não alterar</p>
            <input type="password" value={formPerfil.senhaNova}
              onChange={e => setFormPerfil(p => ({ ...p, senhaNova: e.target.value }))}
              placeholder="Nova senha admin"
              className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-fptext-muted uppercase tracking-wider">Nova Senha do Caixa</label>
            <p className="text-[10px] text-fptext-muted mb-1">Deixe em branco para não alterar</p>
            <input type="password" value={formPerfil.senhaCaixaNova}
              onChange={e => setFormPerfil(p => ({ ...p, senhaCaixaNova: e.target.value }))}
              placeholder="Nova senha do caixa"
              className="w-full px-3 py-2.5 bg-fp-input border border-fp-border rounded-xl text-sm text-fptext-primary focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)]" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={() => setEditando(false)}
            className="flex-1 py-2.5 bg-fp-secondary hover:bg-fp-hover rounded-xl text-sm font-bold text-fptext-primary transition-all">
            Cancelar
          </button>
          <button type="button" onClick={handleSavePerfil} disabled={savingPerfil}
            className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
            {savingPerfil ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}

// ============================================================================
//  TELA KDS — Monitor da Cozinha (pública, sem login)
// ============================================================================