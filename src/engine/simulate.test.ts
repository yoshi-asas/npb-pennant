import { describe, expect, it } from 'vitest';
import { prepareSeason, simulate, DEFAULT_SIMULATION } from './simulate.ts';
import { buildRecords } from './standings.ts';
import { teamsOf } from './teams.ts';
import { SEASON_2026, type Game, type TeamId } from './types.ts';

/**
 * 12球団が完全に互角で、残り試合も対称になる人工シーズンを作る。
 * このとき優勝確率は 6球団でほぼ均等になるはず。
 */
function symmetricSeason(): Game[] {
	const games: Game[] = [];
	const central = teamsOf('central').map((t) => t.id);
	const pacific = teamsOf('pacific').map((t) => t.id);

	let day = 0;
	const play = (home: TeamId, away: TeamId, homeScore: number, awayScore: number) => {
		const date = new Date(Date.UTC(2026, 2, 27 + Math.floor(day / 6)));
		games.push({
			date: date.toISOString().slice(0, 10),
			home,
			away,
			homeScore,
			awayScore,
			status: 'final',
			venue: 'テスト球場',
			startTime: null
		});
		day++;
	};

	// 各ペア20試合を10勝10敗ずつ（同一リーグ）、交流戦18試合も均等に
	for (const league of [central, pacific]) {
		for (let i = 0; i < league.length; i++) {
			for (let j = i + 1; j < league.length; j++) {
				for (let k = 0; k < 20; k++) {
					const homeWins = k % 2 === 0;
					play(league[i]!, league[j]!, homeWins ? 3 : 2, homeWins ? 2 : 3);
				}
			}
		}
	}
	for (const [i, home] of central.entries()) {
		for (const [j, away] of pacific.entries()) {
			for (let k = 0; k < 3; k++) {
				const homeWins = (i + j + k) % 2 === 0;
				play(home, away, homeWins ? 3 : 2, homeWins ? 2 : 3);
			}
		}
	}

	// 残り5試合ずつ（各ペア）を未実施として置く
	for (const league of [central, pacific]) {
		for (let i = 0; i < league.length; i++) {
			for (let j = i + 1; j < league.length; j++) {
				for (let k = 0; k < 5; k++) {
					games.push({
						date: `2026-10-0${k + 1}`,
						home: k % 2 === 0 ? league[i]! : league[j]!,
						away: k % 2 === 0 ? league[j]! : league[i]!,
						homeScore: null,
						awayScore: null,
						status: 'scheduled',
						venue: 'テスト球場',
						startTime: '18:00'
					});
				}
			}
		}
	}

	return games;
}

describe('モンテカルロ', () => {
	const games = symmetricSeason();
	const records = buildRecords(games);

	it('同じシードなら完全に再現する', () => {
		const prepared = prepareSeason(games, records, 'central', SEASON_2026);
		const options = { ...DEFAULT_SIMULATION, iterations: 500, overrides: [] };
		const first = simulate(prepared, options);
		const second = simulate(prepared, options);
		expect(first.teams.map((t) => t.championProbability)).toEqual(
			second.teams.map((t) => t.championProbability)
		);
	});

	it('シードが違えば結果も変わる', () => {
		const prepared = prepareSeason(games, records, 'central', SEASON_2026);
		const a = simulate(prepared, { ...DEFAULT_SIMULATION, iterations: 500, overrides: [] });
		const b = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: 500,
			seed: 999,
			overrides: []
		});
		expect(a.teams.map((t) => t.championProbability)).not.toEqual(
			b.teams.map((t) => t.championProbability)
		);
	});

	it('全球団が互角なら優勝確率はほぼ均等になる', () => {
		const prepared = prepareSeason(games, records, 'central', SEASON_2026);
		const result = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: 6000,
			overrides: []
		});
		for (const team of result.teams) {
			expect(team.championProbability).toBeGreaterThan(0.1);
			expect(team.championProbability).toBeLessThan(0.24);
		}
	});

	it('優勝確率の合計は 1 になる', () => {
		const prepared = prepareSeason(games, records, 'pacific', SEASON_2026);
		const result = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: 2000,
			overrides: []
		});
		const total = result.teams.reduce((sum, t) => sum + t.championProbability, 0);
		expect(total).toBeCloseTo(1, 10);
		// CS進出（3位以内）は必ず3球団ぶん
		const playoff = result.teams.reduce((sum, t) => sum + t.playoffProbability, 0);
		expect(playoff).toBeCloseTo(3, 10);
	});

	it('全試合の結果を固定すると優勝確率が 0 か 1 になる', () => {
		const prepared = prepareSeason(games, records, 'central', SEASON_2026);
		const overrides = prepared.fixtures.map((_, index) => ({
			index,
			result: 'home' as const
		}));
		const result = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: 50,
			overrides
		});
		for (const team of result.teams) {
			expect([0, 1]).toContain(team.championProbability);
		}
	});

	it('決定日の分布の合計は必ず 1 になる（どの試行でも必ずどこかで決まる）', () => {
		const prepared = prepareSeason(games, records, 'central', SEASON_2026);
		const result = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: 2000,
			overrides: []
		});
		const total = [...result.clinchDateDistribution.values()].reduce((a, b) => a + b, 0);
		expect(total).toBe(result.iterations);
	});
});
