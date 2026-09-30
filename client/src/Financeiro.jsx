import { useMemo, useState } from 'react';
import { api, fmtBRL } from './api';
import { usePolling, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';

const CATEGORIAS_SUG = ['Salário', 'Luz', 'Água', 'Aluguel', 'Internet', 'TV a gás', 'Gás de cozinha', 'Publicidade', 'Manutenção', 'Material de limpeza', 'Outros'];

function mesAtual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function Financeiro() {
  const [lancamentos, err, refresh] = usePolling(() => api.get('/api/financeiro'), 10000);
  const [mes, setMes] = useState(mesAtual());
  const [abrir, setAbrir] = useState(false);
  const [msg, setMsg] = useState('');

  const lista = useMemo(() => {
    const base = lancamentos || [];
    if (!mes) return base;
    const prefixo = String(mes).slice(0, 7);
    return base.filter((l) => l.data && l.data.slice(0, 7) === prefixo);
  }, [lancamentos, mes]);

  const totais = useMemo(() => {
    let ent = 0, sai = 0;
    for (const l of lista) {
      if (l.tipo === 'entrada') ent += Number(l.valor);
      else sai += Number(l.valor);
    }
    return { entradas: ent, saidas: sai, saldo: ent - sai };
  }, [lista]);

  async function excluir(l) {
    if (!confirm('Excluir este lançamento de ' + fmtBRL(l.valor) + '?')) return;
    try {
      await api.del('/api/financeiro/' + l.id);
      refresh();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Financeiro</h2>
          <p className="subtle">Recebimentos e gastos extras (salários, contas de luz, água etc.).</p>
        </div>
        <div className="row-gap">
          <input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          <Btn variant="primary" onClick={() => setAbrir(true)}>+ Novo lançamento</Btn>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!lancamentos && <Spinner />}

      <div className="cards" style={{ marginTop: 4 }}>
        <div className="card">
          <span className="card-label">Entradas do mês</span>
          <span className="card-value" style={{ color: '#1f7a3d' }}>{fmtBRL(totais.entradas)}</span>
        </div>
        <div className="card">
          <span className="card-label">Gastos do mês</span>
          <span className="card-value" style={{ color: '#b03a2e' }}>{fmtBRL(totais.saidas)}</span>
        </div>
        <div className="card card-accent">
          <span className="card-label">Saldo do mês</span>
          <span className="card-value">{fmtBRL(totais.saldo)}</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Lançado por</th><th></th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="7"><Empty text="Nenhum lançamento neste mês." /></td></tr>}
            {lista.map((l) => (
              <tr key={l.id}>
                <td>{l.data.split('-').reverse().join('/')}</td>
                <td>{l.tipo === 'entrada' ? '➡️ Entrada' : '⬅️ Saída'}</td>
                <td>{l.categoria}</td>
                <td>{l.descricao || <span className="subtle">—</span>}</td>
                <td className={l.tipo === 'entrada' ? 'saldo-positivo' : 'alerta'}>
                  {(l.tipo === 'entrada' ? '+' : '-') + fmtBRL(l.valor)}
                </td>
                <td className="subtle">{l.usuario}</td>
                <td><button className="btn btn-ghost" onClick={() => excluir(l)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abrir && <LancamentoModal onClose={() => setAbrir(false)} onSalvo={() => { setAbrir(false); refresh(); }} />}
      <Toast msg={msg} />
    </div>
  );
}

function LancamentoModal({ onClose, onSalvo }) {
  const [tipo, setTipo] = useState('saida');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar() {
    setBusy(true); setErro('');
    try {
      await api.post('/api/financeiro', { tipo, categoria, descricao, valor, data });
      onSalvo();
    } catch (e) {
      setErro(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo lançamento" onClose={onClose}>
      <div className="campo-linha">
        <button className={'chip ' + (tipo === 'saida' ? 'chip-active' : '')} onClick={() => setTipo('saida')}>⬅️ Saída / gasto</button>
        <button className={'chip ' + (tipo === 'entrada' ? 'chip-active' : '')} onClick={() => setTipo('entrada')}>➡️ Entrada / recebimento</button>
      </div>

      <Field label="Categoria *">
        <input className="input" list="cat-sug" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Luz, Água, Salário..." />
        <datalist id="cat-sug">{CATEGORIAS_SUG.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>

      <div className="campo-linha">
        <Field label="Valor (R$) *">
          <input className="input" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 250,00" />
        </Field>
        <Field label="Data">
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
      </div>

      <Field label="Descrição / observações">
        <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional (ex.: conta do mês de agosto)" />
      </Field>

      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap">
        <Btn variant="primary" onClick={salvar} disabled={busy || !categoria || !valor}>{busy ? 'Salvando...' : 'Salvar'}</Btn>
        <Btn onClick={onClose}>Cancelar</Btn>
      </div>
    </Modal>
  );
}