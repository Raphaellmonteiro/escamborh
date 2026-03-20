export type PrintProfileKey = 'caixa' | 'cozinha' | 'mesa';

type PrintProfileConfig = {
  largura_papel?: number | string | null;
};

type PrinterConfigShape = PrintProfileConfig & {
  perfis?: Partial<Record<PrintProfileKey, PrintProfileConfig>> | null;
  profiles?: Partial<Record<PrintProfileKey, PrintProfileConfig>> | null;
};

function parsePrinterConfig(rawConfig: unknown): PrinterConfigShape | null {
  if (!rawConfig) return null;

  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig) as PrinterConfigShape;
    } catch {
      return null;
    }
  }

  if (typeof rawConfig === 'object') {
    return rawConfig as PrinterConfigShape;
  }

  return null;
}

export function normalizePaperColumns(value: unknown) {
  return Number(value) <= 32 ? 32 : 48;
}

export function getProfilePaperColumns(rawConfig: unknown, profile: PrintProfileKey) {
  const config = parsePrinterConfig(rawConfig);
  const profileConfig = config?.perfis?.[profile] || config?.profiles?.[profile];
  const configuredValue = profileConfig?.largura_papel ?? config?.largura_papel;

  return normalizePaperColumns(configuredValue);
}

export function getProfilePaperWidthMm(rawConfig: unknown, profile: PrintProfileKey) {
  return getProfilePaperColumns(rawConfig, profile) <= 32 ? 58 : 80;
}
