import React, { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Flag, Globe2, LayoutDashboard, Library, Upload } from 'lucide-react';
import { ReviewerProvider } from './components/Reviewer.jsx';
import { useApi } from './hooks/useApi.js';
import Dashboard from './pages/Dashboard.jsx';
import Directory from './pages/Directory.jsx';
import Company from './pages/Company.jsx';
import Report from './pages/Report.jsx';
import Review from './pages/Review.jsx';
import Ingest from './pages/Ingest.jsx';
import NotFound from './pages/NotFound.jsx';

// three.js is large; only load it when the globe is opened.
const GlobePage = lazy(() => import('./pages/Globe.jsx'));

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/companies', label: ['ESG', 'Directory'], icon: Library },
  { to: '/review', label: 'Review', icon: Flag, badge: true },
  { to: '/ingest', label: 'Ingest', icon: Upload },
  { to: '/globe', label: ['Globe', 'View'], icon: Globe2 },
];

function Sidebar() {
  const { data } = useApi('/flags?limit=1', { poll: 60000 });
  const open = data?.total || 0;
  return (
    <div className="sidebar-shell">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar-ellipse" />
        <NavLink to="/" className="sidebar-brand">GREEN<br />ORB</NavLink>
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-btn${isActive ? ' active' : ''}`}>
            <Icon strokeWidth={1.8} />
            <span className="sidebar-label">
              {Array.isArray(label) ? (<>{label[0]}<br />{label[1]}</>) : label}
            </span>
            {badge && open > 0 && <span className="sidebar-badge">{open > 99 ? '99+' : open}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ReviewerProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="app-content">
          <Suspense fallback={<div className="page muted">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/companies" element={<Directory />} />
              <Route path="/companies/:slug" element={<Company />} />
              <Route path="/reports/:id" element={<Report />} />
              <Route path="/review" element={<Review />} />
              <Route path="/ingest" element={<Ingest />} />
              <Route path="/globe" element={<GlobePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </ReviewerProvider>
  );
}
