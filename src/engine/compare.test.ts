import { describe, expect, it } from 'vitest';
import {
	compareWinPct,
	formatPct,
	guaranteedAbove,
	possiblyAbove,
	rankTeams,
	winPct
} from './compare.ts';
import { CENTRAL, PACIFIC, makeRecord, recordMap, setHeadToHead } from './testUtils.ts';

describe('勝率', () => {
	it('引き分けを分母から除く', () => {
		// 80勝60敗3分 -> 80 / 140
		expect(winPct({ wins: 80, losses: 60 })).toBeCloseTo(80 / 140, 10);
		expect(formatPct(winPct({ wins: 80, losses: 60 }))).toBe('.571');
	});

	it('決着0試合は .000 とする', () => {
		expect(winPct({ wins: 0, losses: 0 })).toBe(0);
	});

	it('割り算せず交差積で比較する（浮動小数の等価判定を避ける）', () => {
		// 1/3 と 2/6 は同値
		expect(compareWinPct({ wins: 1, losses: 2 }, { wins: 2, losses: 4 })).toBe(0);
		expect(compareWinPct({ wins: 2, losses: 1 }, { wins: 1, losses: 2 })).toBeGreaterThan(0);
	});
});

describe('順位決定（セ・リーグ）', () => {
	it('勝率が同じなら勝利数が多いほうが上', () => {
		// 阪神 70-60（.538）と 巨人 71-61（.538）… 勝率は僅差なので同勝率になる組を作る
		// 68勝58敗 と 34勝29敗 は同勝率、勝利数は前者が上
		const records = recordMap([
			makeRecord('t', { wins: 34, losses: 29, draws: 0 }),
			makeRecord('g', { wins: 68, losses: 58, draws: 5 })
		]);
		const ranked = rankTeams([...records.values()], CENTRAL);
		expect(ranked.map((r) => r.teamId)).toEqual(['g', 't']);
	});

	it('勝率・勝利数が並んだら当該球団間の対戦勝率で決まる', () => {
		const records = recordMap([
			makeRecord('t', { wins: 70, losses: 60, draws: 3 }),
			makeRecord('g', { wins: 70, losses: 60, draws: 3 })
		]);
		setHeadToHead(records, 'g', 't', 14, 11); // 巨人が勝ち越し
		const ranked = rankTeams([...records.values()], CENTRAL);
		expect(ranked.map((r) => r.teamId)).toEqual(['g', 't']);
	});

	it('当該球団間も並んだらリーグ内対戦成績の勝率で決まる', () => {
		const records = recordMap([
			makeRecord('t', { wins: 70, losses: 60, draws: 3, leagueWins: 62, leagueLosses: 50 }),
			makeRecord('g', { wins: 70, losses: 60, draws: 3, leagueWins: 60, leagueLosses: 52 })
		]);
		setHeadToHead(records, 'g', 't', 12, 12);
		const ranked = rankTeams([...records.values()], CENTRAL);
		expect(ranked.map((r) => r.teamId)).toEqual(['t', 'g']);
	});

	it('最後は前年順位で決まる', () => {
		// 阪神(前年1位) と DeNA(前年2位)
		const records = recordMap([
			makeRecord('db', { wins: 70, losses: 60, draws: 3, leagueWins: 61, leagueLosses: 51 }),
			makeRecord('t', { wins: 70, losses: 60, draws: 3, leagueWins: 61, leagueLosses: 51 })
		]);
		setHeadToHead(records, 't', 'db', 12, 12);
		const ranked = rankTeams([...records.values()], CENTRAL);
		expect(ranked.map((r) => r.teamId)).toEqual(['t', 'db']);
	});
});

describe('順位決定（パ・リーグ）', () => {
	it('勝率が同じなら勝利数ではなく当該球団間の対戦勝率で決まる', () => {
		// これがセとパの決定的な違い。
		// ソフトバンク 68-58-5（勝利数が多い）／西武 34-29-0（同勝率・直接対決で勝ち越し）
		const records = recordMap([
			makeRecord('h', { wins: 68, losses: 58, draws: 5 }),
			makeRecord('l', { wins: 34, losses: 29, draws: 0 })
		]);
		setHeadToHead(records, 'l', 'h', 3, 1);
		const ranked = rankTeams([...records.values()], PACIFIC);
		expect(ranked.map((r) => r.teamId)).toEqual(['l', 'h']);
	});

	it('同じ成績でもセとパで順位が入れ替わる', () => {
		// 勝率同・勝利数は A が上・直接対決は B が上 という構図を両リーグで作る
		const central = recordMap([
			makeRecord('t', { wins: 68, losses: 58, draws: 5 }),
			makeRecord('g', { wins: 34, losses: 29, draws: 0 })
		]);
		setHeadToHead(central, 'g', 't', 3, 1);
		expect(rankTeams([...central.values()], CENTRAL).map((r) => r.teamId)).toEqual(['t', 'g']);

		const pacific = recordMap([
			makeRecord('h', { wins: 68, losses: 58, draws: 5 }),
			makeRecord('l', { wins: 34, losses: 29, draws: 0 })
		]);
		setHeadToHead(pacific, 'l', 'h', 3, 1);
		expect(rankTeams([...pacific.values()], PACIFIC).map((r) => r.teamId)).toEqual(['l', 'h']);
	});

	it('3球団が並んだら当該3球団間の総当たり成績で比べる', () => {
		const records = recordMap([
			makeRecord('h', { wins: 70, losses: 60, draws: 0 }),
			makeRecord('l', { wins: 70, losses: 60, draws: 0 }),
			makeRecord('f', { wins: 70, losses: 60, draws: 0 })
		]);
		// 3球団間: 日本ハム 14-11 / 西武 13-12 / ソフトバンク 9-13
		setHeadToHead(records, 'f', 'l', 7, 6);
		setHeadToHead(records, 'f', 'h', 7, 5);
		setHeadToHead(records, 'l', 'h', 7, 5);
		const ranked = rankTeams([...records.values()], PACIFIC);
		expect(ranked.map((r) => r.teamId)).toEqual(['f', 'l', 'h']);
	});
});

describe('確定・可能性の判定', () => {
	it('セは勝率同でも勝利数で決着がつく', () => {
		expect(guaranteedAbove({ wins: 80, losses: 60 }, { wins: 40, losses: 30 }, CENTRAL)).toBe(true);
		expect(possiblyAbove({ wins: 40, losses: 30 }, { wins: 80, losses: 60 }, CENTRAL)).toBe(false);
	});

	it('パは勝率同だと勝敗数だけでは決着がつかない', () => {
		expect(guaranteedAbove({ wins: 80, losses: 60 }, { wins: 40, losses: 30 }, PACIFIC)).toBe(
			false
		);
		// 決着がつかない＝どちらにも可能性がある
		expect(possiblyAbove({ wins: 40, losses: 30 }, { wins: 80, losses: 60 }, PACIFIC)).toBe(true);
		expect(possiblyAbove({ wins: 80, losses: 60 }, { wins: 40, losses: 30 }, PACIFIC)).toBe(true);
	});

	it('勝率が上なら両リーグとも確定', () => {
		expect(guaranteedAbove({ wins: 81, losses: 59 }, { wins: 80, losses: 60 }, CENTRAL)).toBe(true);
		expect(guaranteedAbove({ wins: 81, losses: 59 }, { wins: 80, losses: 60 }, PACIFIC)).toBe(true);
	});
});
