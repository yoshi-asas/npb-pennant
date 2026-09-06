import { describe, expect, it } from 'vitest';
import {
	gamesBehindLabel,
	mediumDate,
	percent,
	readableOn,
	shortDate,
	timestamp
} from './format.ts';

describe('shortDate', () => {
	it('ISO の日付をそのままの日で返す', () => {
		expect(shortDate('2026-09-22')).toBe('9/22（火）');
		expect(shortDate('2026-09-26')).toBe('9/26（土）');
	});

	// 回帰: `+09:00` で組み立てて getUTC* で読むと前日になっていた。
	// サイトの目玉である「優勝が決まる日」が全ページで1日早く出ていた。
	it('1日早くずれない', () => {
		for (const iso of ['2026-09-01', '2026-09-22', '2026-10-03', '2026-12-31']) {
			const [, month, day] = iso.split('-');
			expect(shortDate(iso).startsWith(`${Number(month)}/${Number(day)}（`)).toBe(true);
		}
	});

	it('月初・年末をまたいでも壊れない', () => {
		expect(shortDate('2026-10-01')).toBe('10/1（木）');
		expect(shortDate('2026-12-31')).toBe('12/31（木）');
	});

	it('曜日が実際のカレンダーと一致する', () => {
		// 2026-09-22 は火曜。以降1日ずつ進めて一巡させる。
		const expected = ['火', '水', '木', '金', '土', '日', '月'];
		expected.forEach((weekday, offset) => {
			expect(shortDate(`2026-09-${22 + offset}`)).toContain(`（${weekday}）`);
		});
	});
});

describe('mediumDate', () => {
	it('ゼロ埋めを外して返す', () => {
		expect(mediumDate('2026-09-26')).toBe('9月26日');
		expect(mediumDate('2026-10-01')).toBe('10月1日');
	});

	it('shortDate と同じ日を指す', () => {
		for (const iso of ['2026-09-01', '2026-09-22', '2026-10-03']) {
			const [, month, day] = iso.split('-');
			expect(mediumDate(iso)).toBe(`${Number(month)}月${Number(day)}日`);
			expect(shortDate(iso)).toContain(`${Number(month)}/${Number(day)}（`);
		}
	});
});

describe('percent', () => {
	it('0 と 1 は端数を出さない', () => {
		expect(percent(0)).toBe('0%');
		expect(percent(1)).toBe('100%');
	});

	it('極小の値はまとめて表す', () => {
		expect(percent(0.0004)).toBe('<0.1%');
	});

	it('通常の値は小数1桁', () => {
		expect(percent(0.96295)).toBe('96.3%');
		expect(percent(0.5)).toBe('50.0%');
	});
});

describe('timestamp', () => {
	it('UTC の日時を JST で表示する', () => {
		expect(timestamp('2026-09-05T15:52:00.000Z')).toBe('2026年9月6日 0:52');
	});

	it('分はゼロ埋めする', () => {
		expect(timestamp('2026-09-05T15:05:00.000Z')).toBe('2026年9月6日 0:05');
	});
});

describe('gamesBehindLabel', () => {
	it('首位はハイフン', () => {
		expect(gamesBehindLabel(0)).toBe('-');
	});

	it('それ以外は小数1桁', () => {
		expect(gamesBehindLabel(7)).toBe('7.0');
		expect(gamesBehindLabel(17.5)).toBe('17.5');
	});
});

describe('readableOn', () => {
	it('明るい背景には濃い文字色を返す', () => {
		expect(readableOn('#f2c200')).toBe('#14181d');
	});

	it('暗い背景には白を返す', () => {
		expect(readableOn('#121a3c')).toBe('#ffffff');
	});
});
