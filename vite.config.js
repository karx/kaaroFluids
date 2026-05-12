import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wgsl'],
  server: {
    port: 3000,
    open: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
});
