import { useState } from 'react';
import { api } from './api';
import { usePolling, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';

const VAZIO = { nome: '', contato: '', telefone: '', email: '', cnpj: '', endereco: '', obs: '' };

export default function Fornecedores() {
  const [list, err] = usePolling(() => api.get('/api/suppliers'), 15000);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');

  async function salvar(form) {
    if (form.id) await api.put('/api/suppliers/' + form.id, form);
    else await api.post('/api/suppliers', form);
    setMsg('Fornecedor salvo!');
    setEdit(null);
  }

  async function excluir(f) {
    if (!window.confirm('Excluir o fornecedor "' + f.nome + '"?')) return;
    try {
      await api.del('/api/suppliers/' + f.id);
      setMsg('Fornecedor excluído');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Fornecedores</h2>
          <p className="subtle">Cadastro dos seus fornecedores de bebidas, alimentos, etc.</p>
        </div>
        <Btn variant="primary" onClick={() => setEdit({ ...VAZIO })}>+ Novo fornecedor</Btn>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!list && <Spinner />}

      <div className="cards-list">
        {(list || []).map((f) => (
          <div key={f.id} className="row-card">
            <div className="row-card-head">
              <span className="row-card-title">{f.nome}</span>
              <div className="row-gap">
                <Btn onClick={() => setEdit(f)}>✏️</Btn>
                <Btn variant="danger" onClick={() => excluir(f)}>🗑</Btn>
              </div>
            </div>
            <div className="subtle">
              {[f.contato, f.telefone, f.email, f.cnpj && 'CNPJ ' + f.cnpj, f.endereco].filter(Boolean).join(' · ') || 'Sem dados de contato'}
              {f.obs && <div>Obs: {f.obs}</div>}
            </div>
          </div>
        ))}
      </div>
      {list && list.length === 0 && <Empty text="Nenhum fornecedor cadastrado." />}

      {edit && <FormFornecedor inicial={edit} onClose={() => setEdit(null)} onSalvar={salvar} />}
      <Toast msg={msg} />
    </div>
  );
}

function FormFornecedor({ inicial, onClose, onSalvar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function ok() {
    setBusy(true); setErro('');
    try { await onSalvar(form); } catch (e) { setErro(e.message); setBusy(false); }
  }

  return (
    <Modal title={form.id ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={onClose}>
      <Field label="Nome *"><input className="input" value={form.nome} onChange={set('nome')} /></Field>
      <div className="campo-linha">
        <Field label="Contato"><input className="input" value={form.contato} onChange={set('contato')} /></Field>
        <Field label="Telefone"><input className="input" value={form.telefone} onChange={set('telefone')} /></Field>
      </div>
      <div className="campo-linha">
        <Field label="E-mail"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="CNPJ"><input className="input" value={form.cnpj} onChange={set('cnpj')} /></Field>
      </div>
      <Field label="Endereço"><input className="input" value={form.endereco} onChange={set('endereco')} /></Field>
      <Field label="Observações"><input className="input" value={form.obs} onChange={set('obs')} /></Field>
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap"><Btn variant="primary" onClick={ok} disabled={busy || !form.nome}>Salvar</Btn></div>
    </Modal>
  );
}