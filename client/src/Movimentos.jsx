import { useMemo, useState } from 'react';
import { api, fmtDT, fmtNum } from './api';
import { usePolling, Empty, Spinner } from './ui';

const TIPO_LABEL = {
  saida_pedido: 'Saída · pedido',
  entrada_compra: 'Entrada · compra',
  entrada_manual: 'Entrada · manual',
  saida_manual: 'Saída · manual',
  ajuste: 'Ajuste de estoque'
};

export default function Movimentos() {
  const [mov, err] = usePolling(() => api.get('/api/stock/movements?limite=250'), 10000);
  const [produtos] = usePolling(() => api.get('/api/products'), 60000);
  const [filtro, setFiltro] = useState('');

  const lista = useMemo(() => {
    const base = mov || [];
    if (!filtro) return base;
    return base.filter((m) => m.produto_id === Number(filtro));
  }, [mov, filtro]);

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Movimentação de Estoque</h2>
          <p className="subtle">Histórico completo de entradas e saídas.</p>
        </div>
        <select className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos os produtos</option>
          {(produtos || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!mov && <Spinner />}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Data/Hora</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Referência</th></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan="5"><Empty text="Nenhuma movimentação." /></td></tr>}
            {lista.map((m) => (
              <tr key={m.id}>
                <td>{fmtDT(m.data)}</td>
                <td>{m.produto_nome}</td>
                <td>{TIPO_LABEL[m.tipo] || m.tipo}</td>
                <td className={m.quantidade < 0 ? 'alerta' : 'saldo-positivo'}>{(m.quantidade > 0 ? '+' : '') + fmtNum(m.quantidade)}</td>
                <td>{m.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}