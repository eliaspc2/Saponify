import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    base: '/Saponify/',
    plugins: [react()],
    resolve: {
        alias: {
            '@frontend': path.resolve(__dirname, './app/frontend'),
            '@orchestrator': path.resolve(__dirname, './app/orchestrator'),
            '@backend': path.resolve(__dirname, './app/backend'),
            '@shared': path.resolve(__dirname, './app/shared'),
        },
    },
})
