import { useMemo, useState, useEffect } from 'react';
import { api, fmtBRL, fmtDT, fmtNum, STATUS_COLOR, STATUS_LABEL } from './api';
import { applyUI } from './theme';
import { usePolling, Badge, Empty, Modal, Spinner, Toast } from './ui';

function MesaGrid({ mesas, onOpen }) {
  return (
    <div className="mesa-grid">
      {mesas.length === 0 && <Empty text="Nenhuma mesa atribuída a você. Fale com o ADM." />}
      {mesas.map((m) => {
        const ocupada = m.status === 'ocupada';
        return (
          <button key={m.id} className={'mesa-card ' + (ocupada ? 'mesa-ocupada' : 'mesa-livre')}
            onClick={() => { try { window.tapMesa(m.numero); } catch {} onOpen(m); }}>
            <span className="mesa-numero">{m.numero}</span>
            <span className="mesa-cap">{m.capacidade} lugares · {m.local}</span>
            <span className="mesa-status">{ocupada ? 'OCUPADA' : 'LIVRE'}</span>
          </button>
        );
      })}
    </div>
  );
}

function MesaPedido({ mesa, user, onClose, onChanged }) {
  const [products] = usePolling(() => api.get('/api/products'), 30000);
  const [orders] = usePolling(() => api.get('/api/orders?mesa_id=' + mesa.id), 6000);
  const [cart, setCart] = useState({});
  const [busca, setBusca] = useState('');
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const abertos = (orders || []).filter((o) => o.status !== 'fechado');
  const meuAberto = abertos.find((o) => o.funcionario && o.funcionario.id === user.id);
  const outrosAbertos = abertos.filter((o) => !o.funcionario || o.funcionario.id !== user.id);
  const mesmoDia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') : false);
  const fechadosHoje = (orders || []).filter((o) => o.status === 'fechado' && mesmoDia(o.criado_em));

  const prods = useMemo(() => {
    const list = (products || []).filter((p) => p.ativo);
    const b = busca.trim().toLowerCase();
    if (!b) return list;
    return list.filter((p) => p.nome.toLowerCase().includes(b) || p.categoria.toLowerCase().includes(b));
  }, [products, busca]);

  const categorias = useMemo(() => {
    const map = {};
    for (const p of prods) { (map[p.categoria] = map[p.categoria] || []).push(p); }
    return map;
  }, [prods]);

  function addQty(id, delta) {
    setCart((c) => {
      const cur = Number(c[id]) || 0;
      const novo = Math.max(0, cur + delta);
      const copy = { ...c };
      if (novo === 0) delete copy[id];
      else copy[id] = novo;
      return copy;
    });
  }

  const totalCart = useMemo(() => {
    let t = 0;
    for (const [id, q] of Object.entries(cart)) {
      const p = (products || []).find((x) => x.id === Number(id));
      if (p) t += q * p.preco;
    }
    return t;
  }, [cart, products]);

  async function enviar() {
    const itens = Object.entries(cart).map(([id, q]) => ({ produto_id: Number(id), quantidade: q * 1.0 }));
    if (itens.length === 0) return;
    setEnviando(true); setErro(''); setMsg('');
    try {
      if (meuAberto) {
        await api.post('/api/orders/' + meuAberto.id + '/items', { itens });
        setMsg('Itens adicionados ao pedido #' + meuAberto.id + ' e enviados!');
      } else {
        const o = await api.post('/api/orders', { mesa_id: mesa.id, itens, observacao: obs.trim() });
        setMsg('Pedido #' + o.id + ' enviado para o ODM!');
      }
      setCart({}); setObs('');
      onChanged();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={'Mesa ' + mesa.numero + ' · ' + mesa.local} onClose={onClose} wide>
      <div className="pedido-layout">
        <div className="pedido-produtos">
          <input className="input" placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          {!products && <Spinner />}
          {products && categorias && Object.keys(categorias).length === 0 && <Empty text="Nenhum produto" />}
          {Object.entries(categorias).map(([cat, items]) => (
            <div key={cat || 'Outros'} className="cat-block">
              <h4>{cat || 'Outros'}</h4>
              <div className="prod-list">
                {items.map((p) => (
                  <div key={p.id} className={'prod-item' + (Number(p.estoque) <= 0 ? ' prod-sem' : '')}>
                    <div className="prod-info">
                      <div className="prod-nome">{p.nome}</div>
                      <div className="prod-meta">
                        {fmtBRL(p.preco)} · {fmtNum(p.estoque)} {p.unidade} em estoque
                      </div>
                    </div>
                    <div className="prod-qty">
                      <button className="icon-btn" onClick={() => addQty(p.id, 1)}>+</button>
                      <span className="qty-val">{fmtNum(cart[p.id] || 0)}</span>
                      <button className="icon-btn" onClick={() => addQty(p.id, -1)}>−</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pedido-box">
          <h4>Pedidos da mesa</h4>
          {abertos.length === 0 && <div className="subtle">Nenhum pedido em aberto.</div>}
          {meuAberto && (
            <div className="aviso">Itens novos entrarão no seu pedido <b>#{meuAberto.id}</b> — total atual {fmtBRL(meuAberto.total)}</div>
          )}
          {outrosAbertos.length > 0 && (
            <div className="subtle">Há pedidos de outros funcionários nesta mesa. Seu pedido será separado.</div>
          )}
          <div className="comandas">
            {abertos.map((o) => (
              <div key={o.id} className="comanda">
                <div className="comanda-head">
                  <span>#{o.id} · {(o.funcionario && o.funcionario.nome) || '—'}</span>
                  <Badge color={STATUS_COLOR[o.status] || '#888'}>{STATUS_LABEL[o.status] || o.status}</Badge>
                </div>
                <div className="comanda-itens">
                  {(o.itens || []).map((it) => (
                    <div key={it.id} className="comanda-item">
                      <span>{fmtNum(it.quantidade)} x {it.nome}</span>
                      <span>{fmtBRL(it.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="comanda-total">
                  <span>Total pedido</span>
                  <b>{fmtBRL(o.total)}</b>
                </div>
              </div>
            ))}
          </div>
          {fechadosHoje.length > 0 && (
            <details className="comanda-hist">
              <summary>🕐 Já pagos hoje ({fechadosHoje.length})</summary>
              {fechadosHoje.map((o) => (
                <div key={o.id} className="comanda">
                  <div className="comanda-head">
                    <span>#{o.id} · {(o.funcionario && o.funcionario.nome) || '—'}</span>
                    <span className="subtle">{fmtDT(o.fechado_em || o.criado_em)}</span>
                  </div>
                  <div className="comanda-itens">
                    {(o.itens || []).map((it) => (
                      <div key={it.id} className="comanda-item">
                        <span>{fmtNum(it.quantidade)} x {it.nome}</span>
                        <span>{fmtBRL(it.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="comanda-total">
                    <span>Total</span>
                    <b>{fmtBRL(o.total)}</b>
                  </div>
                </div>
              ))}
            </details>
          )}

          <h4>Carrinho</h4>
          <div className="carrinho">
            {Object.keys(cart).length === 0 && <div className="subtle">Selecione produtos.</div>}
            {Object.entries(cart).map(([id, q]) => {
              const p = (products || []).find((x) => x.id === Number(id));
              if (!p) return null;
              return (
                <div key={id} className="cart-row">
                  <span className="cart-nome">{p.nome}</span>
                  <span className="cart-qty">{fmtNum(q)} x {fmtBRL(p.preco)}</span>
                  <span className="cart-sub">{fmtBRL(q * p.preco)}</span>
                </div>
              );
            })}
          </div>

          <input className="input" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
          <div className="total-row">
            <span>Total</span>
            <b>{fmtBRL(totalCart)}</b>
          </div>
          <button className="btn btn-primary btn-block" onClick={enviar} disabled={enviando || Object.keys(cart).length === 0}>
            {enviando ? 'Enviando...' : meuAberto ? 'Adicionar e enviar' : 'Enviar pedido ao ODM'}
          </button>
          {erro && <div className="form-error">{erro}</div>}
        </div>
      </div>
      <Toast msg={msg} />
    </Modal>
  );
}

function MeusPedidos({ user }) {
  const [orders] = usePolling(() => api.get('/api/orders'), 6000);
  const meus = (orders || []).filter((o) => o.funcionario && o.funcionario.id === user.id);

  return (
    <div className="lista">
      {meus.length === 0 && <Empty text="Você ainda não fez pedidos." />}
      {meus.map((o) => (
        <div key={o.id} className="row-card pedido-papel">
          <div className="row-card-head">
            <span className="row-card-title">Pedido #{o.id} · Mesa {o.mesa_numero}</span>
            <Badge color={STATUS_COLOR[o.status] || '#888'}>{STATUS_LABEL[o.status] || o.status}</Badge>
          </div>
          <div className="row-card-body">
            <div>
              {o.itens.map((it, i) => (
                <div key={i}>{fmtNum(it.quantidade)}x {it.nome}</div>
              ))}
            </div>
            <div className="row-card-total">
              <div>{fmtDT(o.criado_em)}</div>
              <b>{fmtBRL(o.total)}</b>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WaiterApp({ user, onLogout }) {
  const [tab, setTab] = useState('mesas');
  const [mesaSel, setMesaSel] = useState(null);
  const [aberta] = usePolling(() => api.get('/api/tables'), 6000);
  const [cfgEst] = usePolling(() => api.get('/api/settings'), 15000);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (cfgEst && cfgEst.ui) applyUI(cfgEst.ui);
  }, [cfgEst]);

  return (
    <div className="waiter">
      <header className="topbar">
        <div>
          <span className="topbar-nome">{cfgEst ? cfgEst.estabelecimento : user.nome}</span>
          <span className="topbar-cod">{cfgEst && cfgEst.estabelecimento ? user.nome + ' · código ' + user.codigo : 'Código ' + user.codigo}</span>
        </div>
        <button className="btn btn-ghost" onClick={onLogout}>Sair</button>
      </header>

      <nav className="tabs">
        <button className={'tab' + (tab === 'mesas' ? ' tab-active' : '')} onClick={() => setTab('mesas')}>Minhas Mesas</button>
        <button className={'tab' + (tab === 'pedidos' ? ' tab-active' : '')} onClick={() => setTab('pedidos')}>Meus Pedidos</button>
      </nav>

      <div className="waiter-body" key={refreshTick}>
        {tab === 'mesas' && (
          <MesaGrid mesas={aberta || []} onOpen={setMesaSel} />
        )}
        {tab === 'pedidos' && <MeusPedidos user={user} />}
      </div>

      {mesaSel && (
        <MesaPedido
          mesa={mesaSel}
          user={user}
          onClose={() => setMesaSel(null)}
          onChanged={() => setRefreshTick((t) => t + 1)}
        />
      )}
    </div>
  );
}