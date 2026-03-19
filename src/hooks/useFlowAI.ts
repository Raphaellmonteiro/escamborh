// src/hooks/useFlowAI.ts
import { useState, useCallback } from 'react';

export interface Aviso {
  id: number;
  tipo: 'alerta' | 'oportunidade' | 'parabens' | 'atencao';
  titulo: string;
  mensagem: string;
  acao?: string;
  acao_rota?: string;
  prioridade: 1 | 2 | 3;
  lido: number;
  created_at: string;
}

export interface MetricaDestaque {
  label: string;
  valor: string;
  tendencia: 'up' | 'down' | 'stable';
}

export interface InsightIA {
  resumo: string;
  insight: string;
  recomendacao: string;
  tipo: 'oportunidade' | 'alerta' | 'parabens' | 'neutro';
  metricas_destaque?: MetricaDestaque[];
  erro?: string;
}

export function useFlowAI(token: string | null) {
  const [avisos, setAvisos]             = useState<Aviso[]>([]);
  const [historico, setHistorico]       = useState<Aviso[]>([]);
  const [historicoTotal, setHistoricoTotal] = useState(0);
  const [avisoAtivo, setAvisoAtivo]     = useState<Aviso | null>(null);
  const [carregando, setCarregando]     = useState(false);
  const [carregandoHist, setCarregandoHist] = useState(false);

  // ── Helpers localStorage para anti-spam ─────────────────────────────────
  const STORAGE_KEY = 'flowai_vistos_hoje';

  const getVistosHoje = (): number[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const { data, ids } = JSON.parse(raw);
      const hoje = new Date().toDateString();
      return data === hoje ? ids : [];
    } catch { return []; }
  };

  const marcarVistoHoje = (id: number) => {
    try {
      const hoje = new Date().toDateString();
      const ids  = getVistosHoje();
      if (!ids.includes(id)) ids.push(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: hoje, ids }));
    } catch {}
  };

  // ── Busca avisos não lidos (para popups) ────────────────────────────────
  const buscarAvisos = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/ai/avisos', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const lista: Aviso[] = await res.json();
      setAvisos(lista);
      const vistosHoje = getVistosHoje();
      const hoje = new Date().toDateString();
      // Só mostra como popup avisos criados HOJE e não vistos ainda
      // Avisos antigos ficam apenas no histórico — não repetem como popup
      const pendentes = lista.filter(a => {
        if (a.lido || vistosHoje.includes(a.id)) return false;
        try {
          const raw = a.created_at.includes('T') ? a.created_at : a.created_at.replace(' ', 'T');
          return new Date(raw).toDateString() === hoje;
        } catch { return false; }
      });
      setAvisoAtivo(prev => {
        if (prev && pendentes.find(p => p.id === prev.id)) return prev;
        return pendentes[0] || null;
      });
    } catch {}
  }, [token]);

  // ── Busca histórico completo (lidos + não lidos) ─────────────────────────
  const buscarHistorico = useCallback(async (limit = 100, offset = 0) => {
    if (!token) return;
    setCarregandoHist(true);
    try {
      const res = await fetch(`/api/ai/avisos/historico?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistorico(data.avisos || []);
      setHistoricoTotal(data.total || 0);
    } catch {} finally {
      setCarregandoHist(false);
    }
  }, [token]);

  // ── Marcar lido ─────────────────────────────────────────────────────────
  const marcarLido = useCallback(async (id: number) => {
    if (!token) return;
    // Atualização OTIMISTA — fecha o popup imediatamente sem esperar o fetch
    setAvisos(prev => prev.map(a => a.id === id ? { ...a, lido: 1 } : a));
    setHistorico(prev => prev.map(a => a.id === id ? { ...a, lido: 1 } : a));
    marcarVistoHoje(id);
    // Fetch em background — não bloqueia o fechamento
    fetch(`/api/ai/avisos/${id}/lido`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [token]);

  // ── Marcar todos como lidos ──────────────────────────────────────────────
  const marcarTodosLidos = useCallback(async () => {
    if (!token) return;
    try {
      await fetch('/api/ai/avisos/todos-lidos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setAvisos(prev => prev.map(a => ({ ...a, lido: 1 })));
      setHistorico(prev => prev.map(a => ({ ...a, lido: 1 })));
      setAvisoAtivo(null);
      // Marca todos como vistos hoje no localStorage — lê estado via setAvisos
      // para garantir que temos os IDs mais recentes sem precisar de dep extra
      setAvisos(curr => {
        curr.forEach(a => marcarVistoHoje(a.id));
        return curr; // retorna a mesma referência → React não re-renderiza
      });
    } catch {}
  }, [token]);

  // ── Gerar avisos no servidor ─────────────────────────────────────────────
  const gerarAvisos = useCallback(async () => {
    if (!token) return;
    try {
      await fetch('/api/ai/avisos/gerar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [token]);

  // ── Analisar com Claude ──────────────────────────────────────────────────
  const analisar = useCallback(async (
    tipo: string,
    pergunta?: string,
  ): Promise<InsightIA | null> => {
    if (!token) return null;
    setCarregando(true);
    try {
      const res = await fetch('/api/ai/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, pergunta }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      setCarregando(false);
    }
  }, [token]);

  const proximoAviso = useCallback(() => {
    // Fecha imediatamente
    setAvisoAtivo(null);
    // Calcula próximo pendente fora do updater — evita setTimeout dentro de
    // state updater, que em React 18 (concurrent mode) pode disparar múltiplas vezes.
    setAvisos(curr => {
      const vistosHoje = getVistosHoje();
      const hoje = new Date().toDateString();
      const pendentes = curr.filter(a => {
        if (a.lido || vistosHoje.includes(a.id)) return false;
        try {
          const raw = a.created_at.includes('T') ? a.created_at : a.created_at.replace(' ', 'T');
          return new Date(raw).toDateString() === hoje;
        } catch { return false; }
      });
      // Agenda exibição do próximo aviso APÓS a animação de saída (400ms)
      // O setTimeout fica FORA do updater: chamamos setAvisoAtivo em callback separado
      if (pendentes.length > 0) {
        const proximo = pendentes[0];
        // queueMicrotask garante que o setTimeout é agendado uma única vez,
        // após o batch de updates do React ser concluído
        queueMicrotask(() => setTimeout(() => setAvisoAtivo(proximo), 400));
      }
      return curr; // sem mudança no array → sem re-render extra
    });
  }, []);

  const avisosNaoLidos = avisos.filter(a => !a.lido).length;

  return {
    avisos,
    historico,
    historicoTotal,
    avisoAtivo,
    carregando,
    carregandoHist,
    avisosNaoLidos,
    buscarAvisos,
    buscarHistorico,
    marcarLido,
    marcarTodosLidos,
    gerarAvisos,
    analisar,
    proximoAviso,
  };
}