import { useMemo } from 'react';
import { api, fmtBRL, PAG_COLOR, PAG_ICON, PAG_LABEL, STATUS_COLOR, STATUS_LABEL } from './api';
import { usePolling, Empty, Spinner } from './ui';

function fmtDia(chave) {
  const p = String(chave || '').split('-');
  if (p.length !== 3) return '';
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const hoje = new Date();
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (d.getTime() === h.getTime()) return 'Hoje';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function Dashboard({ onGoTo }) {
  const [d, err] = usePolling(() => api.get('/api/dashboard'), 15000);

  const max7 = useMemo(() => Math.max(1, ...(d?.dias || []).map((x) => Math.max(x.vendas, x.gastos, x.entradas))), [d]);
  const maxPag = useMemo(() => Math.max(1, ...Object.values(d?.pagamentos_hoje || {}).map(Number)), [d]);
  const maxTop = useMemo(() => Math.max(1, ...(d?.top_produtos || []).map((x) => x.qtd)), [d]);
  const maxSt = useMemo(() => Math.max(1, ...Object.values(d?.pedidos_por_status || {}).map(Number)), [d]);

  if (err) return <div className="form-error">{err}</div>;
  if (!d) return <Spinner />;

  const pagDiv = Object.keys(PAG_LABEL).map((k) => ({ k, v: Number(d.pagamentos_hoje[k]) || 0 }));

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Visão Geral</h2>
          <p className="subtle">Resumo do movimento de hoje.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card card-accent">
          <span className="card-label">Faturamento hoje (pago)</span>
          <span className="card-value">{fmtBRL(d.faturamento_hoje)}</span>
        </div>
        <div className="card">
          <span className="card-label">Pedidos hoje</span>
          <span className="card-value">{d.pedidos_hoje}</span>
          <span className="card-label">· {d.fechados_hoje} fechados · ticket médio {fmtBRL(d.ticket_medio)}</span>
        </div>
        <div className="card">
          <span className="card-label">Em curso (abertos)</span>
          <span className="card-value">{d.pedidos_em_curso}</span>
          <span className="card-label">enviado {d.pedidos_por_status.enviado} · preparo {d.pedidos_por_status.em_preparo} · entregue {d.pedidos_por_status.entregue}</span>
        </div>
        <div className="card">
          <span className="card-label">Mesas ocupadas / livres</span>
          <span className="card-value">{d.mesas_ocupadas} / {d.mesas_livres}</span>
        </div>
        <div className="card">
          <span className="card-label">Mesas fechadas hoje</span>
          <span className="card-value">{d.mesas_fechadas_hoje.length}</span>
          <span className="card-label">· {fmtBRL(d.mesas_fechadas_hoje.reduce((a, b) => a + b.total, 0))} recebidos</span>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <span className="card-label">Comissão hoje</span>
          <span className="card-value">{fmtBRL(d.comissao_hoje)}</span>
        </div>
        <div className="card">
          <span className="card-label">Entradas extras hoje</span>
          <span className="card-value" style={{ color: '#1f7a3d' }}>{fmtBRL(d.receitas_extra_hoje)}</span>
        </div>
        <div className="card">
          <span className="card-label">Gastos extras hoje</span>
          <span className="card-value" style={{ color: '#b03a2e' }}>{fmtBRL(d.despesas_hoje)}</span>
        </div>
        <div className="card">
          <span className="card-label">Resultado do dia (receitas − gastos)</span>
          <span className="card-value">{fmtBRL(d.receitas_extra_hoje + d.faturamento_hoje - d.despesas_hoje)}</span>
        </div>
      </div>

      <div className="chart-two-col">
        <div className="chart-panel">
          <h3>📈 Últimos 7 dias — vendas × gastos</h3>
          <div className="bars-7d">
            {(d.dias || []).map((x) => (
              <div key={x.dia} className="bar-day" title={fmtDia(x.dia) + ' · vendas ' + fmtBRL(x.vendas) + ' · gastos ' + fmtBRL(x.gastos) + ' · extras ' + fmtBRL(x.entradas)}>
                <div className="cols">
                  <div className={'bar bar-verde' + (x.vendas === 0 ? ' bar-vazio' : '')} style={{ height: Math.max(2, (x.vendas / max7) * 100) + '%' }}></div>
                  <div className={'bar bar-vermelho' + (x.gastos === 0 ? ' bar-vazio' : '')} style={{ height: Math.max(2, (x.gastos / max7) * 100) + '%' }}></div>
                  <div className={'bar bar-azul' + (x.entradas === 0 ? ' bar-vazio' : '')} style={{ height: Math.max(2, (x.entradas / max7) * 100) + '%' }}></div>
                </div>
                <span className="leg-dia">{fmtDia(x.dia)}</span>
              </div>
            ))}
          </div>
          <div className="leg-7d">
            <span className="lg-verde">Vendas</span>
            <span className="lg-vermelho">Gastos</span>
            <span className="lg-azul">Entradas extras</span>
          </div>
        </div>

        <div className="chart-panel">
          <h3>💳 Pagamentos de hoje</h3>
          {pagDiv.every((p) => p.v === 0) && <Empty text="Nenhum pagamento hoje ainda." />}
          <div className="hbars">
            {pagDiv.map((p) => (
              <div key={p.k} className="hbar">
                <span className="hlab">{PAG_ICON[p.k]} {PAG_LABEL[p.k]}</span>
                <div className="htrack">
                  <div className="hfill" style={{ width: (p.v / maxPag) * 100 + '%', background: PAG_COLOR[p.k] }}></div>
                </div>
                <span className="hval">{fmtBRL(p.v)}</span>
              </div>
            ))}
          </div>
          <div className="subtle" style={{ marginTop: 8 }}>Total recebido hoje: <b>{fmtBRL(d.faturamento_hoje)}</b></div>
        </div>
      </div>

      <div className="chart-two-col">
        <div className="chart-panel">
          <h3>🥇 Top produtos vendidos hoje</h3>
          {(d.top_produtos || []).length === 0 && <Empty text="Sem vendas fechadas hoje." />}
          <div className="hbars">
            {(d.top_produtos || []).map((p) => (
              <div key={p.nome} className="hbar">
                <span className="hlab">{p.nome}</span>
                <div className="htrack">
                  <div className="hfill" style={{ width: (p.qtd / maxTop) * 100 + '%', background: '#d8a033' }}></div>
                </div>
                <span className="hval">{p.qtd} · {fmtBRL(p.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-panel">
          <h3>📌 Pedidos por status (agora)</h3>
          <div className="hbars">
            {['enviado', 'em_preparo', 'entregue'].map((s) => (
              <div key={s} className="hbar">
                <span className="hlab">{STATUS_LABEL[s]}</span>
                <div className="htrack">
                  <div className="hfill" style={{ width: ((d.pedidos_por_status[s] || 0) / maxSt) * 100 + '%', background: STATUS_COLOR[s] }}></div>
                </div>
                <span className="hval">{d.pedidos_por_status[s] || 0}</span>
              </div>
            ))}
            <div className="hbar">
              <span className="hlab">Fechados hoje</span>
              <div className="htrack">
                <div className="hfill" style={{ width: (d.fechados_hoje / maxSt) * 100 + '%', background: STATUS_COLOR.fechado }}></div>
              </div>
              <span className="hval">{d.fechados_hoje}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>🪑 Mesas fechadas hoje</h3>
          <button className="link" onClick={() => onGoTo('odm')}>abrir ODM</button>
        </div>
        {d.mesas_fechadas_hoje.length === 0 && <Empty text="Nenhuma mesa foi fechada ainda hoje." />}
        {d.mesas_fechadas_hoje.map((m) => (
          <div key={m.mesa_id} className="list-row">
            <span>Mesa {m.mesa_numero} · {m.pedidos} pedido(s) · às {fmtHora(m.ultimo_fechado)}</span>
            <span className="saldo-positivo">{fmtBRL(m.total)}</span>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <h3>⚠️ Estoque baixo</h3>
            <button className="link" onClick={() => onGoTo('produtos')}>ver produtos</button>
          </div>
          {d.estoque_baixo.length === 0 && <Empty text="Nenhum produto abaixo do mínimo." />}
          {d.estoque_baixo.map((p) => (
            <div key={p.id} className="list-row">
              <span>{p.nome}</span>
              <span className="alerta">{p.estoque} {p.unidade} (mín. {p.estoque_min})</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>🧾 Últimos pedidos</h3>
            <button className="link" onClick={() => onGoTo('odm')}>abrir ODM</button>
          </div>
          {d.ultimos_pedidos.length === 0 && <Empty text="Sem pedidos ainda." />}
          {d.ultimos_pedidos.map((p) => (
            <div key={p.id} className="list-row">
              <span>#{p.id} · Mesa {p.mesa_numero} · {p.funcionario ? p.funcionario.nome.split(' ')[0] : ''}</span>
              <span className="saldo-positivo">{fmtBRL((p.total_liquido !== null && p.total_liquido !== undefined && p.total_liquido !== '') ? p.total_liquido : p.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}