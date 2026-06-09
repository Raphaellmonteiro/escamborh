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

export type SetWebhookPayload = {
  enabled: boolean;
  url: string;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  events: string[];
};

export type EvolutionApiClientConfig = {
  baseUrl?: string | null;
  apiKey?: string | null;
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

function resolveConfigOrEnvValue(
  configuredValue: string | null | undefined,
  envName: 'EVOLUTION_API_URL' | 'EVOLUTION_API_KEY'
) {
  const normalized = configuredValue?.trim();
  if (normalized) {
    return normalized;
  }

  return normalizeRequiredEnv(process.env[envName], envName);
}

function createEvolutionApiClient(config: EvolutionApiClientConfig = {}): AxiosInstance {
  return axios.create({
    baseURL: resolveConfigOrEnvValue(config.baseUrl, 'EVOLUTION_API_URL'),
    headers: {
      apikey: resolveConfigOrEnvValue(config.apiKey, 'EVOLUTION_API_KEY'),
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

export async function createInstance<TData = EvolutionApiData>(
  instanceName: string,
  config?: EvolutionApiClientConfig
) {
  const client = createEvolutionApiClient(config);
  const payload: CreateInstancePayload = {
    instanceName: normalizeRequiredText(instanceName, 'instanceName'),
  };

  return requestEvolutionApi(
    () => client.post<TData>('/instance/create', payload),
    'Erro ao criar instancia na Evolution API'
  );
}

export async function connectInstance<TData = EvolutionApiData>(
  instanceName: string,
  config?: EvolutionApiClientConfig
) {
  const client = createEvolutionApiClient(config);
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  return requestEvolutionApi(
    () => client.get<TData>(`/instance/connect/${encodeURIComponent(normalizedInstanceName)}`),
    'Erro ao conectar instancia na Evolution API'
  );
}

export async function getConnectionState<TData = EvolutionApiData>(
  instanceName: string,
  config?: EvolutionApiClientConfig
) {
  const client = createEvolutionApiClient(config);
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  return requestEvolutionApi(
    () => client.get<TData>(`/instance/connectionState/${encodeURIComponent(normalizedInstanceName)}`),
    'Erro ao consultar estado da conexao na Evolution API'
  );
}

export async function setWebhook<TData = EvolutionApiData>(
  instanceName: string,
  payload: SetWebhookPayload,
  config?: EvolutionApiClientConfig
) {
  const client = createEvolutionApiClient(config);
  const normalizedInstanceName = normalizeRequiredText(instanceName, 'instanceName');

  return requestEvolutionApi(
    () =>
      client.post<TData>(
        `/webhook/set/${encodeURIComponent(normalizedInstanceName)}`,
        payload
      ),
    'Erro ao configurar webhook na Evolution API'
  );
}

export async function sendText<TData = EvolutionApiData>(
  instanceName: string,
  number: string,
  text: string,
  config?: EvolutionApiClientConfig
) {
  const client = createEvolutionApiClient(config);
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
