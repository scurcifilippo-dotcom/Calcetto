import React from 'react';
import {createRoot} from 'react-dom/client';
import OfflineApp from '../components/offline-app';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<OfflineApp/>);
