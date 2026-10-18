import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// بدون StrictMode عمداً: يشغّل الـeffects مرتين في التطوير،
// وهذا يعني انضماماً مزدوجاً إلى غرفة Metered.
createRoot(document.getElementById('root')).render(<App />);
