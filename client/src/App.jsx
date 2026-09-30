import { useEffect, useState } from 'react';
import Login from './Login';
import WaiterApp from './WaiterApp';
import AdminApp from './AdminApp';
import { api } from './api';
import { applyUI } from './theme';
import { Spinner } from './ui';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get('/api/settings')
      .then((s) => applyUI(s.ui))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/api/auth/me')
      .then((r) => setUser(r.usuario))
      .catch(() => {})
      .finally(() => setLoading(false));

    const onLogoutEvent = () => setUser(null);
    window.addEventListener('sessao-modal', onLogoutEvent);
    return () => window.removeEventListener('sessao-modal', onLogoutEvent);
  }, []);

  async function sair() {
    try { await api.post('/api/auth/logout'); } catch {}
    localStorage.removeItem('token');
    setUser(null);
  }

  if (loading) return <div className="center-screen"><Spinner /></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.papel === 'adm') return <AdminApp user={user} onLogout={sair} />;
  return <WaiterApp user={user} onLogout={sair} />;
}