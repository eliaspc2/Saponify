import React, { useCallback, useEffect, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastEventDetail = {
    message: string;
    type?: ToastType;
    duration?: number;
};

type ToastItem = {
    id: string;
    message: string;
    type: ToastType;
    duration: number;
};

const TOAST_EVENT = 'saponify:toast';

export function showToast(message: string, type: ToastType = 'info', duration = 3200) {
    if (typeof window === 'undefined') return;
    const detail: ToastEventDetail = { message, type, duration };
    window.dispatchEvent(new CustomEvent<ToastEventDetail>(TOAST_EVENT, { detail }));
}

export const ToastViewport: React.FC = () => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const timersRef = useRef<Record<string, number>>({});

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
        const timer = timersRef.current[id];
        if (timer) {
            window.clearTimeout(timer);
            delete timersRef.current[id];
        }
    }, []);

    useEffect(() => {
        const handler = (event: Event) => {
            const customEvent = event as CustomEvent<ToastEventDetail>;
            const detail = customEvent.detail;
            if (!detail?.message) return;

            const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const toast: ToastItem = {
                id,
                message: detail.message,
                type: detail.type || 'info',
                duration: detail.duration ?? 3200
            };

            setToasts(prev => [toast, ...prev].slice(0, 4));
            timersRef.current[id] = window.setTimeout(() => removeToast(id), toast.duration);
        };

        window.addEventListener(TOAST_EVENT, handler as EventListener);
        return () => {
            window.removeEventListener(TOAST_EVENT, handler as EventListener);
            Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
            timersRef.current = {};
        };
    }, [removeToast]);

    return (
        <div className="toast-viewport" aria-live="polite" aria-atomic="true">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span>{toast.message}</span>
                    <button
                        type="button"
                        className="toast-close"
                        onClick={() => removeToast(toast.id)}
                        aria-label="Fechar notificação"
                    >
                        x
                    </button>
                </div>
            ))}
        </div>
    );
};
