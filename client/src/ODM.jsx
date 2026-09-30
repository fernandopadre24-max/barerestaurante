import { useMemo, useState } from 'react';
import { api, fmtBRL, fmtDT, PAG_COLOR, PAG_LABEL, PAG_ICON, STATUS_COLOR, STATUS_LABEL } from './api';
import { usePolling, Badge, Btn, Empty, Modal, Spinner, Toast } from './ui';
import ReceiptModal from './ReceiptModal';
import PaymentModal from './PaymentModal';

function EditOrderModal({ order, onClose, onSaved }) {
  const [products] = usePolling(() => api.get('/api/products'), 60000);
  const [rows, setRows] = useState(() =>
    (order.itens || []).map((it) => ({ ...it, produto_id: it.produto_id, quantidade: it.quantidade }))
  );
  const [status, setStatus] = useState(order.status);
  const [addProd, setAddProd] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const total = useMemo(() => {
    let t = 0;
    for (const r of rows) {
      const p = (products || []).find((x) => x.id === Number(r.produto_id));
      t += (r.preco || (p ? p.preco : 0)) * Number(r.quantidade);
    }
    return t;
  }, [rows, products]);

  function mudarQty(i, q) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantidade: Math.max(0.5, Number(q) || 0) } : r)));
  }

  function remover(i) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function adicionar() {
    if (!addProd) return;
    setRows((rs) => [...rs, { produto_id: Number(addProd), quantidade: Number(addQty) || 1, preco: 0 }]);
    setAddProd(''); setAddQty(1);
  }

  async function salvar() {
    const itens = rows.filter((r) => r.quantidade > 0).map((r) => ({ produto_id: r.produto_id, quantidade: Number(r.quantidade) }));
    if (itens.length === 0) { setErro('O pedido deve ter pelo menos um item.'); return; }
    setBusy(true); setErro(''); setMsg('');
    try {
      await api.put('/api/orders/' + order.id, { itens, status });
      setMsg('Pedido atualizado!');
      onSaved();
      setTimeout(onClose, 800);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={'Editar Pedido #' + order.id} onClose={onClose} wide>
      <div className="campo-linha">
        <label className="field">
          <span className="field-label">Novo status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = (products || []).find((x) => x.id === Number(r.produto_id));
              const nome = r.nome || (p ? p.nome : 'Produto #' + r.produto_id);
              const preco = r.preco || (p ? p.preco : 0);
              return (
                <tr key={i}>
                  <td>{nome}</td>
                  <td><input className="input input-num" type="number" step="0.5" min="0.5" value={r.quantidade} onChange={(e) => mudarQty(i, e.target.value)} /></td>
                  <td>{fmtBRL(preco)}</td>
                  <td>{fmtBRL(preco * Number(r.quantidade))}</td>
                  <td><button className="icon-btn" onClick={() => remover(i)}>🗑</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="adicionar-produto">
        <select className="input" value={addProd} onChange={(e) => setAddProd(e.target.value)}>
          <option value="">+ Adicionar produto...</option>
          {(products || []).filter((p) => p.ativo).map((p) => (
            <option key={p.id} value={p.id}>{p.nome} — {fmtBRL(p.preco)}</option>
          ))}
        </select>
        <input className="input input-num" type="number" step="0.5" min="0.5" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
        <Btn onClick={adicionar} disabled={!addProd}>Adicionar</Btn>
      </div>

      <div className="total-row">
        <span>Total</span>
        <b>{fmtBRL(total)}</b>
      </div>

      <div className="row-gap">
        <Btn variant="primary" onClick={salvar} disabled={busy}>{busy ? 'Salvando...' : 'Salvar alterações'}</Btn>
      </div>
      <Toast msg={msg} />
      {erro && <div className="form-error">{erro}</div>}
    </Modal>
  );
}

function DetalhePedido({ order, settings, onClose, onNeedRefresh }) {
  const [editando, setEditando] = useState(false);
  const [cupom, setCupom] = useState(false);
  const [pagar, setPagar] = useState(false);
  const [fecharMesa, setFecharMesa] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const [mesaOrders] = usePolling(() => api.get('/api/orders?mesa_id=' + order.mesa_id), 10000);
  const abertosNaMesa = (mesaOrders || []).filter((o) => o.status !== 'fechado');
  const totalMesa = abertosNaMesa.reduce((s, o) => s + Number(o.total), 0);

  async function mudarStatus(st) {
    setBusy(st); setErro('');
    try {
      await api.post('/api/orders/' + order.id + '/status', { status: st });
      setMsg('Status atualizado para "' + STATUS_LABEL[st] + '"');
      onNeedRefresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy('');
    }
  }

  async function pagarOrdem(dados) {
    const o = await api.post('/api/orders/' + order.id + '/fechar', dados);
    const liquido = Number(o.total_liquido) || Number(o.total);
    setMsg('Pedido fechado via ' + PAG_LABEL[dados.pagamento] + ' · Total pago ' + fmtBRL(liquido) + (dados.desconto > 0 ? ' (-desconto ' + fmtBRL(dados.desconto) + ')' : '') + '.');
    onNeedRefresh();
  }

  async function fecharMesaInteira(dados) {
    const r = await api.post('/api/mesas/' + order.mesa_id + '/fechar', dados);
    setMsg(r.fechados + ' pedido(s) fechado(s) via ' + PAG_LABEL[dados.pagamento] + ' · Total ' + fmtBRL(r.total) + (dados.desconto > 0 ? ' (-desconto ' + fmtBRL(dados.desconto) + ')' : '') + '. Mesa liberada!');
    onNeedRefresh();
  }

  async function excluir() {
    if (!window.confirm('Excluir o pedido #' + order.id + '? O estoque será devolvido.')) return;
    setBusy('del'); setErro('');
    try {
      await api.del('/api/orders/' + order.id);
      setMsg('Pedido excluído');
      onNeedRefresh();
      setTimeout(onClose, 700);
    } catch (e) {
      setErro(e.message);
      setBusy('');
    }
  }

  const fechado = order.status === 'fechado';

  return (
    <Modal title={'Pedido #' + order.id + ' · Mesa ' + order.mesa_numero} onClose={onClose} wide>
      <div className="preview-cupom">
        <div><b>Funcionário:</b> {order.funcionario ? order.funcionario.nome + ' (cód. ' + order.funcionario.codigo + ')' : '-'}</div>
        <div><b>Aberto em:</b> {fmtDT(order.criado_em)}</div>
        <div><b>Status:</b> <Badge color={STATUS_COLOR[order.status] || '#888'}>{STATUS_LABEL[order.status] || order.status}</Badge>
        {order.status === 'fechado' && (
          <span style={{ marginLeft: 8 }}>
            <Badge color={PAG_COLOR[order.pagamento] || '#888'}>{PAG_ICON[order.pagamento] || ''} {order.pagamento ? PAG_LABEL[order.pagamento] : 'Sem pagamento'}</Badge>
            {order.fechado_em && <span className="subtle"> · fechado {fmtDT(order.fechado_em)}</span>}
          </span>
        )}
        </div>
        {order.observacao && <div><b>Obs:</b> {order.observacao}</div>}
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
          <tbody>
            {order.itens.map((it) => (
              <tr key={it.id}>
                <td>{it.nome}</td>
                <td>{it.quantidade} {it.unidade}</td>
                <td>{fmtBRL(it.preco)}</td>
                <td>{fmtBRL(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="total-row"><span>Total</span><b>{fmtBRL(order.total)}</b></div>
      {fechado && Number(order.desconto) > 0 && (
        <div className="total-row" style={{ borderTop: 'none' }}>
          <span className="subtle">Desconto</span>
          <b style={{ color: '#e74c3c' }}>-{fmtBRL(order.desconto)}</b>
        </div>
      )}
      {fechado && (
        <div className="total-row" style={{ borderTop: 'none' }}>
          <span>Total a pagar</span>
          <b style={{ fontSize: 18, color: '#2ecc71' }}>{fmtBRL(Number(order.total_liquido) || Number(order.total) - Number(order.desconto))}</b>
        </div>
      )}
      {fechado && Number(order.comissao) > 0 && (
        <div className="subtle" style={{ marginBottom: 8 }}>
          💼 Comissão do funcionário: {fmtBRL(order.comissao)} ({Number(order.comissao_pct)}% do líquido)
        </div>
      )}

      {abertosNaMesa.length > 1 && (
        <div className="subtle" style={{ marginBottom: 8 }}>
          ☕ Esta mesa tem {abertosNaMesa.length} pedido(s) em aberto · total da mesa {fmtBRL(totalMesa)}
        </div>
      )}

      <div className="acoes-status">
        <span className="subtle">Avançar status:</span>
        {order.status === 'enviado' && <Btn onClick={() => mudarStatus('em_preparo')} disabled={busy === 'em_preparo'}>{busy === 'em_preparo' ? '...' : '▶ Em preparo'}</Btn>}
        {order.status === 'em_preparo' && <Btn onClick={() => mudarStatus('entregue')} disabled={busy === 'entregue'}>{busy === 'entregue' ? '...' : '▶ Entregue à mesa'}</Btn>}
        {order.status === 'entregue' && <Btn variant="success" onClick={() => setPagar(true)}>💵 Fechar / Pagar</Btn>}
        {fechado && <span className="subtle">Pedido fechado e pago {order.pagamento ? '(' + PAG_LABEL[order.pagamento] + ')' : ''}.</span>}
      </div>

      <div className="row-gap wrap">
        <Btn variant="primary" onClick={() => setCupom(true)}>🖨️ Cupom</Btn>
        <Btn onClick={() => setEditando(true)}>✏️ Editar itens</Btn>
        <Btn variant="success" onClick={() => setFecharMesa(true)} disabled={abertosNaMesa.length === 0 || fechado}>🔒 Fechar mesa ({abertosNaMesa.length})</Btn>
        <Btn variant="danger" onClick={excluir} disabled={busy === 'del'}>🗑 Excluir</Btn>
      </div>

      {erro && <div className="form-error">{erro}</div>}
      <Toast msg={msg} />

      {editando && <EditOrderModal order={order} onClose={() => setEditando(false)} onSaved={onNeedRefresh} />}
      {cupom && <ReceiptModal order={order} settings={settings} onClose={() => setCupom(false)} />}
      {pagar && <PaymentModal total={Number(order.total)} titulo={'Receber · Pedido #' + order.id} nota={'Recebimento do pedido #' + order.id + ' · Mesa ' + order.mesa_numero} comissaoPadrao={Number((settings || {}).comissaoPct) || 0} onConfirm={pagarOrdem} onClose={() => setPagar(false)} />}
      {fecharMesa && abertosNaMesa.length > 0 && (
        <PaymentModal
          total={Math.round(totalMesa * 100) / 100}
          titulo={'Fechar mesa ' + order.mesa_numero}
          nota={'Fechamento de ' + abertosNaMesa.length + ' pedido(s) em aberto · Mesa ' + order.mesa_numero}
          comissaoPadrao={Number((settings || {}).comissaoPct) || 0}
          onConfirm={fecharMesaInteira}
          onClose={() => setFecharMesa(false)}
        />
      )}
    </Modal>
  );
}

export default function ODM() {
  const [orders, err] = usePolling(() => api.get('/api/orders'), 4000);
  const [settings] = usePolling(() => api.get('/api/settings'), 60000);
  const [filtro, setFiltro] = useState('enviado');
  const [selId, setSelId] = useState(null);
  const [stats, setStats] = useState(null);
  const sel = (orders || []).find((o) => o.id === selId) || null;

  async function carregarStats() {
    try { setStats(await api.get('/api/dashboard')); } catch {}
  }

  const lista = useMemo(() => {
    const base = orders || [];
    if (filtro === 'todos') return base;
    return base.filter((o) => o.status === filtro);
  }, [orders, filtro]);

  const proDestaque = (lista || []).filter((o) => o.status !== 'fechado');

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>ODM · Pedidos</h2>
          <p className="subtle">O que entra (pedidos) e o que sai (entrega) — controle em tempo real. Apenas o ADM pode editar/excluir pedidos.</p>
        </div>
        <Btn onClick={carregarStats}>{stats ? 'Resumo atualizado' : 'Ver resumo'}</Btn>
      </div>

      {stats && (
        <div className="stats-bar">
          <div><b>{stats.pedidos_em_curso}</b> pedidos em curso</div>
          <div><b>{stats.mesas_ocupadas}</b> mesas ocupadas</div>
          <div><b>{stats.mesas_livres}</b> mesas livres</div>
          <div><b>{fmtBRL(stats.faturamento_hoje)}</b> faturado hoje</div>
        </div>
      )}
      {stats && stats.pagamentos_hoje && (
        <div className="stats-bar pagto-stats">
          {Object.keys(PAG_LABEL).map((k) => (
            <div key={k}><span>{PAG_ICON[k]}</span> <b>{fmtBRL(stats.pagamentos_hoje[k] || 0)}</b> {PAG_LABEL[k]}</div>
          ))}
        </div>
      )}

      <div className="filtros">
        {['enviado', 'em_preparo', 'entregue', 'fechado', 'todos'].map((s) => (
          <button key={s} className={'chip' + (filtro === s ? ' chip-active' : '')} onClick={() => setFiltro(s)}>
            {s === 'todos' ? 'Todos' : STATUS_LABEL[s]}
            {s !== 'todos' && (
              <span className="chip-count">{(orders || []).filter((o) => o.status === s).length}</span>
            )}
          </button>
        ))}
      </div>

      {err && <div className="form-error">{err}</div>}
      {!orders && <Spinner />}

      {proDestaque.length > 0 && (
        <div className="destaque-pedidos">
          {proDestaque.map((o) => (
            <button key={o.id} className="minicard" onClick={() => { setSelId(o.id); }}>
              <div className="minicard-num">M{String(o.mesa_numero).padStart(2, '0')} · #{String(o.id).padStart(3, '0')}</div>
              <div className="minicard-total">{fmtBRL(o.total)}</div>
              <div className="minicard-itens">{o.itens.length} itens · {o.funcionario ? o.funcionario.nome.split(' ')[0] : ''}</div>
            </button>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl tbl-papel">
          <thead>
            <tr><th>Nº</th><th>Mesa</th><th>Funcionário</th><th>Itens</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Hora</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="9"><Empty text="Nenhum pedido com esse filtro." /></td></tr>}
            {lista.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td>M{o.mesa_numero}</td>
                <td>{o.funcionario ? o.funcionario.nome + ' (cód. ' + o.funcionario.codigo + ')' : '-'}</td>
                <td>{o.itens.length}</td>
                <td>{o.status === 'fechado' && Number(o.desconto) > 0 ? (
                  <>
                    <span className="subtle" style={{ textDecoration: 'line-through' }}>{fmtBRL(o.total)}</span>
                    <div><b>{fmtBRL(Number(o.total_liquido) || Number(o.total) - Number(o.desconto))}</b></div>
                    <span className="subtle">desc. {fmtBRL(o.desconto)}</span>
                  </>
                ) : (
                  <b>{(o.status === 'fechado' && Number(o.total_liquido)) ? fmtBRL(o.total_liquido) : fmtBRL(o.total)}</b>
                )}</td>
                <td><Badge color={STATUS_COLOR[o.status] || '#888'}>{STATUS_LABEL[o.status] || o.status}</Badge></td>
                <td>{o.status === 'fechado' && o.pagamento ? <Badge color={PAG_COLOR[o.pagamento]}>{PAG_ICON[o.pagamento]} {PAG_LABEL[o.pagamento]}</Badge> : <span className="subtle">—</span>}</td>
                <td>{fmtDT(o.criado_em)}</td>
                <td><Btn onClick={() => { setSelId(o.id); }}>Abrir</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <DetalhePedido
          key={sel.id}
          order={sel}
          settings={settings || {}}
          onClose={() => setSelId(null)}
          onNeedRefresh={() => {}}
        />
      )}
    </div>
  );
}