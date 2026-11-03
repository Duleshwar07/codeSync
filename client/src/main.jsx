/**
 * Client entry point.
 * `./lib/monacoSetup` must be imported first: it tells @monaco-editor/react to
 * use the bundled monaco-editor package (the same instance y-monaco uses)
 * instead of downloading Monaco from a CDN.
 */
import './lib/monacoSetup';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
