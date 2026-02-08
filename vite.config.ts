import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function normalizeBase(pathValue: string): string {
  if (!pathValue) {
    return '/';
  }

  const withLeadingSlash = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolveBase(mode: string): string {
  const env = loadEnv(mode, process.cwd(), '');

  if (env.BASE_URL) {
    return normalizeBase(env.BASE_URL);
  }

  const repoName = env.GITHUB_REPOSITORY?.split('/')[1];
  if (repoName) {
    return normalizeBase(repoName);
  }

  return '/';
}

export default defineConfig(({ mode }) => {
  const base = resolveBase(mode);

  return {
    base,
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        minify: false,
        manifest: {
          name: 'IsoWeather Town',
          short_name: 'IsoWeather',
          description: 'Isometric weather simulation sandbox',
          theme_color: '#304b35',
          background_color: '#dce8d4',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'icons/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'icons/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        },
        workbox: {
          mode: 'development',
          globPatterns: ['**/*.{js,css,html,svg,png,ico,mp3,ogg,wav,json}'],
          globIgnores: ['**/icons/icon-192.*', '**/icons/icon-512.*'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'audio',
              handler: 'CacheFirst',
              options: {
                cacheName: 'audio-cache',
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ]
  };
});
