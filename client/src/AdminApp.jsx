import { useState } from 'react';
import { api } from './api';
import { applyUI } from './theme';
import { usePolling } from './ui';
import TopBar from './TopBar';
import Dashboard from './Dashboard';
import ODM from './ODM';
import Mesas from './Mesas';
import Produtos from './Produtos';
import Movimentos from './Movimentos';
import Fornecedores from './Fornecedores';
import Compras from './Compras';
import Financeiro from './Financeiro';
import Usuarios from './Usuarios';
import Config from './Config';

const MENU = [
  { id: 'painel', label: 'Visão Geral', icon: '📊' },
  { id: 'odm', label: 'ODM · Pedidos', icon: '🍺' },
  { id: 'mesas', label: 'Mesas', icon: '🪑' },
  { id: 'produtos', label: 'Produtos / Estoque', icon: '📦' },
  { id: 'financeiro', label: 'Financeiro', icon: '💰' },
  { id: 'movimentos', label: 'Movimentações', icon: '↔️' },
  { id: 'fornecedores', label: 'Fornecedores', icon: '🚚' },
  { id: 'compras', label: 'Compras', icon: '🧾' },
  { id: 'usuarios', label: 'Usuários', icon: '👥' },
  { id: 'config', label: 'Configurações', icon: '⚙️' }
];

export default function AdminApp({ user, onLogout }) {
  const [sec, setSec] = useState('painel');
  const [cfg, , refCfg] = usePolling(() => api.get('/api/settings'), 15000);
  const [tema, setTema] = useState(null);
  const temaAtual = tema || (cfg && cfg.ui && cfg.ui.tema) || 'papel';
  const titulo = (cfg && cfg.estabelecimento) || 'Barraca';
  document.title = titulo;

  async function toggleTema() {
    const base = (cfg && cfg.ui) || {};
    const novo = { ...base, tema: temaAtual === 'escuro' ? 'papel' : 'escuro' };
    setTema(novo.tema);
    applyUI(novo);
    try {
      await api.put('/api/settings', { ui: novo });
      refCfg();
    } catch (e) {
      setTema(temaAtual);
      applyUI({ ...base, tema: temaAtual });
      window.alert('Erro ao trocar o tema: ' + e.message);
    }
  }

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-ico">🍺</span>
          <div>
            <div className="sidebar-title">{titulo}</div>
            <div className="sidebar-sub">ADM · ODM</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {MENU.map((m) => (
            <button
              key={m.id}
              className={'side-item' + (sec === m.id ? ' side-active' : '')}
              onClick={() => setSec(m.id)}
            >
              <span>{m.icon}</span> {m.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>{user.nome}</div>
          <div className="subtle">cód. {user.codigo}</div>
          <button className="btn btn-ghost btn-block" onClick={onLogout}>Sair</button>
        </div>
      </aside>

      <main className="main">
        <TopBar cfg={cfg} tema={temaAtual} onToggleTema={toggleTema} />
        <div className="main-content">
          {sec === 'painel' && <Dashboard onGoTo={setSec} />}
          {sec === 'odm' && <ODM />}
          {sec === 'mesas' && <Mesas />}
          {sec === 'produtos' && <Produtos />}
          {sec === 'movimentos' && <Movimentos />}
          {sec === 'fornecedores' && <Fornecedores />}
          {sec === 'compras' && <Compras />}
          {sec === 'financeiro' && <Financeiro />}
          {sec === 'usuarios' && <Usuarios />}
          {sec === 'config' && <Config />}
        </div>
      </main>
    </div>
  );
}