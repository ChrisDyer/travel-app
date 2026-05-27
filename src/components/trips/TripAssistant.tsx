'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { TripDay, TripEvent, TripFlight, TripHotel, Proposal, ProposedEvent, ProposedFlight, ProposedHotel } from '@/types/travel';

interface TripAssistantProps {
  tripId: string;
  days: TripDay[];
  onEventsAdded: (events: TripEvent[]) => void;
  onFlightsAdded: (flights: TripFlight[]) => void;
  onHotelsAdded: (hotels: TripHotel[]) => void;
}

interface ProposalCard {
  id: string;
  proposal: Proposal;
  checked: boolean;
  edits: Partial<Proposal>;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function TripAssistant({ tripId, days, onEventsAdded, onFlightsAdded, onHotelsAdded }: TripAssistantProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'email' | 'brainstorm'>('email');
  const [query, setQuery] = useState('');
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const [cards, setCards] = useState<ProposalCard[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [gmailNeeded, setGmailNeeded] = useState(false);
  const [history, setHistory] = useState<HistoryTurn[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef('');
  const proposalsRef = useRef<Proposal[]>([]);

  const hasConversation = history.length > 0;

  const dayLabel = (dayId: string) => {
    const d = days.find((x) => x.id === dayId);
    return d ? `Day ${d.dayNumber} (${d.date})` : dayId;
  };

  const resetConversation = () => {
    setHistory([]);
    setText('');
    setCards([]);
    setQuery('');
    setFollowUpQuery('');
    setGmailNeeded(false);
    accumulatedRef.current = '';
    proposalsRef.current = [];
  };

  const runSuggest = useCallback(async (userMessage: string, sentMode: 'email' | 'brainstorm', currentHistory: HistoryTurn[]) => {
    setStreaming(true);
    setText('');
    setGmailNeeded(false);
    accumulatedRef.current = '';
    proposalsRef.current = [];

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/trips/${tripId}/assistant/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: sentMode,
          query: sentMode === 'brainstorm' ? userMessage : undefined,
          history: currentHistory,
        }),
        signal: abortRef.current.signal,
      });

      if (res.status === 401) {
        const err = await res.json() as { error: string };
        if (err.error === 'gmail_not_connected' || err.error === 'gmail_token_expired') {
          setGmailNeeded(true);
          setStreaming(false);
          return;
        }
      }

      if (res.status === 422) {
        const err = await res.json() as { error: string; label?: string };
        if (err.error === 'gmail_label_missing') {
          const msg = `No "${err.label ?? 'Travel'}" label found in Gmail. Create a label called "${err.label ?? 'Travel'}" in Gmail and tag the emails you want scanned, then try again.`;
          setText(msg);
          setStreaming(false);
          return;
        }
      }

      if (!res.ok || !res.body) {
        setText('Something went wrong. Please try again.');
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; content?: string; proposal?: Proposal; message?: string };
            if (event.type === 'text' && event.content) {
              accumulatedRef.current += event.content;
              setText((prev) => prev + event.content);
            } else if (event.type === 'proposal' && event.proposal) {
              proposalsRef.current.push(event.proposal);
              setCards((prev) => [...prev, {
                id: crypto.randomUUID(),
                proposal: event.proposal!,
                checked: true,
                edits: {},
              }]);
            } else if (event.type === 'done') {
              // Commit this turn to history
              const proposalSummary = proposalsRef.current.length > 0
                ? '\n\n[Proposed: ' + proposalsRef.current.map((p) => {
                    if (p.type === 'event') return (p as ProposedEvent).title;
                    if (p.type === 'flight') return [(p as ProposedFlight).airline, (p as ProposedFlight).flightNumber].filter(Boolean).join(' ') || 'Flight';
                    return (p as ProposedHotel).name;
                  }).join(', ') + ']'
                : '';
              setHistory((prev) => [
                ...prev,
                { role: 'user', content: userMessage },
                { role: 'assistant', content: accumulatedRef.current + proposalSummary },
              ]);
              setText('');
              setStreaming(false);
            } else if (event.type === 'error') {
              setText((prev) => prev + `\n\nError: ${event.message}`);
              setStreaming(false);
            }
          } catch {
            // ignore partial lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setText('Connection error. Please try again.');
      }
      setStreaming(false);
    }
  }, [tripId]);

  const startInitial = useCallback(() => {
    const msg = mode === 'email' ? '__email__' : (query || 'Suggest activities and experiences that would make this trip great.');
    runSuggest(msg, mode, history);
  }, [mode, query, history, runSuggest]);

  const sendFollowUp = useCallback(() => {
    const msg = followUpQuery.trim();
    if (!msg) return;
    setFollowUpQuery('');
    runSuggest(msg, 'brainstorm', history);
  }, [followUpQuery, history, runSuggest]);

  const applySelected = async () => {
    const selected = cards.filter((c) => c.checked).map((c) => ({ ...c.proposal, ...c.edits }));
    if (selected.length === 0) return;

    setApplying(true);
    setApplyError('');
    try {
      const res = await fetch(`/api/trips/${tripId}/assistant/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposals: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setApplyError(data.error ?? 'Failed to add items. Please try again.');
        return;
      }
      const result = await res.json() as { addedEvents: TripEvent[]; addedFlights: TripFlight[]; addedHotels: TripHotel[] };
      if (result.addedEvents.length) onEventsAdded(result.addedEvents);
      if (result.addedFlights.length) onFlightsAdded(result.addedFlights);
      if (result.addedHotels.length) onHotelsAdded(result.addedHotels);
      setCards((prev) => prev.filter((c) => !c.checked));
    } catch {
      setApplyError('Connection error. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const updateCardEdit = (id: string, field: string, value: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, edits: { ...c.edits, [field]: value } } : c));
  };

  return (
    <div className="mt-8 no-print">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 border border-stone-200 bg-white rounded-lg px-4 py-2 shadow-sm hover:shadow transition-all"
      >
        <span className="text-base">✨</span>
        {open ? 'Close Assistant' : 'Open Trip Assistant'}
      </button>

      {open && (
        <div className="mt-4 border border-stone-200 rounded-xl bg-white shadow-sm overflow-hidden">

          {/* Header with New Conversation button when in a session */}
          {hasConversation ? (
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-stone-50">
              <span className="text-xs text-stone-500">{history.length / 2} exchange{history.length / 2 !== 1 ? 's' : ''} in context</span>
              <button
                onClick={resetConversation}
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                New Conversation
              </button>
            </div>
          ) : (
            /* Mode tabs — only shown before conversation starts */
            <div className="flex border-b border-stone-200">
              <button
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${mode === 'email' ? 'bg-stone-50 text-stone-900 border-b-2 border-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                onClick={() => { setMode('email'); }}
              >
                Extract from Email
              </button>
              <button
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${mode === 'brainstorm' ? 'bg-stone-50 text-stone-900 border-b-2 border-stone-900' : 'text-stone-500 hover:text-stone-700'}`}
                onClick={() => { setMode('brainstorm'); }}
              >
                Brainstorm Ideas
              </button>
            </div>
          )}

          <div className="p-5">
            {/* Gmail not connected */}
            {gmailNeeded && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                <p className="font-medium text-amber-900 mb-2">Gmail not connected</p>
                <p className="text-amber-700 mb-3">Connect your Gmail so the assistant can scan for travel confirmations.</p>
                <a
                  href={`/api/gmail/auth?returnTo=/trips/${tripId}`}
                  className="inline-block bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Connect Gmail
                </a>
              </div>
            )}

            {/* Conversation thread — past completed turns */}
            {history.length > 0 && (
              <div className="mb-4 space-y-3 max-h-64 overflow-y-auto">
                {history.map((turn, i) => (
                  <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      turn.role === 'user'
                        ? 'bg-stone-800 text-white'
                        : 'bg-stone-100 text-stone-800'
                    }`}>
                      {turn.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Current streaming response */}
            {text && (
              <div className="mb-4 p-4 bg-stone-50 rounded-lg text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
                {text}
                {streaming && <span className="inline-block w-2 h-4 bg-stone-400 ml-1 animate-pulse" />}
              </div>
            )}

            {/* Initial controls — only when no conversation yet */}
            {!hasConversation && (
              <>
                {mode === 'brainstorm' && (
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="e.g. 'coffee spots near the hotel' or 'day trips from the city'"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !streaming) startInitial(); }}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                    />
                  </div>
                )}
                <div className="flex gap-2 mb-4">
                  <Button onClick={startInitial} disabled={streaming} size="sm">
                    {streaming ? 'Thinking…' : mode === 'email' ? 'Scan Emails' : 'Get Suggestions'}
                  </Button>
                  {streaming && (
                    <Button variant="outline" size="sm" onClick={() => { abortRef.current?.abort(); setStreaming(false); }}>
                      Stop
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Follow-up input — shown once a conversation has started */}
            {hasConversation && (
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Clarify or ask a follow-up…"
                  value={followUpQuery}
                  onChange={(e) => setFollowUpQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !streaming) sendFollowUp(); }}
                  disabled={streaming}
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:opacity-50"
                  autoFocus
                />
                <Button onClick={sendFollowUp} disabled={streaming || !followUpQuery.trim()} size="sm">
                  {streaming ? 'Thinking…' : 'Send'}
                </Button>
                {streaming && (
                  <Button variant="outline" size="sm" onClick={() => { abortRef.current?.abort(); setStreaming(false); }}>
                    Stop
                  </Button>
                )}
              </div>
            )}

            {/* Proposal cards — accumulate across all turns */}
            {cards.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-stone-700">
                  {cards.filter((c) => c.checked).length} of {cards.length} selected — review and edit before adding
                </p>

                {cards.map((card) => (
                  <ProposalCardUI
                    key={card.id}
                    card={card}
                    dayLabel={dayLabel}
                    onToggle={() => setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, checked: !c.checked } : c))}
                    onEdit={(field, value) => updateCardEdit(card.id, field, value)}
                  />
                ))}

                <div className="pt-2 space-y-2">
                  {applyError && <p className="text-sm text-red-600">{applyError}</p>}
                  <Button
                    onClick={applySelected}
                    disabled={applying || cards.filter((c) => c.checked).length === 0}
                  >
                    {applying ? 'Adding…' : `Add ${cards.filter((c) => c.checked).length} selected to itinerary`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProposalCardUIProps {
  card: ProposalCard;
  dayLabel: (id: string) => string;
  onToggle: () => void;
  onEdit: (field: string, value: string) => void;
}

function ProposalCardUI({ card, dayLabel, onToggle, onEdit }: ProposalCardUIProps) {
  const p = { ...card.proposal, ...card.edits } as Proposal;
  const typeLabels: Record<string, string> = { event: '📅 Event', flight: '✈️ Flight', hotel: '🏨 Hotel' };

  return (
    <div className={`border rounded-lg p-4 transition-all ${card.checked ? 'border-stone-400 bg-white' : 'border-stone-200 bg-stone-50 opacity-60'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={card.checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-stone-300 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              {typeLabels[p.type] ?? p.type}
            </span>
          </div>
          {p.type === 'event' && <EventProposalFields p={p as ProposedEvent} dayLabel={dayLabel} onEdit={onEdit} />}
          {p.type === 'flight' && <FlightProposalFields p={p as ProposedFlight} onEdit={onEdit} />}
          {p.type === 'hotel' && <HotelProposalFields p={p as ProposedHotel} onEdit={onEdit} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, field, onEdit }: { label: string; value?: string | null; field: string; onEdit: (f: string, v: string) => void }) {
  return (
    <div className="flex gap-2 items-center text-sm mb-1">
      <span className="text-stone-400 w-24 shrink-0">{label}</span>
      <input
        type="text"
        defaultValue={value ?? ''}
        onBlur={(e) => onEdit(field, e.target.value)}
        className="flex-1 border-b border-stone-200 focus:border-stone-400 focus:outline-none px-1 py-0.5 text-stone-800 bg-transparent"
      />
    </div>
  );
}

function EventProposalFields({ p, dayLabel, onEdit }: { p: ProposedEvent; dayLabel: (id: string) => string; onEdit: (f: string, v: string) => void }) {
  return (
    <>
      <Field label="Title" value={p.title} field="title" onEdit={onEdit} />
      <div className="flex gap-2 items-center text-sm mb-1">
        <span className="text-stone-400 w-24 shrink-0">Day</span>
        <span className="text-stone-600 text-xs">{dayLabel(p.tripDayId)}</span>
      </div>
      {p.startTime && <Field label="Start" value={p.startTime} field="startTime" onEdit={onEdit} />}
      {p.location && <Field label="Location" value={p.location} field="location" onEdit={onEdit} />}
      {p.confirmationNumber && <Field label="Conf #" value={p.confirmationNumber} field="confirmationNumber" onEdit={onEdit} />}
      {p.notes && <Field label="Notes" value={p.notes} field="notes" onEdit={onEdit} />}
      {p.cost != null && <Field label="Cost" value={String(p.cost)} field="cost" onEdit={onEdit} />}
    </>
  );
}

function FlightProposalFields({ p, onEdit }: { p: ProposedFlight; onEdit: (f: string, v: string) => void }) {
  return (
    <>
      {p.airline && <Field label="Airline" value={p.airline} field="airline" onEdit={onEdit} />}
      {p.flightNumber && <Field label="Flight #" value={p.flightNumber} field="flightNumber" onEdit={onEdit} />}
      {p.departureAirport && <Field label="From" value={p.departureAirport} field="departureAirport" onEdit={onEdit} />}
      {p.arrivalAirport && <Field label="To" value={p.arrivalAirport} field="arrivalAirport" onEdit={onEdit} />}
      {p.departureDate && <Field label="Departs" value={`${p.departureDate} ${p.departureTime ?? ''}`} field="departureDate" onEdit={onEdit} />}
      {p.confirmationNumber && <Field label="Conf #" value={p.confirmationNumber} field="confirmationNumber" onEdit={onEdit} />}
      {p.seats && <Field label="Seats" value={p.seats} field="seats" onEdit={onEdit} />}
    </>
  );
}

function HotelProposalFields({ p, onEdit }: { p: ProposedHotel; onEdit: (f: string, v: string) => void }) {
  return (
    <>
      <Field label="Hotel" value={p.name} field="name" onEdit={onEdit} />
      {p.address && <Field label="Address" value={p.address} field="address" onEdit={onEdit} />}
      {p.checkInDate && <Field label="Check-in" value={`${p.checkInDate} ${p.checkInTime ?? ''}`} field="checkInDate" onEdit={onEdit} />}
      {p.checkOutDate && <Field label="Check-out" value={`${p.checkOutDate} ${p.checkOutTime ?? ''}`} field="checkOutDate" onEdit={onEdit} />}
      {p.confirmationNumber && <Field label="Conf #" value={p.confirmationNumber} field="confirmationNumber" onEdit={onEdit} />}
      {p.roomType && <Field label="Room" value={p.roomType} field="roomType" onEdit={onEdit} />}
      {p.notes && <Field label="Notes" value={p.notes} field="notes" onEdit={onEdit} />}
    </>
  );
}
