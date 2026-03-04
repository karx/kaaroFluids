import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wgsl'],
  server: {
    port: 3000,
    open: true,
  },
});
