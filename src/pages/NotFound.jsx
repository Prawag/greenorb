import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p className="muted" style={{ margin: '12px 0 20px' }}>That link does not point to anything in GreenOrb.</p>
      <Link to="/" className="go-btn go-btn-primary">Back to dashboard</Link>
    </div>
  );
}
