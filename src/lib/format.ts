import { formatPct } from '../engine/compare.ts';

export { formatPct };

/** 0.945 -> "94.9%" 。0 と 1 は端数を出さずに書く */
export function percent(value: number, digits = 1): string {
	if (value <= 0) return '0%';
	if (value >= 1) return '100%';
	if (value < 0.001) return '<0.1%';
	return `${(value * 100).toFixed(digits)}%`;
}

/**
 * "2026-09-26" -> "9/26（土）"
 *
 * UTC で組み立てて UTC で読む。`+09:00` で組み立てて `getUTC*` で読むと、
 * 指す瞬間が前日の15:00Z になるため常に1日早くずれる（実際に踏んだ）。
 * ローカル時刻を使わないのは、CI（UTC）と手元（JST）で結果を変えないため。
 */
export function shortDate(iso: string): string {
	const date = new Date(`${iso}T00:00:00Z`);
	const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()] ?? '';
	return `${date.getUTCMonth() + 1}/${date.getUTCDate()}（${weekday}）`;
}

/** "2026-09-26" -> "9月26日" */
export function mediumDate(iso: string): string {
	const [, month, day] = iso.split('-');
	return `${Number(month)}月${Number(day)}日`;
}

/** ISO 日時 -> "2026年9月4日 0:52" */
export function timestamp(iso: string): string {
	const date = new Date(iso);
	const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
	return (
		`${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日 ` +
		`${jst.getUTCHours()}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
	);
}

export function gamesBehindLabel(value: number): string {
	if (value === 0) return '-';
	return value.toFixed(1);
}

/** 背景色に対して読みやすい文字色を返す */
export function readableOn(hex: string): string {
	const value = hex.replace('#', '');
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	// sRGB の相対輝度
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance > 0.6 ? '#14181d' : '#ffffff';
}
