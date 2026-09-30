import { useState } from 'react';
import { api, fmtBRL, fmtNum, PAG_LABEL } from './api';
import { Btn, Modal, Toast } from './ui';

function receitaHtml(settings, order) {
  const d = new Date(order.criado_em);
  const data = d.toLocaleDateString('pt-BR');
  const hora = d.toLocaleTimeString('pt-BR');
  const linhas = [];

  const center = (t, b) => linhas.push('<div class="' + (b ? 'b' : '') + '" style="text-align:center">' + t + '</div>');
  const linha = (t, b) => linhas.push('<div class="' + (b ? 'b' : '') + '">' + t + '</div>');

  center((settings.estabelecimento || 'Estabelecimento').toUpperCase(), true);
  if (settings.endereco) center(settings.endereco);
  if (settings.telefone) center(settings.telefone);
  if (settings.cnpj) center('CNPJ: ' + settings.cnpj);
  linhas.push('<div class="line">' + '='.repeat(40) + '</div>');
  center('CUPOM / COMANDA (NÃO FISCAL)', true);
  linhas.push('<div class="line">' + '='.repeat(40) + '</div>');
  linha('PEDIDO Nº: ' + String(order.id).padStart(5, '0'));
  linha('DATA: ' + data);
  linha('HORA: ' + hora);
  linha('CÓD. FUNCIONÁRIO: ' + (order.funcionario ? order.funcionario.codigo : '-'));
  linha('FUNCIONÁRIO: ' + (order.funcionario ? order.funcionario.nome : '-'));
  linha('MESA: ' + (order.mesa_numero || '-') + (order.mesa_local ? '  LOCAL: ' + order.mesa_local : ''));
  linhas.push('<div class="line">' + '-'.repeat(40) + '</div>');
  for (const it of order.itens || []) {
    const sub = fmtBRL(it.subtotal);
    const nome = it.nome.length > 28 ? it.nome.substring(0, 28) + '…' : it.nome;
    const pad = 40 - nome.length - sub.length - 1;
    linha(nome + ' '.repeat(pad) + sub);
    linha('   ' + fmtNum(it.quantidade) + ' x ' + fmtBRL(it.preco) + ' (' + it.unidade + ')');
  }
  const liquido = Number(order.total_liquido) || (Number(order.total) - Number(order.desconto)) || Number(order.total);
  linhas.push('<div class="line">' + '-'.repeat(40) + '</div>');
  center('TOTAL: ' + fmtBRL(order.total), true);
  if (Number(order.desconto) > 0) linha('DESCONTO: -' + fmtBRL(order.desconto));
  center('TOTAL A PAGAR: ' + fmtBRL(liquido), true);
  if (order.pagamento) linha('PAGAMENTO: ' + (PAG_LABEL[order.pagamento] || order.pagamento));
  if (order.fechado_em) linha('FECHADO EM: ' + new Date(order.fechado_em).toLocaleString('pt-BR'));
  if (order.observacao) {
    linhas.push('<div class="line">' + '-'.repeat(40) + '</div>');
    linha('<b>OBS:</b> ' + order.observacao);
  }
  linhas.push('<div class="line">' + '='.repeat(40) + '</div>');
  if (settings.rodapeCupom) center(settings.rodapeCupom);
  center('Obrigado e volte sempre!');
  linhas.push('<br/>');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Cupom ${order.id}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 8px 10px; width: 80mm; font-family: 'Lucida Console', 'Courier New', monospace;
    font-size: 12px; color: #000; }
  .b { font-weight: bold; }
  .line { white-space: pre; }
  div { line-height: 1.35; }
</style></head><body>${linhas.join('\n')}</body></html>`;
}

export default function ReceiptModal({ order, settings, onClose }) {
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  function imprimir() {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) { setErro('Seu navegador bloqueou a janela de impressão.'); return; }
    w.document.write(receitaHtml(settings, order));
    w.document.close();
    w.focus();
    w.onload = () => setTimeout(() => w.print(), 300);
  }

  async function enviarRede() {
    setBusy(true); setErro(''); setMsg('');
    try {
      const r = await api.post('/api/orders/' + order.id + '/print');
      setMsg(r.mensagem || 'Cupom enviado!');
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={'Cupom · Pedido #' + order.id} onClose={onClose}>
      <div className="preview-cupom">
        <div className="preview-head">
          <b>Cód. Funcionário: </b>{order.funcionario ? order.funcionario.codigo + ' · ' + order.funcionario.nome : '-'}
          <br />
          <b>Data/Hora: </b>{new Date(order.criado_em).toLocaleString('pt-BR')}
          <br />
          <b>Mesa: </b>{order.mesa_numero}
          <br />
          <b>Itens: </b>{order.itens.length} · <b>Total: </b>{fmtBRL(order.total)}
          {Number(order.desconto) > 0 && (
            <>
              <br />
              <b>Desconto: </b>-{fmtBRL(order.desconto)} · <b>Total a pagar: </b>{fmtBRL(Number(order.total_liquido) || Number(order.total) - Number(order.desconto))}
            </>
          )}
          {order.status === 'fechado' && (
            <>
              <br />
              <b>Pagamento: </b>{order.pagamento ? PAG_LABEL[order.pagamento] : '-'}
              {order.fechado_em && <> · {new Date(order.fechado_em).toLocaleString('pt-BR')}</>}
            </>
          )}
        </div>
      </div>
      <div className="row-gap">
        <Btn variant="primary" onClick={imprimir}>🖨️ Imprimir cupom</Btn>
        {settings && settings.printerMode === 'rede' && (
          <Btn onClick={enviarRede} disabled={busy}>Enviar impressora em rede</Btn>
        )}
      </div>
      {settings && settings.printerMode === 'rede' && (
        <div className="subtle">Impressora: rede em {settings.printerIp}:{settings.printerPort}</div>
      )}
      <Toast msg={msg} />
      {erro && <div className="form-error">{erro}</div>}
    </Modal>
  );
}