import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Fingerprint, Calendar, FileText, UserPlus, X, Pencil,
  Trash2, AlertTriangle, CheckCircle2, DollarSign,
  TrendingUp, Download, ArrowRight, Check, RefreshCw,
  ChevronLeft, ChevronRight, Search, Camera, Upload,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Func {
  id: number; nome: string; cargo: string; salario_base: number;
  horario_entrada: string; horario_saida: string; carga_horaria: number;
  dias_semana: string; tolerancia_minutos: number; dias_trabalho_mes: number;
  data_admissao: string; telefone?: string; cpf?: string; pin?: string;
  foto_url?: string; status: string;
}
interface Evento { id: number; funcionario_id: number; data: string; tipo: string; horas_ausentes: number; observacao?: string; }
interface Adiantamento { id: number; valor: number; motivo: string; data: string; descontado: number; }
interface DiaEspelho { data: string; dia: number; diaSemana: number; isExpediente: boolean; status: string; entrada?: string; saida?: string; atrasoMin: number; eventos: Evento[]; }
interface Espelho { funcionario: Func; dias: DiaEspelho[]; resumo: { diasTrabalhados: number; totalFaltas: number; diasFolga: number; diasAtestado: number; totalAtrasoMin: number; descontoFaltas: number; descontoAtrasos: number; descontoParcial: number; totalDescontos: number; }; }
interface Folha { funcionario: Func; mes: string; salarioBruto: number; totalFaltas: number; descontoFaltas: number; totalAtrasoMin: number; descontoAtrasos: number; horasAusentesParcial: number; descontoParcial: number; inss: number; totalAdiantamentos: number; adiantamentos: Adiantamento[]; totalExtraMin: number; valorExtras: number; totalDescontos: number; salarioLiquido: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => `R$ ${(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtDate = (d: string) => d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_LABEL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const TIPOS_EVENTO = [
  { value: 'falta', label: 'Falta' },
  { value: 'folga', label: 'Folga' },
  { value: 'atestado', label: 'Atestado' },
  { value: 'declaracao_parcial', label: 'Aus. Parcial' },
];
const STATUS_COLOR: Record<string, string> = {
  trabalhado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  falta: 'bg-red-50 text-red-700 border-red-200',
  folga: 'bg-blue-50 text-blue-700 border-blue-200',
  atestado: 'bg-purple-50 text-purple-700 border-purple-200',
  declaracao_parcial: 'bg-amber-50 text-amber-700 border-amber-200',
  sem_expediente: 'bg-zinc-50 text-zinc-400 border-zinc-100',
};
const STATUS_LABEL: Record<string, string> = { trabalhado: 'OK', falta: 'Falta', folga: 'Folga', atestado: 'Ates.', declaracao_parcial: 'Parc.', sem_expediente: '—' };

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function RHScreen({ token }: { token: string }) {
  const [tab, setTab] = useState<'lista'|'ponto'|'espelho'|'folha'>('lista');
  const slug = React.useMemo(() => {
    try { const p = token.split('.')[1]; return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')))?.username || ''; }
    catch { return ''; }
  }, [token]);

  const TABS = [
    { key:'lista',   label:'Funcionários',  icon:<Users size={14}/> },
    { key:'espelho', label:'Espelho',        icon:<Calendar size={14}/> },
    { key:'folha',   label:'Folha de Pgto', icon:<FileText size={14}/> },
  ];

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="h-full overflow-y-auto bg-zinc-50">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">RH / Funcionários</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Controle de ponto, presença e folha de pagamento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-white border border-zinc-200 rounded-xl p-1 gap-0.5">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab===t.key ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {/* Botão Bater Ponto — abre quiosque em nova aba */}
          <a
            href={`/kiosk/ponto/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all active:scale-95 no-underline"
          >
            <Fingerprint size={14} />
            Bater Ponto
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
        {tab==='lista'   && <TabLista   token={token}/>}
        {tab==='espelho' && <TabEspelho token={token}/>}
        {tab==='folha'   && <TabFolha   token={token}/>}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA LISTA
// ═══════════════════════════════════════════════════════════════════════════════
function TabLista({ token }: { token: string }) {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Func|null>(null);
  const [modal, setModal] = useState<null|'novo'|'edit'|'adiant'|'ajuste'|'evento'>(null);
  const [adiantamentos, setAdiantamentos] = useState<Adiantamento[]>([]);
  const [saving, setSaving] = useState(false);
  const hdrs = { Authorization:`Bearer ${token}` };
  const jHdrs = { ...hdrs, 'Content-Type':'application/json' };

  const ABAS_SISTEMA = [
    { key:'pos',            label:'Balcão/Vendas' },
    { key:'orders',         label:'Pedidos' },
    { key:'mesas',          label:'Mesas/Comandas' },
    { key:'products',       label:'Cardápio' },
    { key:'estoque',        label:'Estoque' },
    { key:'nfse',           label:'Nota Fiscal' },
    { key:'dashboard',      label:'Dashboard' },
    { key:'finance',        label:'Financeiro' },
    { key:'funcionarios',   label:'RH' },
    { key:'configuracoes',  label:'Configurações' },
  ];

  const CARGO_PRESETS: Record<string, string[]> = {
    dono:      [], // null = tudo
    gerente:   ['pos','orders','mesas','products','estoque','nfse','dashboard','finance','funcionarios'],
    atendente: ['pos','orders','mesas'],
  };

  const eF = { nome:'', cargo:'', salario_base:'', horario_entrada:'08:00', horario_saida:'17:00', carga_horaria:'8', dias_semana:'1,2,3,4,5', tolerancia_minutos:'10', dias_trabalho_mes:'26', data_admissao:'', telefone:'', cpf:'', pin:'' };
  const eAcesso = { login:'', senha:'', cargo_sistema:'atendente' as 'dono'|'gerente'|'atendente', permissoes: ['pos','orders','mesas'] as string[], criar_acesso: false };
  const [form, setForm] = useState(eF);
  const [formAcesso, setFormAcesso] = useState(eAcesso);
  const [usuariosExistentes, setUsuariosExistentes] = useState<any[]>([]);
  const [fotoFile, setFotoFile] = useState<File|null>(null);
  const [fotoPreview, setFotoPreview] = useState('');
  const fotoRef = useRef<HTMLInputElement>(null);
  const [formAdiant, setFormAdiant] = useState({ valor:'', motivo:'' });
  const [formAjuste, setFormAjuste] = useState({ tipo:'aumento' as 'aumento'|'reducao', valor:'', motivo:'' });
  const [formEvento, setFormEvento] = useState({ data:'', tipo:'falta', horas_ausentes:'', observacao:'' });

  useEffect(()=>{ fetchFuncs(); fetchUsuarios(); },[]);
  useEffect(()=>{ if(selected) fetchAdiantamentos(selected.id); },[selected]);

  const fetchFuncs = async () => { setLoading(true); try { const r=await fetch('/api/funcionarios',{headers:hdrs}); setFuncs(await r.json()); } catch{} finally{setLoading(false);} };
  const fetchAdiantamentos = async (id:number) => { const r=await fetch(`/api/funcionarios/${id}/adiantamentos`,{headers:hdrs}); setAdiantamentos(await r.json()); };
  const fetchUsuarios = async () => { try { const r=await fetch('/api/usuarios/funcionarios',{headers:hdrs}); if(r.ok) setUsuariosExistentes(await r.json()); } catch{} };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      const body = { ...form, salario_base:parseFloat(form.salario_base), carga_horaria:parseFloat(form.carga_horaria), tolerancia_minutos:parseInt(form.tolerancia_minutos), dias_trabalho_mes:parseInt(form.dias_trabalho_mes) };
      const url = modal==='novo' ? '/api/funcionarios' : `/api/funcionarios/${selected!.id}`;
      const r = await fetch(url, { method:modal==='novo'?'POST':'PUT', headers:jHdrs, body:JSON.stringify(body) });
      const data = await r.json();
      if(!r.ok){ alert(data.error||'Erro'); return; }
      if(fotoFile){ const fid=modal==='novo'?data.id:selected!.id; const fd=new FormData(); fd.append('foto',fotoFile); await fetch(`/api/funcionarios/${fid}/foto`,{method:'POST',headers:hdrs,body:fd}); }
      // Criar/atualizar acesso de login se marcado
      // Para novo funcionário: exige senha. Para edição: senha é opcional (mantém a atual)
      const isNovoAcesso = modal === 'novo' || !usuariosExistentes.find(u => u.username === formAcesso.login);
      if(formAcesso.criar_acesso && formAcesso.login && (formAcesso.senha || !isNovoAcesso)) {
        const fid = modal==='novo' ? data.id : selected!.id;
        const perms = formAcesso.cargo_sistema === 'dono' ? null : formAcesso.permissoes;
        await fetch(`/api/funcionarios/${fid}/criar-acesso`, {
          method:'POST', headers:jHdrs,
          body:JSON.stringify({ login:formAcesso.login, senha:formAcesso.senha || undefined, cargo:formAcesso.cargo_sistema, permissoes:perms })
        });
        await fetchUsuarios();
      }
      setModal(null); setForm(eF); setFormAcesso(eAcesso); setFotoFile(null); setFotoPreview(''); fetchFuncs(); setSelected(null);
    } finally { setSaving(false); }
  };

  const handleAdiantamento = async () => {
    const valor = parseFloat(formAdiant.valor);
    if (isNaN(valor) || valor <= 0) { alert('Informe um valor válido maior que zero.'); return; }
    if (!formAdiant.motivo.trim()) { alert('Informe o motivo do adiantamento.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${selected!.id}/adiantamentos`, { method:'POST', headers:jHdrs, body:JSON.stringify({ valor, motivo:formAdiant.motivo }) });
      if (r.ok) { setModal(null); setFormAdiant({ valor:'', motivo:'' }); fetchAdiantamentos(selected!.id); }
    } finally { setSaving(false); }
  };

  const handleAjuste = async () => {
    const valor = parseFloat(formAjuste.valor);
    if (isNaN(valor) || valor <= 0) { alert('Informe um valor de ajuste válido maior que zero.'); return; }
    if (!formAjuste.motivo.trim()) { alert('Informe o motivo do ajuste salarial.'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${selected!.id}/ajustes`, { method:'POST', headers:jHdrs, body:JSON.stringify({ tipo:formAjuste.tipo, valor, motivo:formAjuste.motivo }) });
      if (r.ok) { setModal(null); setFormAjuste({ tipo:'aumento', valor:'', motivo:'' }); fetchFuncs(); setSelected(null); }
    } finally { setSaving(false); }
  };
  const handleEvento = async () => { setSaving(true); try { const r=await fetch(`/api/funcionarios/${selected!.id}/eventos`,{method:'POST',headers:jHdrs,body:JSON.stringify({...formEvento,horas_ausentes:parseFloat(formEvento.horas_ausentes||'0')})}); if(r.ok){setModal(null);setFormEvento({data:'',tipo:'falta',horas_ausentes:'',observacao:''});} } finally{setSaving(false);} };
  const handleDesativar = async (id:number) => { if(!confirm('Desativar?'))return; await fetch(`/api/funcionarios/${id}/desativar`,{method:'PATCH',headers:hdrs}); setSelected(null); fetchFuncs(); };

  const openEdit = (f:Func) => {
    setSelected(f);
    setForm({ nome:f.nome, cargo:f.cargo, salario_base:String(f.salario_base), horario_entrada:f.horario_entrada||'08:00', horario_saida:f.horario_saida||'17:00', carga_horaria:String(f.carga_horaria||8), dias_semana:f.dias_semana||'1,2,3,4,5', tolerancia_minutos:String(f.tolerancia_minutos||10), dias_trabalho_mes:String(f.dias_trabalho_mes||26), data_admissao:f.data_admissao||'', telefone:f.telefone||'', cpf:f.cpf||'', pin:f.pin||'' });
    // Usa caminho relativo: funciona tanto em localhost quanto em produção
    setFotoPreview(f.foto_url ? f.foto_url : '');
    // Carrega dados de acesso existente
    const uExist = usuariosExistentes.find(u=>u.nome===f.nome);
    if(uExist) {
      setFormAcesso({ login:uExist.username, senha:'', cargo_sistema:uExist.cargo||'atendente', permissoes:uExist.permissoes||[], criar_acesso:true });
    } else {
      setFormAcesso({...eAcesso});
    }
    setModal('edit');
  };

  const toggleDia = (v:number) => { const arr=form.dias_semana.split(',').map(Number).filter(n=>!isNaN(n)); const next=arr.includes(v)?arr.filter(x=>x!==v):[...arr,v].sort(); setForm({...form,dias_semana:next.join(',')}); };
  const diasAtivos = form.dias_semana.split(',').map(Number);
  const filtered = funcs.filter(f=>f.status==='ativo'&&f.nome.toLowerCase().includes(search.toLowerCase()));
  const inativos = funcs.filter(f=>f.status!=='ativo');

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário..." className="pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none w-56"/></div>
        <button onClick={()=>{setForm(eF);setFotoFile(null);setFotoPreview('');setSelected(null);setModal('novo');}} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all active:scale-95"><UserPlus size={16}/>Novo Funcionário</button>
      </div>

      {loading ? <LoadSpinner/> : filtered.length===0 ? (
        <div className="flex flex-col items-center py-20 text-zinc-400"><Users size={48} className="mb-4 opacity-20"/><p className="font-semibold">Nenhum funcionário ativo</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(f=>(
            <div key={f.id} className="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-400 hover:shadow-md transition-all">
              <div className="flex items-start gap-3 mb-4">
                <Avatar func={f} size={44}/>
                <div className="flex-1 min-w-0"><p className="font-black text-zinc-900 truncate">{f.nome}</p><p className="text-xs text-zinc-400 truncate">{f.cargo}</p></div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">ativo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <InfoChip label="Salário" value={fmt(f.salario_base)}/>
                <InfoChip label="Horário" value={`${f.horario_entrada||'08:00'}–${f.horario_saida||'17:00'}`}/>
                <InfoChip label="Carga" value={`${f.carga_horaria||8}h/dia`}/>
                <InfoChip label="Tolerância" value={`${f.tolerancia_minutos||10}min`}/>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <ABtn label="Editar" icon={<Pencil size={11}/>} onClick={()=>openEdit(f)}/>
                <ABtn label="Evento" icon={<Calendar size={11}/>} onClick={()=>{setSelected(f);setModal('evento');}}/>
                <ABtn label="Adiantamento" icon={<DollarSign size={11}/>} onClick={()=>{setSelected(f);setModal('adiant');}}/>
                <ABtn label="Salário" icon={<TrendingUp size={11}/>} onClick={()=>{setSelected(f);setModal('ajuste');}}/>
                <ABtn label="Desativar" icon={<Trash2 size={11}/>} danger onClick={()=>handleDesativar(f.id)}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {inativos.length>0&&<details><summary className="cursor-pointer text-sm font-bold text-zinc-400 hover:text-zinc-600 mt-2">Inativos ({inativos.length})</summary><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">{inativos.map(f=><div key={f.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex items-center gap-3 opacity-60"><Avatar func={f} size={36}/><div><p className="text-sm font-bold text-zinc-700">{f.nome}</p><p className="text-xs text-zinc-400">{f.cargo}</p></div></div>)}</div></details>}

      {/* Modal Funcionário */}
      <Modal open={modal==='novo'||modal==='edit'} onClose={()=>setModal(null)} title={modal==='novo'?'Novo Funcionário':`Editar — ${selected?.nome}`} wide>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl bg-zinc-100 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer" onClick={()=>fotoRef.current?.click()}>
              {fotoPreview?<img src={fotoPreview} alt="" className="w-full h-full object-cover"/>:<Camera size={24} className="text-zinc-400"/>}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all"><Upload size={18} className="text-white"/></div>
            </div>
            <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;setFotoFile(f);setFotoPreview(URL.createObjectURL(f));}}/>
            <div className="flex-1"><FInput label="Nome completo*" value={form.nome} onChange={v=>setForm({...form,nome:v})} placeholder="João Silva"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Cargo" value={form.cargo} onChange={v=>setForm({...form,cargo:v})} placeholder="Garçom, Cozinheiro..."/>
            <FInput label="Salário base (R$)*" value={form.salario_base} onChange={v=>setForm({...form,salario_base:v})} placeholder="1500,00"/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FInput label="Entrada" type="time" value={form.horario_entrada} onChange={v=>setForm({...form,horario_entrada:v})}/>
            <FInput label="Saída" type="time" value={form.horario_saida} onChange={v=>setForm({...form,horario_saida:v})}/>
            <FInput label="Carga (h/dia)" value={form.carga_horaria} onChange={v=>setForm({...form,carga_horaria:v})} placeholder="8"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Tolerância (min)" value={form.tolerancia_minutos} onChange={v=>setForm({...form,tolerancia_minutos:v})} placeholder="10"/>
            <FInput label="Dias trab./mês (base)" value={form.dias_trabalho_mes} onChange={v=>setForm({...form,dias_trabalho_mes:v})} placeholder="26"/>
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Dias de trabalho</label>
            <div className="flex gap-1.5 mt-1.5">
              {[{v:0,l:'Dom'},{v:1,l:'Seg'},{v:2,l:'Ter'},{v:3,l:'Qua'},{v:4,l:'Qui'},{v:5,l:'Sex'},{v:6,l:'Sáb'}].map(d=>(
                <button key={d.v} onClick={()=>toggleDia(d.v)} className={`w-10 h-10 rounded-xl text-xs font-bold border transition-all ${diasAtivos.includes(d.v)?'bg-zinc-900 text-white border-zinc-900':'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}>{d.l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Data de admissão" type="date" value={form.data_admissao} onChange={v=>setForm({...form,data_admissao:v})}/>
            <FInput label="PIN (bater ponto)" value={form.pin} onChange={v=>setForm({...form,pin:v})} placeholder="Ex: 1234"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FInput label="Telefone" value={form.telefone} onChange={v=>setForm({...form,telefone:v})} placeholder="(11) 99999-9999"/>
            <FInput label="CPF" value={form.cpf} onChange={v=>setForm({...form,cpf:v})} placeholder="000.000.000-00"/>
          </div>

          {/* ── Seção de Acesso ao Sistema ──────────────────────────────── */}
          <div className="border-t border-zinc-100 pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-black text-zinc-800">🔐 Acesso ao Sistema</p>
                <p className="text-[11px] text-zinc-400">Permita que este funcionário faça login</p>
              </div>
              <button
                type="button"
                onClick={()=>setFormAcesso({...formAcesso, criar_acesso:!formAcesso.criar_acesso})}
                className={`relative w-11 h-6 rounded-full transition-colors ${formAcesso.criar_acesso?'bg-zinc-900':'bg-zinc-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${formAcesso.criar_acesso?'left-5':'left-0.5'}`}/>
              </button>
            </div>

            {formAcesso.criar_acesso && (
              <div className="space-y-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Login*" value={formAcesso.login} onChange={v=>setFormAcesso({...formAcesso,login:v})} placeholder="joao.silva"/>
                  <FInput label={modal==='edit'?'Nova senha (deixe vazio para manter)':'Senha*'} type="password" value={formAcesso.senha} onChange={v=>setFormAcesso({...formAcesso,senha:v})} placeholder="••••••"/>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nível de acesso</label>
                  <div className="flex gap-2 mt-1.5">
                    {(['atendente','gerente','dono'] as const).map(c=>(
                      <button key={c} type="button"
                        onClick={()=>setFormAcesso({...formAcesso, cargo_sistema:c, permissoes:CARGO_PRESETS[c] || formAcesso.permissoes})}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize ${formAcesso.cargo_sistema===c?'bg-zinc-900 text-white border-zinc-900':'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                      >
                        {c==='dono'?'👑 Dono':c==='gerente'?'🔑 Gerente':'🪪 Atendente'}
                      </button>
                    ))}
                  </div>
                </div>

                {formAcesso.cargo_sistema !== 'dono' && (
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Abas permitidas</label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      {ABAS_SISTEMA.map(aba=>{
                        const checked = formAcesso.permissoes.includes(aba.key);
                        return (
                          <button key={aba.key} type="button"
                            onClick={()=>{
                              const next = checked
                                ? formAcesso.permissoes.filter(p=>p!==aba.key)
                                : [...formAcesso.permissoes, aba.key];
                              setFormAcesso({...formAcesso, permissoes:next});
                            }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left ${checked?'bg-zinc-900 text-white border-zinc-900':'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                          >
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked?'bg-white border-white':'border-zinc-300'}`}>
                              {checked && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-zinc-900"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
                            </span>
                            {aba.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleSalvar} saving={saving} label="Salvar Funcionário"/>
      </Modal>

      {/* Modal Evento */}
      <Modal open={modal==='evento'} onClose={()=>setModal(null)} title={`Registrar Evento — ${selected?.nome}`}>
        <div className="space-y-3">
          <FInput label="Data" type="date" value={formEvento.data} onChange={v=>setFormEvento({...formEvento,data:v})}/>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tipo de evento</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {TIPOS_EVENTO.map(t=><button key={t.value} onClick={()=>setFormEvento({...formEvento,tipo:t.value})} className={`py-2 rounded-xl text-xs font-bold border transition-all ${formEvento.tipo===t.value?'bg-zinc-900 text-white border-zinc-900':'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}>{t.label}</button>)}
            </div>
          </div>
          {formEvento.tipo==='declaracao_parcial'&&<FInput label="Horas ausentes" value={formEvento.horas_ausentes} onChange={v=>setFormEvento({...formEvento,horas_ausentes:v})} placeholder="Ex: 2.5"/>}
          <FInput label="Observação (opcional)" value={formEvento.observacao} onChange={v=>setFormEvento({...formEvento,observacao:v})} placeholder="Descreva o motivo..."/>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-start gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5"/>Faltas e ausências parciais geram descontos automáticos na folha.</div>
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleEvento} saving={saving} label="Registrar Evento"/>
      </Modal>

      {/* Modal Adiantamento */}
      <Modal open={modal==='adiant'} onClose={()=>setModal(null)} title={`Adiantamento — ${selected?.nome}`}>
        <div className="space-y-3">
          <FInput label="Valor (R$)" value={formAdiant.valor} onChange={v=>setFormAdiant({...formAdiant,valor:v})} placeholder="500,00"/>
          <FInput label="Motivo" value={formAdiant.motivo} onChange={v=>setFormAdiant({...formAdiant,motivo:v})} placeholder="Emergência, solicitação..."/>
          {adiantamentos.filter(a=>!a.descontado).length>0&&<div className="p-3 bg-zinc-50 rounded-xl"><p className="text-xs font-bold text-zinc-600 mb-2">Pendentes</p>{adiantamentos.filter(a=>!a.descontado).map(a=><div key={a.id} className="flex justify-between text-xs text-zinc-500"><span>{fmtDate(a.data)} · {a.motivo}</span><span className="font-bold text-amber-600">{fmt(a.valor)}</span></div>)}</div>}
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleAdiantamento} saving={saving} label="Registrar"/>
      </Modal>

      {/* Modal Ajuste Salário */}
      <Modal open={modal==='ajuste'} onClose={()=>setModal(null)} title={`Ajuste Salarial — ${selected?.nome}`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['aumento','reducao'] as const).map(t=><button key={t} onClick={()=>setFormAjuste({...formAjuste,tipo:t})} className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${formAjuste.tipo===t?(t==='aumento'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600'):'bg-white text-zinc-500 border-zinc-200'}`}>{t==='aumento'?'▲ Aumento':'▼ Redução'}</button>)}
          </div>
          <FInput label="Valor (R$)" value={formAjuste.valor} onChange={v=>setFormAjuste({...formAjuste,valor:v})} placeholder="200,00"/>
          <FInput label="Motivo" value={formAjuste.motivo} onChange={v=>setFormAjuste({...formAjuste,motivo:v})} placeholder="Promoção, reajuste..."/>
          {selected&&formAjuste.valor&&<div className="p-3 bg-zinc-50 rounded-xl text-xs space-y-1"><div className="flex justify-between"><span className="text-zinc-500">Atual</span><span className="font-bold">{fmt(selected.salario_base)}</span></div><div className="flex justify-between"><span className="text-zinc-500">Novo</span><span className={`font-black ${formAjuste.tipo==='aumento'?'text-emerald-600':'text-red-600'}`}>{fmt(selected.salario_base+(formAjuste.tipo==='aumento'?1:-1)*(parseFloat(formAjuste.valor)||0))}</span></div></div>}
        </div>
        <MBtns onCancel={()=>setModal(null)} onConfirm={handleAjuste} saving={saving} label="Confirmar Ajuste"/>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA ESPELHO
// ═══════════════════════════════════════════════════════════════════════════════
interface PontoRaw { id: number; tipo: string; hora: string; data: string; ip: string; }

function TabEspelho({ token }: { token: string }) {
  const [funcs, setFuncs]         = useState<Func[]>([]);
  const [sel, setSel]             = useState<number|''>('');
  const [month, setMonth]         = useState(new Date().getMonth()+1);
  const [year, setYear]           = useState(new Date().getFullYear());
  const [espelho, setEspelho]     = useState<Espelho|null>(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  // modal de evento (já existia)
  const [addEvento, setAddEvento] = useState<string|null>(null);
  const [formEvento, setFormEvento] = useState({tipo:'falta',horas_ausentes:'',observacao:''});
  // modal de gestão de pontos (novo)
  const [gestaoData, setGestaoData]     = useState<string|null>(null);
  const [pontosRaw, setPontosRaw]       = useState<PontoRaw[]>([]);
  const [loadingPontos, setLoadingPontos] = useState(false);
  const [editPonto, setEditPonto]       = useState<PontoRaw|null>(null);
  const [editHora, setEditHora]         = useState('');
  const [editTipo, setEditTipo]         = useState('');
  const [manualHora, setManualHora]     = useState('');
  const [manualTipo, setManualTipo]     = useState<'entrada'|'saida'>('entrada');

  // ── Hora Extra ──────────────────────────────────────────────────────────
  const [horaExtraMin, setHoraExtraMin]         = useState('');
  const [horaExtraObs, setHoraExtraObs]         = useState('');
  const [savingExtra, setSavingExtra]           = useState(false);

  const hdrs   = { Authorization:`Bearer ${token}` };
  const jHdrs  = { ...hdrs, 'Content-Type':'application/json' };

  useEffect(()=>{ fetch('/api/funcionarios',{headers:hdrs}).then(r=>r.json()).then(d=>{ setFuncs(d); const ativos=d.filter((f:Func)=>f.status==='ativo'); if(ativos.length) setSel(ativos[0].id); }); },[]);
  useEffect(()=>{ if(sel) fetchEspelho(); },[sel,month,year]);

  const fetchEspelho = async () => {
    if (!sel) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/espelho?month=${month}&year=${year}`, { headers: hdrs });
      if (!r.ok) return;
      const d = await r.json();
      // Garante que o retorno é um objeto válido com a propriedade dias antes de setar
      if (d && Array.isArray(d.dias)) setEspelho(d);
    } catch {} finally { setLoading(false); }
  };

  // ── Evento ──────────────────────────────────────────────────────────────
  const handleAddEvento = async () => {
    if(!addEvento) return;
    await fetch(`/api/funcionarios/${sel}/eventos`,{method:'POST',headers:jHdrs,body:JSON.stringify({data:addEvento,tipo:formEvento.tipo,horas_ausentes:parseFloat(formEvento.horas_ausentes||'0'),observacao:formEvento.observacao})});
    setAddEvento(null); setFormEvento({tipo:'falta',horas_ausentes:'',observacao:''}); fetchEspelho();
  };

  // ── Gestão de pontos do dia ──────────────────────────────────────────────
  const abrirGestao = async (data: string) => {
    setGestaoData(data); setLoadingPontos(true); setEditPonto(null); setManualHora(''); setManualTipo('entrada');
    try {
      const r = await fetch(`/api/funcionarios/${sel}/pontos-dia?data=${data}`, {headers:hdrs});
      setPontosRaw(await r.json());
    } catch { setPontosRaw([]); } finally { setLoadingPontos(false); }
  };

  const handleEditarPonto = async () => {
    if(!editPonto) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/pontos/${editPonto.id}`,{method:'PUT',headers:jHdrs,body:JSON.stringify({hora:editHora,tipo:editTipo})});
      if(r.ok){
        setEditPonto(null);
        await abrirGestao(gestaoData!);
        await fetchEspelho();
      } else {
        const d = await r.json();
        alert(d.error || 'Erro ao editar ponto');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSaving(false); }
  };

  const handleDeletarPonto = async (id: number) => {
    if(!confirm('Deletar este registro de ponto?')) return;
    try {
      await fetch(`/api/pontos/${id}`,{method:'DELETE',headers:hdrs});
      await abrirGestao(gestaoData!);
      await fetchEspelho();
    } catch { alert('Erro ao deletar'); }
  };

  const handlePontoManual = async () => {
    if(!manualHora || !gestaoData) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/pontos-manual`,{method:'POST',headers:jHdrs,body:JSON.stringify({data:gestaoData,hora:manualHora,tipo:manualTipo})});
      if(r.ok){
        setManualHora('');
        await abrirGestao(gestaoData!);
        await fetchEspelho();
      } else {
        const d = await r.json();
        alert(d.error || 'Erro ao inserir ponto');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSaving(false); }
  };

  const handleAprovarExtra = async () => {
    if (!gestaoData || !horaExtraMin || parseInt(horaExtraMin) <= 0) {
      alert('Informe quantos minutos de hora extra aprovar.'); return;
    }
    setSavingExtra(true);
    try {
      const r = await fetch(`/api/funcionarios/${sel}/horas-extras`, {
        method: 'POST', headers: jHdrs,
        body: JSON.stringify({ data: gestaoData, minutos: parseInt(horaExtraMin), observacao: horaExtraObs }),
      });
      if (r.ok) {
        setHoraExtraMin(''); setHoraExtraObs('');
        await fetchEspelho();
      } else {
        const d = await r.json(); alert(d.error || 'Erro ao aprovar hora extra');
      }
    } catch { alert('Erro de conexão'); }
    finally { setSavingExtra(false); }
  };

  const handleCancelarExtra = async (id: number) => {
    if (!confirm('Cancelar aprovação desta hora extra?')) return;
    try {
      await fetch(`/api/funcionarios/horas-extras/${id}`, { method: 'DELETE', headers: hdrs });
      await fetchEspelho();
    } catch { alert('Erro ao cancelar'); }
  };

  // ── PDF do espelho ───────────────────────────────────────────────────────
  const exportarPDF = () => {
    if(!espelho) return;
    const func = espelho.funcionario;
    const diasExp = espelho.dias.filter(d=>d.isExpediente);
    const mesLabel = `${MESES[month-1]} ${year}`;
    const fmtMoney = (v:number) => `R$ ${(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}`;
    const fmtH = (m:number) => { const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h${mn>0?` ${mn}min`:''}`:mn+'min'; };
    const statusLabel: Record<string,string> = { trabalhado:'Trabalhou', falta:'Falta', folga:'Folga', atestado:'Atestado', declaracao_parcial:'Aus. Parcial', sem_expediente:'—' };
    const statusColor: Record<string,string> = { trabalhado:'#16a34a', falta:'#dc2626', folga:'#2563eb', atestado:'#7c3aed', declaracao_parcial:'#d97706', sem_expediente:'#a1a1aa' };

    const linhas = diasExp.map(d=>`
      <tr>
        <td>${new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</td>
        <td><span style="color:${statusColor[d.status]||'#666'};font-weight:700">${statusLabel[d.status]||d.status}</span></td>
        <td>${d.entrada||'—'}</td>
        <td>${d.saida||'—'}</td>
        <td>${d.atrasoMin>0?`<span style="color:#d97706;font-weight:700">+${d.atrasoMin}min</span>`:'—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Espelho de Ponto — ${func.nome} — ${mesLabel}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:12px}
        h1{font-size:18px;font-weight:900;margin-bottom:2px}
        .sub{color:#666;font-size:12px;margin-bottom:20px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
        .resumo{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px}
        .resumo-card{border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px}
        .resumo-label{font-size:9px;color:#71717a;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
        .resumo-val{font-size:16px;font-weight:900;margin-top:2px}
        table{width:100%;border-collapse:collapse}
        th{background:#f4f4f5;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;font-weight:700;border-bottom:1px solid #e4e4e7}
        td{padding:7px 10px;border-bottom:1px solid #f4f4f5;vertical-align:middle}
        tr:nth-child(even) td{background:#fafafa}
        .sign{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;font-size:11px;color:#888}
        .sign div{border-top:1px solid #ccc;padding-top:8px}
        @media print{body{padding:16px}}
      </style></head><body>
      <div class="header">
        <div>
          <h1>Espelho de Ponto</h1>
          <p class="sub">${mesLabel} · ${func.nome} · ${func.cargo}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#555">
          ${func.horario_entrada||'08:00'} – ${func.horario_saida||'17:00'} · ${func.carga_horaria||8}h/dia<br/>
          Tolerância: ${func.tolerancia_minutos||10}min<br/>
          Admissão: ${func.data_admissao?new Date(func.data_admissao+'T12:00:00').toLocaleDateString('pt-BR'):'-'}
        </div>
      </div>
      <div class="resumo">
        <div class="resumo-card"><div class="resumo-label">Trabalhados</div><div class="resumo-val" style="color:#16a34a">${espelho.resumo.diasTrabalhados}</div></div>
        <div class="resumo-card"><div class="resumo-label">Faltas</div><div class="resumo-val" style="color:#dc2626">${espelho.resumo.totalFaltas}</div></div>
        <div class="resumo-card"><div class="resumo-label">Folgas</div><div class="resumo-val" style="color:#2563eb">${espelho.resumo.diasFolga}</div></div>
        <div class="resumo-card"><div class="resumo-label">Atestados</div><div class="resumo-val" style="color:#7c3aed">${espelho.resumo.diasAtestado}</div></div>
        <div class="resumo-card"><div class="resumo-label">Atraso</div><div class="resumo-val" style="color:#d97706">${espelho.resumo.totalAtrasoMin>0?fmtH(espelho.resumo.totalAtrasoMin):'0min'}</div></div>
        <div class="resumo-card"><div class="resumo-label">Desc. Total</div><div class="resumo-val" style="color:#dc2626;font-size:13px">${fmtMoney(espelho.resumo.totalDescontos)}</div></div>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Status</th><th>Entrada</th><th>Saída</th><th>Atraso</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="sign">
        <div>Assinatura do Funcionário</div>
        <div>Assinatura do Responsável</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;

    const w = window.open('','_blank','width=800,height:1000');
    if(!w) return;
    w.document.write(html); w.document.close();
  };

  const chgMonth = (d:number)=>{ let m=month+d,y=year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} setMonth(m);setYear(y); };
  const funcSel = funcs.find(f=>f.id===sel);

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={sel} onChange={e=>setSel(Number(e.target.value))} className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none">
          {funcs.filter(f=>f.status==='ativo').map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-xl px-2">
          <button onClick={()=>chgMonth(-1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold text-zinc-900 w-28 text-center">{MESES[month-1]} {year}</span>
          <button onClick={()=>chgMonth(1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronRight size={16}/></button>
        </div>
        <button onClick={fetchEspelho} className="p-2 bg-white border border-zinc-200 rounded-xl text-zinc-400 hover:text-zinc-700"><RefreshCw size={15}/></button>
        {espelho && (
          <button onClick={exportarPDF} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold transition-all">
            <Download size={14}/>Exportar PDF
          </button>
        )}
      </div>

      {loading ? <LoadSpinner/> : espelho ? (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <SCard label="Trabalhados" value={espelho.resumo.diasTrabalhados} color="emerald"/>
            <SCard label="Faltas"      value={espelho.resumo.totalFaltas}     color="red"/>
            <SCard label="Folgas"      value={espelho.resumo.diasFolga}       color="blue"/>
            <SCard label="Atestados"   value={espelho.resumo.diasAtestado}    color="purple"/>
            <SCard label="Atraso"      value={`${espelho.resumo.totalAtrasoMin}min`} color="amber"/>
            <SCard label="H. Extras"   value={`${espelho.resumo.totalExtraMin ?? 0}min`} color="orange"/>
            <SCard label="Desc.Faltas" value={fmt(espelho.resumo.descontoFaltas)}   color="red"   small/>
            <SCard label="Desc.Atrasos" value={fmt(espelho.resumo.descontoAtrasos)} color="amber" small/>
          </div>

          {/* Calendário */}
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-zinc-100">
              {DIAS_LABEL.map(d=><div key={d} className="py-2 text-center text-[10px] font-black text-zinc-400 uppercase tracking-wider">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {(()=>{
                const first = new Date(`${year}-${String(month).padStart(2,'0')}-01`).getDay();
                const cells = [...Array(first).fill(null), ...espelho.dias];
                return cells.map((dia,i)=>!dia?(
                  <div key={`e${i}`} className="aspect-square border-r border-b border-zinc-50"/>
                ):(
                  <div key={dia.data} onClick={()=>abrirGestao(dia.data)}
                    className={`aspect-square border-r border-b border-zinc-100 p-1 cursor-pointer hover:ring-2 hover:ring-inset hover:ring-zinc-400 transition-all ${dia.status==='sem_expediente'&&!dia.eventos?.length?'bg-zinc-50/50':''}`}>
                    <div className="flex flex-col h-full">
                      <span className="text-[10px] font-bold text-zinc-500">{dia.dia}</span>
                      {dia.isExpediente && dia.status !== 'futuro' && <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${STATUS_COLOR[dia.status]||''}`}>{STATUS_LABEL[dia.status]}</span>
                        {dia.entrada&&<span className="text-[8px] text-zinc-400">E: {dia.entrada?.slice(0,5)}</span>}
                        {dia.saida&&<span className="text-[8px] text-zinc-400">S: {dia.saida?.slice(0,5)}</span>}
                        {dia.atrasoMin>0&&<span className="text-[8px] text-amber-600 font-bold">+{dia.atrasoMin}m atr.</span>}
                        {/* Badge de hora extra aprovada */}
                        {dia.extraAprov && (
                          <span className="text-[8px] font-black px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                            HE +{dia.extraAprov.minutos}m
                          </span>
                        )}
                        {/* Indicador de saída tardia ainda não aprovada como extra */}
                        {!dia.extraAprov && dia.saidaRealExtraMin && dia.saidaRealExtraMin > 0 && (
                          <span className="text-[8px] text-zinc-400 italic">+{dia.saidaRealExtraMin}m?</span>
                        )}
                      </div>}
                      {/* Folga/atestado em dias fora do expediente */}
                      {!dia.isExpediente && dia.eventos?.some((e:any)=>['folga','atestado'].includes(e.tipo)) && (
                        <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                          {dia.eventos.filter((e:any)=>['folga','atestado'].includes(e.tipo)).map((e:any,ei:number)=>(
                            <span key={ei} className={`text-[9px] font-bold px-1 py-0.5 rounded border ${STATUS_COLOR[e.tipo]||''}`}>
                              {STATUS_LABEL[e.tipo]||e.tipo}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-7 px-4 py-2 bg-zinc-50 border-b border-zinc-100 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
              <span>Data</span><span>Status</span><span>Entrada</span><span>Saída</span><span>Atraso</span><span>H.Extra</span><span>Ação</span>
            </div>
            <div className="divide-y divide-zinc-100 max-h-72 overflow-y-auto">
              {espelho.dias
                .filter(d => d.isExpediente || d.eventos?.some((e:any) => ['folga','atestado'].includes(e.tipo)))
                .map(dia => {
                  const eventoDestaque = dia.eventos?.find((e:any) => ['folga','atestado'].includes(e.tipo));
                  return (
                    <div key={dia.data} className="grid grid-cols-7 px-4 py-2.5 text-xs hover:bg-zinc-50 items-center">
                      <span className="font-medium text-zinc-600">{fmtDate(dia.data)}</span>
                      <div className="flex flex-col gap-0.5">
                        <span className={`w-fit px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[dia.status]}`}>{STATUS_LABEL[dia.status]}</span>
                        {eventoDestaque?.observacao && (
                          <span className="text-[9px] text-zinc-400 truncate max-w-[80px]" title={eventoDestaque.observacao}>{eventoDestaque.observacao}</span>
                        )}
                      </div>
                      <span className="text-zinc-500">{dia.entrada ? dia.entrada.slice(0,5) : '—'}</span>
                      <span className="text-zinc-500">{dia.saida  ? dia.saida.slice(0,5)  : '—'}</span>
                      <span className={dia.atrasoMin>0?'text-amber-600 font-bold':'text-zinc-300'}>{dia.atrasoMin>0?`${dia.atrasoMin}min`:'—'}</span>
                      <span>
                        {dia.extraAprov
                          ? <span className="text-orange-600 font-bold text-[10px]">+{dia.extraAprov.minutos}min ✓</span>
                          : dia.saidaRealExtraMin && dia.saidaRealExtraMin > 0
                            ? <span className="text-zinc-400 text-[10px] italic">+{dia.saidaRealExtraMin}m?</span>
                            : <span className="text-zinc-300">—</span>
                        }
                      </span>
                      <div className="flex gap-2">
                        <button onClick={()=>setAddEvento(dia.data)} className="text-zinc-300 hover:text-zinc-600 text-[10px] font-bold">+ evento</button>
                        <button onClick={()=>abrirGestao(dia.data)} className="text-blue-400 hover:text-blue-700 text-[10px] font-bold">⏱ ponto</button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      ) : null}

      {/* ── Modal: Evento ── */}
      <Modal open={!!addEvento} onClose={()=>setAddEvento(null)} title={`Evento — ${addEvento?fmtDate(addEvento):''}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_EVENTO.map(t=><button key={t.value} onClick={()=>setFormEvento({...formEvento,tipo:t.value})} className={`py-2 rounded-xl text-xs font-bold border transition-all ${formEvento.tipo===t.value?'bg-zinc-900 text-white border-zinc-900':'bg-white text-zinc-500 border-zinc-200'}`}>{t.label}</button>)}
          </div>
          {formEvento.tipo==='declaracao_parcial'&&<FInput label="Horas ausentes" value={formEvento.horas_ausentes} onChange={v=>setFormEvento({...formEvento,horas_ausentes:v})} placeholder="Ex: 2.5"/>}
          <FInput label="Observação (opcional)" value={formEvento.observacao} onChange={v=>setFormEvento({...formEvento,observacao:v})} placeholder="..."/>
        </div>
        <MBtns onCancel={()=>setAddEvento(null)} onConfirm={handleAddEvento} saving={false} label="Registrar"/>
      </Modal>

      {/* ── Modal: Gestão de Pontos do Dia ── */}
      <Modal open={!!gestaoData} onClose={()=>{setGestaoData(null);setEditPonto(null);}} title={`Pontos — ${funcSel?.nome||''} · ${gestaoData?fmtDate(gestaoData):''}`} wide>
        {loadingPontos ? <LoadSpinner/> : (
          <div className="space-y-5">

            {/* Registros existentes */}
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">Registros do dia</p>
              {pontosRaw.length === 0 ? (
                <div className="text-center py-6 text-sm text-zinc-400 bg-zinc-50 rounded-xl">Nenhum ponto registrado neste dia</div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                  {pontosRaw.map(p=>(
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-zinc-50">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${p.tipo==='entrada'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
                        {p.tipo==='entrada'?'▲ Entrada':'▼ Saída'}
                      </span>
                      <span className="font-mono font-bold text-zinc-900 text-sm">{p.hora}</span>
                      {p.ip==='manual-admin'&&<span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Manual</span>}
                      <span className="text-[10px] text-zinc-400 flex-1">{p.ip!=='manual-admin'?`IP: ${p.ip}`:''}</span>
                      <div className="flex gap-2">
                        {/* Editar */}
                        {editPonto?.id===p.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={editHora.slice(0,5)}
                              onChange={e=>setEditHora(e.target.value)}
                              className="px-2 py-1 border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:border-zinc-400"
                            />
                            <select value={editTipo} onChange={e=>setEditTipo(e.target.value)} className="px-2 py-1 border border-zinc-200 rounded-lg text-xs focus:outline-none">
                              <option value="entrada">Entrada</option>
                              <option value="saida">Saída</option>
                            </select>
                            <button onClick={handleEditarPonto} disabled={saving} className="px-3 py-1 bg-zinc-900 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                              {saving?'...':'Salvar'}
                            </button>
                            <button onClick={()=>setEditPonto(null)} className="px-2 py-1 bg-zinc-100 rounded-lg text-xs font-bold">✕</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={()=>{setEditPonto(p);setEditHora(p.hora);setEditTipo(p.tipo);}}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-zinc-200 text-zinc-600 bg-zinc-50 hover:bg-zinc-100">
                              <Pencil size={10}/>Editar
                            </button>
                            <button onClick={()=>handleDeletarPonto(p.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100">
                              <Trash2 size={10}/>Deletar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conceder Folga Extra */}
            {(() => {
              const diaEspelho = espelho?.dias.find(d => d.data === gestaoData);
              const eventoFolga = diaEspelho?.eventos?.find((e:any) => e.tipo === 'folga');
              const temFolga = !!eventoFolga;
              return (
                <div className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Folga do Dia</p>
                    {temFolga && <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">✓ Folga registrada</span>}
                  </div>
                  {temFolga ? (
                    <div className="flex items-center justify-between bg-white border border-blue-200 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-sm font-black text-blue-700">Folga concedida</p>
                        {eventoFolga?.observacao && <p className="text-xs text-zinc-400 mt-0.5">{eventoFolga.observacao}</p>}
                      </div>
                      <button
                        onClick={async () => {
                          if (!eventoFolga?.id) return;
                          if (!confirm('Remover folga deste dia?')) return;
                          try {
                            await fetch(`/api/funcionarios/eventos/${eventoFolga.id}`, { method: 'DELETE', headers: hdrs });
                            await abrirGestao(gestaoData!); await fetchEspelho();
                          } catch { alert('Erro ao remover folga'); }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={10}/> Remover
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Motivo (opcional)</label>
                        <input type="text" id="folga-obs-input"
                          placeholder="Ex: Folga compensatória, banco de horas..."
                          className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!gestaoData || !sel) return;
                          const obs = (document.getElementById('folga-obs-input') as HTMLInputElement)?.value || '';
                          try {
                            const r = await fetch(`/api/funcionarios/${sel}/eventos`, {
                              method: 'POST', headers: jHdrs,
                              body: JSON.stringify({ data: gestaoData, tipo: 'folga', horas_ausentes: 0, observacao: obs }),
                            });
                            if (r.ok) { await abrirGestao(gestaoData!); await fetchEspelho(); }
                            else { const d = await r.json(); alert(d.error || 'Erro ao registrar folga'); }
                          } catch { alert('Erro de conexão'); }
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap"
                      >
                        <Check size={14}/> Conceder Folga
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Inserir ponto manual */}
            <div className="border border-dashed border-zinc-300 rounded-xl p-4 bg-zinc-50">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-3">Inserir ponto manual</p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Tipo</label>
                  <div className="flex gap-2">
                    {(['entrada','saida'] as const).map(t=>(
                      <button key={t} onClick={()=>setManualTipo(t)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${manualTipo===t?(t==='entrada'?'bg-emerald-600 text-white border-emerald-600':'bg-blue-600 text-white border-blue-600'):'bg-white text-zinc-500 border-zinc-200'}`}>
                        {t==='entrada'?'▲ Entrada':'▼ Saída'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Horário</label>
                  <input
                    type="time"
                    value={manualHora}
                    onChange={e=>setManualHora(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <button
                  onClick={handlePontoManual}
                  disabled={saving||!manualHora}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all flex items-center gap-2"
                >
                  {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<Check size={14}/>}
                  Inserir
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-2">⚠️ Registros manuais ficam marcados para auditoria.</p>
            </div>

            {/* Hora Extra */}
            {(() => {
              const diaEspelho = espelho?.dias.find(d => d.data === gestaoData);
              const extraExistente = diaEspelho?.extraAprov || null;
              return (
                <div className="border border-dashed border-orange-300 rounded-xl p-4 bg-orange-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-wider">Hora Extra</p>
                    {extraExistente && (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full border border-orange-200">
                        ✓ Aprovada: {extraExistente.minutos}min
                      </span>
                    )}
                  </div>

                  {/* Informativo: saída além do horário */}
                  {diaEspelho?.saidaRealExtraMin && diaEspelho.saidaRealExtraMin > 0 && (
                    <div className="mb-3 flex items-center gap-2 bg-white border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                      <span className="text-base">⏱</span>
                      <span>Saída registrada <strong>{diaEspelho.saidaRealExtraMin} min além</strong> do horário previsto. Aprove abaixo se for hora extra.</span>
                    </div>
                  )}

                  {extraExistente ? (
                    /* Já aprovada — mostra info e botão de cancelar */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between bg-white border border-orange-200 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-orange-700">{extraExistente.minutos} minutos aprovados</p>
                          {extraExistente.observacao && <p className="text-xs text-zinc-400 mt-0.5">{extraExistente.observacao}</p>}
                        </div>
                        <button
                          onClick={() => handleCancelarExtra(extraExistente.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                        >
                          <Trash2 size={10}/> Cancelar aprovação
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Ainda não aprovada — formulário de aprovação */
                    <div className="flex items-end gap-3">
                      <div className="w-36">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Minutos extras</label>
                        <input
                          type="number"
                          min="1"
                          max="480"
                          value={horaExtraMin}
                          onChange={e => setHoraExtraMin(e.target.value)}
                          placeholder={diaEspelho?.saidaRealExtraMin ? String(diaEspelho.saidaRealExtraMin) : '30'}
                          className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Observação (opcional)</label>
                        <input
                          type="text"
                          value={horaExtraObs}
                          onChange={e => setHoraExtraObs(e.target.value)}
                          placeholder="Ex: Cobertura de turno, evento especial..."
                          className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                        />
                      </div>
                      <button
                        onClick={handleAprovarExtra}
                        disabled={savingExtra || !horaExtraMin}
                        className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-all flex items-center gap-2 whitespace-nowrap"
                      >
                        {savingExtra ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={14}/>}
                        Aprovar HE
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-orange-500/70 mt-2">Horas extras são calculadas a 50% sobre o valor/hora (CLT). O valor aparece na folha de pagamento.</p>
                </div>
              );
            })()}

          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={()=>{setGestaoData(null);setEditPonto(null);}} className="px-5 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Fechar</button>
        </div>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA FOLHA
// ═══════════════════════════════════════════════════════════════════════════════
function TabFolha({ token }: { token: string }) {
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [sel, setSel] = useState<number|''>('');
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [folha, setFolha] = useState<Folha|null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const hdrs = { Authorization:`Bearer ${token}` };

  useEffect(()=>{ fetch('/api/funcionarios',{headers:hdrs}).then(r=>r.json()).then(d=>{ setFuncs(d); const ativos=d.filter((f:any)=>f.status==='ativo'); if(ativos.length) setSel(ativos[0].id); }); },[]);
  useEffect(()=>{ if(sel)fetchFolha(); },[sel,month,year]);

  const fetchFolha = async () => { setLoading(true); try{const r=await fetch(`/api/funcionarios/${sel}/folha?month=${month}&year=${year}`,{headers:hdrs});setFolha(await r.json());}catch{}finally{setLoading(false);} };

  const handlePrint = () => {
    if(!printRef.current||!folha)return;
    const content=printRef.current.innerHTML;
    const w=window.open('','_blank','width=750,height=950');
    if(!w)return;
    w.document.write(`<!DOCTYPE html><html><head><title>Folha de Pagamento — ${folha.funcionario.nome}</title>
    <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
    h1{font-size:20px;font-weight:900;margin:0}p.sub{color:#666;margin:2px 0 24px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:20px}
    .header-right{text-align:right}.header-right p{margin:2px 0;color:#555}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    td{padding:9px 14px;border-bottom:1px solid #eee;vertical-align:middle}
    td:last-child{text-align:right;font-weight:700}
    .section{background:#f8f8f8;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
    .desconto td:last-child{color:#dc2626}
    .subtotal{background:#f4f4f5}
    .liquido{background:#dcfce7}
    .liquido td{font-size:16px;font-weight:900}
    .liquido td:last-child{color:#15803d}
    .sign{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center;font-size:11px;color:#888}
    .sign div{border-top:1px solid #ccc;padding-top:8px}
    @media print{body{padding:20px}}</style>
    </head><body>${content}<script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  const chgMonth = (d:number)=>{ let m=month+d,y=year; if(m>12){m=1;y++;}if(m<1){m=12;y--;} setMonth(m);setYear(y); };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <select value={sel} onChange={e=>setSel(Number(e.target.value))} className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none">
          {funcs.filter(f=>f.status==='ativo').map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-xl px-2">
          <button onClick={()=>chgMonth(-1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold text-zinc-900 w-28 text-center">{MESES[month-1]} {year}</span>
          <button onClick={()=>chgMonth(1)} className="p-1.5 hover:bg-zinc-100 rounded-lg"><ChevronRight size={16}/></button>
        </div>
        {folha&&<button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all"><Download size={15}/>Imprimir / PDF</button>}
      </div>

      {loading?<LoadSpinner/>:folha?(
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recibo */}
          <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div ref={printRef} className="p-6">
              <div className="header flex justify-between items-start pb-5 border-b-2 border-zinc-900 mb-5">
                <div>
                  <h1 className="text-xl font-black text-zinc-900">Folha de Pagamento</h1>
                  <p className="sub text-sm text-zinc-400 mt-1">{MESES[month-1]} {year} · Competência {String(month).padStart(2,'0')}/{year}</p>
                </div>
                <div className="header-right text-right">
                  <p className="font-black text-zinc-900 text-lg">{folha.funcionario.nome}</p>
                  <p className="text-sm text-zinc-500">{folha.funcionario.cargo}</p>
                  {folha.funcionario.cpf&&<p className="text-xs text-zinc-400">CPF: {folha.funcionario.cpf}</p>}
                  {folha.funcionario.data_admissao&&<p className="text-xs text-zinc-400">Admissão: {fmtDate(folha.funcionario.data_admissao)}</p>}
                </div>
              </div>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="bg-emerald-50/60"><td className="py-3 px-4 font-black text-zinc-900">Salário Bruto</td><td className="py-3 px-4 text-right font-black text-zinc-900 text-base">{fmt(folha.salarioBruto)}</td></tr>
                  {/* Horas extras — acréscimo */}
                  {(folha.totalExtraMin ?? 0) > 0 && (
                    <tr className="bg-orange-50/50 border-b border-orange-100">
                      <td className="py-2.5 px-4 text-orange-700 font-bold flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-black">HE</span>
                        Horas Extras ({folha.totalExtraMin}min · 50% CLT)
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-orange-600">+ {fmt(folha.valorExtras ?? 0)}</td>
                    </tr>
                  )}
                  <tr><td className="py-1.5 px-4 text-[11px] font-black text-zinc-400 uppercase tracking-wider" colSpan={2}>Descontos</td></tr>
                  {[
                    [`INSS (11% estimado)`, folha.inss],
                    [`Faltas (${folha.totalFaltas} dia${folha.totalFaltas!==1?'s':''})`, folha.descontoFaltas],
                    [`Atrasos (${folha.totalAtrasoMin} min)`, folha.descontoAtrasos],
                    ...(folha.descontoParcial>0?[[`Ausência parcial (${folha.horasAusentesParcial}h)`, folha.descontoParcial]]:[] as any[]),
                    ...(folha.totalAdiantamentos>0?[[`Adiantamentos (${folha.adiantamentos.length})`, folha.totalAdiantamentos]]:[] as any[]),
                  ].map(([label,val]:any,i)=>(
                    <tr key={i} className="border-b border-zinc-100 desconto"><td className="py-2.5 px-4 text-zinc-600">{label}</td><td className="py-2.5 px-4 text-right font-bold text-red-600">— {fmt(val)}</td></tr>
                  ))}
                  <tr className="subtotal bg-zinc-50"><td className="py-3 px-4 font-black text-zinc-700">Total de Descontos</td><td className="py-3 px-4 text-right font-black text-red-600">— {fmt(folha.totalDescontos)}</td></tr>
                  {folha.totalDescontos > folha.salarioBruto && (
                    <tr>
                      <td colSpan={2} className="px-4 py-2">
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                          <span className="text-sm leading-none mt-0.5">⚠️</span>
                          <span>Descontos (<strong>{fmt(folha.totalDescontos)}</strong>) superam o salário bruto (<strong>{fmt(folha.salarioBruto)}</strong>). Excedente de <strong>{fmt(folha.totalDescontos - folha.salarioBruto)}</strong> deve ser cobrado separadamente ou transferido para o próximo mês.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="liquido bg-emerald-50"><td className="py-4 px-4 font-black text-zinc-900 text-base">SALÁRIO LÍQUIDO</td><td className="py-4 px-4 text-right font-black text-emerald-700 text-2xl">{fmt(Math.max(0, folha.salarioLiquido))}</td></tr>
                </tbody>
              </table>
              {folha.adiantamentos.length>0&&<div className="mt-4 p-4 bg-zinc-50 rounded-xl"><p className="text-xs font-black text-zinc-600 uppercase tracking-wider mb-2">Adiantamentos descontados</p>{folha.adiantamentos.map(a=><div key={a.id} className="flex justify-between text-xs text-zinc-500 py-1"><span>{fmtDate(a.data)} · {a.motivo}</span><span className="font-bold">{fmt(a.valor)}</span></div>)}</div>}
              <div className="sign mt-8 pt-6 border-t border-zinc-200 grid grid-cols-2 gap-8 text-center text-xs text-zinc-400">
                <div><div className="border-b border-zinc-300 mb-2 h-10"/><p>Assinatura do Funcionário</p></div>
                <div><div className="border-b border-zinc-300 mb-2 h-10"/><p>Assinatura do Responsável</p></div>
              </div>
            </div>
          </div>

          {/* Painel lateral */}
          <div className="space-y-4">
            <div className="bg-white border border-zinc-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-3">Resumo</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Salário Bruto</span><span className="font-bold">{fmt(folha.salarioBruto)}</span></div>
                {(folha.totalExtraMin ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-orange-500">H. Extras ({folha.totalExtraMin}min)</span><span className="font-bold text-orange-600">+ {fmt(folha.valorExtras ?? 0)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-zinc-500">Faltas</span><span className="font-bold text-red-500">{folha.totalFaltas}x</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Atraso total</span><span className="font-bold text-amber-500">{folha.totalAtrasoMin}min</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Adiantamentos</span><span className="font-bold text-blue-500">{fmt(folha.totalAdiantamentos)}</span></div>
                <div className="border-t border-zinc-100 pt-2 flex justify-between"><span className="text-zinc-500">Total descontos</span><span className="font-bold text-red-600">— {fmt(folha.totalDescontos)}</span></div>
              </div>
              <div className="mt-4 p-3 bg-emerald-50 rounded-xl flex justify-between items-center">
                <span className="text-sm font-black text-zinc-900">Líquido</span>
                <span className="text-xl font-black text-emerald-700">{fmt(Math.max(0, folha.salarioLiquido))}</span>
              </div>
              {folha.totalDescontos > folha.salarioBruto && (
                <p className="text-[10px] text-amber-600 mt-2 text-center font-bold">⚠️ Excedente: {fmt(folha.totalDescontos - folha.salarioBruto)}</p>
              )}
            </div>
            <div className="bg-white border border-zinc-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-3">Funcionário</p>
              <div className="flex items-center gap-3 mb-3"><Avatar func={folha.funcionario} size={44}/><div><p className="font-black text-zinc-900">{folha.funcionario.nome}</p><p className="text-xs text-zinc-400">{folha.funcionario.cargo}</p></div></div>
              <div className="space-y-1 text-xs text-zinc-500">
                <div className="flex justify-between"><span>Entrada/Saída</span><span className="font-bold text-zinc-700">{folha.funcionario.horario_entrada} – {folha.funcionario.horario_saida}</span></div>
                <div className="flex justify-between"><span>Carga diária</span><span className="font-bold text-zinc-700">{folha.funcionario.carga_horaria}h</span></div>
                <div className="flex justify-between"><span>Tolerância</span><span className="font-bold text-zinc-700">{folha.funcionario.tolerancia_minutos}min</span></div>
              </div>
            </div>
          </div>
        </div>
      ):null}
    </>
  );
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
function Avatar({ func, size=40, className='' }: { func:Pick<Func,'nome'|'foto_url'>; size?:number; className?:string }) {
  const initials = func.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
  return func.foto_url ? (
    <img src={func.foto_url} alt={func.nome} className={`rounded-xl object-cover shrink-0 ${className}`} style={{width:size,height:size}}/>
  ) : (
    <div className={`rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black shrink-0 ${className}`} style={{width:size,height:size,fontSize:Math.max(10,size*0.35)}}>{initials}</div>
  );
}
function InfoChip({ label, value }: { label:string; value:string }) {
  return <div className="bg-zinc-50 rounded-lg px-2 py-1.5"><p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p><p className="text-xs font-bold text-zinc-700 mt-0.5">{value}</p></div>;
}
function ABtn({ label, icon, onClick, danger=false }: { label:string; icon:React.ReactNode; onClick:()=>void; danger?:boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${danger?'border-red-200 text-red-500 bg-red-50 hover:bg-red-100':'border-zinc-200 text-zinc-600 bg-zinc-50 hover:bg-zinc-100'}`}>{icon}{label}</button>;
}
function SCard({ label, value, color, small=false }: { label:string; value:string|number; color:string; small?:boolean }) {
  const bg:Record<string,string>={emerald:'bg-emerald-50 border-emerald-200',red:'bg-red-50 border-red-200',blue:'bg-blue-50 border-blue-200',purple:'bg-purple-50 border-purple-200',amber:'bg-amber-50 border-amber-200',orange:'bg-orange-50 border-orange-200'};
  const txt:Record<string,string>={emerald:'text-emerald-700',red:'text-red-700',blue:'text-blue-700',purple:'text-purple-700',amber:'text-amber-700',orange:'text-orange-700'};
  return <div className={`${bg[color]} border rounded-xl p-3`}><p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p><p className={`font-black mt-1 ${txt[color]} ${small?'text-sm':'text-2xl'}`}>{value}</p></div>;
}
function FInput({ label, value, onChange, placeholder='', type='text' }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) {
  return <div><label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"/></div>;
}
function Modal({ open, onClose, title, children, wide=false }: { open:boolean; onClose:()=>void; title:string; children:React.ReactNode; wide?:boolean }) {
  return (
    <AnimatePresence>
      {open&&(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div initial={{scale:0.93,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.93,opacity:0}} className={`bg-white rounded-2xl p-6 w-full shadow-2xl my-4 ${wide?'max-w-2xl':'max-w-md'}`}>
            <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-black text-zinc-900">{title}</h3><button onClick={onClose} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400"><X size={18}/></button></div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
function MBtns({ onCancel, onConfirm, saving, label }: { onCancel:()=>void; onConfirm:()=>void; saving:boolean; label:string }) {
  return <div className="flex gap-3 mt-5"><button onClick={onCancel} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-sm font-bold">Cancelar</button><button onClick={onConfirm} disabled={saving} className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">{saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:label}</button></div>;
}
function LoadSpinner() { return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"/></div>; }
