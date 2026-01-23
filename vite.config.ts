import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom'],
                    firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
                    lucide: ['lucide-react'],
                    idb: ['idb'],
                },
            },
        },
    },
    resolve: {
        alias: {
            '@frontend': '/app/frontend',
            '@orchestrator': '/app/orchestrator',
            '@backend': '/app/backend',
            '@shared': '/app/shared',
        },
    },
})
