import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swUrl = new URL('sw.js', import.meta.env.BASE_URL);
        navigator.serviceWorker.register(swUrl).catch((error) => {
            console.warn('Service worker registration failed:', error);
        });
    });
}
