import { describe, expect, it } from 'vitest';
import { eliminationStatus } from './elimination.ts';
import { PACIFIC, makeState } from './testUtils.ts';

/**
 * ライバル同士の潰し合いを考えて初めて敗退が分かるケース（baseball elimination problem）。
 *
 * 全球団100試合。対象の m は残り7を全勝して 47-53。
 * ライバル4球団はいずれも単独では m を上回れない（現在45勝、上限47勝に対して余裕は2勝ずつ）。
 * しかしライバル同士は残り10試合を戦うので、必ず10勝がライバルの誰かに配られる。
 * 許容できる合計は 2×4 = 8勝しかないため、どう転んでも誰かが m を上回る。
 */
function collisionScenario(selfWinsNeeded: number) {
	return makeState(
		PACIFIC,
		[
			{ id: 'm', wins: 40 + selfWinsNeeded, losses: 53 - selfWinsNeeded, remaining: 7 },
			{ id: 'h', wins: 45, losses: 48, remaining: 7 },
			{ id: 'f', wins: 45, losses: 48, remaining: 7 },
			{ id: 'b', wins: 45, losses: 48, remaining: 7 },
			{ id: 'l', wins: 45, losses: 49, remaining: 6 }
		],
		[
			['m', 'h', 2],
			['m', 'f', 2],
			['m', 'b', 2],
			['m', 'l', 1],
			['h', 'f', 2],
			['h', 'b', 2],
			['h', 'l', 1],
			['f', 'b', 1],
			['f', 'l', 2],
			['b', 'l', 2]
		]
	);
}

describe('数学的敗退', () => {
	it('単独で上回れないライバルがいれば敗退（自明なケース）', () => {
		const state = makeState(
			PACIFIC,
			[
				{ id: 'm', wins: 40, losses: 90, remaining: 3 },
				{ id: 'h', wins: 90, losses: 40, remaining: 3 }
			],
			[['m', 'h', 3]]
		);
		const result = eliminationStatus(state, 'm');
		expect(result.alive).toBe(false);
		expect(result.unbeatable).toEqual(['h']);
	});

	it('個別には抑えられてもライバル同士の潰し合いで敗退する', () => {
		const state = collisionScenario(0);
		const result = eliminationStatus(state, 'm');
		expect(result.alive).toBe(false);
		// 単独で追い抜けない相手はいない。最大流が足りずに敗退している
		expect(result.unbeatable).toEqual([]);
		expect(result.flowFeasible).toBe(false);
	});

	it('自チームの勝ち星が増えて許容量が上がれば生き残る', () => {
		// m が4勝ぶん多いと上限が51勝になり、ライバルの許容合計が 6×3+6 = 24 ≧ 10 になる
		const state = collisionScenario(4);
		const result = eliminationStatus(state, 'm');
		expect(result.alive).toBe(true);
		expect(result.flowFeasible).toBe(true);
	});

	it('首位チームは当然生き残っている', () => {
		const state = collisionScenario(0);
		expect(eliminationStatus(state, 'h').alive).toBe(true);
	});
});
