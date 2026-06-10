import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../App';
import { directoryOrder, placeById, PLACES } from '../data/sites';
import { fmtDate, paddles, todayIso, uid } from '../lib/format';
import { compressPhoto, useStore } from '../lib/store';
import type { Camper, Memory } from '../types';

export default function JournalPage() {
  const { data, dispatch, visitedPlaceIds, exportJson, importJson } = useStore();
  const [editing, setEditing] = useState<Memory | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'feed' | 'passport' | 'crew'>('feed');

  // deep-link: #/journal/new-<placeId>
  useEffect(() => {
    const m = window.location.hash.match(/^#\/journal\/new-(.+)$/);
    if (m && placeById.get(m[1])) {
      setEditing(blankMemory(m[1]));
      navigate('journal');
    }
  }, []);

  const memories = useMemo(
    () => [...data.memories].sort((a, b) => b.date.localeCompare(a.date)),
    [data.memories],
  );

  const storageKb = useMemo(
    () => Math.round(JSON.stringify(data).length / 1024),
    [data],
  );

  return (
    <main className="page">
      <div className="section-head">
        <h2>Journal</h2>
        <span className="sub">the part you’ll reread in February</span>
        <button className="btn right" onClick={() => setEditing(blankMemory())}>+ New memory</button>
      </div>

      <div className="flex" style={{ marginBottom: 14 }}>
        <button className={`btn small ${tab === 'feed' ? 'secondary' : 'ghost'}`} onClick={() => setTab('feed')}>Memories</button>
        <button className={`btn small ${tab === 'passport' ? 'secondary' : 'ghost'}`} onClick={() => setTab('passport')}>🎫 Passport</button>
        <button className={`btn small ${tab === 'crew' ? 'secondary' : 'ghost'}`} onClick={() => setTab('crew')}>Crew & data</button>
      </div>

      {tab === 'feed' && (
        <>
          {memories.length === 0 && (
            <div className="empty-state card">
              <div className="big">🏕</div>
              <p><b>No memories yet.</b></p>
              <p className="small">The night the loons wouldn’t stop. The portage that ate a sandal. Write it down.</p>
            </div>
          )}
          {memories.map((m) => (
            <MemoryCard key={m.id} memory={m} onEdit={() => setEditing(m)} />
          ))}
        </>
      )}

      {tab === 'passport' && <Passport visited={visitedPlaceIds} memories={data.memories} />}

      {tab === 'crew' && (
        <>
          <CrewEditor campers={data.campers} onSave={(c) => dispatch({ type: 'camper/save', camper: c })} onDelete={(id) => dispatch({ type: 'camper/delete', id })} />

          <div className="section-head"><h2>Pace</h2><span className="sub">used for travel-time estimates</span></div>
          <div className="card flex">
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>🛶 paddling km/h</label>
              <input
                type="number" step="0.5" min="1" max="8"
                value={data.settings.paddleKmh}
                onChange={(e) => dispatch({ type: 'settings/save', settings: { paddleKmh: Number(e.target.value) || 4 } })}
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>🥾 hiking km/h</label>
              <input
                type="number" step="0.5" min="1" max="7"
                value={data.settings.hikeKmh}
                onChange={(e) => dispatch({ type: 'settings/save', settings: { hikeKmh: Number(e.target.value) || 3.5 } })}
              />
            </div>
            <p className="tiny muted" style={{ flexBasis: '100%' }}>
              Loaded boats on flat water average 3–4 km/h including short breaks; Keji’s flat
              trails go at 3–4 km/h with a pack. Portage time is inside the paddling chart figures.
            </p>
          </div>

          <div className="section-head"><h2>Your data</h2><span className="sub">{storageKb} KB in this browser</span></div>
          <div className="card flex">
            <button className="btn secondary" onClick={exportJson}>Export JSON</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import / merge JSON</button>
            <input
              ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  try { await importJson(f); alert('Imported & merged!'); }
                  catch (err) { alert(`Import failed: ${err}`); }
                }
                e.target.value = '';
              }}
            />
            <p className="tiny muted" style={{ flexBasis: '100%' }}>
              Everything lives in this browser only. Export to back up, or send the file to a
              friend — importing merges by id, so swapping journals is safe.
            </p>
          </div>
        </>
      )}

      {editing && (
        <MemoryForm
          initial={editing}
          campers={data.campers}
          onCancel={() => setEditing(null)}
          onDelete={(id) => { dispatch({ type: 'memory/delete', id }); setEditing(null); }}
          onSave={(m) => { dispatch({ type: 'memory/save', memory: m }); setEditing(null); }}
        />
      )}
    </main>
  );
}

function blankMemory(placeId = ''): Memory {
  return {
    id: uid(), placeId, date: todayIso(), title: '', text: '',
    rating: 4, tags: [], photos: [],
  };
}

function MemoryCard({ memory, onEdit }: { memory: Memory; onEdit: () => void }) {
  const { data } = useStore();
  const place = placeById.get(memory.placeId);
  const author = data.campers.find((c) => c.id === memory.authorId);
  return (
    <article className="memory">
      <span className="date-tab">{fmtDate(memory.date)}</span>
      <div className="flex" style={{ marginTop: 6 }}>
        <h3 style={{ margin: 0 }}>{memory.title || place?.name || 'Untitled'}</h3>
        <span className="paddles right">{paddles(memory.rating)}</span>
      </div>
      <div className="small muted">
        {place ? <a href={`#/sites/${place.id}`}>{place.name}</a> : 'somewhere out there'}
        {author && <> · by {author.emoji} {author.name}</>}
      </div>
      <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{memory.text}</p>
      {memory.tags.length > 0 && (
        <div className="flex">{memory.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</div>
      )}
      {memory.photos.length > 0 && (
        <div className="photos">
          {memory.photos.map((p, i) => <img key={i} src={p} alt="" loading="lazy" />)}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="btn ghost small" onClick={onEdit}>Edit</button>
      </div>
    </article>
  );
}

function MemoryForm({
  initial, campers, onSave, onCancel, onDelete,
}: {
  initial: Memory;
  campers: Camper[];
  onSave: (m: Memory) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const [m, setM] = useState<Memory>(initial);
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const { data } = useStore();

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const save = () => {
    onSave({
      ...m,
      tags: tagText.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    });
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onCancel}>
      <h3>Memory</h3>
      <div className="flex">
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label>Where</label>
          <select value={m.placeId} onChange={(e) => setM({ ...m, placeId: e.target.value })}>
            <option value="">— choose a site —</option>
            {directoryOrder().map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Date</label>
          <input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Title</label>
        <input value={m.title} placeholder="The night of the snoring porcupine" onChange={(e) => setM({ ...m, title: e.target.value })} />
      </div>
      <div className="field">
        <label>The story</label>
        <textarea value={m.text} onChange={(e) => setM({ ...m, text: e.target.value })} />
      </div>
      <div className="flex">
        <div className="field" style={{ flex: 1 }}>
          <label>Rating</label>
          <select value={m.rating} onChange={(e) => setM({ ...m, rating: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{'🛶'.repeat(r)}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Author</label>
          <select value={m.authorId ?? ''} onChange={(e) => setM({ ...m, authorId: e.target.value || undefined })}>
            <option value="">—</option>
            {campers.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Trip</label>
          <select value={m.tripId ?? ''} onChange={(e) => setM({ ...m, tripId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.trips.map((t) => <option key={t.id} value={t.id}>{t.name || 'Unnamed trip'}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Tags (comma separated)</label>
        <input value={tagText} placeholder="loons, perseids, swim" onChange={(e) => setTagText(e.target.value)} />
      </div>
      <div className="field">
        <label>Photos (stored small, in-browser)</label>
        <div className="flex">
          {m.photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={p} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)' }} />
              <button
                className="btn danger small" style={{ position: 'absolute', top: -8, right: -8, padding: '0 6px' }}
                onClick={() => setM({ ...m, photos: m.photos.filter((_, k) => k !== i) })}
              >✕</button>
            </div>
          ))}
          <button className="btn ghost small" onClick={() => photoRef.current?.click()}>+ photo</button>
          <input
            ref={photoRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, 4);
              const compressed = await Promise.all(files.map((f) => compressPhoto(f)));
              setM((prev) => ({ ...prev, photos: [...prev.photos, ...compressed].slice(0, 6) }));
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="flex" style={{ marginTop: 6 }}>
        <button className="btn" onClick={save} disabled={!m.placeId}>Save memory</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn danger small right" onClick={() => onDelete(m.id)}>Delete</button>
      </div>
    </dialog>
  );
}

function Passport({ visited, memories }: { visited: Set<string>; memories: Memory[] }) {
  const campPlaces = PLACES.filter((p) => p.kind !== 'launch');
  const stamped = campPlaces.filter((p) => visited.has(p.id));
  const colors = ['', 'green', 'blue'];

  const yearFor = (id: string) => {
    const ms = memories.filter((m) => m.placeId === id).map((m) => m.date.slice(0, 4));
    return ms.sort()[0] ?? '';
  };

  return (
    <>
      <div className="trail-sign">
        Backcountry Passport · {stamped.length} / {campPlaces.length} sites stamped
      </div>
      <p className="small muted">
        A stamp appears when a site has a memory, or is part of a completed trip.
        Collect them all and you’ve slept everywhere a person can sleep in the Keji backcountry.
      </p>
      <div className="stamp-grid">
        {campPlaces.map((p, i) => {
          const got = visited.has(p.id);
          return (
            <div
              key={p.id}
              className={`stamp ${got ? colors[i % 3] : 'empty'}`}
              style={got ? { transform: `rotate(${((i * 47) % 13) - 6}deg)` } : undefined}
              title={p.name}
            >
              <div className="num">{p.label}</div>
              <div className="lake">{p.lake.split('/')[0].replace('Lake', '').trim() || p.lake}</div>
              {got && <div className="year">EST’D {yearFor(p.id) || '——'}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function CrewEditor({
  campers, onSave, onDelete,
}: {
  campers: Camper[];
  onSave: (c: Camper) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦫');
  const EMOJIS = ['🦫', '🛶', '🌲', '🔥', '🦉', '🐢', '🌌', '🪓', '🐟', '🍁'];
  return (
    <>
      <div className="section-head"><h2>Crew</h2><span className="sub">the people in the canoe</span></div>
      <div className="card">
        <div className="flex">
          {campers.map((c) => (
            <span key={c.id} className="chip muted" style={{ fontSize: '0.9rem', textTransform: 'none' }}>
              {c.emoji} {c.name}
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                onClick={() => onDelete(c.id)} aria-label={`Remove ${c.name}`}
              >✕</button>
            </span>
          ))}
          {campers.length === 0 && <span className="small muted">No campers yet.</span>}
        </div>
        <hr className="hr-stitch" />
        <div className="flex">
          <select value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ padding: 8, border: '2px solid var(--ink)', borderRadius: 8 }}>
            {EMOJIS.map((e) => <option key={e}>{e}</option>)}
          </select>
          <input
            placeholder="Name" value={name}
            style={{ flex: 1, padding: 9, border: '2px solid var(--ink)', borderRadius: 8, background: '#fffdf6' }}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onSave({ id: uid(), name: name.trim(), emoji }); setName(''); } }}
          />
          <button
            className="btn small" disabled={!name.trim()}
            onClick={() => { onSave({ id: uid(), name: name.trim(), emoji }); setName(''); }}
          >Add</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Local profiles for now — the data model is ready for the multi-user version
          (see docs/ARCHITECTURE.md in the repo).
        </p>
      </div>
    </>
  );
}
