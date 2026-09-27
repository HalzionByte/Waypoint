import { Link } from 'react-router-dom'

import { useAuth } from '../context/useAuth'

function FeatureIcon({ path }: { path: string }) {
  return (
    <svg
      className="feature__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const FEATURES = [
  {
    icon: 'M12 21.5s7-6.4 7-11.2a7 7 0 1 0-14 0c0 4.8 7 11.2 7 11.2Z M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
    title: 'Landmarks, not addresses',
    body: 'Describe the last few hundred metres with the gates, shops, signs and walls people already recognise.',
  },
  {
    icon: 'M3 7.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M3 15.5l4.4-4.4 3.6 3.6 4-4L20 15 M8.6 9.4a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z',
    title: 'A photo on every step',
    body: 'One picture and a single line of text is all it takes to point someone at the right gate.',
  },
  {
    icon: 'M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.1 1.1 M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 1 0 5.7 5.7l1.1-1.1',
    title: 'Share by link or QR code',
    body: 'Send it over WhatsApp, SMS or as a printable code. Recipients open it in any browser — no account, no app install.',
  },
  {
    icon: 'M20.5 12a8.5 8.5 0 1 1-2.5-6 M20.5 4v4.5H16 M12 8v4.3l3 1.7',
    title: 'Six-month freshness checks',
    body: 'Every landmark expires and is re-confirmed, so a closed shop or a repainted wall never sends a rider to the wrong house.',
  },
  {
    icon: 'M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M2.8 20a6.2 6.2 0 0 1 12.4 0 M16.2 5.6a2.7 2.7 0 0 1 0 5.3 M17.8 20a5.6 5.6 0 0 0-1.7-4',
    title: 'Community landmarks',
    body: 'Contribute a landmark once and your whole neighbourhood can reuse it in their own routes.',
  },
  {
    icon: 'M5.5 21.5v-18 M5.5 4.5h11l-1.6 3.7 1.6 3.8h-11 M9 8.5v3 M9 14.5v3',
    title: 'Neighbours keep it honest',
    body: 'Anyone can upload a current photo or report a landmark that no longer matches reality.',
  },
]

const AUDIENCES = [
  {
    title: 'For delivery riders',
    body: 'Find residential addresses that no map pin can describe.',
  },
  {
    title: 'For ride-hailing drivers',
    body: 'Pick-up and drop-off points that are actually findable the first time.',
  },
  {
    title: 'For residents',
    body: 'Explain your location once, then stop repeating it on the phone.',
  },
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="landing">
      <section className="hero">
        <p className="hero__eyebrow">Visual last-mile navigation</p>
        <h1>
          Maps get you to the area.
          <br />
          <span className="hero__accent">WayPoint gets you to the door.</span>
        </h1>
        <p className="hero__lede">
          Build directions from the landmarks people already use — the brown gate, the repair
          shop, the signboard. Add a photo and a short instruction to each one, then share the
          whole route as a link or a QR code.
        </p>
        <div className="hero__actions">
          <Link to={user ? '/dashboard' : '/register'} className="btn btn--lg">
            {user ? 'Go to my routes' : 'Create your first route'}
          </Link>
          {user ? (
            <Link to="/landmarks" className="btn btn--ghost btn--lg">
              Browse community landmarks
            </Link>
          ) : (
            <Link to="/login" className="btn btn--ghost btn--lg">
              I already have an account
            </Link>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>What WayPoint does</h2>
        <ul className="features">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="feature">
              <FeatureIcon path={feature.icon} />
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid-3">
        {AUDIENCES.map((audience) => (
          <div key={audience.title} className="card">
            <h3>{audience.title}</h3>
            <p>{audience.body}</p>
          </div>
        ))}
      </section>

      <section className="panel panel--muted">
        <h2>The question it actually answers</h2>
        <p>
          Not “where is this street?” — but the far more practical one:{' '}
          <em>“I am on the correct road, so how do I find the exact place?”</em>
        </p>
      </section>
    </div>
  )
}
