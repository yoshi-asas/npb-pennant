import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	output: 'static',
	site: process.env.SITE_URL ?? 'https://example.pages.dev',
	integrations: [svelte()],
	vite: {
		plugins: [tailwindcss()]
	}
});
