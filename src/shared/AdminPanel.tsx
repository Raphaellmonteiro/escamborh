import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  LogOut,
  Trash2,
  DollarSign,
  User as UserIcon,
  Lock,
  AlertCircle,
  Copy,
  Search,
  Users,
  Activity,
  Calendar,
  Check,
  Smartphone,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  Pencil,
  KeyRound,
  Users2,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Button } from '../components/ui/Card';

export default function AdminPanel() {
  const [buscaCliente, setBuscaCliente] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'solicitacoes' | 'clientes' | 'financeiro'>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [financeiro, setFinanceiro] = useState<any>(null);
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ usuario: '', senha: '' });
  const [showCreds, setShowCreds] = useState<any>(null);
  const [filter, setFilter] = useState('todas');
  const [showSenha, setShowSenha] = useState<Record<number, boolean>>({});
  const [editPlano, setEditPlano] = useState<any>(null);
  const [editSenha, setEditSenha] = useState<any>(null);
  const [subUsersCliente, setSubUsersCliente] = useState<any>(null); // cliente selecionado
  const [subUsers, setSubUsers]               = useState<any[]>([]);
  const [subUsersLoading, setSubUsersLoading] = useState(false);
  const [resetSenhaUser, setResetSenhaUser]   = useState<any>(null);
  const [novaSenhaUser, setNovaSenhaUser]     = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novaSenhaVisivel, setNovaSenhaVisivel] = useState(false);
  const [novaSenhaAdmin, setNovaSenhaAdmin] = useState('');
  const [novaSenhaCaixa, setNovaSenhaCaixa] = useState('');

  // ── Garante que o dark mode do cliente nunca afete o painel admin ──────────
  useEffect(() => {
    document.documentElement.classList.remove('flowpdv-dark');
    document.documentElement.style.background = '';
    document.body.style.background = '';
    return () => {}; // cleanup não restaura — admin não tem dark mode
  }, []);

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchSolicitacoes();
      fetchClientes();
      fetchFinanceiro();
    }
  }, [token]);

  const fetchFinanceiro = async () => {
    const res = await fetch('/api/admin/financeiro', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setFinanceiro(data);
    }
  };

  const handleAuthError = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  const fetchStats = async () => {
    const res = await fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return handleAuthError();
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    }
  };

  const fetchSolicitacoes = async () => {
    const res = await fetch('/api/admin/solicitacoes', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return handleAuthError();
    if (res.ok) {
      const data = await res.json();
      setSolicitacoes(Array.isArray(data) ? data : []);
    }
  };

  const fetchSubUsers = async (clienteId: number) => {
    setSubUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/usuarios`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubUsers(res.ok ? await res.json() : []);
    } catch { setSubUsers([]); }
    setSubUsersLoading(false);
  };

  const handleToggleSubUser = async (clienteId: number, uid: number) => {
    await fetch(`/api/admin/clientes/${clienteId}/usuarios/${uid}/toggle`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
    });
    fetchSubUsers(clienteId);
  };

  const handleResetSenhaUser = async () => {
    if (!resetSenhaUser || !novaSenhaUser) return;
    if (!confirm(`Confirmar reset de senha do usuário "${resetSenhaUser.nome || resetSenhaUser.username}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/admin/clientes/${subUsersCliente.id}/usuarios/${resetSenhaUser.id}/senha`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: novaSenhaUser }),
    });
    setResetSenhaUser(null);
    setNovaSenhaUser('');
  };

  const fetchClientes = async () => {
    const res = await fetch('/api/admin/clientes', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return handleAuthError();
    if (res.ok) {
      const data = await res.json();
      setClientes(Array.isArray(data) ? data : []);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        localStorage.setItem('admin_token', data.token);
      } else {
        alert("Credenciais inválidas");
      }
    } catch (err) {
      alert("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const handleAprovar = async (id: number) => {
    if (!confirm("Deseja aprovar esta solicitação?")) return;
    const res = await fetch(`/api/admin/solicitacoes/${id}/aprovar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      setShowCreds(data);
      fetchSolicitacoes();
      fetchClientes();
      fetchStats();
    }
  };

  const handleRecusar = async (id: number) => {
    if (!confirm("Deseja recusar esta solicitação? Esta ação não pode ser desfeita.")) return;
    const res = await fetch(`/api/admin/solicitacoes/${id}/recusar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      fetchSolicitacoes();
      fetchStats();
    } else {
      alert("Erro ao recusar solicitação.");
    }
  };

  const handleBloquear = async (id: number, action: 'bloquear' | 'desbloquear') => {
    const res = await fetch(`/api/admin/clientes/${id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      fetchClientes();
      fetchStats();
    }
  };

const handleUpdatePlano = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Agora enviamos TODOS os dados do cliente de uma vez para a rota principal
      const res = await fetch(`/api/admin/clientes/${editPlano.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editPlano)
      });

      if (res.ok) {
        setEditPlano(null);
        fetchClientes();
        fetchFinanceiro();
        fetchStats();
        alert("Dados do cliente atualizados com sucesso!");
      } else {
        const text = await res.text();
        alert(`Erro do Servidor ao editar: ${text}`);
      }
    } catch (err) {
      alert("Erro de conexão ao tentar editar.");
    }
  };

const handleUpdateSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha && novaSenha.length < 6) {
      alert("A senha de login deve ter pelo menos 6 caracteres.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/clientes/${editSenha.id}/senha`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          nova_senha: novaSenha,
          senha_admin: novaSenhaAdmin,
          senha_caixa: novaSenhaCaixa
        })
      });
      if (res.ok) {
        setEditSenha(null);
        setNovaSenha('');
        setNovaSenhaAdmin('');
        setNovaSenhaCaixa('');
        setNovaSenhaVisivel(false);
        fetchClientes();
        alert("Senhas atualizadas com sucesso!");
      } else {
        const text = await res.text();
        alert(`Erro ao alterar senha: ${text}`);
      }
    } catch (err) {
      alert("Erro de conexão ao tentar alterar as senhas.");
    }
  };

  const handleDeleteCliente = async (id: number) => {
    if (!confirm("⚠️ ATENÇÃO: Isso excluirá TODOS os dados deste cliente (produtos, pedidos, estoque, etc) permanentemente. Deseja continuar?")) return;
    
    try {
      const res = await fetch(`/api/admin/clientes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        fetchClientes();
        fetchStats();
        fetchFinanceiro();
        alert("Cliente excluído com sucesso!");
      } else {
        const text = await res.text();
        alert(`Erro do Servidor ao excluir cliente: ${text}`);
      }
    } catch (err) {
      alert("Erro de conexão ao tentar excluir cliente.");
    }
  };

  const handleDisconnectCliente = async (id: number) => {
    if (!confirm("Deseja forçar a desconexão deste cliente? Ele precisará fazer login novamente.")) return;
    
    try {
      const res = await fetch(`/api/admin/clientes/${id}/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        fetchClientes();
        alert("Cliente desconectado com sucesso! O token foi invalidado.");
      } else {
        const text = await res.text();
        alert(`Erro ao desconectar: ${text}`);
      }
    } catch (err) {
      alert("Erro de conexão ao tentar desconectar.");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f4ff' }}>
              Flow<span style={{ color: '#06b6d4' }}>PDV</span>
            </div>
            <span style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: 4 }}>
              RM Tecnologia
            </span>
            <p className="text-zinc-500" style={{ marginTop: 8, fontSize: '0.85rem' }}>Painel Administrativo · Gestão de SaaS</p>
          </div>
          <Card className="p-8 bg-zinc-900 border-zinc-800">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Usuário</label>
                <input
                  required
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-white outline-none transition-all"
                  value={loginForm.usuario}
                  onChange={e => setLoginForm({...loginForm, usuario: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Senha</label>
                <input
                  required
                  type="password"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-white outline-none transition-all"
                  value={loginForm.senha}
                  onChange={e => setLoginForm({...loginForm, senha: e.target.value})}
                />
              </div>
              <Button type="submit" className="w-full py-4 bg-white text-zinc-950 hover:bg-zinc-200" disabled={loading}>
                {loading ? "Autenticando..." : "Entrar no Painel"}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-zinc-900 text-white p-4 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f4ff', display: 'flex', alignItems: 'center', gap: 8 }}>
            Flow<span style={{ color: '#06b6d4' }}>PDV</span>
            <span style={{ fontSize: '0.58rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Sans, system-ui, sans-serif' }}>RM Tecnologia</span>
          </div>
          <div>
            <h1 className="font-bold leading-none">RM PDV SaaS</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-1">Painel de Controle</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { localStorage.removeItem('admin_token'); setToken(null); }}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 bg-white border-r border-zinc-200 p-4 space-y-2 hidden md:block">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'dashboard' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('solicitacoes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'solicitacoes' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <Activity size={18} /> Solicitações
            {stats?.pendentes > 0 && <span className="ml-auto w-5 h-5 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">{stats.pendentes}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('clientes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'clientes' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <Users size={18} /> Clientes
          </button>
          <button 
            onClick={() => setActiveTab('financeiro')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'financeiro' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            <DollarSign size={18} /> Financeiro
            {financeiro?.proximos_vencimentos?.some((v: any) => v.dias <= 3) && (
              <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            )}
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Clientes</p>
                  <h3 className="text-3xl font-black text-zinc-900">{stats?.total || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-emerald-500">
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Ativos</p>
                  <h3 className="text-3xl font-black text-zinc-900">{stats?.ativos || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-amber-500">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Pendentes</p>
                  <h3 className="text-3xl font-black text-zinc-900">{stats?.pendentes || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-red-500">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Bloqueados</p>
                  <h3 className="text-3xl font-black text-zinc-900">{stats?.bloqueados || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-zinc-400">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Expirados</p>
                  <h3 className="text-3xl font-black text-zinc-900">{stats?.expirados || 0}</h3>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2"><Activity size={18} /> Solicitações Recentes</h3>
                  <div className="space-y-4">
                    {solicitacoes.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div>
                          <p className="font-bold text-zinc-900">{s.nome_estabelecimento}</p>
                          <p className="text-xs text-zinc-500">{s.cidade} • {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${s.status === 'pendente' ? 'bg-amber-100 text-amber-600' : s.status === 'aprovado' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-6">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2"><Users size={18} /> Últimos Clientes</h3>
                  <div className="space-y-4">
                    {clientes.slice(0, 5).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div>
                          <p className="font-bold text-zinc-900">{c.nome_estabelecimento}</p>
                          <p className="text-xs text-zinc-500">
                            Expira em: {(c.vencimento || c.trial_fim) ? new Date(c.vencimento ?? c.trial_fim).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${c.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'solicitacoes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-zinc-900">Solicitações de Acesso</h2>
                <div className="flex p-1 bg-zinc-200 rounded-xl">
                  {['todas', 'pendente', 'aprovado', 'recusado'].map(f => (
                    <button 
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize ${filter === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <Card className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Estabelecimento</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Responsável</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Contato</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cidade</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {solicitacoes.filter(s => filter === 'todas' || s.status === filter).map(s => (
                      <tr key={s.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-zinc-900">{s.nome_estabelecimento}</p>
                          <p className="text-xs text-zinc-500">{s.documento_tipo}: {s.documento_numero}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">{s.nome_responsavel}</td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-zinc-600">{s.email}</p>
                          <p className="text-xs text-emerald-600 font-medium">{s.whatsapp}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">{s.cidade}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${s.status === 'pendente' ? 'bg-amber-100 text-amber-600' : s.status === 'aprovado' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {s.status === 'pendente' && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleAprovar(s.id)} className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors" title="Aprovar">
                                <UserCheck size={16} />
                              </button>
                              <button onClick={() => handleRecusar(s.id)} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors" title="Recusar">
                                <UserX size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}

          {activeTab === 'clientes' && (
            <>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-zinc-900">Gerenciamento de Clientes</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all w-64"
                  />
                </div>
              </div>

              <Card className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-100">
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Estabelecimento</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Acesso</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Plano & Valor</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Vencimento</th>
                      <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {clientes
                      .filter(c => 
                        c.nome_estabelecimento?.toLowerCase().includes(buscaCliente.toLowerCase()) || 
                        c.usuario?.toLowerCase().includes(buscaCliente.toLowerCase())
                      )
                      .map((c: any) => {
                      const diasRestantes = c.vencimento 
                        ? Math.ceil((new Date(c.vencimento).getTime() - Date.now()) / 86400000)
                        : c.trial_fim ? Math.ceil((new Date(c.trial_fim).getTime() - Date.now()) / 86400000) : null;
                      
                      const isOnline = c.ultimo_acesso && (Date.now() - new Date(c.ultimo_acesso).getTime() < 86400000);

                      return (
                        <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-300'}`} title={isOnline ? 'Online (Acesso Recente)' : 'Offline'} />
                              <div>
                                <p className="font-bold text-zinc-900">{c.nome_estabelecimento}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">{c.documento_tipo}: {c.documento_numero}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <UserIcon size={14} className="text-zinc-400" />
                                <span className="font-mono text-sm text-zinc-700">{c.usuario}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Lock size={14} className="text-zinc-400" />
                                <span className="font-mono text-xs text-zinc-400 italic">
                                  Use "Alterar Senhas" para redefinir
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                c.plano === 'trial' ? 'bg-purple-100 text-purple-700' : 
                                c.plano === 'anual' ? 'bg-blue-100 text-blue-700' : 
                                c.plano === 'trimestral' ? 'bg-amber-100 text-amber-700' :
                                'bg-zinc-100 text-zinc-700'
                              }`}>
                                {c.plano || 'Trial'}
                              </span>
                              <p className="text-xs font-bold text-zinc-500">
                                R$ {c.valor_plano ? c.valor_plano.toFixed(2) : '0.00'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                  {c.status}
                                </span>
                                {diasRestantes !== null && (
                                  <span className={`font-bold text-xs ${diasRestantes > 5 ? 'text-emerald-600' : diasRestantes > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                                    {diasRestantes}d
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                                Exp: {c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : c.trial_fim ? new Date(c.trial_fim).toLocaleDateString('pt-BR') : '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => { setSubUsersCliente(c); fetchSubUsers(c.id); }}
                                className="p-2 bg-zinc-50 text-zinc-600 rounded-lg hover:bg-zinc-900 hover:text-white transition-colors"
                                title="Ver Sub-Usuários"
                              >
                                <Users2 size={16} />
                              </button>
                              <button
                                onClick={() => setEditPlano(c)}
                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                title="Editar Cliente e Plano"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => { 
                                  setEditSenha(c); 
                                  setNovaSenha(''); 
                                  setNovaSenhaAdmin(c.senha_admin || '123321');
                                  setNovaSenhaCaixa(c.senha_caixa || '123321');
                                  setNovaSenhaVisivel(false); 
                                }}
                                className="p-2 bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 transition-colors"
                                title="Alterar Senhas do Cliente"
                              >
                                <KeyRound size={16} />
                              </button>
                              <button
                                onClick={() => handleBloquear(c.id, c.status === 'ativo' ? 'bloquear' : 'desbloquear')}
                                className={`p-2 rounded-lg transition-colors ${c.status === 'ativo' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                                title={c.status === 'ativo' ? 'Bloquear Acesso' : 'Desbloquear Acesso'}
                              >
                                {c.status === 'ativo' ? <Lock size={16} /> : <UserCheck size={16} />}
                              </button>
                              <button
                                onClick={() => handleDisconnectCliente(c.id)}
                                className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
                                title="Desconectar Cliente"
                              >
                                <LogOut size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteCliente(c.id)}
                                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                title="Excluir Cliente Permanentemente"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* ── Drawer de Sub-Usuários ── */}
            {subUsersCliente && (
              <div className="fixed inset-0 z-50 flex">
                <div className="flex-1 bg-black/40" onClick={() => setSubUsersCliente(null)} />
                <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-zinc-900">Sub-Usuários</h3>
                      <p className="text-xs text-zinc-400">{subUsersCliente.nome_estabelecimento}</p>
                    </div>
                    <button onClick={() => setSubUsersCliente(null)} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Lista */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {subUsersLoading ? (
                      <p className="text-sm text-zinc-400 text-center py-10">Carregando...</p>
                    ) : subUsers.length === 0 ? (
                      <div className="text-center py-10">
                        <Users2 size={32} className="mx-auto text-zinc-200 mb-2" />
                        <p className="text-sm text-zinc-400">Nenhum sub-usuário criado</p>
                      </div>
                    ) : subUsers.map((u: any) => (
                      <div key={u.id} className={`p-4 rounded-xl border transition-all ${u.ativo ? 'border-zinc-100 bg-white' : 'border-red-100 bg-red-50/50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center">
                              <span className="text-white text-xs font-black">{(u.nome || u.username).charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{u.nome || u.username}</p>
                              <p className="text-[11px] text-zinc-400">@{u.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              u.cargo === 'dono' ? 'bg-amber-100 text-amber-700' :
                              u.cargo === 'gerente' ? 'bg-blue-100 text-blue-700' :
                              'bg-zinc-100 text-zinc-600'
                            }`}>
                              {u.cargo === 'dono' ? '👑 Dono' : u.cargo === 'gerente' ? '🔑 Gerente' : '🪪 Atendente'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                              {u.ativo ? 'Ativo' : 'Bloqueado'}
                            </span>
                          </div>
                        </div>
                        {/* Permissões */}
                        <div className="text-[10px] text-zinc-400 mb-3">
                          {u.permissoes ? `${u.permissoes.length} abas permitidas` : 'Acesso total'}
                        </div>
                        {/* Ações */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggleSubUser(subUsersCliente.id, u.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              u.ativo ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                          >
                            {u.ativo ? <><ShieldOff size={12} /> Bloquear</> : <><ShieldCheck size={12} /> Ativar</>}
                          </button>
                          <button
                            onClick={() => { setResetSenhaUser(u); setNovaSenhaUser(''); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-lg text-xs font-bold transition-all"
                          >
                            <KeyRound size={12} /> Resetar Senha
                          </button>
                        </div>
                        {/* Reset senha inline */}
                        {resetSenhaUser?.id === u.id && (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="password"
                              value={novaSenhaUser}
                              onChange={e => setNovaSenhaUser(e.target.value)}
                              placeholder="Nova senha..."
                              className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-zinc-400"
                            />
                            <button
                              onClick={handleResetSenhaUser}
                              className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-700 transition-colors"
                            >
                              Salvar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
          )}

          {activeTab === 'financeiro' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-zinc-900 text-white">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">MRR (Mensal)</p>
                  <h3 className="text-3xl font-black">R$ {(financeiro?.mrr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">ARR (Anual)</p>
                  <h3 className="text-3xl font-black text-zinc-900">R$ {(financeiro?.arr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Clientes Pagantes</p>
                  <h3 className="text-3xl font-black text-zinc-900">{financeiro?.clientes_pagantes || 0}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Ticket Médio</p>
                  <h3 className="text-3xl font-black text-zinc-900">R$ {(financeiro?.ticket_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="p-6 lg:col-span-2">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2"><Activity size={18} /> Faturamento (Últimos 6 meses)</h3>
                  <div className="h-64 flex items-end gap-4 px-4">
                    {financeiro?.faturamento_mensal?.map((m: any) => (
                      <div key={m.mes} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full bg-zinc-100 rounded-t-xl relative overflow-hidden flex items-end" style={{ height: '100%' }}>
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(m.total / Math.max(...financeiro.faturamento_mensal.map((x: any) => x.total))) * 100}%` }}
                            className="w-full bg-zinc-900 group-hover:bg-emerald-500 transition-colors"
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap">
                            R$ {m.total.toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{m.mes}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-6">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2"><Calendar size={18} /> Próximos Vencimentos</h3>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {financeiro?.proximos_vencimentos?.map((v: any) => (
                      <div key={v.nome_estabelecimento} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">{v.nome_estabelecimento}</p>
                            <p className="text-[10px] text-zinc-500 uppercase font-bold">{v.plano} • R$ {v.valor_plano.toLocaleString('pt-BR')}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.dias <= 0 ? 'bg-red-100 text-red-600' : v.dias <= 3 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {v.dias <= 0 ? 'Vencido' : `Em ${v.dias}d`}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button 
                            onClick={() => setEditPlano(clientes.find(c => c.nome_estabelecimento === v.nome_estabelecimento))}
                            className="flex-1 py-2 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors"
                          >
                            Renovar
                          </button>
                          <button 
                            onClick={() => {
                              const text = `Olá, sua licença do FlowPDV vence em ${new Date(v.vencimento).toLocaleDateString()}. Deseja renovar?`;
                              window.open(`https://wa.me/${v.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
                            }}
                            className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors"
                          >
                            <Smartphone size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className="p-6">
                <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2"><Users size={18} /> Todos os Clientes Pagantes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
                        <th className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Plano</th>
                        <th className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor</th>
                        <th className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Vencimento</th>
                        <th className="py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Último Acesso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {financeiro?.todos_pagantes?.map((c: any) => (
                        <tr key={c.nome_estabelecimento} className="hover:bg-zinc-50 transition-colors">
                          <td className="py-4 font-bold text-zinc-900">{c.nome_estabelecimento}</td>
                          <td className="py-4">
                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full text-[10px] font-bold uppercase">{c.plano}</span>
                          </td>
                          <td className="py-4 text-sm text-zinc-600 font-mono">R$ {c.valor_plano.toLocaleString('pt-BR')}</td>
                          <td className="py-4 text-sm text-zinc-600">{new Date(c.vencimento).toLocaleDateString()}</td>
                          <td className="py-4 text-xs text-zinc-400">{new Date(c.ultimo_acesso).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {editPlano && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 overflow-y-auto max-h-[90vh]">
              <h3 className="text-2xl font-bold text-zinc-900 mb-6">Editar Cliente: {editPlano.nome_estabelecimento}</h3>
              <form onSubmit={handleUpdatePlano} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome do Estabelecimento</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.nome_estabelecimento}
                      onChange={e => setEditPlano({...editPlano, nome_estabelecimento: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Razão Social</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.razao_social || ''}
                      onChange={e => setEditPlano({...editPlano, razao_social: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Documento ({editPlano.documento_tipo})</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.documento_numero}
                      onChange={e => setEditPlano({...editPlano, documento_numero: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Responsável</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.nome_responsavel}
                      onChange={e => setEditPlano({...editPlano, nome_responsavel: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">E-mail</label>
                    <input 
                      type="email"
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.email}
                      onChange={e => setEditPlano({...editPlano, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">WhatsApp</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.whatsapp}
                      onChange={e => setEditPlano({...editPlano, whatsapp: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Cidade</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.cidade}
                      onChange={e => setEditPlano({...editPlano, cidade: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</label>
                    <select 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.status}
                      onChange={e => setEditPlano({...editPlano, status: e.target.value})}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="bloqueado">Bloqueado</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-zinc-100 pt-6">
                  <h4 className="text-sm font-bold text-zinc-900 mb-4">Configurações de Plano</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Plano</label>
                      <select 
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                        value={editPlano.plano}
                        onChange={e => setEditPlano({...editPlano, plano: e.target.value})}
                      >
                        <option value="trial">Trial</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="anual">Anual</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Valor (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                        value={editPlano.valor_plano}
                        onChange={e => setEditPlano({...editPlano, valor_plano: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Vencimento</label>
                      <input 
                        type="date"
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                        value={editPlano.vencimento ? new Date(editPlano.vencimento).toISOString().split('T')[0] : ''}
                        onChange={e => setEditPlano({...editPlano, vencimento: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="submit" className="flex-1">Salvar Alterações</Button>
                  <Button variant="secondary" onClick={() => setEditPlano(null)}>Cancelar</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editSenha && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <KeyRound size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Alterar Senha</h3>
                  <p className="text-sm text-zinc-500">{editSenha.nome_estabelecimento}</p>
                  <p className="text-xs font-mono text-zinc-400">Usuário: {editSenha.usuario}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">A nova senha será aplicada imediatamente. O cliente poderá fazer login com ela na próxima tentativa.</p>
              </div>

<form onSubmit={handleUpdateSenha} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Senha de Login do Cliente</label>
                  <div className="relative">
                    <input
                      type={novaSenhaVisivel ? 'text' : 'password'}
                      placeholder="Deixe em branco para não alterar"
                      className="w-full px-4 py-3 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-mono"
                      value={novaSenha}
                      onChange={e => setNovaSenha(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setNovaSenhaVisivel(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
                    >
                      {novaSenhaVisivel ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Sub-senha: Gerência</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold text-amber-900"
                      value={novaSenhaAdmin}
                      onChange={e => setNovaSenhaAdmin(e.target.value)}
                    />
                    <p className="text-[10px] text-zinc-400">Acesso a relatórios e exclusões.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Sub-senha: Caixa</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono font-bold text-emerald-900"
                      value={novaSenhaCaixa}
                      onChange={e => setNovaSenhaCaixa(e.target.value)}
                    />
                    <p className="text-[10px] text-zinc-400">Abertura e fechamento de caixa.</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700">
                    <KeyRound size={16} /> Salvar Senhas
                  </Button>
                  <Button variant="secondary" onClick={() => { setEditSenha(null); setNovaSenha(''); }}>Cancelar</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showCreds && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check size={40} />
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 mb-2">Cliente Aprovado!</h3>
              <p className="text-zinc-500 mb-8">Copie as credenciais abaixo e envie para o cliente.</p>
              
              <div className="space-y-4 text-left mb-8">
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 relative group">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Usuário</p>
                  <p className="font-mono font-bold text-zinc-900">{showCreds.usuario}</p>
                </div>
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 relative group">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Senha Temporária</p>
                  <p className="font-mono font-bold text-zinc-900">{showCreds.senha}</p>
                </div>
                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Período de Teste — Expira em</p>
                  <p className="font-bold text-zinc-900">{new Date(showCreds.vencimento ?? showCreds.trial_fim).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    const expira = new Date(showCreds.vencimento ?? showCreds.trial_fim).toLocaleDateString('pt-BR');
                    const text = `FlowPDV - Credenciais de Acesso\n\nUsuário: ${showCreds.usuario}\nSenha: ${showCreds.senha}\nExpira em: ${expira}`;
                    navigator.clipboard.writeText(text);
                    alert("Copiado para a área de transferência!");
                  }}
                >
                  <Copy size={18} /> Copiar Tudo
                </Button>
                <Button variant="secondary" onClick={() => setShowCreds(null)}>Fechar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
