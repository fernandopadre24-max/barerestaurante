import { useMemo, useState } from 'react';
import { api, fmtBRL, fmtNum } from './api';
import { usePolling, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';

export default function Produtos() {
  const [produtos, err] = usePolling(() => api.get('/api/products'), 10000);
  const [edit, setEdit] = useState(null);
  const [mov, setMov] = useState(null);
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState('');

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const base = produtos || [];
    if (!b) return base;
    return base.filter((p) => p.nome.toLowerCase().includes(b) || p.categoria.toLowerCase().includes(b));
  }, [produtos, busca]);

  async function salvar(form) {
    if (form.id) await api.put('/api/products/' + form.id, form);
    else await api.post('/api/products', form);
    setMsg('Produto salvo!');
    setEdit(null);
  }

  async function excluir(p) {
    if (!window.confirm('Excluir o produto "' + p.nome + '"?')) return;
    try {
      await api.del('/api/products/' + p.id);
      setMsg('Produto excluído');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Produtos e Estoque</h2>
          <p className="subtle">Estoque é baixado automaticamente quando os pedidos são enviados.</p>
        </div>
        <div className="row-gap wrap">
          <input className="input" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Btn variant="primary" onClick={() => setEdit({ nome: '', categoria: '', preco: '', preco_custo: '', estoque: 0, estoque_min: 0, unidade: 'un', ativo: 1 })}>+ Novo produto</Btn>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!produtos && <Spinner />}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Custo</th><th>Estoque</th><th>Mínimo</th><th>Situação</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="8"><Empty text="Nenhum produto." /></td></tr>}
            {lista.map((p) => {
              const baixo = Number(p.estoque) <= Number(p.estoque_min);
              return (
                <tr key={p.id} className={p.ativo ? '' : 'linha-inativa'}>
                  <td>{p.nome}</td>
                  <td>{p.categoria}</td>
                  <td>{fmtBRL(p.preco)}</td>
                  <td>{fmtBRL(p.preco_custo)}</td>
                  <td className={baixo ? 'alerta' : ''}>{fmtNum(p.estoque)} {p.unidade}</td>
                  <td>{fmtNum(p.estoque_min)}</td>
                  <td>{p.ativo ? (baixo ? '⚠️ Baixo' : '✅ OK') : 'Inativo'}</td>
                  <td>
                    <div className="row-gap">
                      <Btn onClick={() => setMov(p)}>Estoque</Btn>
                      <Btn onClick={() => setEdit(p)}>✏️</Btn>
                      <Btn variant="danger" onClick={() => excluir(p)}>🗑</Btn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && <ProdutoForm inicial={edit} onClose={() => setEdit(null)} onSalvar={salvar} />}
      {mov && <MovimentoForm produto={mov} onClose={() => setMov(null)} onSaved={() => { setMsg('Estoque atualizado!'); setMov(null); }} />}
      <Toast msg={msg} />
    </div>
  );
}

function ProdutoForm({ inicial, onClose, onSalvar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const novo = !form.id;

  async function ok() {
    setBusy(true); setErro('');
    try { await onSalvar(form); } catch (e) { setErro(e.message); setBusy(false); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={novo ? 'Novo produto' : 'Editar produto'} onClose={onClose}>
      <Field label="Nome"><input className="input" value={form.nome} onChange={set('nome')} /></Field>
      <Field label="Categoria"><input className="input" value={form.categoria} onChange={set('categoria')} placeholder="Bebidas, Porções..." /></Field>
      <div className="campo-linha">
        <Field label="Preço de venda"><input className="input" type="number" step="0.01" value={form.preco} onChange={set('preco')} /></Field>
        <Field label="Preço de custo"><input className="input" type="number" step="0.01" value={form.preco_custo} onChange={set('preco_custo')} /></Field>
      </div>
      <div className="campo-linha">
        <Field label="Estoque atual"><input className="input" type="number" step="0.01" value={form.estoque} onChange={set('estoque')} /></Field>
        <Field label="Estoque mínimo"><input className="input" type="number" step="0.01" value={form.estoque_min} onChange={set('estoque_min')} /></Field>
      </div>
      <div className="campo-linha">
        <Field label="Unidade">
          <select className="input" value={form.unidade} onChange={set('unidade')}>
            {['un', 'porção', 'kg', 'l', 'ml', 'g', 'cx', 'garrafa', 'dose'].map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Ativo">
          <select className="input" value={form.ativo} onChange={set('ativo')}>
            <option value={1}>Sim</option>
            <option value={0}>Não</option>
          </select>
        </Field>
      </div>
      {!novo && <div className="subtle">Alterar o estoque aqui gera um movimento de ajuste.</div>}
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap"><Btn variant="primary" onClick={ok} disabled={busy || !form.nome}>Salvar</Btn></div>
    </Modal>
  );
}

function MovimentoForm({ produto, onClose, onSaved }) {
  const [tipo, setTipo] = useState('entrada');
  const [quantidade, setQuantidade] = useState('');
  const [ref, setRef] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function ok() {
    setBusy(true); setErro('');
    try {
      await api.post('/api/stock/movements', { produto_id: produto.id, tipo, quantidade, ref });
      onSaved();
    } catch (e) {
      setErro(e.message); setBusy(false);
    }
  }

  return (
    <Modal title={'Estoque · ' + produto.nome} onClose={onClose}>
      <div className="preview-cupom">
        <div>Estoque atual: <b>{fmtNum(produto.estoque)} {produto.unidade}</b></div>
      </div>
      <Field label="Tipo de lançamento">
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="entrada">Entrada (soma ao estoque)</option>
          <option value="saida">Saída / avaria (subtrai)</option>
          <option value="ajuste">Ajuste (define o estoque exato)</option>
        </select>
      </Field>
      <Field label={tipo === 'ajuste' ? 'Novo estoque exato' : 'Quantidade'}>
        <input className="input" type="number" step="0.01" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      </Field>
      <Field label="Motivo / referência">
        <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex: quebra, inventário, doação..." />
      </Field>
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap"><Btn variant="primary" onClick={ok} disabled={busy || quantidade === ''}>Confirmar</Btn></div>
    </Modal>
  );
}