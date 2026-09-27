import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, api } from '../api/client'
import type { PublicLandmark, RouteSummary } from '../api/types'
import { LandmarkPhoto } from '../components/imgUrl'
import PhotoField from '../components/PhotoField'
import { Alert, EmptyState, Spinner, StatusPill } from '../components/ui'
import { formatDate, relativeDue } from '../lib/format'

type Filter = 'all' | 'stale' | 'mine'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stale', label: 'Needs re-checking' },
  { value: 'mine', label: 'Contributed by me' },
]

export default function CommunityLandmarks() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [routes, setRoutes] = useState<RouteSummary[]>([])
  const [error, setError] = useState('')

  // Results are tagged with the query that produced them, so switching filter
  // or search shows the spinner without needing to clear state in an effect.
  const key = `${filter}|${query}`
  const [loaded, setLoaded] = useState<{ key: string; items: PublicLandmark[] } | null>(null)
  const items = loaded && loaded.key === key ? loaded.items : null

  useEffect(() => {
    let cancelled = false
    api
      .listPublicLandmarks({
        q: query || undefined,
        stale: filter === 'stale' ? true : undefined,
      })
      .then((landmarks) => {
        if (cancelled) return
        setError('')
        setLoaded({
          key,
          items: filter === 'mine' ? landmarks.filter((l) => l.is_mine) : landmarks,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load the library.')
      })
    return () => {
      cancelled = true
    }
  }, [filter, query, key])

  // Route titles are needed by the "use in a route" picker; they do not change
  // when a landmark is refreshed, so they load once.
  useEffect(() => {
    api.listRoutes().then(setRoutes).catch(() => setRoutes([]))
  }, [])

  /** Re-read the library after a refresh / verify / report. */
  const reload = useCallback(async () => {
    try {
      const landmarks = await api.listPublicLandmarks({
        q: query || undefined,
        stale: filter === 'stale' ? true : undefined,
      })
      setLoaded({
        key,
        items: filter === 'mine' ? landmarks.filter((l) => l.is_mine) : landmarks,
      })
    } catch {
      // The in-card error already explains the failure; leave the list as-is.
    }
  }, [filter, query, key])

  const staleCount = items?.filter((l) => l.is_stale).length ?? 0

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Community landmarks</h1>
          <p className="page__sub">
            Shared by neighbours, reusable in any route. Landmarks fall out of date after six
            months — anyone can refresh the photo or report one that no longer matches.
          </p>
        </div>
        <Link to="/contribute" className="btn">
          + Contribute
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="library-toolbar">
        <div className="segmented" role="tablist" aria-label="Filter landmarks">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              role="tab"
              aria-selected={filter === option.value}
              className={`segmented__btn${filter === option.value ? ' segmented__btn--on' : ''}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form
          className="library-search"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(search.trim())
          }}
        >
          <input
            value={search}
            placeholder="Search landmarks…"
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search community landmarks"
          />
          {search && (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setSearch('')
                setQuery('')
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {!items ? (
        <Spinner label="Loading the library…" />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing here yet">
          <p>
            {query
              ? `No landmark matches “${query}”.`
              : filter === 'mine'
                ? 'You have not contributed a landmark yet.'
                : 'No community landmarks have been shared yet.'}
          </p>
          <Link to="/contribute" className="btn">
            Contribute the first one
          </Link>
        </EmptyState>
      ) : (
        <>
          {filter === 'all' && staleCount > 0 && (
            <div className="banner banner--warn">
              <strong>
                {staleCount} landmark{staleCount === 1 ? '' : 's'} need
                {staleCount === 1 ? 's' : ''} a second look.
              </strong>{' '}
              Upload a current photo or report the ones that have changed.{' '}
              <button className="linkish" onClick={() => setFilter('stale')}>
                Show {staleCount === 1 ? 'it' : 'them'}
              </button>
            </div>
          )}

          <ul className="library">
            {items.map((landmark) => (
              <LibraryCard
                key={landmark.id}
                landmark={landmark}
                routes={routes}
                onChanged={reload}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function LibraryCard({
  landmark,
  routes,
  onChanged,
}: {
  landmark: PublicLandmark
  routes: RouteSummary[]
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [useOpen, setUseOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [note, setNote] = useState('')

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await work()
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`lib-card${landmark.is_disputed ? ' lib-card--disputed' : ''}`}>
      <div className="lib-card__photo">
        {landmark.photo_url ? (
          <LandmarkPhoto
            photoUrl={landmark.photo_url}
            alt={landmark.name}
            className="lib-card__img"
            placeholder=""
          />
        ) : (
          <div className="photo-placeholder photo-placeholder--flat">No photo</div>
        )}
      </div>

      <div className="lib-card__body">
        <div className="lib-card__head">
          <strong>{landmark.name}</strong>
          {landmark.is_disputed ? (
            <StatusPill tone="bad">Reported as outdated</StatusPill>
          ) : landmark.is_stale ? (
            <StatusPill tone="warn">Needs re-checking</StatusPill>
          ) : (
            <StatusPill tone="ok">Current</StatusPill>
          )}
        </div>

        {landmark.description && <p className="lib-card__desc">{landmark.description}</p>}

        <p className="muted small">
          Contributed by <strong>{landmark.contributor_name}</strong>
          {landmark.last_verified_by &&
            landmark.last_verified_by !== landmark.contributor_name &&
            ` · last confirmed by ${landmark.last_verified_by}`}
          {' · '}
          {relativeDue(landmark.next_verification)}
        </p>

        <p className="muted small">
          Used in {landmark.times_used} route{landmark.times_used === 1 ? '' : 's'}
          {landmark.report_count > 0 &&
            ` · ${landmark.report_count} report${landmark.report_count === 1 ? '' : 's'}`}
          {` · added ${formatDate(landmark.created_at)}`}
        </p>

        {error && <p className="lib-card__error">{error}</p>}

        <div className="lib-card__actions">
          <button
            className="btn btn--sm"
            disabled={busy}
            onClick={() => setUseOpen((open) => !open)}
          >
            Use in a route
          </button>

          {landmark.can_verify && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void run(() => api.verifyPublicLandmark(landmark.id))}
            >
              Still looks the same
            </button>
          )}

          {!landmark.is_mine && !landmark.reported_by_me && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => setShowReport((open) => !open)}
            >
              Report as outdated
            </button>
          )}
          {landmark.reported_by_me && (
            <span className="muted small">You reported this one.</span>
          )}
        </div>

        {useOpen && (
          <div className="lib-card__panel">
            <p className="muted small">
              Add this landmark as a step. Its six-month check-up stays with{' '}
              {landmark.contributor_name}, so refreshing it later updates every route that uses it.
            </p>
            {routes.length === 0 ? (
              <p className="muted small">
                You have no routes yet — <Link to="/routes/new">create one first</Link>.
              </p>
            ) : (
              <div className="lib-card__routes">
                {routes.map((route) => (
                  <button
                    key={route.id}
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.usePublicLandmark(landmark.id, route.id)
                        setUseOpen(false)
                      })
                    }
                  >
                    {route.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showReport && (
          <div className="lib-card__panel">
            <label className="field">
              <span>What has changed? <small>(optional)</small></span>
              <input
                value={note}
                placeholder="The shop has closed and the shutters are down."
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="lib-card__actions">
              <button
                className="btn btn--sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.reportPublicLandmark(landmark.id, note.trim())
                    setShowReport(false)
                    setNote('')
                  })
                }
              >
                Send report
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowReport(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Anyone can re-photograph an outdated landmark; that is a real
            observation, so it restarts the contributor's window. */}
        {(landmark.is_stale || landmark.is_disputed) && (
          <div className="lib-card__refresh">
            <p className="lib-card__refresh-lead">
              {landmark.is_disputed
                ? 'Someone reported this one as changed.'
                : 'Its six-month check-up has expired.'}{' '}
              If you have been past it recently, add a current photo — that also clears the
              outdated flag.
            </p>
            <PhotoField
              photoUrl={null}
              busy={busy}
              onSelect={(file) =>
                void run(() => api.uploadPublicLandmarkPhoto(landmark.id, file))
              }
            />
          </div>
        )}
      </div>
    </li>
  )
}
