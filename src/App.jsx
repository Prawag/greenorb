import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ReviewerProvider } from './components/Reviewer.jsx';
import { Frame } from './components/Frame.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Directory from './pages/Directory.jsx';
import Company from './pages/Company.jsx';
import Report from './pages/Report.jsx';
import Review from './pages/Review.jsx';
import Ingest from './pages/Ingest.jsx';
import NotFound from './pages/NotFound.jsx';

// three.js is large; only load it when the map is opened.
const GlobePage = lazy(() => import('./pages/Globe.jsx'));

export default function App() {
  return (
    <ReviewerProvider>
      <Frame>
        <Suspense fallback={<div className="content muted">Loading…</div>}>
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
      </Frame>
    </ReviewerProvider>
  );
}
