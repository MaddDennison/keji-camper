import React, { useEffect, useState } from 'react';
import { IconCanoe, IconInfo, IconJournal, IconMap, IconStar, IconTent } from './components/icons';
import MapPage from './pages/MapPage';
import TripsPage from './pages/TripsPage';
import JournalPage from './pages/JournalPage';
import SitesPage from './pages/SitesPage';
import SkyPage from './pages/SkyPage';
import AboutPage from './pages/AboutPage';
import SharedTripPage from './pages/SharedTripPage';

const TABS = [
  { id: 'map', label: 'Map', icon: <IconMap /> },
  { id: 'trips', label: 'Trips', icon: <IconCanoe /> },
  { id: 'journal', label: 'Journal', icon: <IconJournal /> },
  { id: 'sites', label: 'Sites', icon: <IconTent /> },
  { id: 'sky', label: 'Sky', icon: <IconStar /> },
  { id: 'about', label: 'About', icon: <IconInfo /> },
] as const;

type TabId = (typeof TABS)[number]['id'] | 'view';

function parseHash(): { tab: TabId; param?: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [tab, param] = h.split('/');
  if (tab === 'view' && param) return { tab: 'view', param };
  if (TABS.some((t) => t.id === tab)) return { tab: tab as TabId, param };
  return { tab: 'map' };
}

export function navigate(tab: TabId, param?: string) {
  window.location.hash = param ? `#/${tab}/${param}` : `#/${tab}`;
}

export default function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const page = (() => {
    switch (route.tab) {
      case 'map': return <MapPage focusId={route.param} />;
      case 'trips': return <TripsPage tripId={route.param} />;
      case 'journal': return <JournalPage />;
      case 'sites': return <SitesPage siteId={route.param} />;
      case 'sky': return <SkyPage />;
      case 'about': return <AboutPage />;
      case 'view': return <SharedTripPage payload={route.param!} />;
    }
  })();

  return (
    <>
      <header className="topbar">
        <img className="crest" src="./icon.svg" alt="" />
        <div className="title">
          Keji Camper
          <small>Backcountry Passport · Kejimkujik</small>
        </div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`navlink ${route.tab === t.id ? 'active' : ''}`}
              onClick={() => navigate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="unofficial">Fan project<br />not Parks Canada</span>
      </header>

      {page}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={route.tab === t.id ? 'active' : ''}
            onClick={() => navigate(t.id)}
            aria-label={t.label}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
