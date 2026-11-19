/**
 * FR 6.2 case view and FR 7.1-7.2 triage. Photos are fetched with the login
 * token and shown from memory (object URLs), revoked when the page closes.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PRIORITIES, type CaseDetail, type Priority, type TriageResult } from '@smilesync/shared';
import { ApiError, api } from '../api';
import { ImageViewer, type ViewerImage } from '../components/ImageViewer';
import { DURATION, PRIORITY, VIEW, dateTime, painClass } from '../lib/format';
import { href } from '../router';

const PRIORITY_HELP: Record<Priority, string> = {
  ROUTINE: 'Next routine clinic visit',
  URGENT: 'Should see a dentist within days',
  EMERGENCY: 'Needs care today',
};

export function CasePage({ id }: { id: string }) {
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ViewerImage[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);

  const load = () =>
    api
      .get<CaseDetail>(`/cases/${id}`)
      .then((d) => (setCase(d), setError(null)))
      .catch((e: unknown) => setError(e instanceof ApiError && e.status === 404 ? 'Case not found.' : 'Could not load the case.'));

  useEffect(() => {
    void load();
  }, [id]);

  // Fetch photos once the case is known; free them when leaving.
  useEffect(() => {
    if (!c) return;
    let live = true;
    const urls: string[] = [];
    Promise.all(
      c.images.map(async (img) => {
        const url = await api.imageUrl(`/cases/${c.id}/images/${img.id}`);
        urls.push(url);
        return { url, label: VIEW[img.viewType] };
      }),
    )
      .then((list) => live && setPhotos(list))
      .catch(() => live && setError('Some photos could not be loaded.'));
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [c?.id, c?.images.length]);

  if (error && !c) return <p className="banner error" role="alert">{error}</p>;
  if (!c) return <p className="muted">Loading…</p>;

  return (
    <article className="case" aria-labelledby="case-title">
      <div className="page-head">
        <a href={href({ page: 'queue' })} className="back">
          ← Queue
        </a>
        <h1 id="case-title">Case {c.anonId}</h1>
        {c.priority ? <span className={`badge ${c.priority.toLowerCase()}`}>{PRIORITY[c.priority]}</span> : <span className="badge waiting">Waiting for review</span>}
      </div>
      {error ? <p className="banner error">{error}</p> : null}

      <ul className="facts-strip" aria-label="Patient and symptoms">
        <li>
          <span>Age</span> {c.age}
        </li>
        <li>
          <span>Sex</span> {c.sex ? c.sex.toLowerCase().replace('_', ' ') : 'not recorded'}
        </li>
        <li>
          <span>County</span> {c.location}
        </li>
        <li>
          <span>Pain</span> <b className={`pain ${painClass(c.painLevel)}`}>{c.painLevel ?? '-'}</b>/10
        </li>
        <li>
          <span>Duration</span> {c.duration ? DURATION[c.duration] : '-'}
        </li>
        <li>
          <span>Captured</span> {dateTime(c.createdAt)}
        </li>
        <li>
          <span>CHW</span> {c.submittedBy}
        </li>
        <li>
          <span>Consent</span> {dateTime(c.consentDate)}
        </li>
      </ul>

      <div className="case-grid">
        <section aria-label="Photos" className="photos">
          <div className="photo-grid">
            {c.images.map((img, i) => (
              <button type="button" key={img.id} className="photo" onClick={() => setViewing(i)} disabled={!photos[i]} aria-label={`Open ${VIEW[img.viewType]} photo full screen`}>
                {photos[i] ? <img src={photos[i]!.url} alt="" /> : <span className="muted">Loading…</span>}
                <span className="photo-label">{VIEW[img.viewType]} · click to zoom</span>
              </button>
            ))}
          </div>
          <p className="muted small">The patient's name stays with the CHW and is not shown here.</p>
        </section>

        <aside className="triage-panel card" aria-labelledby="triage-title">
          <h2 id="triage-title">{c.status === 'REVIEWED' ? 'Update triage' : 'Your triage'}</h2>
          <TriageForm caseDetail={c} onSaved={() => void load()} />
          {c.notes.length > 0 ? (
            <div className="history">
              <h3>Earlier notes</h3>
              <ol className="notes">
                {c.notes.map((n) => (
                  <li key={n.id}>
                    <p>{n.noteText}</p>
                    {n.referralAdvice ? (
                      <p>
                        <strong>Referral:</strong> {n.referralAdvice}
                      </p>
                    ) : null}
                    <p className="muted small">
                      {n.author}, {dateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </aside>
      </div>

      {viewing !== null && photos.length === c.images.length ? <ImageViewer images={photos} start={viewing} onClose={() => setViewing(null)} /> : null}
    </article>
  );
}

function TriageForm({ caseDetail, onSaved }: { caseDetail: CaseDetail; onSaved: () => void }) {
  const [priority, setPriority] = useState<Priority | ''>(caseDetail.priority ?? '');
  const [noteText, setNoteText] = useState('');
  const [referral, setReferral] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // One id per note: a retried save after a network error cannot add it twice (FR 7.2).
  const noteId = useRef(crypto.randomUUID());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!priority) {
      setMessage({ kind: 'error', text: 'Choose a priority first.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.send<TriageResult>('PUT', `/cases/${caseDetail.id}/triage`, {
        priority,
        ...(noteText.trim()
          ? { note: { id: noteId.current, noteText: noteText.trim(), ...(referral.trim() ? { referralAdvice: referral.trim() } : {}) } }
          : {}),
      });
      noteId.current = crypto.randomUUID();
      setNoteText('');
      setReferral('');
      setMessage({ kind: 'ok', text: 'Saved. The CHW will receive it on their next sync.' });
      onSaved();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="triage" aria-label="Assign priority and add notes">
      <fieldset>
        <legend>1. Priority</legend>
        <div className="priority-options">
          {PRIORITIES.map((p) => (
            <label key={p} className={`priority-option ${p.toLowerCase()} ${priority === p ? 'selected' : ''}`}>
              <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} />
              <strong>{PRIORITY[p]}</strong>
              <span>{PRIORITY_HELP[p]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        2. Clinical notes for the CHW
        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} maxLength={5000} placeholder="What you see and what the patient should do" />
      </label>
      <label>
        3. Referral advice (optional)
        <textarea value={referral} onChange={(e) => setReferral(e.target.value)} rows={2} maxLength={2000} placeholder="Where to go and how soon" />
      </label>
      {message ? (
        <p className={`banner ${message.kind === 'ok' ? 'ok' : 'error'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      <button type="submit" className="primary-action" disabled={busy}>
        {busy ? 'Saving…' : caseDetail.status === 'REVIEWED' ? 'Update triage' : 'Save triage'}
      </button>
    </form>
  );
}
