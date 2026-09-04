import { describe, expect, it } from 'vitest';
import { clinchesWith, hasClinched, leagueMagic, magicNumber } from './magic.ts';
import { CENTRAL, makeState } from './testUtils.ts';

describe('マジックナンバー', () => {
	it('慣用式は「ライバルの最大到達勝利数 − 自チーム勝利数 + 1」', () => {
		const state = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 69, losses: 50, draws: 1, remaining: 23 },
				{ id: 'g', wins: 64, losses: 55, draws: 2, remaining: 22 },
				{ id: 'db', wins: 55, losses: 62, draws: 3, remaining: 23 }
			],
			[
				['t', 'g', 2],
				['t', 'db', 7],
				['g', 'db', 4]
			]
		);
		// 巨人の上限は 64 + 22 = 86 勝。86 − 69 + 1 = 18
		const magic = magicNumber(state, 't');
		expect(magic.conventionalTarget).toBe('g');
		expect(magic.conventional).toBe(18);
		expect(magic.selfClinchPossible).toBe(true);
	});

	it('引き分けが多いと厳密マジックは慣用式より小さくなる', () => {
		// 自チームは10分あるため勝率の分母が小さく、勝利数で見るより実は強い
		const state = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 80, losses: 50, draws: 10, remaining: 3 },
				{ id: 'g', wins: 78, losses: 62, draws: 0, remaining: 3 }
			],
			[['t', 'g', 0]]
		);
		const magic = magicNumber(state, 't');
		// 勝利数だけで見ると「あと2勝」だが、勝率ではすでに逆転不可能
		expect(magic.conventional).toBe(2);
		expect(magic.strict).toBe(0);
		expect(hasClinched(state, 't')).toBe(true);
	});

	it('勝利数で上でも勝率で届かなければ自力優勝は不可能', () => {
		// ライバルの引き分けが多く、全勝しても勝率で抜けない
		const state = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 80, losses: 60, draws: 0, remaining: 3 },
				{ id: 'g', wins: 78, losses: 52, draws: 10, remaining: 3 }
			],
			[['t', 'g', 0]]
		);
		const magic = magicNumber(state, 't');
		expect(magic.selfClinchPossible).toBe(false);
		expect(magic.strict).toBeNull();
		// 自力優勝できない以上、慣用式の数字を出してはいけない
		expect(magic.conventional).toBeNull();
	});

	it('直接対決が残っていれば、自チームの勝ち星ぶんライバルの上限が下がる', () => {
		const state = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 80, losses: 60, draws: 0, remaining: 3 },
				{ id: 'g', wins: 79, losses: 61, draws: 0, remaining: 3 }
			],
			[['t', 'g', 3]]
		);
		// 阪神が3連勝すれば巨人は3連敗するので 79-64、阪神は 83-60 で確定
		expect(clinchesWith(state, 't', 3).clinched).toBe(true);
		// 2勝1敗なら巨人は 80-63（.559）、阪神は 82-61（.573）でまだ上
		expect(clinchesWith(state, 't', 2).clinched).toBe(true);
		expect(magicNumber(state, 't').strict).toBeLessThanOrEqual(2);
	});

	it('必要な勝ち数について単調（一度確定したら勝ち星が増えても確定のまま）', () => {
		const state = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 70, losses: 55, draws: 0, remaining: 18 },
				{ id: 'g', wins: 66, losses: 59, draws: 0, remaining: 18 },
				{ id: 'db', wins: 60, losses: 65, draws: 0, remaining: 18 }
			],
			[
				['t', 'g', 6],
				['t', 'db', 6],
				['g', 'db', 6]
			]
		);
		const magic = magicNumber(state, 't').strict!;
		expect(magic).toBeGreaterThan(0);
		for (let wins = magic; wins <= 18; wins++) {
			expect(clinchesWith(state, 't', wins).clinched).toBe(true);
		}
		expect(clinchesWith(state, 't', magic - 1).clinched).toBe(false);
	});
});

describe('マジックの点灯', () => {
	it('他の全球団の自力優勝が消えたときだけ点灯する', () => {
		// 巨人にも自力優勝の目が残っている状態
		const contested = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 70, losses: 55, draws: 0, remaining: 18 },
				{ id: 'g', wins: 68, losses: 57, draws: 0, remaining: 18 }
			],
			[['t', 'g', 6]]
		);
		const contestedMagic = leagueMagic(contested);
		expect(contestedMagic.find((m) => m.teamId === 'g')!.magic.selfClinchPossible).toBe(true);
		expect(contestedMagic.find((m) => m.teamId === 't')!.lit).toBe(false);

		// 巨人の自力優勝が消えると阪神のマジックが点灯する
		const decided = makeState(
			CENTRAL,
			[
				{ id: 't', wins: 78, losses: 47, draws: 0, remaining: 18 },
				{ id: 'g', wins: 60, losses: 65, draws: 0, remaining: 18 }
			],
			[['t', 'g', 2]]
		);
		const decidedMagic = leagueMagic(decided);
		expect(decidedMagic.find((m) => m.teamId === 'g')!.magic.selfClinchPossible).toBe(false);
		expect(decidedMagic.find((m) => m.teamId === 't')!.lit).toBe(true);
	});
});
