const net = require('net');

const W = 48;

function pad(s, n, ch) {
  s = String(s);
  const c = ch || ' ';
  while (s.length < n) s += c;
  return s;
}

function padEnd(s, n) {
  return pad(s, n, ' ');
}

function padStart(s, n) {
  s = String(s);
  const c = ' ';
  while (s.length < n) s = c + s;
  return s;
}

function cut(text, n) {
  if (String(text).length <= n) return String(text);
  return String(text).substring(0, n - 1) + '…';
}

function fmtBRL(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',');
}

function buildReceiptLines(cfg, order) {
  const lines = [];
  lines.push({ text: cfg.estabelecimento || 'Estabelecimento', center: true, bold: true });
  if (cfg.endereco) lines.push({ text: cfg.endereco, center: true });
  if (cfg.telefone) lines.push({ text: cfg.telefone, center: true });
  if (cfg.cnpj) lines.push({ text: 'CNPJ: ' + cfg.cnpj, center: true });
  lines.push({ text: '='.repeat(W) });
  lines.push({ text: 'CUPOM / COMANDA  (não fiscal)', center: true, bold: true });
  lines.push({ text: '='.repeat(W) });

  const d = new Date(order.criado_em);
  const data = d.toLocaleDateString('pt-BR');
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  lines.push({ text: `PEDIDO Nº: ${String(order.id).padStart(5, '0')}` });
  lines.push({ text: `DATA: ${data}` });
  lines.push({ text: `HORA: ${hora}` });
  lines.push({ text: `CÓD. FUNCIONÁRIO: ${order.funcionario ? order.funcionario.codigo : '-'}` });
  lines.push({ text: `FUNCIONÁRIO: ${order.funcionario ? order.funcionario.nome : '-'}` });
  lines.push({ text: `MESA: ${order.mesa_numero || '-'}  LOCAL: ${order.mesa_local || ''}` });
  lines.push({ text: '-'.repeat(W) });

  for (const it of order.itens || []) {
    const q = Number(it.quantidade);
    const nome = cut(it.nome, 26);
    const subtotalStr = fmtBRL(it.subtotal);
    lines.push({
      text: padEnd(nome, W - (subtotalStr.length + 1)) + subtotalStr
    });
    lines.push({
      text: '   ' + String(q).replace('.', ',') + ' x ' + fmtBRL(it.preco) + ' (' + it.unidade + ')',
      right: true
    });
  }

  lines.push({ text: '-'.repeat(W) });
  lines.push({ text: 'TOTAL', bold: true, left: true });
  lines.push({ text: fmtBRL(order.total), center: true, bold: true, double: true });
  if (Number(order.desconto) > 0) {
    lines.push({ text: 'DESCONTO: -' + fmtBRL(order.desconto), center: true });
    lines.push({ text: 'TOTAL A PAGAR', center: true, bold: true });
    lines.push({ text: fmtBRL(order.total_liquido || (order.total - order.desconto)), center: true, bold: true, double: true });
  }
  if (order.pagamento) {
    const rotulos = { pix: 'PIX', dinheiro: 'DINHEIRO', debito: 'CARTÃO DÉBITO', credito: 'CARTÃO CRÉDITO' };
    lines.push({ text: 'PAGAMENTO: ' + (rotulos[order.pagamento] || order.pagamento), center: true, bold: true });
  }
  if (order.fechado_em) {
    const fd = new Date(order.fechado_em);
    lines.push({ text: 'FECHADO EM: ' + fd.toLocaleString('pt-BR'), center: true });
  }
  if (order.observacao) {
    lines.push({ text: '-'.repeat(W) });
    lines.push({ text: 'OBS: ' + cut(order.observacao, 44) });
  }
  lines.push({ text: '='.repeat(W) });
  if (cfg.rodapeCupom) {
    lines.push({ text: cfg.rodapeCupom, center: true });
  }
  lines.push({ text: '' });

  return lines;
}

function buildBuffer(lines) {
  const enc = (s) => Buffer.from(String(s), 'latin1');
  const parts = [Buffer.from([0x1b, 0x40])];
  for (const ln of lines) {
    if (ln.double) parts.push(Buffer.from([0x1b, 0x21, 0x10]));
    else parts.push(Buffer.from([0x1b, 0x21, 0x00]));
    if (ln.bold) parts.push(Buffer.from([0x1b, 0x45, 0x01]));
    else parts.push(Buffer.from([0x1b, 0x45, 0x00]));
    parts.push(Buffer.from([0x1b, 0x61, ln.center ? 0x01 : 0x00]));
    parts.push(enc(ln.text));
    parts.push(Buffer.from([0x0a]));
  }
  parts.push(Buffer.from([0x1d, 0x56, 0x01]));
  return Buffer.concat(parts);
}

function printLines(ip, port, lines, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: ip, port: port });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('Tempo esgotado ao conectar na impressora ' + ip + ':' + port));
    }, timeoutMs || 5000);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.write(buildBuffer(lines), (err) => {
        if (err) {
          sock.destroy();
          return reject(err);
        }
        sock.end();
        resolve();
      });
    });
    sock.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    sock.on('close', () => clearTimeout(timer));
  });
}

function printCupom(cfg, order) {
  return printLines(cfg.printerIp, Number(cfg.printerPort) || 9100, buildReceiptLines(cfg, order));
}

function printTeste(cfg) {
  const lines = [
    { text: cfg.estabelecimento || 'Teste', center: true, bold: true },
    { text: 'TESTE DE IMPRESSÃO', center: true, bold: true },
    { text: '='.repeat(W) },
    { text: 'Se você está lendo isto, a' },
    { text: 'impressora está funcionando!' },
    { text: 'Data: ' + new Date().toLocaleDateString('pt-BR') },
    { text: 'Hora: ' + new Date().toLocaleTimeString('pt-BR') },
    { text: '='.repeat(W) },
    { text: '' }
  ];
  return printLines(cfg.printerIp, Number(cfg.printerPort) || 9100, lines);
}

module.exports = { buildReceiptLines, printCupom, printTeste, buildBuffer };