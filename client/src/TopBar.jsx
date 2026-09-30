import { useEffect, useState } from 'react';
import { api } from './api';
import { usePolling, Modal, Empty } from './ui';

function Relogio() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const it = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(it);
  }, []);
  const hh = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dia = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return (
    <div className="relogio">
      <span className="relogio-hora">{hh}</span>
      <span className="relogio-data">{dia}</span>
    </div>
  );
}

function calcula(a, b, o) {
  const x = parseFloat(a) || 0;
  const y = parseFloat(b) || 0;
  let v = 0;
  if (o === '+') v = x + y;
  else if (o === '-') v = x - y;
  else if (o === 'x') v = x * y;
  else if (o === '/') v = y === 0 ? NaN : x / y;
  if (isNaN(v) || !isFinite(v)) return null;
  return Math.round(v * 1e8) / 1e8;
}

function Calculadora({ onClose }) {
  const [cur, setCur] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const fmt = (n) => String(n);

  function reset() { setCur('0'); setPrev(null); setOp(null); setFresh(true); }

  function digito(d) {
    if (fresh) { setCur(d); setFresh(false); }
    else if (cur === '0' && d !== '.') setCur(d);
    else if (d === '.' && cur.includes('.')) return;
    else setCur(cur + d);
  }

  function operador(o) {
    if (op && prev !== null && !fresh) {
      const r = calcula(prev, cur, op);
      if (r === null) { reset(); return; }
      setPrev(r); setCur(fmt(r)); setOp(o); setFresh(true);
    } else if (fresh && prev !== null) {
      setOp(o);
    } else {
      setPrev(parseFloat(cur)); setOp(o); setFresh(true);
    }
  }

  function igual() {
    if (op === null) return;
    const r = calcula(prev, cur, op);
    if (r === null) { reset(); return; }
    setCur(fmt(r)); setPrev(null); setOp(null); setFresh(true);
  }

  function retro() {
    if (fresh) return;
    setCur(cur.length > 1 ? cur.slice(0, -1) : '0');
  }

  function sinal() {
    if (fresh) return;
    setCur(cur.startsWith('-') ? cur.slice(1) : '-' + cur);
  }

  function pct() {
    const v = (parseFloat(cur) || 0) / 100;
    setCur(fmt(v)); setFresh(true);
  }

  const bt = (t, fn, cls) => (
    <button key={t} className={'calc-btn' + (cls ? ' ' + cls : '')} onClick={fn}>{t}</button>
  );

  const show = op && !fresh ? fmt(prev) + ' ' + op + ' ' + cur : cur;

  return (
    <Modal title="Calculadora" onClose={onClose}>
      <div className="calc">
        <div className="calc-display">{show}</div>
        <div className="calc-grade">
          {bt('C', reset, 'calc-fnc')}
          {bt('⌫', retro, 'calc-fnc')}
          {bt('%', pct, 'calc-fnc')}
          {bt('÷', () => operador('/'), 'calc-op')}
          {bt('7', () => digito('7'))}
          {bt('8', () => digito('8'))}
          {bt('9', () => digito('9'))}
          {bt('×', () => operador('x'), 'calc-op')}
          {bt('4', () => digito('4'))}
          {bt('5', () => digito('5'))}
          {bt('6', () => digito('6'))}
          {bt('−', () => operador('-'), 'calc-op')}
          {bt('1', () => digito('1'))}
          {bt('2', () => digito('2'))}
          {bt('3', () => digito('3'))}
          {bt('+', () => operador('+'), 'calc-op')}
          {bt('±', sinal, 'calc-fnc')}
          {bt('0', () => digito('0'))}
          {bt('.', () => digito('.'))}
          {bt('=', igual, 'calc-eq')}
        </div>
      </div>
    </Modal>
  );
}

function Lembretes({ onClose }) {
  const [lista, err] = usePolling(() => api.get('/api/lembretes'), 15000);
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');

  async function adicionar() {
    const t = texto.trim();
    if (!t) return;
    try {
      await api.post('/api/lembretes', { texto: t });
      setTexto('');
      setMsg('Lembrete adicionado!');
    } catch (e) {
      setMsg('Erro: ' + e.message);
    }
  }

  async function alternar(r) {
    try {
      await api.put('/api/lembretes/' + r.id, { feito: r.feito ? 0 : 1 });
      setMsg('');
    } catch (e) {
      setMsg('Erro: ' + e.message);
    }
  }

  async function remover(r) {
    try {
      await api.delete('/api/lembretes/' + r.id);
    } catch (e) {
      setMsg('Erro: ' + e.message);
    }
  }

  const feitos = lista ? [...lista].sort((a, b) => a.feito - b.feito) : [];

  return (
    <Modal title="Lembretes" onClose={onClose}>
      <div className="adicionar-produto">
        <input
          className="input"
          placeholder="Novo lembrete..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }}
        />
        <button className="btn" onClick={adicionar}>＋</button>
      </div>
      {msg && <div className={msg.startsWith('Erro') ? 'form-error' : 'toast'} style={{ marginBottom: 8 }}>{msg}</div>}
      {!lista && !err && <Empty text="..." />}
      {lista && lista.length === 0 && <Empty text="Sem lembretes. Adicione um acima." />}
      <div className="lembretes">
        {feitos.map((r) => (
          <div className="rem-item" key={r.id}>
            <button className={'rem-check' + (r.feito ? ' rem-checked' : '')} onClick={() => alternar(r)} title={r.feito ? 'Desfazer' : 'Concluir'}>
              {r.feito ? '✓' : ''}
            </button>
            <span className={'rem-text' + (r.feito ? ' rem-feito' : '')}>{r.texto}</span>
            <button className="rem-x" onClick={() => remover(r)} title="Excluir">🗑</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function TopBar({ cfg, tema, onToggleTema }) {
  const [calc, setCalc] = useState(false);
  const [lemb, setLemb] = useState(false);
  const [lista] = usePolling(() => api.get('/api/lembretes'), 30000);
  const pendentes = lista ? lista.filter((r) => !r.feito).length : 0;
  const curTema = tema || (cfg && cfg.ui && cfg.ui.tema) || 'papel';
  const escuro = curTema === 'escuro';

  return (
    <header className="topbar-admin">
      <Relogio />
      <div className="topbar-ico">
        <span className="top-ico-wrap">
          <button className="top-ico" title="Lembretes" onClick={() => setLemb(true)}>🔔</button>
          {pendentes > 0 && <span className="badge">{pendentes}</span>}
        </span>
        <button className="top-ico" title="Calculadora" onClick={() => setCalc(true)}>🧮</button>
        <button className="top-ico" title={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'} onClick={onToggleTema}>
          {escuro ? '☀️' : '🌙'}
        </button>
      </div>
      {calc && <Calculadora onClose={() => setCalc(false)} />}
      {lemb && <Lembretes onClose={() => setLemb(false)} />}
    </header>
  );
}