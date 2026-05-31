import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import App from "./App";

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, background: '#fee2e2', color: '#991b1b', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    <h2>React Crash Report</h2>
                    <p>{this.state.error && this.state.error.toString()}</p>
                    <pre>{this.state.error && this.state.error.stack}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
