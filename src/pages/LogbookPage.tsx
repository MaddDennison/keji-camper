import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { placeById } from '../data/sites';
import { fmtDate, paddles } from '../lib/format';
import { useSocial } from '../lib/useLogbook';
import type { SocialProfile } from '../lib/useLogbook';
import type { InboxItem, LogbookCard } from '../lib/social';
import type { Memory, Trip } from '../types';

/**
 * #/logbook (M4): the cabin logbook — read-only offers and broadcasts from
 * the circle, each with "save a copy to mine." Everything on this page comes
 * from the SEPARATE ephemeral social read path (useSocial); the only local
 * write is the fork a user explicitly accepts.
 */
export default function LogbookPage() {
  const { session } = useAuth();

  if (!supabase) {
    return (
      <main className="page">
        <div className="empty-state card">
          <div className="big">🔌</div>
          <p><b>Sync is not configured</b></p>
          <p className="small">This deployment has no cloud backend, so there is no shared logbook.</p>
        </div>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="page">
        <div className="empty-state card">
          <div className="big">📖</div>
          <p><b>The cabin logbook is for signed-in campers</b></p>
          <p className="small">Sign in above to see what the crew has been sharing.</p>
        </div>
      </main>
    );
  }
  return <LogbookInner />;
}

function profileChip(profiles: Map<string, SocialProfile>, id: string): string {
  const p = profiles.get(id);
  return p ? `${p.emoji || '🦫'} ${p.display_name || 'Unnamed camper'}` : '🦫 a camper';
}

function placeName(id: string): string {
  return placeById.get(id)?.name ?? id;
}

function LogbookInner() {
  const { loading, error, logbook, inbox, profiles, accept, dismiss, saveCopy } = useSocial();
  const [busyItem, setBusyItem] = useState('');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyItem(key);
    try { await fn(); } finally { setBusyItem(''); }
  };

  return (
    <main className="page">
      <div className="section-head">
        <h2>Cabin logbook</h2>
        <span className="sub">what the crew is sharing — read-only, save what you like</span>
      </div>

      {loading && <p className="small muted">Reading the logbook…</p>}
      {error && <p className="small muted">⚠️ {error}</p>}

      {inbox.length > 0 && (
        <>
          <div className="trail-sign">Shared with you · {inbox.length} waiting</div>
          {inbox.map((item) => (
            <InboxCard
              key={item.shareIds[0]} item={item} profiles={profiles}
              busy={busyItem === item.shareIds[0]}
              onAccept={() => void run(item.shareIds[0], () => accept(item))}
              onDismiss={() => void run(item.shareIds[0], () => dismiss(item))}
            />
          ))}
        </>
      )}

      {!loading && inbox.length === 0 && logbook.length === 0 && !error && (
        <div className="empty-state card">
          <div className="big">🪵</div>
          <p><b>The logbook is empty.</b></p>
          <p className="small">
            Share a trip or a memory from its page (👥 Share with campers) and it shows up here
            for the whole cabin.
          </p>
        </div>
      )}

      {logbook.length > 0 && (
        <>
          <div className="trail-sign" style={{ marginTop: inbox.length ? 18 : 0 }}>The logbook</div>
          {logbook.map((card) => (
            <BroadcastCard
              key={`${card.row.kind}:${card.row.owner}:${card.row.id}`}
              card={card} profiles={profiles}
              onSave={() => saveCopy(card)}
            />
          ))}
        </>
      )}
    </main>
  );
}

function TripSummary({ trip }: { trip: Trip }) {
  const nights = Math.max(0, trip.stops.length - 2);
  return (
    <>
      <div className="small muted">
        {trip.startDate ? fmtDate(trip.startDate) : 'no date'} · {nights} night{nights === 1 ? '' : 's'}
      </div>
      <p className="small" style={{ margin: '6px 0' }}>
        {trip.stops.filter(Boolean).map(placeName).join(' → ') || 'No stops'}
      </p>
      {trip.notes && <p className="tiny muted">{trip.notes}</p>}
    </>
  );
}

function MemorySummary({ memory }: { memory: Memory }) {
  const place = placeById.get(memory.placeId);
  return (
    <>
      <div className="small muted">
        {fmtDate(memory.date)}{place ? ` · ${place.name}` : ''} · <span className="paddles">{paddles(memory.rating)}</span>
      </div>
      {memory.text && <p className="small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{memory.text}</p>}
      {memory.photos.length > 0 && (
        <div className="photos">
          {memory.photos.map((p, i) => <img key={i} src={p} alt="" loading="lazy" />)}
        </div>
      )}
    </>
  );
}

function InboxCard({
  item, profiles, busy, onAccept, onDismiss,
}: {
  item: InboxItem;
  profiles: Map<string, SocialProfile>;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const trip = item.trip?.data as Trip | undefined;
  const memory = !item.trip ? (item.memories[0]?.data as Memory | undefined) : undefined;
  const title = trip ? (trip.name || 'a trip') : (memory?.title || 'a memory');
  return (
    <div className="card">
      <div className="flex">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="chip muted right">from {profileChip(profiles, item.fromOwner)}</span>
      </div>
      {trip && <TripSummary trip={trip} />}
      {memory && <MemorySummary memory={memory} />}
      {trip && item.memories.length > 0 && (
        <p className="tiny muted">Includes {item.memories.length} memor{item.memories.length === 1 ? 'y' : 'ies'} (photos & stories).</p>
      )}
      <div className="flex" style={{ marginTop: 8 }}>
        <button className="btn small" disabled={busy} onClick={onAccept}>
          {busy ? 'Saving…' : '✓ Add to my journal'}
        </button>
        <button className="btn ghost small" disabled={busy} onClick={onDismiss}>Dismiss</button>
        <span className="tiny muted right">Saving makes your own copy — it stamps your passport.</span>
      </div>
    </div>
  );
}

function BroadcastCard({
  card, profiles, onSave,
}: {
  card: LogbookCard;
  profiles: Map<string, SocialProfile>;
  onSave: () => void;
}) {
  const trip = card.row.kind === 'trip' ? (card.row.data as Trip) : undefined;
  const memory = card.row.kind === 'memory' ? (card.row.data as Memory) : undefined;
  const title = trip ? (trip.name || 'Unnamed trip') : (memory?.title || 'Untitled memory');
  return (
    <article className="memory">
      <div className="flex" style={{ marginTop: 6 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="chip muted right">
          {card.own ? 'yours' : `by ${profileChip(profiles, card.row.owner)}`}
        </span>
      </div>
      {trip && <TripSummary trip={trip} />}
      {memory && <MemorySummary memory={memory} />}
      {!card.own && (
        <div className="flex" style={{ marginTop: 8 }}>
          {card.saved
            ? <span className="chip muted">✓ in your journal</span>
            : <button className="btn ghost small" onClick={onSave}>💾 Save a copy to mine</button>}
        </div>
      )}
    </article>
  );
}
