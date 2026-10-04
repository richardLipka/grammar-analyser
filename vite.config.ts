/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    open: true
  },
  test: {
    // Several suites check hundreds of random grammars or large automata;
    // the CI runners are slower than a desktop, so the default 5 s is too tight
    testTimeout: 60000
  }
});
