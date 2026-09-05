import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: process.env.SITE_URL ?? 'https://example.pages.dev',
	// GitHub Pages のプロジェクトページでは `/npb-pennant` 配下に置かれる。
	// daily.yml が configure-pages の base_path をそのまま渡す。
	// ローカルと、ルート配信（独自ドメイン等）では '/' になる。
	base: process.env.BASE_PATH ?? '/',
	integrations: [svelte()],
	vite: {
		plugins: [tailwindcss()]
	}
});
