import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'OrigamiNav',
    description: '在任意网页一键收藏到 OrigamiNav 导航站。',
    permissions: ['activeTab', 'scripting', 'storage'],
  },
});
