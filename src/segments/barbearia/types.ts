export interface BarberCliente {
  id: number; nome: string; cpf?: string; telefone?: string; email?: string;
  data_nascimento?: string; observacoes?: string; created_at: string;
  tem_assinatura?: number; plano_nome?: string;
}
export interface Agendamento {
  id: number; cliente_id?: number; cliente_nome: string; servico_nome: string;
  barbeiro: string; data: string; hora: string;
  status: 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado';
  observacao?: string; valor: number;
}
export interface FidelidadeRegra { id: number; nome: string; meta: number; descricao?: string; ativo: number; }
export interface FidelidadeCartao { id: number; regra_id: number; regra_nome: string; meta: number; contagem: number; total_ganhos: number; }
export interface PlanoServico { id: number; plano_id: number; produto_id: number; produto_nome: string; quantidade: number; }
export interface AssinaturaPlan { id: number; nome: string; descricao?: string; valor_mensal: number; ativo: number; tipo_plano: 'pacote' | 'ilimitado'; servicos?: PlanoServico[]; }
