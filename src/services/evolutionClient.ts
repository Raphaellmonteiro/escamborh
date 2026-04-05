import axios, { AxiosError, AxiosInstance } from 'axios';

type EvolutionApiData = Record<string, unknown>;

export type EvolutionApiResponse<TData = EvolutionApiData> = {
  data: TData;
  status: number;
};

type CreateInstancePayload = {
  instanceName: string;
};

type SendTextPayload = {
  number: string;
  text: string;
};

function normalizeRequiredEnv(value: string | undefined, envName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${envName} nao configurada`);
  }

  return normalized;
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} obrigatorio`);
  }

  return normalized;
}

function createEvolutionApiClient(): AxiosInstance {
  return axios.create({
    baseURL: normalizeRequiredEnv(process.env.EVOLUTION_API_URL, 'EVOLUTION_API_URL'),
    headers: {
      apikey: normalizeRequiredEnv(process.env.EVOLUTION_API_KEY, 'EVOLUTION_API_KEY'),
      'Content-Type': 'application/json',
    },
  });
}

function buildErrorMessage(error: unknown, fallbackMessage: string) {
  if (axios.isAxiosError(error)) {
    const responseMessage = extractAxiosResponseMessage(error);
    if (responseMessage) {
      return responseMessage;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function extractAxiosResponseMessage(error: AxiosError<unknown>) {
  const responseData = error.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData;
  }

  if (responseData && typeof responseData === 'object') {
    const message = (responseData as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const errorText = (responseData as Record<string, unknown>).error;
    if (typeof errorText === 'string' && errorText.trim()) {
      return errorText;
    }
  }

  return null;
}

async function requestEvolutionApi<TData>(
  request: () => Promise<{ data: TData; status: number }>,
  fallbackMessage: string
): Promise<EvolutionApiResponse<TData>> {
  try {
    const response = await request();

    return {
      data: response.data,
      status: response.status,
    };
  } catch (error) {
    throw new Error(buildErrorMessage(error, fallbackMessage));
  }
}

export async function createInstance<TData = EvolutionApiData>(instanceName: string) {
  const client = createEvolutionApiClient();
  const payload: CreateInstancePayload = {
    instanceName: normalizeRequiredText(instanceName, 'instanceName'),
  };

  return requestEvolutionApi(
    () => client.post<TData>('/instance/create', payload),
    'Erro ao criar instancia na Evolution API'
  );
}

export async function connectInstance<TData = EvolutionApiData>(instanceName: string) {
  const client = createEvolutionApiClient();
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  return requestEvolutionApi(
    () => client.get<TData>(`/instance/connect/${encodeURIComponent(normalizedInstanceName)}`),
    'Erro ao conectar instancia na Evolution API'
  );
}

export async function getConnectionState<TData = EvolutionApiData>(instanceName: string) {
  const client = createEvolutionApiClient();
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  return requestEvolutionApi(
    () => client.get<TData>(`/instance/connectionState/${encodeURIComponent(normalizedInstanceName)}`),
    'Erro ao consultar estado da conexao na Evolution API'
  );
}

export async function sendText<TData = EvolutionApiData>(
  instanceName: string,
  number: string,
  text: string
) {
  const client = createEvolutionApiClient();
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');
  const payload: SendTextPayload = {
    number: normalizeRequiredText(number, 'number'),
    text: normalizeRequiredText(text, 'text'),
  };

  return requestEvolutionApi(
    () => client.post<TData>(`/message/sendText/${encodeURIComponent(normalizedInstanceName)}`, payload),
    'Erro ao enviar texto pela Evolution API'
  );
}
