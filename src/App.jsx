import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ReviewerProvider } from './components/Reviewer.jsx';
import { Frame } from './components/Frame.jsx';
import Directory from './pages/Directory.jsx';
import Company from './pages/Company.jsx';
import Report from './pages/Report.jsx';
import Review from './pages/Review.jsx';
import Ingest from './pages/Ingest.jsx';
import NotFound from './pages/NotFound.jsx';
import Evidence from './pages/Evidence.jsx';

// The overview is the map; three.js is large, so it loads in its own chunk.
const Home = lazy(() => import('./pages/Home.jsx'));

export default function App() {
  return (
    <ReviewerProvider>
      <Frame>
        <Suspense fallback={<div className="home" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/companies" element={<Directory />} />
            <Route path="/companies/:slug" element={<Company />} />
            <Route path="/reports/:id" element={<Report />} />
            <Route path="/reports/:id/pages/:page" element={<Evidence />} />
            <Route path="/review" element={<Review />} />
            <Route path="/ingest" element={<Ingest />} />
            <Route path="/globe" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Frame>
    </ReviewerProvider>
  );
}
