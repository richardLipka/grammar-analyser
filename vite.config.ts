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
    // the CI runners are slower than a desktop, so generous timeouts prevent worker RPC timeouts
    testTimeout: 180000,
    hookTimeout: 180000,
    teardownTimeout: 180000
  }
});
