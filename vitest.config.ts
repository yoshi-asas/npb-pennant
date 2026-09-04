import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
			'@data': fileURLToPath(new URL('./data', import.meta.url))
		}
	},
	test: {
		globals: true,
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
	}
});
