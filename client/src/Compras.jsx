import { useMemo, useState } from 'react';
import { api, fmtBRL, fmtDT, fmtNum } from './api';
import { usePolling, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';

function localMes(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function labelMes(m) {
  if (!m) return '';
  const [a, b] = m.split('-');
  return new Date(Number(a), Number(b) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function Compras() {
  const [compras, err] = usePolling(() => api.get('/api/purchases'), 15000);
  const [suppliers] = usePolling(() => api.get('/api/suppliers'), 30000);
  const [products] = usePolling(() => api.get('/api/products'), 30000);
  const [nova, setNova] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [msg, setMsg] = useState('');
  const [mes, setMes] = useState(localMes(new Date()));

  const meses = useMemo(() => {
    const s = new Set((compras || []).map((c) => localMes(c.data)));
    s.add(localMes(new Date()));
    return [...s].sort().reverse();
  }, [compras]);

  const listadas = useMemo(() => (compras || []).filter((c) => localMes(c.data) === mes), [compras, mes]);
  const totalMes = useMemo(() => listadas.reduce((t, c) => t + Number(c.total), 0), [listadas]);
  const totalGeral = useMemo(() => (compras || []).reduce((t, c) => t + Number(c.total), 0), [compras]);

  async function excluir(c) {
    if (!window.confirm('Excluir a compra #' + c.id + '? O estoque será devolvido.')) return;
    try {
      await api.del('/api/purchases/' + c.id);
      setMsg('Compra excluída e estoque devolvido');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Compras de Fornecedores</h2>
          <p className="subtle">Registre as compras para dar entrada no estoque.</p>
        </div>
        <div className="row-gap">
          <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => <option key={m} value={m}>{labelMes(m)}</option>)}
          </select>
          <Btn variant="primary" onClick={() => setNova(true)}>+ Nova compra</Btn>
        </div>
      </div>

      <div className="cards">
        <div className="card"><span className="card-label">Total comprado · {labelMes(mes)}</span><span className="card-value">{fmtBRL(totalMes)}</span></div>
        <div className="card"><span className="card-label">Compras em {labelMes(mes)}</span><span className="card-value">{listadas.length}</span></div>
        <div className="card"><span className="card-label">Total geral (histórico)</span><span className="card-value">{fmtBRL(totalGeral)}</span></div>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!compras && <Spinner />}

      <div className="cards-list">
        {listadas.map((c) => (
          <div key={c.id} className="row-card">
            <div className="row-card-head">
              <span className="row-card-title">Compra #{c.id} · {c.fornecedor}</span>
              <div className="row-gap">
                <Btn onClick={() => setDetalhe(c)}>Ver</Btn>
                <Btn variant="danger" onClick={() => excluir(c)}>🗑</Btn>
              </div>
            </div>
            <div className="subtle">
              {fmtDT(c.data)} · {c.usuario} · {c.itens.length} itens · <b>{fmtBRL(c.total)}</b>
            </div>
          </div>
        ))}
      </div>
      {compras && compras.length === 0 && <Empty text="Nenhuma compra registrada." />}
      {compras && compras.length > 0 && listadas.length === 0 && <Empty text="Nenhuma compra neste mês." />}

      {nova && (
        <FormCompra
          suppliers={suppliers || []}
          products={(products || []).filter((p) => p.ativo)}
          onClose={() => setNova(false)}
          onSaved={() => { setMsg('Compra registrada! Entrada no estoque feita.'); setNova(false); }}
        />
      )}
      {detalhe && (
        <DetalheCompra compra={detalhe} onClose={() => setDetalhe(null)} />
      )}
      <Toast msg={msg} />
    </div>
  );
}

function FormCompra({ suppliers, products, onClose, onSaved }) {
  const [fornecedor, setFornecedor] = useState(suppliers.length ? String(suppliers[0].id) : '');
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState([{ produto_id: '', quantidade: 1, contem: 1, preco_custo: '' }]);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  const total = linhas.reduce((t, l) => {
    const custo = l.preco_custo !== '' ? Number(l.preco_custo) : 0;
    return t + (Number(l.quantidade) || 0) * (custo || 0);
  }, 0);
  const unidades = linhas.reduce((t, l) => t + (Number(l.quantidade) || 0) * (Number(l.contem) || 1), 0);

  function setLinha(i, k, v) {
    setLinhas((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const novo = { ...l, [k]: v };
      if (k === 'produto_id') {
        const p = products.find((x) => x.id === Number(v));
        novo.preco_custo = p ? p.preco_custo : '';
      }
      return novo;
    }));
  }

  async function ok() {
    const itens = linhas.filter((l) => l.produto_id && Number(l.quantidade) > 0).map((l) => ({
      produto_id: Number(l.produto_id),
      quantidade: Number(l.quantidade),
      contem: Number(l.contem) || 1,
      preco_custo: l.preco_custo !== '' ? Number(l.preco_custo) : 0
    }));
    if (itens.length === 0) return setErro('Adicione ao menos um item.');
    setBusy(true); setErro('');
    try {
      await api.post('/api/purchases', { fornecedor_id: fornecedor ? Number(fornecedor) : null, obs, itens });
      onSaved();
    } catch (e) {
      setErro(e.message); setBusy(false);
    }
  }

  return (
    <Modal title="Nova compra" onClose={onClose} wide>
      <div className="campo-linha">
        <Field label="Fornecedor">
          <select className="input" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
            <option value="">Sem fornecedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Field>
        <Field label="Observações"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      </div>

      <div className="adicionar-produto header-col compra-col">
        <span>Produto</span><span>Qtd</span><span>Contém</span><span>Custo</span><span></span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="input" value={l.produto_id} onChange={(e) => setLinha(i, 'produto_id', e.target.value)}>
                    <option value="">Selecionar...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </td>
                <td><input className="input input-num" type="number" step="0.01" min="0.01" value={l.quantidade} onChange={(e) => setLinha(i, 'quantidade', e.target.value)} /></td>
                <td><input className="input input-num" type="number" step="0.01" min="0.01" value={l.contem} onChange={(e) => setLinha(i, 'contem', e.target.value)} /></td>
                <td><input className="input input-num" type="number" step="0.01" min="0" value={l.preco_custo} onChange={(e) => setLinha(i, 'preco_custo', e.target.value)} /></td>
                <td><button className="icon-btn" onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Btn onClick={() => setLinhas((ls) => [...ls, { produto_id: '', quantidade: 1, contem: 1, preco_custo: '' }])}>+ Adicionar linha</Btn>

      <div className="total-row"><span>Total</span><b>{fmtBRL(total)}</b></div>
      <div className="subtle">Entram no estoque <b>{fmtNum(unidades)} un</b> · Custo = por embalagem. O preço de custo do produto é atualizado automaticamente.</div>
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap"><Btn variant="primary" onClick={ok} disabled={busy}>{busy ? 'Salvando...' : 'Registrar compra'}</Btn></div>
    </Modal>
  );
}

function DetalheCompra({ compra, onClose }) {
  return (
    <Modal title={'Compra #' + compra.id + ' · ' + compra.fornecedor} onClose={onClose} wide>
      <div className="preview-cupom">
        <div><b>Data:</b> {fmtDT(compra.data)}</div>
        <div><b>Registrada por:</b> {compra.usuario}</div>
        {compra.obs && <div><b>Obs:</b> {compra.obs}</div>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Produto</th><th>Qtd (emb.)</th><th>Contém</th><th>Custo/emb.</th><th>Subtotal</th></tr></thead>
          <tbody>
            {compra.itens.map((it) => (
              <tr key={it.id}>
                <td>{it.nome}</td>
                <td>{fmtNum(it.embalagens)}</td>
                <td>{fmtNum(it.contem)} {it.unidade}</td>
                <td>{fmtBRL(it.preco_custo)}</td>
                <td>{fmtBRL(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="total-row"><span>Total</span><b>{fmtBRL(compra.total)}</b></div>
      <div className="subtle">Entradas no estoque = Qtd × Contém (soma em {compra.itens.length} linhas).</div>
    </Modal>
  );
}