// src/types/express.d.ts
// Estende o tipo Request do Express com os campos injetados pelo middleware

declare namespace Express {
  interface Request {
    tenantId?: number;
    user?: {
      id: number;
      username: string;
      token_version?: number;
    };
    // Campos injetados para sub-usuários (atendentes, gerentes, etc.)
    userCargo?: string;
    userPermissoes?: string[] | null;
    userName?: string;
    // Campos injetados pelo authDeliveryCliente
    clienteId?: number;
  }
}