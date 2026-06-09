export function isPrintableHtmlDocument(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

export function ensurePrintableHtmlDocument(value: string) {
  if (isPrintableHtmlDocument(value)) return value;

  const escaped = String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<html><body><pre style="font-family:monospace;font-size:12px;padding:16px;white-space:pre-wrap">${escaped}</pre></body></html>`;
}

export function openPrintPreview(html: string, features = 'width=420,height=700') {
  const win = window.open('', '_blank', features);
  if (!win) return null;

  win.document.write(ensurePrintableHtmlDocument(html));
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      // Browser-specific popup/print failures should not break the flow.
    }
  }, 350);

  return win;
}

export async function fetchPrintableHtml(url: string, token?: string) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Falha ao gerar impressao (${res.status})`);
  }

  return res.text();
}

export async function openPrintPreviewFromUrl(
  url: string,
  token?: string,
  features = 'width=420,height=700'
) {
  const html = await fetchPrintableHtml(url, token);
  return openPrintPreview(html, features);
}
