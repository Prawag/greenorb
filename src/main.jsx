import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('GreenOrb UI error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <h1>Something went wrong</h1>
          <p className="muted" style={{ margin: '12px 0 20px' }}>{String(this.state.error.message || this.state.error)}</p>
          <button className="go-btn go-btn-primary" onClick={() => window.location.assign('/')}>Back to dashboard</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
