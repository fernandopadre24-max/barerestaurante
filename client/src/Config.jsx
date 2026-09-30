import { useState } from 'react';
import { api } from './api';
import { applyUI, TEMA_OPCOES, FONTE_OPCOES, TAMANHO_OPCOES } from './theme';
import { usePolling, Btn, Field, Toast } from './ui';

export default function Config() {
  const [cfg, err] = usePolling(() => api.get('/api/settings'), 30000);
  const [form, setForm] = useState(null);
  const [ui, setUi] = useState(null);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  if (err) return <div className="form-error">{err}</div>;
  if (!cfg) return null;

  const dados = form !== null ? form : cfg;
  const cur = ui || cfg.ui || { tema: 'papel', fonte: 'sistema', tamanho: 'medio' };
  const set = (k) => (e) => setForm({ ...(form !== null ? form : cfg), [k]: e.target.value });

  function setUI(k, v) {
    const novo = { ...cur, [k]: v };
    setUi(novo);
    applyUI(novo);
  }

  async function salvar() {
    setBusy(true); setErro('');
    try {
      await api.put('/api/settings', { ...(form !== null ? form : cfg), ui: cur });
      setMsg('Configurações salvas!');
      setForm(null);
      setUi(null);
      applyUI(cur);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function teste() {
    setBusy(true); setErro(''); setMsg('');
    try {
      const r = await api.post('/api/print/teste');
      setMsg(r.mensagem || 'Teste enviado!');
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function baixarBackup() {
    setBusy(true); setErro('');
    try {
      const data = await api.get('/api/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const hoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      a.download = 'backup-barraca-' + hoje + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('Backup baixado com sucesso!');
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function restaurarBackup(file) {
    if (!file) return;
    if (!window.confirm('Isso vai SUBSTITUIR todos os dados atuais pelos do backup. Deseja continuar?')) return;
    setBusy(true); setErro('');
    try {
      const texto = await file.text();
      const backup = JSON.parse(texto);
      const r = await api.post('/api/backup', backup);
      setMsg('Backup restaurado! Recarregando...');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setErro(e.message || 'Arquivo de backup inválido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Configurações</h2>
          <p className="subtle">Aparência, dados do estabelecimento, impressora e backup.</p>
        </div>
      </div>

      <div className="panel">
        <h3>🎨 Aparência</h3>
        <div className="field-label" style={{ margin: '10px 0 6px' }}>Tema (troca de tela)</div>
        <div className="opcoes">
          {TEMA_OPCOES.map((t) => (
            <button
              key={t.valor}
              className={'opcao' + (cur.tema === t.valor ? ' opcao-sel' : '')}
              onClick={() => setUI('tema', t.valor)}
            >
              {t.nome}
              <small>{t.desc}</small>
            </button>
          ))}
        </div>

        <div className="field-label" style={{ margin: '14px 0 6px' }}>Fonte de letras</div>
        <div className="opcoes">
          {FONTE_OPCOES.map((f) => (
            <button key={f.valor} className={'opcao' + (cur.fonte === f.valor ? ' opcao-sel' : '')} onClick={() => setUI('fonte', f.valor)}>
              {f.nome}
              <small>{f.desc}</small>
            </button>
          ))}
        </div>

        <div className="field-label" style={{ margin: '14px 0 6px' }}>Tamanho do texto</div>
        <div className="opcoes">
          {TAMANHO_OPCOES.map((t) => (
            <button key={t.valor} className={'opcao' + (cur.tamanho === t.valor ? ' opcao-sel' : '')} onClick={() => setUI('tamanho', t.valor)}>
              {t.nome}
              <small>{t.desc}</small>
            </button>
          ))}
        </div>
        <div className="subtle" style={{ marginTop: 10 }}>As mudanças aparecem em tempo real em todos os aparelhos após salvar.</div>
      </div>

      <div className="panel">
        <h3>🏷️ Estabelecimento (título e cupom)</h3>
        <div className="campo-linha">
          <Field label="Nome / Título"><input className="input" value={dados.estabelecimento || ''} onChange={set('estabelecimento')} placeholder="Ex: Bar do Zé" /></Field>
          <Field label="Telefone"><input className="input" value={dados.telefone || ''} onChange={set('telefone')} /></Field>
        </div>
        <div className="campo-linha">
          <Field label="Endereço"><input className="input" value={dados.endereco || ''} onChange={set('endereco')} /></Field>
          <Field label="CNPJ"><input className="input" value={dados.cnpj || ''} onChange={set('cnpj')} /></Field>
        </div>
        <Field label="Rodapé do cupom"><input className="input" value={dados.rodapeCupom || ''} onChange={set('rodapeCupom')} /></Field>
      </div>

      <div className="panel">
        <h3>💸 Comissão dos funcionários</h3>
        <div className="campo-linha">
          <Field label="Comissão padrão (%)"><input className="input" type="number" step="0.1" min="0" max="100" value={dados.comissaoPct || 0} onChange={set('comissaoPct')} placeholder="Ex: 5" /></Field>
        </div>
        <div className="subtle">Usada como sugestão no fechamento/pagamento. Pode ser ajustada a cada fechamento ou desligada (opcional).</div>
      </div>

      <div className="panel">
        <h3>🖨️ Impressora de cupom</h3>
        <Field label="Modo de impressão">
          <select className="input" value={dados.printerMode || 'navegador'} onChange={set('printerMode')}>
            <option value="navegador">Pelo navegador (qualquer impressora instalada no Windows)</option>
            <option value="rede">Rede ESC/POS (impressora térmica com IP fixo)</option>
          </select>
        </Field>
        {dados.printerMode === 'rede' && (
          <>
            <div className="campo-linha">
              <Field label="IP da impressora"><input className="input" value={dados.printerIp || ''} onChange={set('printerIp')} placeholder="Ex: 192.168.0.50" /></Field>
              <Field label="Porta"><input className="input" type="number" value={dados.printerPort || 9100} onChange={set('printerPort')} /></Field>
            </div>
            <Btn onClick={teste} disabled={busy}>🔌 Testar impressão em rede</Btn>
          </>
        )}
        <div className="subtle" style={{ marginTop: 8 }}>
          No modo navegador, abra um cupom e clique em "Imprimir". Configure a impressora térmica (80mm) como padrão no Windows.
        </div>
      </div>

      <div className="panel">
        <h3>🗄️ Backup dos dados</h3>
        <div className="subtle" style={{ marginBottom: 12 }}>Exporte todo o banco (produtos, pedidos, usuários, financeiro etc.) para um arquivo .json. Guarde-o em um lugar seguro. A restauração substitui todos os dados atuais.</div>
        <div className="row-gap">
          <Btn variant="primary" onClick={baixarBackup} disabled={busy}>📥 Baixar backup (.json)</Btn>
          <label className="btn">
            📤 Restaurar backup
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => restaurarBackup(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="row-gap">
        <Btn variant="primary" onClick={salvar} disabled={busy}>Salvar configurações</Btn>
      </div>
      {erro && <div className="form-error">{erro}</div>}
      <Toast msg={msg} />
    </div>
  );
}