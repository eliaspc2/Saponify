import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    base: '/Saponify/',
    plugins: [react()],
    resolve: {
        alias: {
            '@frontend': '/app/frontend',
            '@orchestrator': '/app/orchestrator',
            '@backend': '/app/backend',
            '@shared': '/app/shared',
        },
    },
})
