import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePaginatedList } from '../hooks/usePaginatedList';
import {
  LayoutDashboard,
  LogIn,
  LogOut,
  Trash2,
  DollarSign,
  User as UserIcon,
  Lock,
  AlertCircle,
  ArrowLeft,
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
  Package,
  Wallet,
  PackageSearch,
  Bike,
  Wrench,
  Ban,
  ShoppingCart,
  QrCode,
  RefreshCw,
  Menu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, Button } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';

type AdminActionPayloadField = { type: 'number' | 'text' | 'textarea'; label: string; required: boolean };

export default function AdminPanel() {
  const pendingEstoqueDeeplinkRef = useRef<number | null>(null);
  const pendingPedidoPdvRef = useRef<{ orderId: number; tab: 'active' | 'receipts'; orderCreatedAt?: string } | null>(null);
  const [pedidoDetalheModal, setPedidoDetalheModal] = useState<
    | null
    | {
        orderId: number;
        loading: boolean;
        err?: string;
        data?: { pedido: any; itens: any[]; pagamentos: any[] };
      }
  >(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clientes' | 'financeiro' | 'diagnosticos'>('clientes');
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
  const [diagnostics, setDiagnostics] = useState<{ tenants: { tenant_id: number; nome_estabelecimento: string; problems: any[] }[] } | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsActioning, setDiagnosticsActioning] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<{ id: number; nome_estabelecimento: string } | null>(null);
  const [tenantModule, setTenantModule] = useState<'diagnostico' | 'pedidos' | 'caixa' | 'estoque' | 'delivery'>('diagnostico');
  const [clientesSubTab, setClientesSubTab] = useState<'lista' | 'solicitacoes'>('lista');
  const [showAcoesMenu, setShowAcoesMenu] = useState(false);
  const [selectedProblemDetail, setSelectedProblemDetail] = useState<any>(null);
  const [pendingActionProblem, setPendingActionProblem] = useState<any>(null);
  const [actionToast, setActionToast] = useState<{ msg: string; success: boolean } | null>(null);
  const [actionConfirmModal, setActionConfirmModal] = useState<{
    action: string;
    label: string;
    impact: string;
    payloadTemplate?: Record<string, AdminActionPayloadField>;
  } | null>(null);
  const [actionConfirmReason, setActionConfirmReason] = useState('');
  const [actionConfirmPayload, setActionConfirmPayload] = useState<Record<string, string>>({});
  const [actionConfirmLoading, setActionConfirmLoading] = useState(false);
  const [actionResultLogs, setActionResultLogs] = useState<Array<{ id: number; usuario_nome: string; cargo: string; acao: string; detalhes: string | null; created_at: string }> | null>(null);
  const [tenantModuleData, setTenantModuleData] = useState<any>(null);
  const [tenantModuleLoading, setTenantModuleLoading] = useState(false);
  const [tenantModuleError, setTenantModuleError] = useState<string | null>(null);
  const [tenantLogs, setTenantLogs] = useState<Array<{ id: number; usuario_nome: string; cargo: string; acao: string; detalhes: string | null; created_at: string }>>([]);
  const [tenantLogsLoading, setTenantLogsLoading] = useState(false);
  const [tenantLogsError, setTenantLogsError] = useState<string | null>(null);
  const [adminNavOpen, setAdminNavOpen] = useState(false);

  // ── Listas paginadas para performance em listas grandes ─────────────────────
  const clientesFiltrados = useMemo(() =>
    clientes.filter((c: any) =>
      !buscaCliente.trim() ||
      c.nome_estabelecimento?.toLowerCase().includes(buscaCliente.toLowerCase()) ||
      c.usuario?.toLowerCase().includes(buscaCliente.toLowerCase())
    ),
    [clientes, buscaCliente]
  );
  const solicitacoesFiltradas = useMemo(() =>
    filter === 'todas' ? solicitacoes : solicitacoes.filter((s: any) => s.status === filter),
    [solicitacoes, filter]
  );
  const { visibleItems: clientesVisiveis, hasMore: hasMoreClientes, loadMore: loadMoreClientes } = usePaginatedList(clientesFiltrados, { pageSize: 50 });
  const { visibleItems: solicitacoesVisiveis, hasMore: hasMoreSolicitacoes, loadMore: loadMoreSolicitacoes } = usePaginatedList(solicitacoesFiltradas, { pageSize: 50 });
  const { visibleItems: tenantLogsVisiveis, hasMore: hasMoreTenantLogs, loadMore: loadMoreTenantLogs } = usePaginatedList(tenantLogs, { pageSize: 50 });

  const tenantsComProblemas = useMemo(
    () => (diagnostics?.tenants ?? []).filter((t: any) => t.problems?.length > 0),
    [diagnostics]
  );
  const { visibleItems: tenantsVisiveis, hasMore: hasMoreTenants, loadMore: loadMoreTenants, totalCount: totalTenants } = usePaginatedList(tenantsComProblemas, { pageSize: 20 });

  // ── Dark mode admin: classe global em html/body, CSS em index.css ────────────
  useEffect(() => {
    document.documentElement.classList.remove('flowpdv-dark');
    document.documentElement.classList.add('flowpdv-admin-dark');
    document.body.classList.add('flowpdv-admin-dark');
    return () => {
      document.documentElement.classList.remove('flowpdv-admin-dark');
      document.body.classList.remove('flowpdv-admin-dark');
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchSolicitacoes();
      fetchClientes();
      fetchFinanceiro();
    }
  }, [token]);

  useEffect(() => {
    if (token && activeTab === 'diagnosticos') fetchDiagnostics();
  }, [token, activeTab]);

  useEffect(() => {
    if (token && selectedTenantId && activeTab === 'clientes') fetchDiagnosticsForTenant(selectedTenantId);
  }, [token, selectedTenantId, activeTab]);

  const fetchTenantLogs = async (tenantId: number) => {
    setTenantLogsLoading(true);
    setTenantLogsError(null);
    try {
      const res = await fetch(`/api/admin/tenant/${tenantId}/logs?limit=15`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        setTenantLogs(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json().catch(() => ({}));
        setTenantLogsError((err as any)?.error || `Erro ${res.status}`);
      }
    } catch (e: any) {
      setTenantLogsError(e?.message || 'Erro de conexão');
    }
    setTenantLogsLoading(false);
  };

  useEffect(() => {
    if (token && selectedTenantId && activeTab === 'clientes') {
      fetchTenantLogs(selectedTenantId);
    } else {
      setTenantLogs([]);
      setTenantLogsError(null);
    }
  }, [token, selectedTenantId, activeTab]);

  const fetchTenantModuleData = async (tenantId: number, module: string) => {
    if (module === 'diagnostico') return;
    setTenantModuleLoading(true);
    setTenantModuleData(null);
    setTenantModuleError(null);
    try {
      const res = await fetch(`/api/admin/tenant/${tenantId}/${module}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) return handleAuthError();
      if (res.ok) {
        setTenantModuleData(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setTenantModuleError((err as any)?.error || `Erro ${res.status}`);
      }
    } catch (e: any) {
      setTenantModuleError(e?.message || 'Erro de conexão');
    }
    setTenantModuleLoading(false);
  };

  useEffect(() => {
    if (token && selectedTenantId && tenantModule !== 'diagnostico') {
      fetchTenantModuleData(selectedTenantId, tenantModule);
    } else {
      setTenantModuleData(null);
      setTenantModuleError(null);
    }
  }, [token, selectedTenantId, tenantModule]);

  const fetchFinanceiro = async () => {
    const res = await fetch('/api/admin/financeiro', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setFinanceiro(data);
    }
  };

  const fetchDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const res = await fetch('/api/admin/diagnostics', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      } else setDiagnostics(null);
    } catch { setDiagnostics(null); }
    setDiagnosticsLoading(false);
  };

  const fetchDiagnosticsForTenant = async (tenantId: number) => {
    setDiagnosticsLoading(true);
    try {
      const res = await fetch(`/api/admin/diagnostics?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) return handleAuthError();
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      } else setDiagnostics(null);
    } catch { setDiagnostics(null); }
    setDiagnosticsLoading(false);
  };

  const showActionToast = (msg: string, success: boolean) => {
    setActionToast({ msg, success });
    setTimeout(() => setActionToast(null), 2600);
  };

  const formatProblemDataLabel = (key: string): string => {
    const labels: Record<string, string> = {
      tenant_id: 'ID do tenant',
      caixa_id: 'ID do caixa',
      caixa_ids: 'IDs dos caixas',
      order_id: 'ID do pedido',
      order_number: 'Nº do pedido',
      current_status: 'Status atual',
      count: 'Quantidade',
      product_ids: 'IDs dos produtos',
    };
    return labels[key] ?? key;
  };

  const isOrderFinalStatus = (status?: string | null): boolean => {
    const s = String(status || '').toLowerCase();
    return s.includes('cancel') || s === 'concluído' || s === 'concluido' || s === 'entregue';
  };

  const getActionDescription = (problem: any): string => {
    if (problem.action === 'force_close') {
      const id = problem.data?.caixa_id ?? problem.data?.caixa_ids?.[0];
      return id ? `Forçar fechamento do caixa #${id}` : 'Forçar fechamento do caixa aberto mais antigo';
    }
    if (problem.action === 'fix_status') {
      const num = problem.data?.order_number ?? problem.data?.order_id ?? '—';
      return `Alterar status do pedido #${num} para "Concluído"`;
    }
    return 'Executar ação administrativa';
  };

  const handleDiagnosticAction = async (problem: any) => {
    if (problem.action !== 'fix_links') {
      setPendingActionProblem(problem);
      return;
    }
    await executeDiagnosticAction(problem);
  };

  const executeDiagnosticAction = async (problem: any) => {
    setPendingActionProblem(null);
    const key = `${problem.category}-${problem.data?.tenant_id}-${problem.data?.caixa_id ?? problem.data?.order_id ?? 'x'}`;
    setDiagnosticsActioning(key);
    try {
      let res: Response;
      if (problem.action === 'force_close' && problem.data?.tenant_id) {
        res = await fetch('/api/admin/caixa/force-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
          tenant_id: problem.data.tenant_id,
          caixa_id: problem.data.caixa_id ?? problem.data.caixa_ids?.[0],
        }),
        });
      } else if (problem.action === 'fix_status' && problem.data?.tenant_id && problem.data?.order_id) {
        res = await fetch('/api/admin/pedidos/fix-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            tenant_id: problem.data.tenant_id,
            order_id: problem.data.order_id,
            new_status: 'Concluído',
          }),
        });
      } else if (problem.action === 'fix_links') {
        res = await fetch('/api/admin/estoque/fix-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: problem.data?.tenant_id }),
        });
      } else {
        showActionToast('Ação não disponível para este problema.', false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        showActionToast('Ação executada com sucesso', true);
        if (selectedTenantId) {
          fetchDiagnosticsForTenant(selectedTenantId);
          fetchTenantLogs(selectedTenantId);
        } else {
          fetchDiagnostics();
        }
      } else {
        showActionToast(data.error || 'Erro ao executar ação', false);
      }
    } catch (e: any) {
      showActionToast(e?.message || 'Erro de conexão', false);
    } finally {
      setDiagnosticsActioning(null);
    }
  };

  const handleAuthError = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
  };

  const executeAdminAction = async () => {
    if (!actionConfirmModal || !selectedTenantId || actionConfirmReason.trim().length < 10) return;
    setActionConfirmLoading(true);
    try {
      const payload: Record<string, unknown> = {};
      if (actionConfirmModal.payloadTemplate) {
        for (const [key, cfg] of Object.entries(actionConfirmModal.payloadTemplate) as [string, AdminActionPayloadField][]) {
          const val = actionConfirmPayload[key];
          if (cfg.required && (!val || String(val).trim() === '')) {
            showActionToast(`Campo "${cfg.label}" é obrigatório`, false);
            setActionConfirmLoading(false);
            return;
          }
          if (cfg.type === 'number') {
            if (val !== undefined && val !== '') payload[key] = Number(val);
          } else if (cfg.type === 'text' || cfg.type === 'textarea') {
            if (val !== undefined && val !== '') payload[key] = String(val).trim();
          }
        }
      }
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: actionConfirmModal.action,
          tenant_id: selectedTenantId,
          payload: Object.keys(payload).length ? payload : undefined,
          reason: actionConfirmReason.trim(),
        }),
      });
      const data = await res.json();
      const acted = actionConfirmModal.action;
      if (res.ok && data.success) {
        setActionConfirmModal(null);
        setActionConfirmReason('');
        setActionConfirmPayload({});
        setShowAcoesMenu(false);
        showActionToast('Ação executada com sucesso', true);
        if (acted === 'login_as_cliente' && data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user_cargo', 'dono');
          localStorage.setItem('user_nome', data.nome_estabelecimento || data.usuario || '');
          localStorage.setItem('user_permissoes', '');
          if (pendingEstoqueDeeplinkRef.current != null) {
            localStorage.setItem(
              'flowpdv_estoque_deeplink',
              JSON.stringify({ tab: 'ficha', productId: pendingEstoqueDeeplinkRef.current })
            );
            localStorage.setItem('flowpdv_initial_nav_tab', 'estoque');
            pendingEstoqueDeeplinkRef.current = null;
          } else if (pendingPedidoPdvRef.current != null) {
            const { orderId, tab, orderCreatedAt } = pendingPedidoPdvRef.current;
            localStorage.setItem('flowpdv_orders_deeplink', JSON.stringify({ orderId, tab, orderCreatedAt }));
            localStorage.setItem('flowpdv_initial_nav_tab', 'orders');
            pendingPedidoPdvRef.current = null;
          }
          window.open('/', '_blank', 'noopener');
          showActionToast('App do cliente aberto em nova aba', true);
          return;
        }
        pendingEstoqueDeeplinkRef.current = null;
        pendingPedidoPdvRef.current = null;
        if (acted === 'open_caixa' || acted === 'force_close_caixa' || acted === 'force_cancel_order' || acted === 'force_pix_check') {
          fetchDiagnosticsForTenant(selectedTenantId);
          if (tenantModule !== 'diagnostico') fetchTenantModuleData(selectedTenantId, tenantModule);
        }
        if (acted === 'recalculate_stock') {
          fetchDiagnosticsForTenant(selectedTenantId);
          if (tenantModule !== 'diagnostico') fetchTenantModuleData(selectedTenantId, tenantModule);
        }
        if (acted === 'delivery_enable' || acted === 'delivery_disable') {
          fetchDiagnosticsForTenant(selectedTenantId);
          if (tenantModule !== 'diagnostico') fetchTenantModuleData(selectedTenantId, tenantModule);
        }
        if (acted === 'ver_logs_sistema' && Array.isArray(data.logs)) {
          setActionResultLogs(data.logs);
          return;
        }
        if (selectedTenantId && acted !== 'login_as_cliente') fetchTenantLogs(selectedTenantId);
      } else {
        showActionToast(data.error || 'Erro ao executar ação', false);
      }
    } catch (e: any) {
      showActionToast(e?.message || 'Erro de conexão', false);
    } finally {
      setActionConfirmLoading(false);
    }
  };

  const openActionConfirm = (cfg: {
    action: string;
    label: string;
    impact: string;
    payloadTemplate?: Record<string, AdminActionPayloadField>;
    initialPayload?: Record<string, string>;
  }) => {
    const { initialPayload, ...modal } = cfg;
    setActionConfirmModal(modal);
    setActionConfirmReason('');
    setActionConfirmPayload(
      Object.fromEntries(Object.keys(cfg.payloadTemplate || {}).map((k) => [k, initialPayload?.[k] ?? '']))
    );
    setActionResultLogs(null);
    setShowAcoesMenu(false);
  };

  const dismissActionConfirmModal = () => {
    if (!actionConfirmLoading) {
      setActionConfirmModal(null);
      setActionResultLogs(null);
      pendingEstoqueDeeplinkRef.current = null;
      pendingPedidoPdvRef.current = null;
    }
  };

  const openPedidoDetalhe = async (orderId: number) => {
    if (!selectedTenantId || !token) return;
    setPedidoDetalheModal({ orderId, loading: true });
    try {
      const res = await fetch(`/api/admin/tenant/${selectedTenantId}/pedidos/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar pedido');
      setPedidoDetalheModal({ orderId, loading: false, data: json });
    } catch (e: any) {
      setPedidoDetalheModal({ orderId, loading: false, err: e?.message || 'Erro ao carregar' });
    }
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
        showActionToast("Cliente excluído com sucesso", true);
      } else {
        const text = await res.text();
        showActionToast(text || "Erro ao excluir cliente", false);
      }
    } catch (err) {
      showActionToast("Erro de conexão ao tentar excluir cliente", false);
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
        showActionToast("Cliente desconectado com sucesso", true);
      } else {
        const text = await res.text();
        showActionToast(text || "Erro ao desconectar", false);
      }
    } catch (err) {
      showActionToast("Erro de conexão ao tentar desconectar", false);
    }
  };

  const renderClientesContent = () => {
    if (selectedTenantId && selectedTenant) {
      const cliente = clientes.find((c: any) => c.id === selectedTenantId);
      const tenantData = diagnostics?.tenants?.find((t: any) => t.tenant_id === selectedTenantId);
      const allProblems = tenantData?.problems ?? [];
      const categoryMap: Record<string, string> = {
        diagnostico: '',
        pedidos: 'pedidos',
        caixa: 'caixa',
        estoque: 'estoque',
        delivery: 'delivery',
      };
      const filterCat = categoryMap[tenantModule];
      const problems = filterCat ? allProblems.filter((p: any) => p.category === filterCat) : allProblems;

      const severityStyles: Record<string, { bg: string; border: string; accent: string }> = {
        high: { bg: 'bg-red-950', border: 'border-red-800', accent: 'border-l-4 border-l-red-500' },
        medium: { bg: 'bg-amber-950', border: 'border-amber-800', accent: 'border-l-4 border-l-amber-500' },
        low: { bg: 'bg-zinc-800', border: 'border-zinc-800', accent: 'border-l-4 border-l-zinc-500' },
      };

      return (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
              <button
                type="button"
                onClick={() => { setSelectedTenantId(null); setSelectedTenant(null); setShowAcoesMenu(false); }}
                className="p-2.5 min-h-[44px] rounded-xl hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors flex items-center gap-2 shrink-0 self-start"
              >
                <ArrowLeft size={18} /> Voltar
              </button>
              <div className="border-l-0 sm:border-l border-zinc-800 pl-0 sm:pl-4 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white break-words">{selectedTenant.nome_estabelecimento}</h2>
                <p className="text-xs text-zinc-400">ID: {selectedTenantId} · Painel de suporte</p>
              </div>
            </div>
            <div className="relative w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowAcoesMenu(!showAcoesMenu)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors"
              >
                Ações <span className="text-zinc-200">▼</span>
              </button>
              {showAcoesMenu && cliente && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowAcoesMenu(false)} />
                  <div className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-2 w-full sm:w-56 max-h-[min(70dvh,520px)] overflow-y-auto bg-zinc-900 rounded-xl shadow-xl border border-zinc-800 py-2 z-[70]">
                    <button onClick={() => { setEditPlano(cliente); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <Pencil size={16} /> Editar cliente
                    </button>
                    <button onClick={() => { setEditSenha(cliente); setNovaSenha(''); setNovaSenhaAdmin(cliente.senha_admin || '123321'); setNovaSenhaCaixa(cliente.senha_caixa || '123321'); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <KeyRound size={16} /> Gerenciar senhas
                    </button>
                    <button onClick={() => { setSubUsersCliente(cliente); fetchSubUsers(cliente.id); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <Users2 size={16} /> Sub-usuários
                    </button>
                    <button onClick={() => { handleBloquear(cliente.id, cliente.status === 'ativo' ? 'bloquear' : 'desbloquear'); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      {cliente.status === 'ativo' ? <><Lock size={16} /> Bloquear</> : <><UserCheck size={16} /> Desbloquear</>}
                    </button>
                    <button onClick={() => { handleDisconnectCliente(cliente.id); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <LogOut size={16} /> Desconectar
                    </button>
                    <button onClick={() => { handleDeleteCliente(cliente.id); setShowAcoesMenu(false); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-900 flex items-center gap-2">
                      <Trash2 size={16} /> Excluir
                    </button>
                    <div className="border-t border-zinc-800 my-2" />
                    <button type="button" onClick={() => openActionConfirm({ action: 'login_as_cliente', label: 'Logar como cliente', impact: 'Você será redirecionado para o sistema como se fosse o dono deste estabelecimento. Use com responsabilidade.' })} className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm text-violet-300 hover:bg-violet-950/80 flex items-center gap-2">
                      <LogIn size={16} /> Logar como cliente
                    </button>
                    <button onClick={() => openActionConfirm({
                      action: 'force_close_caixa',
                      label: 'Forçar fechamento de caixa',
                      impact: 'O caixa aberto será fechado. Informe o valor contado e observação, se houver. Esta ação é irreversível.',
                      payloadTemplate: {
                        valor_contado: { type: 'number', label: 'Valor contado (R$)', required: false },
                        observacao: { type: 'textarea', label: 'Observação', required: false },
                      },
                      initialPayload: { valor_contado: '' },
                    })} className="w-full px-4 py-2 text-left text-sm text-amber-600 hover:bg-amber-900 flex items-center gap-2">
                      <Wallet size={16} /> Forçar fechamento de caixa
                    </button>
                    <button onClick={() => openActionConfirm({ action: 'force_cancel_order', label: 'Forçar cancelamento de pedido', impact: 'O pedido será cancelado permanentemente. Informe o ID do pedido abaixo.', payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } } })} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-900 flex items-center gap-2">
                      <Package size={16} /> Forçar cancelamento de pedido
                    </button>
                    <div className="border-t border-zinc-800 my-2" />
                    <button onClick={() => openActionConfirm({ action: 'ver_logs_sistema', label: 'Ver logs do sistema', impact: 'Exibe os últimos logs de atividade do estabelecimento para suporte e diagnóstico.' })} className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <Activity size={16} /> Ver logs do sistema
                    </button>
                    <button onClick={() => openActionConfirm({ action: 'clear_sessions', label: 'Limpar sessões', impact: 'Todos os usuários serão desconectados. Será necessário fazer login novamente.' })} className="w-full px-4 py-2 text-left text-sm text-amber-600 hover:bg-amber-900 flex items-center gap-2">
                      <LogOut size={16} /> Limpar sessões
                    </button>
                    <button onClick={() => openActionConfirm({ action: 'force_pix_check', label: 'Marcar PIX como pago', impact: 'Marca manualmente um pedido PIX como pago. Use quando o pagamento foi confirmado fora do sistema.', payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } } })} className="w-full px-4 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-900 flex items-center gap-2">
                      <DollarSign size={16} /> Marcar PIX como pago
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex p-1 bg-zinc-800 rounded-xl w-full max-w-full sm:w-fit overflow-x-auto overflow-y-hidden touch-pan-x [-webkit-overflow-scrolling:touch]">
            {(['diagnostico', 'pedidos', 'caixa', 'estoque', 'delivery'] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setTenantModule(m)}
                className={`shrink-0 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 capitalize ${tenantModule === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400'}`}
              >
                {m === 'diagnostico' && <Wrench size={14} />}
                {m === 'pedidos' && <Package size={14} />}
                {m === 'caixa' && <Wallet size={14} />}
                {m === 'estoque' && <PackageSearch size={14} />}
                {m === 'delivery' && <Bike size={14} />}
                {m}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">Histórico recente</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Últimas ações e eventos do estabelecimento</p>
              </div>
              <button
                onClick={() => selectedTenantId && fetchTenantLogs(selectedTenantId)}
                disabled={tenantLogsLoading}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 disabled:opacity-50 transition-colors"
                title="Atualizar"
              >
                <RefreshCw size={16} className={tenantLogsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto">
              {tenantLogsLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-zinc-400" role="status" aria-label="Carregando histórico">
                  <Spinner className="h-7 w-7" />
                  <span className="text-sm">Carregando histórico…</span>
                </div>
              ) : tenantLogsError ? (
                <div className="p-6 text-center">
                  <p className="text-red-600 text-sm font-medium mb-2">{tenantLogsError}</p>
                  <Button onClick={() => selectedTenantId && fetchTenantLogs(selectedTenantId)} variant="secondary" className="text-xs">
                    Tentar novamente
                  </Button>
                </div>
              ) : tenantLogsVisiveis.length === 0 ? (
                <EmptyState
                  variant="admin"
                  icon={Activity}
                  title="Nenhum registro recente"
                  description="Ações do estabelecimento aparecerão aqui."
                  className="!py-10 !sm:py-12"
                />
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {tenantLogsVisiveis.map((log) => {
                    const dt = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
                    const userLabel = log.usuario_nome ? `${log.usuario_nome}${log.cargo ? ` (${log.cargo})` : ''}` : null;
                    const detalhes = log.detalhes || '';
                    const truncated = detalhes.length > 80 ? `${detalhes.slice(0, 80)}…` : detalhes;
                    return (
                      <li key={log.id} className="px-4 py-2.5 text-sm">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-zinc-400 text-xs font-mono shrink-0">{dt}</span>
                          {userLabel && <span className="text-zinc-400 text-xs shrink-0">{userLabel}</span>}
                        </div>
                        <p className="font-medium text-white mt-0.5">{log.acao}</p>
                        {truncated && <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2">{truncated}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {hasMoreTenantLogs && (
                <div className="flex justify-center py-3 border-t border-zinc-800">
                  <button onClick={loadMoreTenantLogs}
                    className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg transition-all">
                    Carregar mais
                  </button>
                </div>
              )}
            </div>
          </Card>

          {tenantModule === 'diagnostico' ? (
            diagnosticsLoading && !diagnostics ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center gap-3 text-zinc-400" role="status" aria-label="Carregando diagnósticos">
                  <Spinner className="h-8 w-8" />
                  <span className="text-sm font-medium">Carregando diagnósticos…</span>
                </div>
              </Card>
            ) : problems.length === 0 ? (
              <Card className="p-8 text-center">
                <Check className="mx-auto text-emerald-500 mb-3" size={48} />
                <p className="font-bold text-white">Nenhum problema detectado</p>
                <p className="text-sm text-zinc-400 mt-1">Este módulo está em ordem.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {problems.map((problem: any, idx: number) => {
                  const key = `${problem.id}-${selectedTenantId}-${idx}-${problem.data?.order_id ?? problem.data?.caixa_id ?? idx}`;
                  const actioning = diagnosticsActioning === `${problem.category}-${problem.data?.tenant_id}-${problem.data?.caixa_id ?? problem.data?.order_id ?? 'x'}`;
                  const style = severityStyles[problem.severity as string] ?? severityStyles.low;
                  const ids = problem.data?.caixa_ids ?? (problem.data?.caixa_id ? [problem.data.caixa_id] : []);
                  const extra = problem.category === 'caixa' && ids.length
                    ? ids.map((id: number) => `Caixa #${id}`).join(', ')
                    : problem.category === 'pedidos' && problem.data?.order_id
                      ? `Pedido #${problem.data?.order_number ?? problem.data?.order_id}`
                      : problem.category === 'estoque' && problem.data?.count
                        ? `${problem.data.count} produto(s)`
                        : null;
                  return (
                    <div key={key} className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between p-4 rounded-xl border ${style.bg} ${style.border} ${style.accent}`}>
                      <div className="flex-1 min-w-0">
                        {extra && <p className="text-[10px] text-zinc-400 font-mono mb-0.5">{extra}</p>}
                        <p className="font-bold text-white text-sm">{problem.title}</p>
                        <p className="text-xs text-zinc-300 mt-0.5">{problem.description}</p>
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          problem.category === 'caixa' ? 'bg-blue-900 text-blue-300' :
                          problem.category === 'pedidos' ? 'bg-violet-900 text-violet-300' : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          {problem.category}
                        </span>
                      </div>
                      <Button
                        onClick={() => handleDiagnosticAction(problem)}
                        disabled={actioning || problem.action === 'fix_links'}
                        variant="secondary"
                        className="ml-0 sm:ml-4 shrink-0 w-full sm:w-auto min-h-[44px] justify-center"
                      >
                        {actioning ? 'Resolvendo...' : problem.action === 'fix_links' ? 'Em breve' : 'Resolver'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )
          ) : tenantModuleLoading ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center gap-3 text-zinc-400" role="status" aria-label={`Carregando ${tenantModule}`}>
                <Spinner className="h-8 w-8" />
                <span className="text-sm font-medium capitalize">Carregando {tenantModule}…</span>
              </div>
            </Card>
          ) : tenantModuleError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 font-bold mb-2">Erro ao carregar {tenantModule}</p>
              <p className="text-sm text-zinc-300 mb-4">{tenantModuleError}</p>
              <Button onClick={() => selectedTenantId && fetchTenantModuleData(selectedTenantId, tenantModule)}>Tentar novamente</Button>
            </Card>
          ) : tenantModule === 'pedidos' ? (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="font-bold text-white">Pedidos recentes</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Últimos pedidos do estabelecimento</p>
              </div>
              <div className="max-h-96 min-h-0 flex flex-col">
                {Array.isArray(tenantModuleData) && tenantModuleData.length > 0 ? (
                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
                  <table className="w-full min-w-[720px] text-sm border-collapse">
                    <thead className="bg-zinc-900 sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-bold text-zinc-400">Nº / ID</th>
                        <th className="text-left px-4 py-2 text-xs font-bold text-zinc-400">Canal</th>
                        <th className="text-left px-4 py-2 text-xs font-bold text-zinc-400">Status</th>
                        <th className="text-left px-4 py-2 text-xs font-bold text-zinc-400">Total</th>
                        <th className="text-left px-4 py-2 text-xs font-bold text-zinc-400">Criado</th>
                        <th className="text-right px-4 py-2 text-xs font-bold text-zinc-400">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {tenantModuleData.map((p: any) => {
                        const stLower = String(p.status || '').toLowerCase();
                        const isCanceled = !!p.cancelado_at || stLower.includes('cancel');
                        const podePix =
                          !isCanceled &&
                          String(p.pagamento_tipo || '').toLowerCase() === 'pix' &&
                          String(p.pagamento_status || '').toLowerCase() !== 'pago';
                        return (
                        <tr
                          key={p.id}
                          className="hover:bg-zinc-800/60 cursor-pointer"
                          onClick={() => openPedidoDetalhe(p.id)}
                        >
                          <td className="px-4 py-2 font-mono text-xs">{p.order_number || `#${p.id}`}</td>
                          <td className="px-4 py-2">{p.canal || '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.cancelado_at ? 'bg-red-900 text-red-300' : 'bg-zinc-800 text-zinc-300'}`}>
                              {p.status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2">R$ {(p.total_amount || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-zinc-300">{p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : '—'}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={isCanceled}
                              onClick={() => {
                                const isFinal = isOrderFinalStatus(p.status);
                                pendingPedidoPdvRef.current = {
                                  orderId: p.id,
                                  tab: isFinal ? 'receipts' : 'active',
                                  orderCreatedAt: p.created_at,
                                };
                                openActionConfirm({
                                  action: 'login_as_cliente',
                                  label: 'Abrir pedido no PDV',
                                  impact: isFinal
                                    ? 'Este pedido está concluído ou cancelado. O app abrirá na aba Histórico. Use os filtros de data se necessário para localizá-lo.'
                                    : 'Você será redirecionado ao app do estabelecimento na aba Pedidos ativos para localizar este pedido. Use apenas com autorização do cliente.',
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 min-h-[36px] text-xs font-bold rounded-lg text-zinc-100 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:pointer-events-none mr-1"
                              title="Login como cliente e abrir Pedidos"
                            >
                              <ShoppingCart size={14} />
                              PDV
                            </button>
                            <button
                              type="button"
                              disabled={!podePix}
                              onClick={() =>
                                openActionConfirm({
                                  action: 'force_pix_check',
                                  label: 'Forçar pagamento PIX confirmado',
                                  impact:
                                    'Marca o pedido como PIX pago no sistema. Use apenas quando o pagamento tiver sido confirmado fora do fluxo automático.',
                                  payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } },
                                  initialPayload: { order_id: String(p.id) },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 min-h-[36px] text-xs font-bold rounded-lg text-emerald-300 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 disabled:pointer-events-none mr-1"
                              title={!podePix ? 'Só para PIX pendente' : 'Forçar PIX pago'}
                            >
                              <QrCode size={14} />
                              PIX
                            </button>
                            <button
                              type="button"
                              disabled={isCanceled}
                              onClick={() =>
                                openActionConfirm({
                                  action: 'force_cancel_order',
                                  label: 'Forçar cancelamento de pedido',
                                  impact: 'O pedido será cancelado permanentemente. Confira o ID do pedido antes de confirmar.',
                                  payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } },
                                  initialPayload: { order_id: String(p.id) },
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 min-h-[36px] text-xs font-bold rounded-lg text-red-300 bg-red-900 hover:bg-red-800 disabled:opacity-40 disabled:pointer-events-none"
                              title={isCanceled ? 'Pedido já cancelado' : 'Forçar cancelamento'}
                            >
                              <Ban size={14} />
                              Cancelar
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                ) : (
                  <EmptyState
                    variant="admin"
                    icon={Package}
                    title="Nenhum pedido encontrado"
                    description="Não há pedidos recentes para este estabelecimento."
                    className="!py-12 !sm:py-14"
                  />
                )}
              </div>
            </Card>
          ) : tenantModule === 'caixa' ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <h3 className="font-bold text-white">Caixa</h3>
                <div className="flex flex-wrap gap-2">
                  {tenantModuleData?.status === 'fechado' && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() =>
                        openActionConfirm({
                          action: 'open_caixa',
                          label: 'Abrir caixa',
                          impact: 'Um novo caixa será aberto para hoje. O cliente poderá registrar vendas normalmente.',
                          payloadTemplate: { fundo_inicial: { type: 'number', label: 'Fundo inicial (R$)', required: false } },
                          initialPayload: { fundo_inicial: '0' },
                        })
                      }
                    >
                      <Wallet size={16} className="inline mr-1.5 -mt-0.5" />
                      Abrir caixa
                    </Button>
                  )}
                  {tenantModuleData?.status === 'aberto' && (
                    <Button
                      variant="secondary"
                      className="text-amber-300 border-amber-700 bg-amber-900 hover:bg-amber-800"
                      onClick={() =>
                        openActionConfirm({
                          action: 'force_close_caixa',
                          label: 'Forçar fechamento de caixa',
                          impact: 'O caixa aberto será fechado. Informe o valor contado e observação, se houver. Esta ação é irreversível.',
                          payloadTemplate: {
                            valor_contado: { type: 'number', label: 'Valor contado (R$)', required: false },
                            observacao: { type: 'textarea', label: 'Observação', required: false },
                          },
                          initialPayload: { valor_contado: '' },
                        })
                      }
                    >
                      <Wallet size={16} className="inline mr-1.5 -mt-0.5" />
                      Forçar fechamento
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${tenantModuleData?.status === 'aberto' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  <span className="font-bold">{tenantModuleData?.status === 'aberto' ? 'Status: aberto' : 'Status: fechado'}</span>
                </div>
                {tenantModuleData?.status === 'aberto' && Array.isArray(tenantModuleData?.caixas_abertos) && tenantModuleData.caixas_abertos.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Caixas abertos</p>
                    <div className="space-y-2">
                      {tenantModuleData.caixas_abertos.map((c: any) => (
                        <div key={c.id} className="p-4 bg-zinc-800 rounded-xl border border-zinc-800">
                          <p className="font-mono text-sm font-bold">Caixa #{c.id}</p>
                          <p className="text-xs text-zinc-300 mt-0.5">Data: {c.data}</p>
                          <p className="text-xs text-zinc-400 mt-1">Fundo inicial: R$ {(c.fundo_inicial || 0).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {tenantModuleData?.ultimo_fechado && (
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Último caixa fechado</p>
                    <div className="p-4 bg-zinc-800 rounded-xl border border-zinc-800">
                      <p className="font-mono text-sm">Caixa #{tenantModuleData.ultimo_fechado.id} · {tenantModuleData.ultimo_fechado.data}</p>
                      <p className="text-xs text-zinc-300 mt-0.5">Valor contado: R$ {(tenantModuleData.ultimo_fechado.valor_contado || 0).toFixed(2)}</p>
                      {tenantModuleData.ultimo_fechado.closed_at && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Fechado: {new Date(tenantModuleData.ultimo_fechado.closed_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {!tenantModuleData?.ultimo_fechado && tenantModuleData?.status === 'fechado' && (
                  <p className="text-zinc-400 text-sm">Nenhum registro de caixa fechado</p>
                )}
              </div>
            </Card>
          ) : tenantModule === 'estoque' ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <h3 className="font-bold text-white">Resumo do estoque</h3>
                {tenantModuleData && (
                  <Button
                    variant="secondary"
                    className="text-amber-300 border-amber-700 bg-amber-900 hover:bg-amber-800"
                    onClick={() =>
                      openActionConfirm({
                        action: 'recalculate_stock',
                        label: 'Reprocessar estoque pelo histórico',
                        impact:
                          'O estoque atual de TODOS os ingredientes será SUBSTITUÍDO pelo valor calculado a partir do histórico de movimentações (entradas - saídas). Atenção: estoque definido manualmente, sem entrada lançada, será zerado. Use apenas quando o histórico de movimentações estiver completo e confiável. Em caso de dúvida, não execute.',
                      })
                    }
                  >
                    <RefreshCw size={16} className="inline mr-1.5 -mt-0.5" />
                    Reprocessar estoque pelo histórico
                  </Button>
                )}
              </div>
              {tenantModuleData ? (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="px-4 py-2 bg-zinc-800 rounded-xl">
                      <p className="text-xs text-zinc-400">Ingredientes</p>
                      <p className="font-bold text-lg">{tenantModuleData.total_ingredientes ?? 0}</p>
                    </div>
                    <div className="px-4 py-2 bg-zinc-800 rounded-xl">
                      <p className="text-xs text-zinc-400">Total em estoque</p>
                      <p className="font-bold text-lg">{Number(tenantModuleData.total_estoque || 0).toFixed(1)}</p>
                    </div>
                  </div>
                  {Array.isArray(tenantModuleData.abaixo_minimo) && tenantModuleData.abaixo_minimo.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-700 uppercase mb-2">Abaixo do mínimo ({tenantModuleData.abaixo_minimo.length})</p>
                      <ul className="text-sm space-y-1">
                        {tenantModuleData.abaixo_minimo.slice(0, 10).map((i: any) => (
                          <li key={i.id}>{i.nome}: {i.estoque_atual} / {i.estoque_minimo}</li>
                        ))}
                        {tenantModuleData.abaixo_minimo.length > 10 && <li className="text-zinc-400">+{tenantModuleData.abaixo_minimo.length - 10} mais</li>}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-zinc-300 uppercase mb-2">
                      Produtos sem vínculo (
                      {Array.isArray(tenantModuleData.produtos_sem_vinculo) ? tenantModuleData.produtos_sem_vinculo.length : 0}
                      )
                    </p>
                    <p className="text-xs text-zinc-400 mb-2">
                      Produtos ativos sem ingredientes na ficha técnica (nem variação com ingrediente). Vincule no Estoque ou use login como cliente.
                    </p>
                    {Array.isArray(tenantModuleData.produtos_sem_vinculo) && tenantModuleData.produtos_sem_vinculo.length > 0 ? (
                      <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-zinc-800 min-w-0">
                        <table className="w-full min-w-[480px] text-sm border-collapse">
                          <thead className="bg-zinc-900 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">Produto</th>
                              <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">ID</th>
                              <th className="text-right px-3 py-2 text-xs font-bold text-zinc-400">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {tenantModuleData.produtos_sem_vinculo.map((p: any) => (
                              <tr key={p.id} className="hover:bg-zinc-800/60">
                                <td className="px-3 py-2 text-zinc-100">{p.name || '—'}</td>
                                <td className="px-3 py-2 font-mono text-xs text-zinc-300">{p.id}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      pendingEstoqueDeeplinkRef.current = Number(p.id);
                                      openActionConfirm({
                                        action: 'login_as_cliente',
                                        label: 'Login como cliente — ficha técnica',
                                        impact:
                                          'Você será redirecionado ao app do estabelecimento na aba Estoque › Ficha técnica com este produto selecionado. Use apenas com autorização do cliente.',
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg text-violet-300 bg-violet-900 hover:bg-violet-800 mr-1"
                                  >
                                    <LogIn size={14} />
                                    Abrir ficha
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(String(p.id));
                                        showActionToast('ID do produto copiado', true);
                                      } catch {
                                        showActionToast('Não foi possível copiar', false);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg text-zinc-300 bg-zinc-800 hover:bg-zinc-800"
                                  >
                                    <Copy size={14} />
                                    Copiar ID
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-400 py-2">Nenhum produto nesta lista no momento.</p>
                    )}
                  </div>
                  {(!tenantModuleData.abaixo_minimo?.length && !tenantModuleData.produtos_sem_vinculo?.length) && (
                    <p className="text-sm text-emerald-600">Estoque em ordem</p>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400">Sem dados</p>
              )}
            </Card>
          ) : tenantModule === 'delivery' ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <h3 className="font-bold text-white">Delivery</h3>
                {tenantModuleData && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => selectedTenantId && fetchTenantModuleData(selectedTenantId, 'delivery')}
                      disabled={tenantModuleLoading}
                      className="text-zinc-300"
                    >
                      <RefreshCw size={14} className={`inline mr-1 -mt-0.5 ${tenantModuleLoading ? 'animate-spin' : ''}`} />
                      {tenantModuleLoading ? 'Atualizando...' : 'Atualizar'}
                    </Button>
                    {!tenantModuleData.ativo ? (
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() =>
                          openActionConfirm({
                            action: 'delivery_enable',
                            label: 'Ativar delivery na loja',
                            impact:
                              'Novos pedidos pelo canal delivery poderão ser aceitos conforme a configuração do cliente (cardápio online, horários, etc.).',
                          })
                        }
                      >
                        Ativar loja (delivery)
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="text-amber-200 border-amber-700 bg-amber-950 hover:bg-amber-900 min-h-[44px]"
                        onClick={() =>
                          openActionConfirm({
                            action: 'delivery_disable',
                            label: 'Desativar delivery na loja',
                            impact:
                              'O estabelecimento deixará de aceitar novos pedidos pelo canal delivery até reativar. Pedidos em andamento não são cancelados automaticamente.',
                          })
                        }
                      >
                        Desativar loja (delivery)
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {tenantModuleData ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Status da loja</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${tenantModuleData.ativo ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      <span className="font-bold">{tenantModuleData.ativo ? 'Ativo' : 'Inativo'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Indicadores hoje</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-zinc-800 rounded-xl">
                        <p className="text-xs text-zinc-400">Pedidos</p>
                        <p className="font-bold">{tenantModuleData.pedidos_hoje ?? 0}</p>
                      </div>
                      <div className="p-3 bg-zinc-800 rounded-xl">
                        <p className="text-xs text-zinc-400">Faturamento</p>
                        <p className="font-bold">R$ {(tenantModuleData.faturamento_hoje || 0).toFixed(2)}</p>
                      </div>
                      <div className="p-3 bg-zinc-800 rounded-xl">
                        <p className="text-xs text-zinc-400">Em preparo</p>
                        <p className="font-bold">{tenantModuleData.em_preparo ?? 0}</p>
                      </div>
                      <div className="p-3 bg-zinc-800 rounded-xl">
                        <p className="text-xs text-zinc-400">Em rota</p>
                        <p className="font-bold">{tenantModuleData.em_rota ?? 0}</p>
                      </div>
                    </div>
                  </div>
                  {Array.isArray(tenantModuleData.motoboys) && tenantModuleData.motoboys.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Motoboys ({tenantModuleData.motoboys.length})</p>
                      <p className="text-sm text-zinc-300">{tenantModuleData.motoboys.map((m: any) => m.nome).join(', ')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400">Sem dados</p>
              )}
            </Card>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex p-1 bg-zinc-800 rounded-xl w-fit max-w-full overflow-x-auto touch-pan-x">
            <button type="button" onClick={() => setClientesSubTab('lista')} className={`shrink-0 px-4 py-2.5 min-h-[44px] text-xs font-bold rounded-lg transition-all ${clientesSubTab === 'lista' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400'}`}>Clientes</button>
            <button type="button" onClick={() => setClientesSubTab('solicitacoes')} className={`shrink-0 px-4 py-2.5 min-h-[44px] text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${clientesSubTab === 'solicitacoes' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400'}`}>
              Solicitações
              {stats?.pendentes > 0 && <span className="w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">{stats.pendentes}</span>}
            </button>
          </div>
        </div>

        {clientesSubTab === 'lista' ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Clientes</h2>
              <div className="relative w-full sm:w-auto sm:min-w-[14rem]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={16} />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 min-h-[44px] !bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-zinc-700 transition-all"
                />
              </div>
            </div>
            <Card className="overflow-x-auto !bg-zinc-900 !border-zinc-800 min-w-0">
              <table className="w-full min-w-[720px] text-left border-collapse">
                <thead>
                  <tr className="!bg-zinc-900 text-zinc-300 border-b border-zinc-800">
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Estabelecimento</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Acesso</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Plano & Valor</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Vencimento</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {clientesVisiveis.map((c: any) => {
                      const diasRestantes = c.vencimento
                        ? Math.ceil((new Date(c.vencimento).getTime() - Date.now()) / 86400000)
                        : c.trial_fim ? Math.ceil((new Date(c.trial_fim).getTime() - Date.now()) / 86400000) : null;
                      const isOnline = c.ultimo_acesso && (Date.now() - new Date(c.ultimo_acesso).getTime() < 86400000);
                      return (
                        <tr key={c.id} className="hover:bg-zinc-800/60 transition-colors">
                          <td className="px-3 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-300'}`} title={isOnline ? 'Online (Acesso Recente)' : 'Offline'} />
                              <div>
                                <p className="font-bold text-white">{c.nome_estabelecimento}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">{c.documento_tipo}: {c.documento_numero}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <UserIcon size={14} className="text-zinc-400 shrink-0" />
                                <span className="font-mono text-sm text-zinc-300">{c.usuario}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Lock size={14} className="text-zinc-400" />
                                <span className="font-mono text-xs text-zinc-400 italic">Use &quot;Alterar Senhas&quot; para redefinir</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="space-y-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                c.plano === 'trial' ? 'bg-purple-900 text-purple-300' :
                                c.plano === 'anual' ? 'bg-blue-900 text-blue-300' :
                                c.plano === 'trimestral' ? 'bg-amber-900 text-amber-300' :
                                'bg-zinc-800 text-zinc-300'
                              }`}>
                                {c.plano || 'Trial'}
                              </span>
                              <p className="text-xs font-bold text-zinc-400">R$ {c.valor_plano ? c.valor_plano.toFixed(2) : '0.00'}</p>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'ativo' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                                  {c.status}
                                </span>
                                {diasRestantes !== null && (
                                  <span className={`font-bold text-xs ${diasRestantes > 5 ? 'text-emerald-400' : diasRestantes > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {diasRestantes}d
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">
                                Exp: {c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : c.trial_fim ? new Date(c.trial_fim).toLocaleDateString('pt-BR') : '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 text-right align-top">
                            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 max-w-[min(100%,280px)] sm:max-w-none ml-auto">
                              <button
                                type="button"
                                onClick={() => { setSelectedTenantId(c.id); setSelectedTenant({ id: c.id, nome_estabelecimento: c.nome_estabelecimento }); }}
                                className="px-2 sm:px-3 py-2 min-h-[40px] bg-transparent text-emerald-400 rounded-lg text-[11px] sm:text-xs font-bold hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5"
                              >
                                <Wrench size={14} /> <span className="hidden sm:inline">Abrir painel</span><span className="sm:hidden">Painel</span>
                              </button>
                              <button type="button" onClick={() => { setSubUsersCliente(c); fetchSubUsers(c.id); }} className="p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-transparent text-zinc-400 rounded-lg hover:bg-zinc-500/20 transition-colors" title="Sub-usuários">
                                <Users2 size={16} />
                              </button>
                              <button type="button" onClick={() => setEditPlano(c)} className="p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-transparent text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors" title="Editar">
                                <Pencil size={16} />
                              </button>
                              <button type="button" onClick={() => { setEditSenha(c); setNovaSenha(''); setNovaSenhaAdmin(c.senha_admin || '123321'); setNovaSenhaCaixa(c.senha_caixa || '123321'); }} className="p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-transparent text-violet-400 rounded-lg hover:bg-violet-500/20 transition-colors" title="Senhas">
                                <KeyRound size={16} />
                              </button>
                              <button type="button" onClick={() => handleBloquear(c.id, c.status === 'ativo' ? 'bloquear' : 'desbloquear')} className={`p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg transition-colors ${c.status === 'ativo' ? 'bg-transparent text-red-400 hover:bg-red-500/20' : 'bg-transparent text-emerald-400 hover:bg-emerald-500/20'}`} title={c.status === 'ativo' ? 'Bloquear' : 'Desbloquear'}>
                                {c.status === 'ativo' ? <Lock size={16} /> : <UserCheck size={16} />}
                              </button>
                              <button type="button" onClick={() => handleDisconnectCliente(c.id)} className="p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-transparent text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors" title="Desconectar">
                                <LogOut size={16} />
                              </button>
                              <button type="button" onClick={() => handleDeleteCliente(c.id)} className="p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center bg-transparent text-red-400 rounded-lg hover:bg-red-500/20 transition-colors" title="Excluir">
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
            {hasMoreClientes && (
              <div className="flex justify-center pt-4">
                <button onClick={loadMoreClientes}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-sm transition-all">
                  Carregar mais (+50)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Solicitações de Acesso</h2>
              <div className="flex p-1 bg-zinc-800 rounded-xl w-full max-w-full sm:w-fit overflow-x-auto touch-pan-x">
                {['todas', 'pendente', 'aprovado', 'recusado'].map(f => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`shrink-0 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold rounded-lg transition-all capitalize ${filter === f ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Card className="overflow-x-auto !bg-zinc-900 !border-zinc-800 min-w-0">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="!bg-zinc-900 text-zinc-300 border-b border-zinc-800">
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Estabelecimento</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Responsável</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contato</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Cidade</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Status</th>
                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {solicitacoesVisiveis.map(s => (
                    <tr key={s.id} className="hover:bg-zinc-800/60 transition-colors">
                      <td className="px-3 sm:px-6 py-4">
                        <p className="font-bold text-white">{s.nome_estabelecimento}</p>
                        <p className="text-xs text-zinc-400">{s.documento_tipo}: {s.documento_numero}</p>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-sm text-zinc-300">{s.nome_responsavel}</td>
                      <td className="px-3 sm:px-6 py-4">
                        <p className="text-sm text-zinc-300">{s.email}</p>
                        <p className="text-xs text-emerald-400 font-medium">{s.whatsapp}</p>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-sm text-zinc-300">{s.cidade}</td>
                      <td className="px-3 sm:px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${s.status === 'pendente' ? 'bg-amber-900 text-amber-400' : s.status === 'aprovado' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4">
                        {s.status === 'pendente' && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => handleAprovar(s.id)} className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-emerald-900 text-emerald-400 rounded-lg hover:bg-emerald-800 transition-colors" title="Aprovar">
                              <UserCheck size={16} />
                            </button>
                            <button type="button" onClick={() => handleRecusar(s.id)} className="p-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-red-900 text-red-400 rounded-lg hover:bg-red-800 transition-colors" title="Recusar">
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
            {hasMoreSolicitacoes && (
              <div className="flex justify-center pt-4">
                <button onClick={loadMoreSolicitacoes}
                  className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-xl text-sm transition-all">
                  Carregar mais (+50)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!token) {
    return (
      <div className="admin-dark min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f4ff' }}>
              Flow<span style={{ color: '#06b6d4' }}>PDV</span>
            </div>
            <span style={{ fontSize: '0.6rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: 4 }}>
              RM Tecnologia
            </span>
            <p className="text-zinc-400" style={{ marginTop: 8, fontSize: '0.85rem' }}>Painel Administrativo · Gestão de SaaS</p>
          </div>
          <Card className="p-8 bg-zinc-900 border-zinc-800">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Usuário</label>
                <input
                  required
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-white outline-none transition-all"
                  value={loginForm.usuario}
                  onChange={e => setLoginForm({...loginForm, usuario: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Senha</label>
                <input
                  required
                  type="password"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-white outline-none transition-all"
                  value={loginForm.senha}
                  onChange={e => setLoginForm({...loginForm, senha: e.target.value})}
                />
              </div>
              <Button type="submit" className="w-full py-4 bg-emerald-600 text-white hover:bg-emerald-500" disabled={loading}>
                {loading ? "Autenticando..." : "Entrar no Painel"}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="admin-dark min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`fixed top-5 right-5 z-[130] text-white text-sm font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 ${
              actionToast.success ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {actionToast.success && <Check size={18} />}
            {actionToast.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <header className="!bg-zinc-900 text-white p-4 sm:p-6 flex items-center justify-between border-b border-zinc-800 sticky top-0 z-50 gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <button
            type="button"
            className="lg:hidden p-2.5 rounded-xl border border-zinc-700 text-zinc-200 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 active:bg-zinc-800"
            aria-label="Abrir menu"
            onClick={() => setAdminNavOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: 'clamp(1rem, 2.5vw, 1.35rem)', fontWeight: 800, letterSpacing: '-0.02em', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Flow<span style={{ color: '#22d3ee' }}>PDV</span>
            <span className="hidden sm:inline" style={{ fontSize: '0.58rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Sans, system-ui, sans-serif' }}>RM Tecnologia</span>
          </div>
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-bold leading-none text-white truncate">RM PDV SaaS</h1>
            <p className="text-[10px] text-zinc-300 uppercase tracking-widest mt-1">Painel de Controle</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => { localStorage.removeItem('admin_token'); setToken(null); }}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-800 rounded-xl transition-colors text-zinc-300 hover:text-white"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {adminNavOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-[60] bg-black/50 md:hidden"
            onClick={() => setAdminNavOpen(false)}
          />
        )}
        <aside
          className={`
            fixed md:static inset-y-0 left-0 z-[70] w-64 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 p-4 sm:p-6 space-y-2
            overflow-y-auto min-h-0 transition-transform duration-200 ease-out
            pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]
            ${adminNavOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
          `}
        >
          <div className="flex items-center justify-between gap-2 md:hidden pb-2 mb-2 border-b border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Menu</span>
            <button
              type="button"
              aria-label="Fechar menu"
              className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl border border-zinc-700 text-zinc-200 flex items-center justify-center hover:bg-zinc-800"
              onClick={() => setAdminNavOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <button 
            onClick={() => { setActiveTab('clientes'); setAdminNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl font-medium transition-all ${activeTab === 'clientes' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
          >
            <Users size={18} /> Clientes
          </button>
          <button 
            onClick={() => { setActiveTab('diagnosticos'); setAdminNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl font-medium transition-all ${activeTab === 'diagnosticos' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
          >
            <AlertCircle size={18} /> Diagnósticos
          </button>
          <button 
            onClick={() => { setActiveTab('financeiro'); setAdminNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl font-medium transition-all ${activeTab === 'financeiro' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
          >
            <DollarSign size={18} /> Financeiro
            {financeiro?.proximos_vencimentos?.some((v: any) => v.dias <= 3) && (
              <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('dashboard'); setAdminNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl font-medium transition-all ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
        </aside>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5 md:p-6 bg-zinc-950 min-h-0 min-w-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className={activeTab !== 'dashboard' ? 'hidden' : ''}>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Clientes</p>
                  <h3 className="text-3xl font-black text-white">{stats?.total || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-emerald-500">
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Ativos</p>
                  <h3 className="text-3xl font-black text-emerald-400">{stats?.ativos || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-amber-500">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Pendentes</p>
                  <h3 className="text-3xl font-black text-amber-400">{stats?.pendentes || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-red-500">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Bloqueados</p>
                  <h3 className="text-3xl font-black text-red-400">{stats?.bloqueados || 0}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-zinc-400">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Expirados</p>
                  <h3 className="text-3xl font-black text-white">{stats?.expirados || 0}</h3>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="font-bold text-white mb-6 flex items-center gap-2"><Activity size={18} /> Solicitações Recentes</h3>
                  <div className="space-y-4">
                    {solicitacoes.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl border border-zinc-800">
                        <div>
                          <p className="font-bold text-white">{s.nome_estabelecimento}</p>
                          <p className="text-xs text-zinc-400">{s.cidade} • {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${s.status === 'pendente' ? 'bg-amber-900 text-amber-400' : s.status === 'aprovado' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-6">
                  <h3 className="font-bold text-white mb-6 flex items-center gap-2"><Users size={18} /> Últimos Clientes</h3>
                  <div className="space-y-4">
                    {clientes.slice(0, 5).map(c => (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl border border-zinc-800">
                        <div>
                          <p className="font-bold text-white">{c.nome_estabelecimento}</p>
                          <p className="text-xs text-zinc-400">
                            Expira em: {(c.vencimento || c.trial_fim) ? new Date(c.vencimento ?? c.trial_fim).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${c.status === 'ativo' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <div className={activeTab !== 'clientes' ? 'hidden' : ''}>
          {renderClientesContent()}
          </div>

          <div className={activeTab !== 'financeiro' ? 'hidden' : ''}>
          <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 bg-zinc-900 text-white">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">MRR (Mensal)</p>
                  <h3 className="text-3xl font-black">R$ {(financeiro?.mrr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">ARR (Anual)</p>
                  <h3 className="text-3xl font-black text-white">R$ {(financeiro?.arr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Clientes Pagantes</p>
                  <h3 className="text-3xl font-black text-white">{financeiro?.clientes_pagantes || 0}</h3>
                </Card>
                <Card className="p-6">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Ticket Médio</p>
                  <h3 className="text-3xl font-black text-white">R$ {(financeiro?.ticket_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="p-6 lg:col-span-2">
                  <h3 className="font-bold text-white mb-6 flex items-center gap-2"><Activity size={18} /> Faturamento (Últimos 6 meses)</h3>
                  <div className="h-64 flex items-end gap-4 px-4">
                    {financeiro?.faturamento_mensal?.map((m: any) => (
                      <div key={m.mes} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full bg-zinc-800 rounded-t-xl relative overflow-hidden flex items-end" style={{ height: '100%' }}>
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(m.total / Math.max(...financeiro.faturamento_mensal.map((x: any) => x.total))) * 100}%` }}
                            className="w-full bg-zinc-900 group-hover:bg-emerald-9000 transition-colors"
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
                  <h3 className="font-bold text-white mb-6 flex items-center gap-2"><Calendar size={18} /> Próximos Vencimentos</h3>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {financeiro?.proximos_vencimentos?.map((v: any) => (
                      <div key={v.nome_estabelecimento} className="p-4 bg-zinc-800 rounded-2xl border border-zinc-800">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-white text-sm">{v.nome_estabelecimento}</p>
                            <p className="text-[10px] text-zinc-400 uppercase font-bold">{v.plano} • R$ {v.valor_plano.toLocaleString('pt-BR')}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.dias <= 0 ? 'bg-red-900 text-red-400' : v.dias <= 3 ? 'bg-amber-900 text-amber-400' : 'bg-emerald-900 text-emerald-400'}`}>
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
                            className="p-2 bg-emerald-900 text-emerald-400 rounded-lg hover:bg-emerald-800 transition-colors"
                          >
                            <Smartphone size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className="p-4 sm:p-6 min-w-0">
                <h3 className="font-bold text-white mb-4 sm:mb-6 flex items-center gap-2"><Users size={18} /> Todos os Clientes Pagantes</h3>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[640px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="py-3 sm:py-4 pr-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
                        <th className="py-3 sm:py-4 pr-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Plano</th>
                        <th className="py-3 sm:py-4 pr-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor</th>
                        <th className="py-3 sm:py-4 pr-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Vencimento</th>
                        <th className="py-3 sm:py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Último Acesso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {financeiro?.todos_pagantes?.map((c: any) => (
                        <tr key={c.nome_estabelecimento} className="hover:bg-zinc-800/60 transition-colors">
                          <td className="py-4 font-bold text-white">{c.nome_estabelecimento}</td>
                          <td className="py-4">
                            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-full text-[10px] font-bold uppercase">{c.plano}</span>
                          </td>
                          <td className="py-4 text-sm text-zinc-300 font-mono">R$ {c.valor_plano.toLocaleString('pt-BR')}</td>
                          <td className="py-4 text-sm text-zinc-300">{new Date(c.vencimento).toLocaleDateString()}</td>
                          <td className="py-4 text-xs text-zinc-400">{new Date(c.ultimo_acesso).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>

          <div className={activeTab !== 'diagnosticos' ? 'hidden' : ''}>
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl sm:text-2xl font-bold text-white">Diagnósticos e Ações Administrativas</h2>
                <Button onClick={fetchDiagnostics} disabled={diagnosticsLoading} className="min-h-[44px] w-full sm:w-auto justify-center">
                  {diagnosticsLoading ? 'Carregando...' : 'Atualizar'}
                </Button>
              </div>
              {diagnosticsLoading && !diagnostics ? (
                <Card className="p-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-zinc-400" role="status" aria-label="Carregando diagnósticos">
                    <Spinner className="h-8 w-8" />
                    <span className="text-sm font-medium">Carregando diagnósticos…</span>
                  </div>
                </Card>
              ) : (
                <div className="space-y-6">
                  {tenantsComProblemas.length === 0 && (
                    <Card className="p-8 text-center">
                      <Check className="mx-auto text-emerald-500 mb-3" size={48} />
                      <p className="font-bold text-white">Nenhum problema detectado</p>
                      <p className="text-sm text-zinc-400 mt-1">Todos os clientes estão em ordem.</p>
                    </Card>
                  )}
                  {tenantsVisiveis.map((tenant: any) => (
                      <Card key={tenant.tenant_id} className="p-6">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                          <Users size={18} /> {tenant.nome_estabelecimento}
                          <span className="text-xs font-normal text-zinc-400">(ID: {tenant.tenant_id})</span>
                        </h3>
                        <div className="space-y-3">
                          {tenant.problems.map((problem: any, idx: number) => {
                            const key = `${problem.id}-${tenant.tenant_id}-${idx}-${problem.data?.order_id ?? problem.data?.caixa_id ?? idx}`;
                            const actioning = diagnosticsActioning === `${problem.category}-${problem.data?.tenant_id}-${problem.data?.caixa_id ?? problem.data?.order_id ?? 'x'}`;
                            const severityStyles = {
                              high: { bg: 'bg-red-950', border: 'border-red-800', accent: 'border-l-4 border-l-red-500' },
                              medium: { bg: 'bg-amber-950', border: 'border-amber-800', accent: 'border-l-4 border-l-amber-500' },
                              low: { bg: 'bg-zinc-800', border: 'border-zinc-800', accent: 'border-l-4 border-l-zinc-500' },
                            };
                            const style = severityStyles[problem.severity as keyof typeof severityStyles] ?? severityStyles.low;
                            const ids = problem.data?.caixa_ids ?? (problem.data?.caixa_id ? [problem.data.caixa_id] : []);
                            const extra = problem.category === 'caixa' && ids.length
                              ? ids.map((id: number) => `Caixa #${id}`).join(', ')
                              : problem.category === 'pedidos' && problem.data?.order_id
                                ? `Pedido #${problem.data?.order_number ?? problem.data?.order_id}`
                                : problem.category === 'estoque' && problem.data?.count
                                  ? `${problem.data.count} produto(s)`
                                  : null;
                            return (
                              <div key={key} className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between p-4 rounded-xl border ${style.bg} ${style.border} ${style.accent}`}>
                                <div className="flex-1 min-w-0">
                                  {extra && <p className="text-[10px] text-zinc-400 font-mono mb-0.5">{extra}</p>}
                                  <p className="font-bold text-white text-sm">{problem.title}</p>
                                  <p className="text-xs text-zinc-300 mt-0.5">{problem.description}</p>
                                  <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    problem.category === 'caixa' ? 'bg-blue-900 text-blue-300' :
                                    problem.category === 'pedidos' ? 'bg-violet-900 text-violet-300' : 'bg-zinc-800 text-zinc-300'
                                  }`}>
                                    {problem.category}
                                  </span>
                                </div>
                                <Button
                                  onClick={() => handleDiagnosticAction(problem)}
                                  disabled={actioning || problem.action === 'fix_links'}
                                  variant="secondary"
                                  className="ml-0 sm:ml-4 shrink-0 w-full sm:w-auto min-h-[44px] justify-center"
                                >
                                  {actioning ? 'Resolvendo...' : problem.action === 'fix_links' ? 'Em breve' : 'Resolver'}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                  ))}
                  {hasMoreTenants && (
                    <div className="flex justify-center py-4">
                      <button onClick={loadMoreTenants}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-sm transition-all">
                        Carregar mais (+20) — {tenantsVisiveis.length} de {totalTenants}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Drawer Sub-Usuários — disponível em qualquer view */}
      {subUsersCliente && (
        <div className="fixed inset-0 z-[80] flex">
          <div className="flex-1 bg-black/50" onClick={() => setSubUsersCliente(null)} aria-hidden />
          <div className="w-full max-w-md bg-zinc-900 h-full max-h-[100dvh] shadow-2xl flex flex-col overflow-hidden border-l border-zinc-800 pb-[env(safe-area-inset-bottom)]">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-white">Sub-Usuários</h3>
                <p className="text-xs text-zinc-400 truncate">{subUsersCliente.nome_estabelecimento}</p>
              </div>
              <button type="button" onClick={() => setSubUsersCliente(null)} className="p-2.5 min-h-[44px] min-w-[44px] shrink-0 hover:bg-zinc-800 rounded-xl transition-colors flex items-center justify-center text-zinc-300">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-3">
              {subUsersLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-400" role="status" aria-label="Carregando sub-usuários">
                  <Spinner className="h-8 w-8" />
                  <span className="text-sm">Carregando…</span>
                </div>
              ) : subUsers.length === 0 ? (
                <EmptyState
                  variant="admin"
                  icon={Users2}
                  title="Nenhum sub-usuário criado"
                  description="Usuários adicionais do estabelecimento aparecerão aqui."
                  className="!py-10 !sm:py-12"
                />
              ) : subUsers.map((u: any) => (
                <div key={u.id} className={`p-4 rounded-xl border transition-all ${u.ativo ? 'border-zinc-800 bg-zinc-900' : 'border-red-800 bg-red-950/50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center">
                        <span className="text-white text-xs font-black">{(u.nome || u.username).charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{u.nome || u.username}</p>
                        <p className="text-[11px] text-zinc-400">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        u.cargo === 'dono' ? 'bg-amber-900 text-amber-300' :
                        u.cargo === 'gerente' ? 'bg-blue-900 text-blue-300' :
                        'bg-zinc-800 text-zinc-300'
                      }`}>
                        {u.cargo === 'dono' ? '👑 Dono' : u.cargo === 'gerente' ? '🔑 Gerente' : '🪪 Atendente'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.ativo ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}`}>
                        {u.ativo ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-400 mb-3">
                    {u.permissoes ? `${u.permissoes.length} abas permitidas` : 'Acesso total'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleSubUser(subUsersCliente.id, u.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        u.ativo ? 'bg-red-900 text-red-400 hover:bg-red-800' : 'bg-emerald-900 text-emerald-400 hover:bg-emerald-800'
                      }`}
                    >
                      {u.ativo ? <><ShieldOff size={12} /> Bloquear</> : <><ShieldCheck size={12} /> Ativar</>}
                    </button>
                    <button
                      onClick={() => { setResetSenhaUser(u); setNovaSenhaUser(''); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-violet-900 text-violet-300 hover:bg-violet-800 rounded-lg text-xs font-bold transition-all"
                    >
                      <KeyRound size={12} /> Resetar Senha
                    </button>
                  </div>
                  {resetSenhaUser?.id === u.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="password"
                        value={novaSenhaUser}
                        onChange={e => setNovaSenhaUser(e.target.value)}
                        placeholder="Nova senha..."
                        className="flex-1 px-3 py-1.5 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-zinc-400"
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

      <AnimatePresence>
        {selectedProblemDetail && (
          <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md" onClick={() => setSelectedProblemDetail(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[min(92dvh,100svh)] sm:max-h-[90vh] flex flex-col min-h-0 p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                <h3 className="text-lg font-bold text-white pr-2">Detalhe do problema</h3>
                <button type="button" onClick={() => setSelectedProblemDetail(null)} className="p-2.5 min-h-[44px] min-w-[44px] shrink-0 hover:bg-zinc-800 rounded-lg transition-colors flex items-center justify-center text-zinc-400">
                  <X size={18} />
                </button>
              </div>
              {(() => {
                const p = selectedProblemDetail;
                const severityStyles = {
                  high: { badge: 'bg-red-900 text-red-300', label: 'Crítico' },
                  medium: { badge: 'bg-amber-900 text-amber-300', label: 'Atenção' },
                  low: { badge: 'bg-zinc-800 text-zinc-300', label: 'Informação' },
                };
                const style = severityStyles[p.severity as keyof typeof severityStyles] ?? severityStyles.low;
                const catClass = p.category === 'caixa' ? 'bg-blue-900 text-blue-300' : p.category === 'pedidos' ? 'bg-violet-900 text-violet-300' : 'bg-zinc-800 text-zinc-300';
                const actioning = diagnosticsActioning === `${p.category}-${p.data?.tenant_id}-${p.data?.caixa_id ?? p.data?.order_id ?? 'x'}`;
                return (
                  <>
                  <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
                    <div className="flex flex-wrap gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${style.badge}`}>{style.label}</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${catClass}`}>{p.category}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Título</p>
                      <p className="font-bold text-white">{p.title}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">Descrição</p>
                      <p className="text-sm text-zinc-300">{p.description}</p>
                    </div>
                    {p.data && Object.keys(p.data).length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-2">Dados relacionados</p>
                        <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                          {Object.entries(p.data).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-sm gap-2">
                              <span className="text-zinc-400 shrink-0">{formatProblemDataLabel(k)}:</span>
                              <span className="font-mono font-medium text-white text-right break-all">
                                {Array.isArray(v) ? v.join(', ') : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="p-3 bg-amber-950 border border-amber-800 rounded-xl">
                      <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">Ação sugerida</p>
                      <p className="text-sm text-amber-200">{getActionDescription(p)}</p>
                    </div>
                  </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-zinc-800 shrink-0">
                      <Button variant="secondary" onClick={() => setSelectedProblemDetail(null)} className="flex-1 min-h-[44px]">
                        Fechar
                      </Button>
                      <Button
                        onClick={() => { setSelectedProblemDetail(null); handleDiagnosticAction(p); }}
                        disabled={actioning || p.action === 'fix_links'}
                        className="flex-1 min-h-[44px]"
                      >
                        {actioning ? 'Resolvendo...' : p.action === 'fix_links' ? 'Em breve' : 'Resolver'}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
        {pedidoDetalheModal && (
          <div
            className="fixed inset-0 z-[121] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md"
            onClick={() => setPedidoDetalheModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-lg max-h-[min(92dvh,100svh)] sm:max-h-[90vh] flex flex-col min-h-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                <h3 className="text-lg font-bold text-white">Detalhes do pedido</h3>
                <button type="button" onClick={() => setPedidoDetalheModal(null)} className="p-2.5 min-h-[44px] min-w-[44px] shrink-0 hover:bg-zinc-800 rounded-xl text-zinc-400 flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>
              {pedidoDetalheModal.loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-400" role="status" aria-label="Carregando pedido">
                  <Spinner className="h-8 w-8" />
                  <span className="text-sm">Carregando…</span>
                </div>
              ) : pedidoDetalheModal.err ? (
                <p className="text-sm text-red-600 py-4">{pedidoDetalheModal.err}</p>
              ) : pedidoDetalheModal.data ? (
                <>
                  <div className="space-y-3 text-sm overflow-y-auto flex-1 min-h-0 pr-1 text-zinc-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Número</p>
                        <p className="font-mono font-bold">{pedidoDetalheModal.data.pedido?.order_number || `#${pedidoDetalheModal.data.pedido?.id}`}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Status</p>
                        <p>{pedidoDetalheModal.data.pedido?.status || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Total</p>
                        <p className="font-bold">R$ {Number(pedidoDetalheModal.data.pedido?.total_amount || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Data</p>
                        <p className="text-zinc-300">
                          {pedidoDetalheModal.data.pedido?.created_at
                            ? new Date(pedidoDetalheModal.data.pedido.created_at).toLocaleString('pt-BR')
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Pagamento</p>
                      <p>
                        {pedidoDetalheModal.data.pedido?.pagamento_tipo || '—'} ·{' '}
                        {pedidoDetalheModal.data.pedido?.pagamento_status || '—'}
                      </p>
                      {pedidoDetalheModal.data.pagamentos?.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                          {pedidoDetalheModal.data.pagamentos.map((pg: any) => (
                            <li key={pg.id}>
                              {pg.method}: R$ {Number(pg.amount_paid || 0).toFixed(2)}
                              {Number(pg.change_given || 0) > 0 ? ` · troco R$ ${Number(pg.change_given).toFixed(2)}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Itens</p>
                      {pedidoDetalheModal.data.itens?.length ? (
                        <ul className="border border-zinc-800 rounded-xl divide-y divide-zinc-800 max-h-48 overflow-y-auto">
                          {pedidoDetalheModal.data.itens.map((it: any) => (
                            <li key={it.id} className="px-3 py-2 flex justify-between gap-2">
                              <span className="text-zinc-100">
                                {it.quantity}× {it.product_name || 'Produto'}
                              </span>
                              <span className="text-zinc-400">R$ {(Number(it.price_at_time || 0) * Number(it.quantity || 0)).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-zinc-400 text-xs">Nenhum item</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row flex-wrap gap-2 sm:justify-end mt-4 pt-4 border-t border-zinc-800 shrink-0">
                    <Button variant="secondary" onClick={() => setPedidoDetalheModal(null)} className="min-h-[44px] w-full sm:w-auto">
                      Fechar
                    </Button>
                    {(() => {
                      const ped = pedidoDetalheModal.data?.pedido;
                      if (!ped?.id) return null;
                      const modalIsCanceled = !!ped.cancelado_at || String(ped.status || '').toLowerCase().includes('cancel');
                      const modalPodePix = !modalIsCanceled && String(ped.pagamento_tipo || '').toLowerCase() === 'pix' && String(ped.pagamento_status || '').toLowerCase() !== 'pago';
                      return (
                        <>
                          <Button
                            className="min-h-[44px] w-full sm:w-auto justify-center"
                            onClick={() => {
                              setPedidoDetalheModal(null);
                              const isFinal = isOrderFinalStatus(ped.status);
                              pendingPedidoPdvRef.current = { orderId: ped.id, tab: isFinal ? 'receipts' : 'active', orderCreatedAt: ped.created_at };
                              openActionConfirm({
                                action: 'login_as_cliente',
                                label: 'Abrir pedido no PDV',
                                impact: isFinal ? 'Este pedido está concluído ou cancelado. O app abrirá na aba Histórico. Use os filtros de data se necessário para localizá-lo.' : 'Você será redirecionado ao app do estabelecimento na aba Pedidos ativos para localizar este pedido. Use apenas com autorização do cliente.',
                              });
                            }}
                          >
                            <ShoppingCart size={16} className="inline mr-1.5 -mt-0.5" />
                            Abrir no PDV
                          </Button>
                          <Button
                            disabled={!modalPodePix}
                            className={`min-h-[44px] w-full sm:w-auto justify-center ${modalPodePix ? 'text-emerald-300 border-emerald-700 bg-emerald-900 hover:bg-emerald-800' : ''}`}
                            onClick={() => {
                              setPedidoDetalheModal(null);
                              openActionConfirm({
                                action: 'force_pix_check',
                                label: 'Forçar pagamento PIX confirmado',
                                impact: 'Marca o pedido como PIX pago no sistema. Use apenas quando o pagamento tiver sido confirmado fora do fluxo automático.',
                                payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } },
                                initialPayload: { order_id: String(ped.id) },
                              });
                            }}
                          >
                            <QrCode size={16} className="inline mr-1.5 -mt-0.5" />
                            Forçar PIX
                          </Button>
                          <Button
                            disabled={modalIsCanceled}
                            className={`min-h-[44px] w-full sm:w-auto justify-center ${!modalIsCanceled ? 'text-red-300 border-red-700 bg-red-900 hover:bg-red-800' : ''}`}
                            onClick={() => {
                              setPedidoDetalheModal(null);
                              openActionConfirm({
                                action: 'force_cancel_order',
                                label: 'Forçar cancelamento de pedido',
                                impact: 'O pedido será cancelado permanentemente. Confira o ID do pedido antes de confirmar.',
                                payloadTemplate: { order_id: { type: 'number', label: 'ID do pedido', required: true } },
                                initialPayload: { order_id: String(ped.id) },
                              });
                            }}
                          >
                            <Ban size={16} className="inline mr-1.5 -mt-0.5" />
                            Cancelar
                          </Button>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        )}
        {actionConfirmModal && (
          <div className="fixed inset-0 z-[122] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md" onClick={dismissActionConfirmModal}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className={`bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] ${actionResultLogs ? 'w-full max-w-2xl max-h-[min(92dvh,100svh)] sm:max-h-[90vh] flex flex-col min-h-0' : 'w-full max-w-md max-h-[min(92dvh,100svh)] sm:max-h-[90vh] overflow-y-auto flex flex-col min-h-0'}`}
            >
              {actionResultLogs ? (
                <>
                  <h3 className="text-lg font-bold text-white mb-2">Logs do sistema ({actionResultLogs.length})</h3>
                  <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 rounded-xl border border-zinc-800 mb-4">
                    <table className="w-full min-w-[560px] text-sm border-collapse">
                      <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">Data</th>
                          <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">Usuário</th>
                          <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">Ação</th>
                          <th className="text-left px-3 py-2 text-xs font-bold text-zinc-400">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionResultLogs.map((l) => (
                          <tr key={l.id} className="border-b border-zinc-800 hover:bg-zinc-800/60">
                            <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-2 text-zinc-300">{l.usuario_nome}</td>
                            <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{l.acao}</td>
                            <td className="px-3 py-2 text-zinc-300 max-w-xs truncate" title={l.detalhes || ''}>{l.detalhes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={dismissActionConfirmModal}>Fechar</Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-white mb-2">{actionConfirmModal.label}</h3>
                  <div className="p-3 bg-amber-950 border border-amber-800 rounded-xl mb-4">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">Impacto</p>
                    <p className="text-sm text-amber-200">{actionConfirmModal.impact}</p>
                  </div>
                  {actionConfirmModal.payloadTemplate &&
                    (Object.entries(actionConfirmModal.payloadTemplate) as [string, AdminActionPayloadField][]).map(([key, cfg]) => (
                    <div key={key} className="mb-4">
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{cfg.label}{cfg.required && ' *'}</label>
                      {cfg.type === 'textarea' ? (
                        <textarea
                          value={actionConfirmPayload[key] || ''}
                          onChange={(e) => setActionConfirmPayload((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder={cfg.label}
                          rows={2}
                          className="w-full px-4 py-2 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                        />
                      ) : (
                        <input
                          type={cfg.type === 'number' ? 'number' : 'text'}
                          value={actionConfirmPayload[key] || ''}
                          onChange={(e) => setActionConfirmPayload((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder={cfg.label}
                          step={cfg.type === 'number' ? '0.01' : undefined}
                          className="w-full px-4 py-2 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                      )}
                    </div>
                  ))}
                  <div className="mb-6">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Motivo (obrigatório, mínimo 10 caracteres) *</label>
                    <textarea
                      value={actionConfirmReason}
                      onChange={(e) => setActionConfirmReason(e.target.value)}
                      placeholder="Descreva o motivo desta ação..."
                      rows={3}
                      className="w-full px-4 py-3 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                    />
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-stretch sm:justify-end shrink-0">
                    <Button variant="secondary" onClick={dismissActionConfirmModal} disabled={actionConfirmLoading} className="min-h-[44px] w-full sm:w-auto">
                      Cancelar
                    </Button>
                    <Button
                      onClick={executeAdminAction}
                      disabled={actionConfirmLoading || actionConfirmReason.trim().length < 10}
                      className="min-h-[44px] w-full sm:w-auto"
                    >
                      {actionConfirmLoading ? 'Executando...' : 'Confirmar'}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
        {pendingActionProblem && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md" onClick={() => setPendingActionProblem(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 max-h-[min(92dvh,100svh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <h3 className="text-lg font-bold text-white mb-2">Confirmar ação</h3>
              <p className="text-sm text-zinc-300 mb-2">{pendingActionProblem.title}</p>
              <p className="text-xs text-zinc-400 mb-4">{pendingActionProblem.description}</p>
              <div className="p-3 bg-amber-950 border border-amber-800 rounded-xl mb-6">
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1">O que será feito</p>
                <p className="text-sm text-amber-200">{getActionDescription(pendingActionProblem)}</p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 justify-stretch sm:justify-end">
                <Button variant="secondary" onClick={() => setPendingActionProblem(null)} className="min-h-[44px] w-full sm:w-auto">
                  Cancelar
                </Button>
                <Button onClick={() => executeDiagnosticAction(pendingActionProblem)} className="min-h-[44px] w-full sm:w-auto">
                  Confirmar e resolver
                </Button>
              </div>
            </motion.div>
          </div>
        )}
        {editPlano && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[min(92dvh,100svh)] sm:max-h-[90vh] flex flex-col min-h-0 overflow-hidden">
              <h3 className="text-lg sm:text-2xl font-bold text-white px-4 sm:px-8 pt-5 sm:pt-8 pb-4 shrink-0 border-b border-zinc-800">Editar Cliente: {editPlano.nome_estabelecimento}</h3>
              <form onSubmit={handleUpdatePlano} className="flex flex-col flex-1 min-h-0">
                <div className="space-y-6 overflow-y-auto flex-1 min-h-0 px-4 sm:px-8 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Nome do Estabelecimento</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.nome_estabelecimento}
                      onChange={e => setEditPlano({...editPlano, nome_estabelecimento: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Razão Social</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.razao_social || ''}
                      onChange={e => setEditPlano({...editPlano, razao_social: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Documento ({editPlano.documento_tipo})</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.documento_numero}
                      onChange={e => setEditPlano({...editPlano, documento_numero: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Responsável</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.nome_responsavel}
                      onChange={e => setEditPlano({...editPlano, nome_responsavel: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">E-mail</label>
                    <input 
                      type="email"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.email}
                      onChange={e => setEditPlano({...editPlano, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">WhatsApp</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.whatsapp}
                      onChange={e => setEditPlano({...editPlano, whatsapp: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Cidade</label>
                    <input 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.cidade}
                      onChange={e => setEditPlano({...editPlano, cidade: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</label>
                    <select 
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                      value={editPlano.status}
                      onChange={e => setEditPlano({...editPlano, status: e.target.value})}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="bloqueado">Bloqueado</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-6">
                  <h4 className="text-sm font-bold text-white mb-4">Configurações de Plano</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Plano</label>
                      <select 
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
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
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                        value={editPlano.valor_plano}
                        onChange={e => setEditPlano({...editPlano, valor_plano: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Vencimento</label>
                      <input 
                        type="date"
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10"
                        value={editPlano.vencimento ? new Date(editPlano.vencimento).toISOString().split('T')[0] : ''}
                        onChange={e => setEditPlano({...editPlano, vencimento: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 p-4 sm:px-8 sm:pb-8 pt-4 border-t border-zinc-800 bg-zinc-900 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <Button type="submit" className="flex-1 min-h-[44px]">Salvar Alterações</Button>
                  <Button variant="secondary" type="button" onClick={() => setEditPlano(null)} className="min-h-[44px] sm:min-w-[120px]">Cancelar</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editSenha && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md max-h-[min(92dvh,100svh)] sm:max-h-[90vh] overflow-y-auto p-6 sm:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-violet-900 text-violet-300 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <KeyRound size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Alterar Senha</h3>
                  <p className="text-sm text-zinc-400">{editSenha.nome_estabelecimento}</p>
                  <p className="text-xs font-mono text-zinc-400">Usuário: {editSenha.usuario}</p>
                </div>
              </div>

              <div className="bg-amber-950 border border-amber-800 rounded-2xl p-4 mb-6 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">A nova senha será aplicada imediatamente. O cliente poderá fazer login com ela na próxima tentativa.</p>
              </div>

<form onSubmit={handleUpdateSenha} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Senha de Login do Cliente</label>
                  <div className="relative">
                    <input
                      type={novaSenhaVisivel ? 'text' : 'password'}
                      placeholder="Deixe em branco para não alterar"
                      className="w-full px-4 py-3 pr-12 bg-zinc-800 border border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all font-mono"
                      value={novaSenha}
                      onChange={e => setNovaSenha(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setNovaSenhaVisivel(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300 transition-colors"
                    >
                      {novaSenhaVisivel ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Sub-senha: Gerência</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 bg-amber-950 border border-amber-800 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold text-amber-200"
                      value={novaSenhaAdmin}
                      onChange={e => setNovaSenhaAdmin(e.target.value)}
                    />
                    <p className="text-[10px] text-zinc-400">Acesso a relatórios e exclusões.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Sub-senha: Caixa</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 bg-emerald-950 border border-emerald-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all font-mono font-bold text-emerald-200"
                      value={novaSenhaCaixa}
                      onChange={e => setNovaSenhaCaixa(e.target.value)}
                    />
                    <p className="text-[10px] text-zinc-400">Abertura e fechamento de caixa.</p>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4">
                  <Button type="submit" className="flex-1 min-h-[44px] bg-violet-600 hover:bg-violet-700">
                    <KeyRound size={16} /> Salvar Senhas
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => { setEditSenha(null); setNovaSenha(''); }} className="min-h-[44px] sm:min-w-[120px]">Cancelar</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showCreds && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto bg-zinc-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 text-center max-h-[min(92dvh,100svh)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="w-20 h-20 bg-emerald-900/60 text-emerald-300 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check size={40} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Cliente Aprovado!</h3>
              <p className="text-zinc-400 mb-8">Copie as credenciais abaixo e envie para o cliente.</p>
              
              <div className="space-y-4 text-left mb-8">
                <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-800 relative group">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Usuário</p>
                  <p className="font-mono font-bold text-white">{showCreds.usuario}</p>
                </div>
                <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-800 relative group">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Senha Temporária</p>
                  <p className="font-mono font-bold text-white">{showCreds.senha}</p>
                </div>
                <div className="bg-zinc-800 p-4 rounded-2xl border border-zinc-800">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Período de Teste — Expira em</p>
                  <p className="font-bold text-white">{new Date(showCreds.vencimento ?? showCreds.trial_fim).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <Button 
                  className="flex-1 min-h-[44px]"
                  onClick={() => {
                    const expira = new Date(showCreds.vencimento ?? showCreds.trial_fim).toLocaleDateString('pt-BR');
                    const text = `FlowPDV - Credenciais de Acesso\n\nUsuário: ${showCreds.usuario}\nSenha: ${showCreds.senha}\nExpira em: ${expira}`;
                    navigator.clipboard.writeText(text);
                    alert("Copiado para a área de transferência!");
                  }}
                >
                  <Copy size={18} /> Copiar Tudo
                </Button>
                <Button variant="secondary" onClick={() => setShowCreds(null)} className="min-h-[44px] sm:min-w-[100px]">Fechar</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
