import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/etl-pipeline-app/',
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
  },
})

