import { useMemo, useState } from 'react';
import { api, fmtBRL, PAG_LABEL } from './api';
import { usePolling, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';
import PaymentModal from './PaymentModal';

export default function Mesas() {
  const [mesas, err] = usePolling(() => api.get('/api/tables'), 8000);
  const [users] = usePolling(() => api.get('/api/users'), 30000);
  const [settings] = usePolling(() => api.get('/api/settings'), 60000);
  const [orders] = usePolling(() => api.get('/api/orders'), 8000);
  const [edit, setEdit] = useState(null);
  const [assign, setAssign] = useState(null);
  const [pagar, setPagar] = useState(null);
  const [msg, setMsg] = useState('');

  async function salvar(form) {
    if (form.id) await api.put('/api/tables/' + form.id, form);
    else await api.post('/api/tables', form);
    setMsg('Mesa salva!');
    setEdit(null);
  }

  async function excluir(m) {
    if (!window.confirm('Excluir a mesa ' + m.numero + '?')) return;
    try {
      await api.del('/api/tables/' + m.id);
      setMsg('Mesa excluída');
    } catch (e) {
      alert(e.message);
    }
  }

  const funcs = (users || []).filter((u) => u.papel === 'func' && u.ativo);

  const resumoMesas = useMemo(() => {
    const mapa = {};
    for (const o of orders || []) {
      if (o.status === 'fechado' || !o.mesa_id) continue;
      const r = (mapa[o.mesa_id] = mapa[o.mesa_id] || { pedidos: 0, total: 0 });
      r.pedidos++;
      r.total += Number(o.total);
    }
    return mapa;
  }, [orders]);

  async function fecharMesa(mesaid, dados) {
    const r = await api.post('/api/mesas/' + mesaid + '/fechar', dados);
    setMsg(r.fechados + ' pedido(s) fechado(s) via ' + PAG_LABEL[dados.pagamento] + ' · Total ' + fmtBRL(r.total) + (dados.desconto > 0 ? ' (-desconto ' + fmtBRL(dados.desconto) + ')' : '') + '. Mesa liberada!');
    setPagar(null);
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Mesas</h2>
          <p className="subtle">Cadastre as mesas, atribua funcionários e faça o fechamento com pagamento (PIX, Dinheiro, Débito ou Crédito).</p>
        </div>
        <Btn variant="primary" onClick={() => setEdit({ numero: '', capacidade: 4, local: 'Interno' })}>+ Nova mesa</Btn>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!mesas && <Spinner />}

      <div className="mesa-admin-grid">
        {(mesas || []).map((m) => {
          const resumo = resumoMesas[m.id];
          return (
            <div key={m.id} className={'mesa-admin ' + (m.status === 'ocupada' ? 'mesa-ocupada' : 'mesa-livre')}>
              <div className="mesa-admin-top">
                <span className="mesa-admin-num">Mesa {m.numero}</span>
                <span className="mesa-status">{m.status === 'ocupada' ? 'OCUPADA' : 'LIVRE'}</span>
              </div>
              <div className="subtle">{m.capacidade} lugares · {m.local}</div>
              <div className="mesa-funcs">
                {m.funcionarios.length === 0 ? <span className="subtle">Sem funcionários</span> :
                  m.funcionarios.map((f) => <span key={f.id} className="tag">{f.nome}</span>)}
              </div>
              <div className="preview-cupom" style={{ marginBottom: 8 }}>
                {m.status === 'ocupada' && resumo ? (
                  <div><b>{resumo.pedidos}</b> pedido(s) em aberto · <b>{fmtBRL(resumo.total)}</b></div>
                ) : (
                  <span className="subtle">Mesa livre</span>
                )}
              </div>
              <div className="row-gap wrap">
                <Btn variant="success" onClick={() => setPagar(m)} disabled={m.status !== 'ocupada' || !resumo}>💵 Fechar / Pagar</Btn>
                <Btn onClick={() => setAssign(m)}>👤 Funcionários</Btn>
                <Btn onClick={() => setEdit(m)}>✏️ Editar</Btn>
                <Btn variant="danger" onClick={() => excluir(m)}>🗑</Btn>
              </div>
            </div>
          );
        })}
      </div>
      {mesas && mesas.length === 0 && <Empty text="Nenhuma mesa cadastrada." />}

      {edit && <MesaForm inicial={edit} onClose={() => setEdit(null)} onSalvar={salvar} />}
      {assign && (
        <AssignFuncs
          mesa={assign}
          funcs={funcs}
          onClose={() => setAssign(null)}
          onSaved={() => { setMsg('Funcionários atualizados!'); setAssign(null); }}
        />
      )}
      {pagar && (
        <PaymentModal
          total={Math.round((resumoMesas[pagar.id] || {}).total * 100) / 100}
          titulo={'Fechar mesa ' + pagar.numero}
          nota={'Fechamento de ' + (resumoMesas[pagar.id] || {}).pedidos + ' pedido(s) em aberto · Mesa ' + pagar.numero}
          comissaoPadrao={Number((settings || {}).comissaoPct) || 0}
          onConfirm={(dados) => fecharMesa(pagar.id, dados)}
          onClose={() => setPagar(null)}
        />
      )}
      <Toast msg={msg} />
    </div>
  );
}

function MesaForm({ inicial, onClose, onSalvar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function ok() {
    setBusy(true); setErro('');
    try { await onSalvar(form); } catch (e) { setErro(e.message); setBusy(false); }
  }

  return (
    <Modal title={form.id ? 'Editar mesa' : 'Nova mesa'} onClose={onClose}>
      <Field label="Número">
        <input className="input" type="number" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
      </Field>
      <Field label="Capacidade (lugares)">
        <input className="input" type="number" value={form.capacidade} onChange={(e) => setForm({ ...form, capacidade: e.target.value })} />
      </Field>
      <Field label="Local">
        <input className="input" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} placeholder="Interno / Externo / Varanda" />
      </Field>
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap">
        <Btn variant="primary" onClick={ok} disabled={busy || !form.numero}>Salvar</Btn>
      </div>
    </Modal>
  );
}

function AssignFuncs({ mesa, funcs, onClose, onSaved }) {
  const [ids, setIds] = useState((mesa.funcionarios || []).map((f) => f.id));
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function salvar() {
    setBusy(true);
    try {
      await api.put('/api/tables/' + mesa.id + '/funcionarios', { ids });
      onSaved();
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={'Funcionários da Mesa ' + mesa.numero} onClose={onClose}>
      <div className="check-list">
        {funcs.length === 0 && <Empty text="Cadastre funcionários primeiro." />}
        {funcs.map((f) => (
          <label key={f.id} className="check-row">
            <input type="checkbox" checked={ids.includes(f.id)} onChange={() => toggle(f.id)} />
            <span>{f.nome} (cód. {f.codigo})</span>
          </label>
        ))}
      </div>
      <div className="row-gap">
        <Btn variant="primary" onClick={salvar} disabled={busy}>Salvar</Btn>
      </div>
    </Modal>
  );
}