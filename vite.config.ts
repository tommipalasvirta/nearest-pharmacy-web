import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths, so the build works at any URL (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  build: {
    // The lazily loaded opening-hours parser is a single ~690 kB chunk.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
})
