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
      <p>
        <a href={href({ page: 'queue' })}>← Back to queue</a>
      </p>
      <div className="page-head">
        <h1 id="case-title">Case {c.anonId}</h1>
        {c.priority ? <span className={`badge ${c.priority.toLowerCase()}`}>{PRIORITY[c.priority]}</span> : <span className="badge waiting">Waiting for review</span>}
      </div>
      {error ? <p className="banner error">{error}</p> : null}

      <div className="case-grid">
        <section aria-label="Patient and symptoms" className="card facts">
          <dl>
            <dt>Age</dt>
            <dd>{c.age} years</dd>
            <dt>Sex</dt>
            <dd>{c.sex ? c.sex.toLowerCase().replace('_', ' ') : 'Not recorded'}</dd>
            <dt>County</dt>
            <dd>{c.location}</dd>
            <dt>Pain</dt>
            <dd>
              <span className={`pain ${painClass(c.painLevel)}`}>{c.painLevel ?? '-'}</span> / 10
            </dd>
            <dt>Duration</dt>
            <dd>{c.duration ? DURATION[c.duration] : '-'}</dd>
            <dt>Consent</dt>
            <dd>{dateTime(c.consentDate)}</dd>
            <dt>Captured</dt>
            <dd>{dateTime(c.createdAt)}</dd>
            <dt>Received</dt>
            <dd>{dateTime(c.syncedAt)}</dd>
            <dt>CHW</dt>
            <dd>{c.submittedBy}</dd>
          </dl>
          <p className="muted small">The patient's name is kept by the CHW and is not shown here.</p>
        </section>

        <section aria-labelledby="photos-title" className="photos">
          <h2 id="photos-title">Photos</h2>
          <div className="thumbs">
            {c.images.map((img, i) => (
              <button type="button" key={img.id} className="thumb" onClick={() => setViewing(i)} disabled={!photos[i]} aria-label={`Open ${VIEW[img.viewType]} photo`}>
                {photos[i] ? <img src={photos[i]!.url} alt="" /> : <span className="muted">Loading…</span>}
                <span>{VIEW[img.viewType]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="notes-title" className="card">
        <h2 id="notes-title">Triage</h2>
        {c.notes.length > 0 ? (
          <ol className="notes">
            {c.notes.map((n) => (
              <li key={n.id}>
                <p>{n.noteText}</p>
                {n.referralAdvice ? <p><strong>Referral:</strong> {n.referralAdvice}</p> : null}
                <p className="muted small">
                  {n.author}, {dateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No notes yet.</p>
        )}
        <TriageForm caseDetail={c} onSaved={() => void load()} />
      </section>

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
    if (!priority) return;
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
        <legend>Priority</legend>
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
        Clinical notes for the CHW
        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} maxLength={5000} placeholder="What you see and what the patient should do" />
      </label>
      <label>
        Referral advice (optional)
        <textarea value={referral} onChange={(e) => setReferral(e.target.value)} rows={2} maxLength={2000} placeholder="Where to go and how soon" />
      </label>
      {message ? (
        <p className={`banner ${message.kind === 'ok' ? 'ok' : 'error'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      <button type="submit" disabled={busy || !priority}>
        {busy ? 'Saving…' : caseDetail.status === 'REVIEWED' ? 'Update triage' : 'Save triage'}
      </button>
    </form>
  );
}
