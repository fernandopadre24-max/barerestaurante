import { useState } from 'react';
import { fmtBRL, PAG_LABEL, PAG_ICON } from './api';
import { Btn, Field, Modal } from './ui';

export default function PaymentModal({ total, titulo, nota, onConfirm, onClose, comissaoPadrao = 0 }) {
  const [pag, setPag] = useState('pix');
  const [descTipo, setDescTipo] = useState('pct');
  const [descValor, setDescValor] = useState('');
  const [comissaoOn, setComissaoOn] = useState(false);
  const [comissaoPct, setComissaoPct] = useState(comissaoPadrao || '');
  const [recebido, setRecebido] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const desconto = descTipo === 'pct'
    ? Math.min(total, Math.round((total * (Number(descValor) || 0)) / 100 * 100) / 100)
    : Math.min(total, Math.round((Number(descValor) || 0) * 100) / 100);

  const liquido = Math.round((total - desconto) * 100) / 100;
  const pctComissao = Number(comissaoOn ? comissaoPct : 0) || 0;
  const comissao = Math.round(liquido * pctComissao / 100 * 100) / 100;

  const valorRecebido = Number(recebido) || 0;
  const troco = pag === 'dinheiro' && valorRecebido > 0 ? Math.round((valorRecebido - liquido) * 100) / 100 : 0;

  async function confirmar() {
    if (pag === 'dinheiro' && valorRecebido > 0 && valorRecebido < liquido) {
      setErro('Valor recebido menor que o total. Confira.');
      return;
    }
    setBusy(true); setErro('');
    try {
      await onConfirm({ pagamento: pag, desconto, comissao_pct: pctComissao });
      onClose();
    } catch (e) {
      setErro(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={titulo} onClose={onClose}>
      <div className="preview-cupom" style={{ marginBottom: 10 }}>
        <div className="subtle">{nota}</div>
        <div className="preview-head">
          <b>Total</b>
          <b style={{ fontSize: 22, color: '#2ecc71' }}>{fmtBRL(total)}</b>
          {desconto > 0 && (
            <>
              <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                <span><b>Desconto</b></span>
                <span style={{ color: '#e74c3c' }}>-{fmtBRL(desconto)}</span>
              </div>
              <div className="row-gap" style={{ justifyContent: 'space-between' }}>
                <span><b>Total a pagar</b></span>
                <b>{fmtBRL(liquido)}</b>
              </div>
            </>
          )}
          {comissaoOn && pctComissao > 0 && (
            <div className="row-gap" style={{ justifyContent: 'space-between' }}>
              <span><b>Comissão ({pctComissao}%)</b></span>
              <span>{fmtBRL(comissao)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pag-opcoes">
        {Object.keys(PAG_LABEL).map((k) => (
          <button key={k} className={'pag-opcao' + (pag === k ? ' pag-opcao-sel' : '')} onClick={() => setPag(k)}>
            <span className="pag-ico">{PAG_ICON[k]}</span>
            {PAG_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="campo-linha">
        <Field label="Desconto ao cliente">
          <div className="desc-modo">
            <button className={'chip' + (descTipo === 'pct' ? ' chip-active' : '')} onClick={() => setDescTipo('pct')}>%</button>
            <button className={'chip' + (descTipo === 'fixo' ? ' chip-active' : '')} onClick={() => setDescTipo('fixo')}>R$</button>
          </div>
        </Field>
        <Field label={descTipo === 'pct' ? 'Porcentagem (%)' : 'Valor (R$)'}>
          <input className="input" type="number" step="0.01" min="0" value={descValor} onChange={(e) => setDescValor(e.target.value)} placeholder={descTipo === 'pct' ? 'Ex: 10' : fmtBRL(0)} />
        </Field>
      </div>

      <div className="check-row" style={{ padding: '8px 0' }}>
        <input type="checkbox" checked={comissaoOn} onChange={(e) => setComissaoOn(e.target.checked)} id="comissao-chk" />
        <label htmlFor="comissao-chk" style={{ cursor: 'pointer' }}>Descontar comissão do funcionário</label>
        {comissaoOn && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
            <input className="input input-num" type="number" step="0.1" min="0" max="100" value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} placeholder="%" style={{ width: 70 }} />
            <span className="subtle">%</span>
          </span>
        )}
      </div>

      {pag === 'dinheiro' && (
        <div className="campo-linha">
          <Field label="Valor recebido (R$)">
            <input className="input" type="number" step="0.01" min="0" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder={fmtBRL(liquido)} />
          </Field>
          {valorRecebido > 0 && (
            <Field label="Troco">
              <div className={'input' + (troco < 0 ? ' input-erro' : '')} style={{ paddingTop: 8 }}>
                <b>{troco < 0 ? 'Falta ' + fmtBRL(-troco) : fmtBRL(troco)}</b>
              </div>
            </Field>
          )}
        </div>
      )}

      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap">
        <Btn variant="success" onClick={confirmar} disabled={busy}>{busy ? 'Confirmando...' : '✅ Confirmar ' + PAG_LABEL[pag] + ' · ' + fmtBRL(liquido)}</Btn>
        <Btn onClick={onClose}>Cancelar</Btn>
      </div>
    </Modal>
  );
}