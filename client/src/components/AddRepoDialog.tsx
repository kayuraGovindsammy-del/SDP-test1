import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../api.ts';
import type { Repository } from '../types.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (repo: Repository) => void;
}

type Tab = 'upload' | 'clone';

export default function AddRepoDialog({ open, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<Tab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab('upload');
      setFile(null);
      setName('');
      setUrl('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    try {
      setBusy(true);
      setError(null);
      let repo: Repository;
      if (tab === 'upload') {
        if (!file) throw new Error('Choose a .zip file first');
        repo = await api.uploadRepository(file, name);
      } else {
        if (!url.trim()) throw new Error('Enter a clone URL');
        repo = await api.cloneRepository(url, name);
      }
      onCreated(repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>Add repository</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Close">
            ✕
          </button>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={tab === 'upload' ? 'tab active' : 'tab'}
            onClick={() => setTab('upload')}
          >
            Upload zip
          </button>
          <button
            type="button"
            className={tab === 'clone' ? 'tab active' : 'tab'}
            onClick={() => setTab('clone')}
          >
            Clone URL
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          {tab === 'upload' ? (
            <label className="field" key="upload">
              <span>Repository archive (.zip, must include the .git directory)</span>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
              />
              {file && (
                <span className="muted">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </label>
          ) : (
            <label className="field" key="clone">
              <span>Remote repository URL</span>
              <input
                type="text"
                value={url}
                placeholder="https://github.com/owner/repo.git"
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <label className="field">
            <span>Display name (optional)</span>
            <input
              type="text"
              value={name}
              placeholder={tab === 'upload' ? 'Derived from the zip file name' : 'Derived from the URL'}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <div className="error">{error}</div>}
          {busy && tab === 'clone' && (
            <div className="hint">
              Deep cloning fetches the full history and can take a while for large repositories.
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy
                ? tab === 'upload'
                  ? 'Uploading…'
                  : 'Cloning…'
                : tab === 'upload'
                  ? 'Upload repository'
                  : 'Clone repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
