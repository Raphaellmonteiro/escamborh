import React, { useState, useEffect } from 'react';

export default function BookingPage({ slug }: { slug: string }) {
  // ── estado do fluxo ────────────────────────────────────────────────────────
  type Step = 'cpf' | 'cadastro' | 'servico' | 'barbeiro' | 'data' | 'horario' | 'confirmar' | 'sucesso';
  const [step, setStep]             = useState<Step>('cpf');
  const [info, setInfo]             = useState<any>(null);          // { tenant, funcionarios, servicos }
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [erro, setErro]             = useState('');

  // cliente
  const [cpf, setCpf]               = useState('');
  const [cliente, setCliente]       = useState<any | null>(null);
  const [novoNome, setNovoNome]     = useState('');
  const [novoTel, setNovoTel]       = useState('');
  const [novoEmail, setNovoEmail]   = useState('');

  // agendamento
  const [servico, setServico]       = useState<any | null>(null);
  const [barbeiro, setBarbeiro]     = useState<any | null>(null);  // null = qualquer
  const [data, setData]             = useState('');
  const [horario, setHorario]       = useState('');
  const [ocupados, setOcupados]     = useState<string[]>([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agendamentoId, setAgendamentoId] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // Horários disponíveis (08:00–20:00, de 30 em 30 min)
  const todosHorarios = Array.from({ length: 25 }, (_, i) => {
    const h = Math.floor(i / 2) + 8;
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${m}`;
  });

  // ── carregar info da barbearia ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`/public/barber/${slug}`)
      .then(r => r.json())
      .then(d => { setInfo(d); setLoadingInfo(false); })
      .catch(() => { setErro('Barbearia não encontrada.'); setLoadingInfo(false); });
  }, [slug]);

  // ── carregar horários ao mudar data ───────────────────────────────────────
  useEffect(() => {
    if (!data || !info) return;
    setLoadingHorarios(true);
    setHorario('');
    fetch(`/public/barber/${slug}/horarios?data=${data}`)
      .then(r => r.json())
      .then(d => { setOcupados((d.ocupados || []).map((o: any) => o.hora)); setLoadingHorarios(false); })
      .catch(() => setLoadingHorarios(false));
  }, [data, slug, info]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const formatCPF = (v: string) => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');

  const [buscandoCPF, setBuscandoCPF]   = useState(false);

  const buscarCPF = async () => {
    setErro('');
    const raw = cpf.replace(/\D/g,'');
    if (raw.length < 11) { setErro('CPF inválido. Digite todos os 11 dígitos.'); return; }
    setBuscandoCPF(true);
    try {
      const res = await fetch(`/public/barber/${slug}/cliente-cpf?cpf=${raw}`);
      if (!res.ok) { setErro('Erro ao buscar CPF. Tente novamente.'); setBuscandoCPF(false); return; }
      const d = await res.json();
      if (d.found) { setCliente(d.cliente); setStep('servico'); }
      else { setStep('cadastro'); }
    } catch { setErro('Erro de conexão. Verifique sua internet.'); }
    setBuscandoCPF(false);
  };

  const cadastrar = async () => {
    setErro('');
    if (!novoNome.trim()) { setErro('Nome obrigatório.'); return; }
    try {
      const res = await fetch(`/public/barber/${slug}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome, cpf, telefone: novoTel, email: novoEmail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErro(err.error || 'Erro ao cadastrar. Tente novamente.');
        return;
      }
      const d = await res.json();
      if (d.success) {
        // existing: true = CPF já estava no banco (retornou cliente existente)
        const clienteData = d.cliente || { id: d.id, nome: novoNome, cpf };
        setCliente(clienteData);
        setStep('servico');
      } else {
        setErro(d.error || 'Erro ao cadastrar.');
      }
    } catch { setErro('Erro de conexão. Verifique sua internet.'); }
  };

  const confirmar = async () => {
    setSubmitting(true); setErro('');
    const res = await fetch(`/public/barber/${slug}/agendamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id:    cliente?.id || null,
        cliente_nome:  cliente?.nome || novoNome,
        servico_nome:  servico?.name,
        servico_preco: servico?.price,
        funcionario_id: barbeiro?.id || null,
        barbeiro:      barbeiro?.nome || 'Qualquer',
        data, hora: horario,
      }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (d.success) { setAgendamentoId(d.id); setStep('sucesso'); }
    else setErro(d.error || 'Erro ao agendar.');
  };

  if (loadingInfo) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center"><div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-zinc-500">Carregando...</p></div>
    </div>
  );
  if (erro && !info) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50"><p className="text-red-500 font-bold">{erro}</p></div>
  );

  const corMap: Record<string,string> = { zinc:'bg-zinc-500',red:'bg-red-500',orange:'bg-orange-500',yellow:'bg-yellow-400',green:'bg-green-500',blue:'bg-blue-500',purple:'bg-purple-500',pink:'bg-pink-500' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col items-center justify-start py-10 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl text-4xl">✂️</div>
        <h1 className="text-3xl font-black text-white">{info?.tenant?.nome_estabelecimento}</h1>
        {info?.tenant?.cidade && <p className="text-zinc-400 text-sm mt-1">📍 {info.tenant.cidade}</p>}
        <p className="text-zinc-500 text-xs mt-2">Agendamento Online</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Progresso */}
        {step !== 'sucesso' && (
          <div className="flex">
            {(['cpf','servico','barbeiro','data','confirmar'] as Step[]).map((s, i) => (
              <div key={s} className={`flex-1 h-1 ${['cpf','servico','barbeiro','data','horario','confirmar'].indexOf(step) >= i ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
            ))}
          </div>
        )}

        <div className="p-7">
          {/* ── PASSO: CPF ────────────────────────────────────────────── */}
          {step === 'cpf' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Bem-vindo! 👋</h2>
                <p className="text-zinc-500 text-sm mt-1">Digite seu CPF para começar. Se for seu primeiro acesso, faremos seu cadastro.</p>
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">CPF</label>
                <input value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14}
                  className="w-full mt-1.5 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-lg tracking-widest focus:outline-none focus:border-zinc-900 transition-colors" />
              </div>
              {erro && <p className="text-red-500 text-sm">{erro}</p>}
              <button onClick={buscarCPF} disabled={buscandoCPF} className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white rounded-2xl font-black text-lg transition-colors">
                {buscandoCPF ? 'Buscando...' : 'Continuar →'}
              </button>
            </div>
          )}

          {/* ── PASSO: CADASTRO ────────────────────────────────────────── */}
          {step === 'cadastro' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Primeiro acesso ✨</h2>
                <p className="text-zinc-500 text-sm mt-1">Preencha seus dados para criar seu cadastro.</p>
              </div>
              {[['Nome completo*', novoNome, setNovoNome, 'text', 'João Silva'],
                ['Telefone', novoTel, setNovoTel, 'tel', '(11) 99999-9999'],
                ['E-mail', novoEmail, setNovoEmail, 'email', 'joao@email.com']].map(([lbl, val, set, type, ph]: any) => (
                <div key={lbl}>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{lbl}</label>
                  <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    className="w-full mt-1.5 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-zinc-900 transition-colors" />
                </div>
              ))}
              {erro && <p className="text-red-500 text-sm">{erro}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setStep('cpf'); setErro(''); }} className="flex-1 py-3 border-2 border-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-50 transition-colors">← Voltar</button>
                <button onClick={cadastrar} className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-black transition-colors">Cadastrar →</button>
              </div>
            </div>
          )}

          {/* ── PASSO: SERVIÇO ────────────────────────────────────────── */}
          {step === 'servico' && (
            <div className="space-y-4">
              <div>
                <p className="text-zinc-500 text-sm">Olá, <b className="text-zinc-900">{cliente?.nome}</b>!</p>
                <h2 className="text-2xl font-black text-zinc-900 mt-1">Qual serviço? ✂️</h2>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(info?.servicos || []).map((s: any) => (
                  <button key={s.id} onClick={() => { setServico(s); setStep('barbeiro'); }}
                    className="w-full flex items-center justify-between p-4 border-2 border-zinc-100 hover:border-zinc-900 hover:bg-zinc-50 rounded-2xl transition-all text-left">
                    <span className="font-bold text-zinc-900">{s.name}</span>
                    <span className="font-black text-zinc-900">R$ {Number(s.price).toFixed(2)}</span>
                  </button>
                ))}
                {(info?.servicos || []).length === 0 && <p className="text-zinc-400 text-center py-4">Nenhum serviço disponível</p>}
              </div>
            </div>
          )}

          {/* ── PASSO: BARBEIRO ───────────────────────────────────────── */}
          {step === 'barbeiro' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Com quem? 💈</h2>
                <p className="text-zinc-500 text-sm mt-1">Escolha o profissional ou deixe em aberto.</p>
              </div>
              <div className="space-y-2">
                <button onClick={() => { setBarbeiro(null); setStep('data'); }}
                  className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 rounded-2xl transition-all text-left">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-black">?</div>
                  <div><p className="font-bold text-zinc-700">Qualquer disponível</p><p className="text-xs text-zinc-400">Primeiro disponível no horário</p></div>
                </button>
                {(info?.funcionarios || []).map((f: any) => (
                  <button key={f.id} onClick={() => { setBarbeiro(f); setStep('data'); }}
                    className="w-full flex items-center gap-3 p-4 border-2 border-zinc-100 hover:border-zinc-900 hover:bg-zinc-50 rounded-2xl transition-all text-left">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black ${corMap[f.cor] || 'bg-zinc-500'}`}>{f.nome[0]}</div>
                    <div><p className="font-bold text-zinc-900">{f.nome}</p><p className="text-xs text-zinc-400">{f.cargo}</p></div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('servico')} className="w-full py-2.5 border border-zinc-200 text-zinc-500 rounded-xl text-sm hover:bg-zinc-50 transition-colors">← Voltar</button>
            </div>
          )}

          {/* ── PASSO: DATA ───────────────────────────────────────────── */}
          {step === 'data' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Qual dia? 📅</h2>
                <p className="text-zinc-500 text-sm mt-1">Escolha a data do agendamento.</p>
              </div>
              <div>
                <input type="date" value={data} min={today} onChange={e => { setData(e.target.value); setStep('horario'); }}
                  className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-lg focus:outline-none focus:border-zinc-900 transition-colors" />
              </div>
              <button onClick={() => setStep('barbeiro')} className="w-full py-2.5 border border-zinc-200 text-zinc-500 rounded-xl text-sm hover:bg-zinc-50 transition-colors">← Voltar</button>
            </div>
          )}

          {/* ── PASSO: HORÁRIO ─────────────────────────────────────────── */}
          {step === 'horario' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Que horas? ⏰</h2>
                <p className="text-zinc-500 text-sm mt-1">{new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</p>
              </div>
              {loadingHorarios ? (
                <div className="text-center py-8"><div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {todosHorarios.map(h => {
                    const isOcupado = ocupados.includes(h);
                    const isSel    = horario === h;
                    return (
                      <button key={h} disabled={isOcupado} onClick={() => setHorario(h)}
                        className={`py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${isOcupado ? 'border-zinc-100 text-zinc-300 bg-zinc-50 cursor-not-allowed' : isSel ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-700 hover:border-zinc-900 hover:bg-zinc-50'}`}>
                        {h}
                      </button>
                    );
                  })}
                </div>
              )}
              {horario && (
                <button onClick={() => setStep('confirmar')} className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-black transition-colors">Confirmar horário {horario} →</button>
              )}
              <button onClick={() => setStep('data')} className="w-full py-2.5 border border-zinc-200 text-zinc-500 rounded-xl text-sm hover:bg-zinc-50 transition-colors">← Voltar</button>
            </div>
          )}

          {/* ── PASSO: CONFIRMAÇÃO ─────────────────────────────────────── */}
          {step === 'confirmar' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Confirmar ✅</h2>
                <p className="text-zinc-500 text-sm mt-1">Revise os detalhes do seu agendamento.</p>
              </div>
              <div className="bg-zinc-50 rounded-2xl p-5 space-y-3 border border-zinc-200">
                {[
                  ['Cliente',    cliente?.nome],
                  ['Serviço',    servico?.name],
                  ['Valor',      `R$ ${Number(servico?.price).toFixed(2)}`],
                  ['Profissional', barbeiro?.nome || 'Qualquer disponível'],
                  ['Data',       new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})],
                  ['Horário',    horario],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="flex justify-between items-center">
                    <span className="text-sm text-zinc-500">{lbl}</span>
                    <span className="font-black text-zinc-900 text-sm text-right">{val}</span>
                  </div>
                ))}
              </div>
              {erro && <p className="text-red-500 text-sm">{erro}</p>}
              <button onClick={confirmar} disabled={submitting} className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white rounded-2xl font-black text-lg transition-colors">
                {submitting ? 'Agendando...' : '🗓️ Confirmar Agendamento'}
              </button>
              <button onClick={() => setStep('horario')} className="w-full py-2.5 border border-zinc-200 text-zinc-500 rounded-xl text-sm hover:bg-zinc-50 transition-colors">← Voltar</button>
            </div>
          )}

          {/* ── PASSO: SUCESSO ─────────────────────────────────────────── */}
          {step === 'sucesso' && (
            <div className="text-center space-y-5 py-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-4xl">🎉</div>
              <div>
                <h2 className="text-2xl font-black text-zinc-900">Agendado!</h2>
                <p className="text-zinc-500 text-sm mt-2">Seu horário foi reservado com sucesso.</p>
              </div>
              <div className="bg-zinc-50 rounded-2xl p-5 space-y-2 border border-zinc-200 text-left">
                <p className="text-sm"><b>Serviço:</b> {servico?.name}</p>
                <p className="text-sm"><b>Profissional:</b> {barbeiro?.nome || 'Qualquer disponível'}</p>
                <p className="text-sm"><b>Data:</b> {new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</p>
                <p className="text-sm"><b>Horário:</b> {horario}</p>
              </div>
              {info?.tenant?.whatsapp && (
                <a href={`https://wa.me/55${info.tenant.whatsapp.replace(/\D/g,'')}?text=Olá! Acabei de agendar um ${servico?.name} para ${new Date(data+'T12:00:00').toLocaleDateString('pt-BR')} às ${horario}. Meu nome é ${cliente?.nome}.`}
                  target="_blank" rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-bold transition-colors">
                  📱 Confirmar via WhatsApp
                </a>
              )}
              <button onClick={() => { setStep('cpf'); setCpf(''); setServico(null); setBarbeiro(null); setData(''); setHorario(''); setCliente(null); }}
                className="w-full py-3 border-2 border-zinc-200 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-50 transition-colors">
                Fazer outro agendamento
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-zinc-600 text-xs mt-6">Powered by <b className="text-zinc-400">FlowPDV</b></p>
    </div>
  );
}
