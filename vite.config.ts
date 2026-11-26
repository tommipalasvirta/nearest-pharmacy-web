import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths, so the build works at any URL (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  build: {
    // Two chunks are large and loaded only on demand: the opening-hours
    // parser (~690 kB) and the saved copy of the pharmacies (~750 kB).
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
  },
})
