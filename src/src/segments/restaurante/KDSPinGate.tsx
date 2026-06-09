import React from 'react';

export default function KDSPinGate({ slug, onUnlock }: { slug: string; onUnlock: (token: string) => void }) {
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (!pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/public/kds-pin/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'PIN incorreto'); return; }
      sessionStorage.setItem(`kds_token_${slug}`, data.token);
      onUnlock(data.token);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div style={{
      minHeight: '100vh', background: '#09090b', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <div style={{
        background: '#18181b', border: '1px solid #27272a', borderRadius: 24,
        padding: 40, width: '100%', maxWidth: 380, boxShadow: '0 25px 60px rgba(0,0,0,.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>Tela da Cozinha</h1>
          <p style={{ color: '#71717a', fontSize: 14, marginTop: 8 }}>Digite o PIN para acessar</p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
          style={{
            width: '100%', height: 52, borderRadius: 12, border: '1px solid #27272a',
            background: '#09090b', color: '#fff', fontSize: 20, textAlign: 'center',
            outline: 'none', boxSizing: 'border-box', letterSpacing: 8,
          }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !pin.trim()}
          style={{
            width: '100%', height: 52, borderRadius: 12, border: 'none',
            background: loading || !pin.trim() ? '#27272a' : '#fff',
            color: loading || !pin.trim() ? '#52525b' : '#09090b',
            fontSize: 15, fontWeight: 700, cursor: loading || !pin.trim() ? 'not-allowed' : 'pointer',
            marginTop: 16, transition: '.15s'
          }}
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
