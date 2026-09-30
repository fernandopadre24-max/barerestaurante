import { useEffect, useState } from 'react';
import { api } from './api';

export default function Login({ onLogin }) {
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.post('/api/auth/login', { codigo, pin });
      localStorage.setItem('token', r.token);
      onLogin(r.usuario);
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🍺</div>
        <h1>Barraca</h1>
        <p className="login-sub">Gestão de Restaurante / Bar</p>
        <form onSubmit={entrar}>
          <input
            className="input"
            placeholder="Código do funcionário"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          {err && <div className="form-error">{err}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || !codigo || !pin}>
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="login-hint">
          <strong>Acesso inicial</strong>
          <div>ADM: código <b>1</b> · PIN <b>1234</b></div>
          <div>Garçom: código <b>2</b> · PIN <b>1234</b></div>
        </div>
      </div>
    </div>
  );
}