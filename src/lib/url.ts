/**
 * サイト内リンクのパスを組み立てる。
 *
 * GitHub Pages のプロジェクトページでは、サイトが `/npb-pennant/` の下に置かれる。
 * Astro はテンプレートに直書きした `href="/method/"` を自動では書き換えないので、
 * サイト内リンクは必ずこの関数を通すこと。通し忘れるとサブパス配信で 404 になる。
 *
 * `import.meta.env.BASE_URL` は astro.config.mjs の `base`（末尾スラッシュ付き）が入る。
 * ルート配信なら `/` なので、その場合この関数は実質素通しになる。
 */
export function url(path: string): string {
	const base = import.meta.env.BASE_URL ?? '/';
	return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
