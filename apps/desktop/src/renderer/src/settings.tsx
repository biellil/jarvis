import React from 'react';
import ReactDOM from 'react-dom/client';
import SettingsForm from './settings/SettingsForm';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsForm />
  </React.StrictMode>,
);
