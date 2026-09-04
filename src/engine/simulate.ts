import { rankTeams } from './compare.ts';
import { clinchedOverRivals, type RivalSnapshot } from './magic.ts';
import { Random } from './random.ts';
import { buildRemainingSchedule, scheduleDates, type RemainingFixture } from './schedule.ts';
import { teamsOf } from './teams.ts';
import {
	DEFAULT_STRENGTH,
	estimateStrength,
	gameProbabilities,
	seasonContext,
	type LeagueContext,
	type StrengthOptions
} from './strength.ts';
import type { Game, HeadToHead, LeagueId, SeasonShape, TeamId, TeamRecord } from './types.ts';

/**
 * 残りシーズンのモンテカルロ・シミュレーション。
 *
 * 日程は全試行で共通なので、日付ごとの「残り試合数」「残り直接対決数」は
 * 前処理で1度だけ作っておく。試行の中では結果だけが変わる。
 */

export interface FixtureOverride {
	/** PreparedSeason.fixtures のインデックス */
	index: number;
	result: 'home' | 'away' | 'draw';
}

export interface SimulationOptions {
	iterations: number;
	seed: number;
	strength: StrengthOptions;
	/** ユーザーが結果を仮定した試合（「もしも」シミュレーター用） */
	overrides: FixtureOverride[];
}

export const DEFAULT_SIMULATION: Omit<SimulationOptions, 'overrides'> = {
	iterations: 20000,
	seed: 20260904,
	strength: DEFAULT_STRENGTH
};

/**
 * シミュレーションの入力を平たい配列にまとめたもの。
 * そのまま Web Worker に渡せる形にしてある。
 */
export interface PreparedSeason {
	league: LeagueId;
	teamIds: TeamId[];
	fixtures: RemainingFixture[];
	dates: string[];
	context: LeagueContext;
	strengths: number[];

	baseWins: Int32Array;
	baseLosses: Int32Array;
	baseDraws: Int32Array;
	baseLeagueWins: Int32Array;
	baseLeagueLosses: Int32Array;
	baseLeagueDraws: Int32Array;
	/** [i * n + j] = i の j に対する勝ち数 */
	baseH2hWins: Int32Array;
	baseH2hLosses: Int32Array;
	baseH2hDraws: Int32Array;

	fixtureHome: Int32Array;
	fixtureAway: Int32Array;
	fixtureDate: Int32Array;
	pHomeWin: Float64Array;
	pDraw: Float64Array;

	/** [dateIndex * n + team] = その日を終えた時点での残り試合数 */
	remainingAfter: Int32Array;
	/** [dateIndex * n * n + i * n + j] = その日を終えた時点での残り直接対決数 */
	h2hRemainingAfter: Int32Array;
}

export function prepareSeason(
	games: readonly Game[],
	records: ReadonlyMap<TeamId, TeamRecord>,
	league: LeagueId,
	season: SeasonShape,
	strengthOptions: StrengthOptions = DEFAULT_STRENGTH
): PreparedSeason {
	const teamIds = teamsOf(league).map((t) => t.id);
	const n = teamIds.length;
	const indexOf = new Map<TeamId, number>(teamIds.map((id, i) => [id, i]));

	const fixtures = buildRemainingSchedule(games, records, league, season);
	const dates = scheduleDates(fixtures);
	const dateIndex = new Map<string, number>(dates.map((d, i) => [d, i]));

	const context = seasonContext(games);
	const strengths = teamIds.map((id) => estimateStrength(records.get(id)!, strengthOptions));

	const baseWins = new Int32Array(n);
	const baseLosses = new Int32Array(n);
	const baseDraws = new Int32Array(n);
	const baseLeagueWins = new Int32Array(n);
	const baseLeagueLosses = new Int32Array(n);
	const baseLeagueDraws = new Int32Array(n);
	const baseH2hWins = new Int32Array(n * n);
	const baseH2hLosses = new Int32Array(n * n);
	const baseH2hDraws = new Int32Array(n * n);

	for (const [i, id] of teamIds.entries()) {
		const record = records.get(id)!;
		baseWins[i] = record.wins;
		baseLosses[i] = record.losses;
		baseDraws[i] = record.draws;
		baseLeagueWins[i] = record.leagueWins;
		baseLeagueLosses[i] = record.leagueLosses;
		baseLeagueDraws[i] = record.leagueDraws;
		for (const [j, other] of teamIds.entries()) {
			if (i === j) continue;
			const h2h = record.h2h[other];
			if (!h2h) continue;
			baseH2hWins[i * n + j] = h2h.wins;
			baseH2hLosses[i * n + j] = h2h.losses;
			baseH2hDraws[i * n + j] = h2h.draws;
		}
	}

	const count = fixtures.length;
	const fixtureHome = new Int32Array(count);
	const fixtureAway = new Int32Array(count);
	const fixtureDate = new Int32Array(count);
	const pHomeWin = new Float64Array(count);
	const pDraw = new Float64Array(count);

	for (const [f, fixture] of fixtures.entries()) {
		const home = indexOf.get(fixture.home)!;
		const away = indexOf.get(fixture.away)!;
		fixtureHome[f] = home;
		fixtureAway[f] = away;
		fixtureDate[f] = dateIndex.get(fixture.date)!;
		const probabilities = gameProbabilities(strengths[home]!, strengths[away]!, context);
		pHomeWin[f] = probabilities.homeWin;
		pDraw[f] = probabilities.draw;
	}

	const { remainingAfter, h2hRemainingAfter } = remainingTables(
		fixtureHome,
		fixtureAway,
		fixtureDate,
		dates.length,
		n
	);

	return {
		league,
		teamIds,
		fixtures,
		dates,
		context,
		strengths,
		baseWins,
		baseLosses,
		baseDraws,
		baseLeagueWins,
		baseLeagueLosses,
		baseLeagueDraws,
		baseH2hWins,
		baseH2hLosses,
		baseH2hDraws,
		fixtureHome,
		fixtureAway,
		fixtureDate,
		pHomeWin,
		pDraw,
		remainingAfter,
		h2hRemainingAfter
	};
}

export interface TeamSimulation {
	teamId: TeamId;
	championProbability: number;
	/** 3位以内に入る確率（クライマックスシリーズ進出） */
	playoffProbability: number;
	/** 1位〜6位それぞれになる確率 */
	rankProbabilities: number[];
	finalWins: { p10: number; median: number; p90: number };
	/** その球団が優勝した試行のうち、優勝が決まった日ごとの回数 */
	clinchDateCounts: Map<string, number>;
}

export interface SimulationResult {
	league: LeagueId;
	iterations: number;
	teams: TeamSimulation[];
	/** 優勝決定日の分布（全試行を合算）。key は YYYY-MM-DD */
	clinchDateDistribution: Map<string, number>;
	/**
	 * 数学的な確定ではなく、最終戦を終えたうえでのタイブレークで優勝が決まった試行の割合。
	 * この試行ぶんは決定日を最終日として集計している。
	 */
	tiebreakDecidedRate: number;
	context: LeagueContext;
	elapsedMs: number;
}

export function simulate(prepared: PreparedSeason, options: SimulationOptions): SimulationResult {
	const started = Date.now();
	const n = prepared.teamIds.length;
	const fixtureCount = prepared.fixtures.length;
	const dateCount = prepared.dates.length;
	const random = new Random(options.seed);

	const overrideResult = new Int8Array(fixtureCount).fill(-1);
	for (const override of options.overrides) {
		if (override.index < 0 || override.index >= fixtureCount) continue;
		overrideResult[override.index] =
			override.result === 'home' ? 0 : override.result === 'away' ? 1 : 2;
	}

	const wins = new Int32Array(n);
	const losses = new Int32Array(n);
	const draws = new Int32Array(n);
	const h2hWins = new Int32Array(n * n);
	const h2hLosses = new Int32Array(n * n);
	const h2hDraws = new Int32Array(n * n);

	const rankCounts = new Int32Array(n * n);
	const championCounts = new Int32Array(n);
	const winSamples: Int16Array[] = Array.from(
		{ length: n },
		() => new Int16Array(options.iterations)
	);
	const clinchDateCounts = new Int32Array(n * Math.max(1, dateCount));
	const clinchTotals = new Int32Array(Math.max(1, dateCount));
	let undecided = 0;

	// rankTeams に渡すオブジェクトは毎回作り直さず使い回す
	const scratch: TeamRecord[] = prepared.teamIds.map((teamId) => ({
		teamId,
		league: prepared.league,
		games: 0,
		wins: 0,
		losses: 0,
		draws: 0,
		runsScored: 0,
		runsAllowed: 0,
		leagueWins: 0,
		leagueLosses: 0,
		leagueDraws: 0,
		h2h: {} as Record<TeamId, HeadToHead>
	}));
	for (const [i, record] of scratch.entries()) {
		for (const [j, other] of prepared.teamIds.entries()) {
			if (i !== j) record.h2h[other] = { wins: 0, losses: 0, draws: 0 };
		}
	}

	const rivalSnapshots: RivalSnapshot[] = Array.from({ length: n - 1 }, () => ({
		wins: 0,
		losses: 0,
		remaining: 0,
		directRemaining: 0
	}));

	for (let iteration = 0; iteration < options.iterations; iteration++) {
		wins.set(prepared.baseWins);
		losses.set(prepared.baseLosses);
		draws.set(prepared.baseDraws);
		h2hWins.set(prepared.baseH2hWins);
		h2hLosses.set(prepared.baseH2hLosses);
		h2hDraws.set(prepared.baseH2hDraws);

		let clinchDate = -1;
		let fixture = 0;

		for (let date = 0; date < dateCount; date++) {
			while (fixture < fixtureCount && prepared.fixtureDate[fixture] === date) {
				const home = prepared.fixtureHome[fixture]!;
				const away = prepared.fixtureAway[fixture]!;
				const forced = overrideResult[fixture]!;

				let outcome: number;
				if (forced >= 0) {
					outcome = forced;
				} else {
					const roll = random.next();
					const homeWin = prepared.pHomeWin[fixture]!;
					const drawProbability = prepared.pDraw[fixture]!;
					outcome = roll < homeWin ? 0 : roll < homeWin + drawProbability ? 2 : 1;
				}

				if (outcome === 0) {
					wins[home]!++;
					losses[away]!++;
					h2hWins[home * n + away]!++;
					h2hLosses[away * n + home]!++;
				} else if (outcome === 1) {
					wins[away]!++;
					losses[home]!++;
					h2hWins[away * n + home]!++;
					h2hLosses[home * n + away]!++;
				} else {
					draws[home]!++;
					draws[away]!++;
					h2hDraws[home * n + away]!++;
					h2hDraws[away * n + home]!++;
				}
				fixture++;
			}

			if (clinchDate < 0) {
				const leader = findClinched(prepared, wins, losses, date, n, rivalSnapshots);
				if (leader >= 0) {
					clinchDate = date;
					clinchDateCounts[leader * dateCount + date]!++;
					clinchTotals[date]!++;
				}
			}
		}

		for (const [i, record] of scratch.entries()) {
			record.wins = wins[i]!;
			record.losses = losses[i]!;
			record.draws = draws[i]!;
			record.games = record.wins + record.losses + record.draws;
			// 残り試合は全て同一リーグ内なので、増分はそのままリーグ戦成績に乗る
			record.leagueWins = prepared.baseLeagueWins[i]! + (wins[i]! - prepared.baseWins[i]!);
			record.leagueLosses = prepared.baseLeagueLosses[i]! + (losses[i]! - prepared.baseLosses[i]!);
			record.leagueDraws = prepared.baseLeagueDraws[i]! + (draws[i]! - prepared.baseDraws[i]!);
			for (const [j, other] of prepared.teamIds.entries()) {
				if (i === j) continue;
				const slot = record.h2h[other]!;
				slot.wins = h2hWins[i * n + j]!;
				slot.losses = h2hLosses[i * n + j]!;
				slot.draws = h2hDraws[i * n + j]!;
			}
			winSamples[i]![iteration] = record.wins;
		}

		const ranked = rankTeams(scratch, prepared.league);
		for (const [position, record] of ranked.entries()) {
			const index = prepared.teamIds.indexOf(record.teamId);
			rankCounts[index * n + position]!++;
			if (position === 0) championCounts[index]!++;
		}

		if (clinchDate < 0) {
			// 勝率も（セなら勝利数も）完全に並んだ場合、優勝は当該球団間の対戦成績で決まる。
			// 数学的確定としては最後まで立たないが、実際には最終戦で決着している。
			undecided++;
			if (dateCount > 0) {
				const champion = prepared.teamIds.indexOf(rankTeams(scratch, prepared.league)[0]!.teamId);
				clinchDateCounts[champion * dateCount + (dateCount - 1)]!++;
				clinchTotals[dateCount - 1]!++;
			}
		}
	}

	const teams: TeamSimulation[] = prepared.teamIds.map((teamId, i) => {
		const sorted = Int16Array.from(winSamples[i]!).sort();
		const quantile = (q: number) =>
			sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
		const dateCounts = new Map<string, number>();
		for (let d = 0; d < dateCount; d++) {
			const value = clinchDateCounts[i * dateCount + d]!;
			if (value > 0) dateCounts.set(prepared.dates[d]!, value);
		}
		return {
			teamId,
			championProbability: championCounts[i]! / options.iterations,
			playoffProbability:
				(rankCounts[i * n + 0]! + rankCounts[i * n + 1]! + rankCounts[i * n + 2]!) /
				options.iterations,
			rankProbabilities: Array.from(
				{ length: n },
				(_, p) => rankCounts[i * n + p]! / options.iterations
			),
			finalWins: { p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9) },
			clinchDateCounts: dateCounts
		};
	});

	const clinchDateDistribution = new Map<string, number>();
	for (let d = 0; d < dateCount; d++) {
		if (clinchTotals[d]! > 0) clinchDateDistribution.set(prepared.dates[d]!, clinchTotals[d]!);
	}

	return {
		league: prepared.league,
		iterations: options.iterations,
		teams,
		clinchDateDistribution,
		tiebreakDecidedRate: undecided / options.iterations,
		context: prepared.context,
		elapsedMs: Date.now() - started
	};
}

/**
 * その日を終えた時点で優勝が確定している球団を返す（なければ -1）。
 *
 * 優勝が確定した球団は、必ずその時点の勝率でも首位になっている
 * （残り全敗しても他を上回るなら、今の勝率も他以上のはず）。
 * したがって上位2球団だけ調べれば足りる。
 */
function findClinched(
	prepared: PreparedSeason,
	wins: Int32Array,
	losses: Int32Array,
	date: number,
	n: number,
	rivalSnapshots: RivalSnapshot[]
): number {
	let best = 0;
	let second = -1;
	for (let i = 1; i < n; i++) {
		if (comparePct(wins[i]!, losses[i]!, wins[best]!, losses[best]!) > 0) {
			second = best;
			best = i;
		} else if (second < 0 || comparePct(wins[i]!, losses[i]!, wins[second]!, losses[second]!) > 0) {
			second = i;
		}
	}

	const candidates = second >= 0 ? [best, second] : [best];
	for (const candidate of candidates) {
		let slot = 0;
		for (let j = 0; j < n; j++) {
			if (j === candidate) continue;
			const snapshot = rivalSnapshots[slot++]!;
			snapshot.wins = wins[j]!;
			snapshot.losses = losses[j]!;
			snapshot.remaining = prepared.remainingAfter[date * n + j]!;
			snapshot.directRemaining = prepared.h2hRemainingAfter[date * n * n + candidate * n + j]!;
		}
		const blockers = clinchedOverRivals(
			prepared.league,
			{ wins: wins[candidate]!, losses: losses[candidate]! },
			prepared.remainingAfter[date * n + candidate]!,
			0,
			rivalSnapshots
		);
		if (blockers.length === 0) return candidate;
	}
	return -1;
}

function comparePct(winsA: number, lossesA: number, winsB: number, lossesB: number): number {
	const decidedA = winsA + lossesA;
	const decidedB = winsB + lossesB;
	if (decidedA === 0 || decidedB === 0) return winsA - winsB;
	return winsA * decidedB - winsB * decidedA;
}

/** 前処理からシミュレーションまで一気に走らせる入口 */
export function simulateSeason(
	games: readonly Game[],
	records: ReadonlyMap<TeamId, TeamRecord>,
	league: LeagueId,
	season: SeasonShape,
	options: Partial<SimulationOptions> = {}
): { prepared: PreparedSeason; result: SimulationResult } {
	const merged: SimulationOptions = {
		...DEFAULT_SIMULATION,
		overrides: [],
		...options,
		strength: options.strength ?? DEFAULT_STRENGTH
	};
	const prepared = prepareSeason(games, records, league, season, merged.strength);
	return { prepared, result: simulate(prepared, merged) };
}

/**
 * 各日付を終えた時点での「残り試合数」「残り直接対決数」を前処理で作る。
 * 日程は全試行で共通なので1度だけ計算すればよい。
 */
function remainingTables(
	fixtureHome: Int32Array,
	fixtureAway: Int32Array,
	fixtureDate: Int32Array,
	dateCount: number,
	n: number
): { remainingAfter: Int32Array; h2hRemainingAfter: Int32Array } {
	const count = fixtureHome.length;
	const remainingAfter = new Int32Array(dateCount * n);
	const h2hRemainingAfter = new Int32Array(dateCount * n * n);

	const pendingGames = new Int32Array(n);
	const pendingH2h = new Int32Array(n * n);
	for (let f = 0; f < count; f++) {
		const home = fixtureHome[f]!;
		const away = fixtureAway[f]!;
		pendingGames[home]!++;
		pendingGames[away]!++;
		pendingH2h[home * n + away]!++;
		pendingH2h[away * n + home]!++;
	}

	let cursor = 0;
	for (let d = 0; d < dateCount; d++) {
		while (cursor < count && fixtureDate[cursor] === d) {
			const home = fixtureHome[cursor]!;
			const away = fixtureAway[cursor]!;
			pendingGames[home]!--;
			pendingGames[away]!--;
			pendingH2h[home * n + away]!--;
			pendingH2h[away * n + home]!--;
			cursor++;
		}
		remainingAfter.set(pendingGames, d * n);
		h2hRemainingAfter.set(pendingH2h, d * n * n);
	}

	return { remainingAfter, h2hRemainingAfter };
}

/**
 * PreparedSeason を JSON にできる形に落としたもの。
 *
 * 「もしも」シミュレーターはブラウザ側で同じエンジンを走らせる。
 * 試合ログ全体（約900試合）を配るのは無駄なので、必要な数字だけをこの形で配る。
 */
export interface SeasonSeed {
	league: LeagueId;
	teamIds: TeamId[];
	fixtures: RemainingFixture[];
	strengths: number[];
	context: LeagueContext;
	wins: number[];
	losses: number[];
	draws: number[];
	leagueWins: number[];
	leagueLosses: number[];
	leagueDraws: number[];
	h2hWins: number[];
	h2hLosses: number[];
	h2hDraws: number[];
}

export function toSeed(prepared: PreparedSeason): SeasonSeed {
	return {
		league: prepared.league,
		teamIds: prepared.teamIds,
		fixtures: prepared.fixtures,
		strengths: prepared.strengths,
		context: prepared.context,
		wins: [...prepared.baseWins],
		losses: [...prepared.baseLosses],
		draws: [...prepared.baseDraws],
		leagueWins: [...prepared.baseLeagueWins],
		leagueLosses: [...prepared.baseLeagueLosses],
		leagueDraws: [...prepared.baseLeagueDraws],
		h2hWins: [...prepared.baseH2hWins],
		h2hLosses: [...prepared.baseH2hLosses],
		h2hDraws: [...prepared.baseH2hDraws]
	};
}

export function fromSeed(seed: SeasonSeed): PreparedSeason {
	const n = seed.teamIds.length;
	const indexOf = new Map<TeamId, number>(seed.teamIds.map((id, i) => [id, i]));
	const dates = scheduleDates(seed.fixtures);
	const dateIndex = new Map<string, number>(dates.map((d, i) => [d, i]));

	const count = seed.fixtures.length;
	const fixtureHome = new Int32Array(count);
	const fixtureAway = new Int32Array(count);
	const fixtureDate = new Int32Array(count);
	const pHomeWin = new Float64Array(count);
	const pDraw = new Float64Array(count);

	for (const [f, fixture] of seed.fixtures.entries()) {
		const home = indexOf.get(fixture.home)!;
		const away = indexOf.get(fixture.away)!;
		fixtureHome[f] = home;
		fixtureAway[f] = away;
		fixtureDate[f] = dateIndex.get(fixture.date)!;
		const probabilities = gameProbabilities(
			seed.strengths[home]!,
			seed.strengths[away]!,
			seed.context
		);
		pHomeWin[f] = probabilities.homeWin;
		pDraw[f] = probabilities.draw;
	}

	const { remainingAfter, h2hRemainingAfter } = remainingTables(
		fixtureHome,
		fixtureAway,
		fixtureDate,
		dates.length,
		n
	);

	return {
		league: seed.league,
		teamIds: seed.teamIds,
		fixtures: seed.fixtures,
		dates,
		context: seed.context,
		strengths: seed.strengths,
		baseWins: Int32Array.from(seed.wins),
		baseLosses: Int32Array.from(seed.losses),
		baseDraws: Int32Array.from(seed.draws),
		baseLeagueWins: Int32Array.from(seed.leagueWins),
		baseLeagueLosses: Int32Array.from(seed.leagueLosses),
		baseLeagueDraws: Int32Array.from(seed.leagueDraws),
		baseH2hWins: Int32Array.from(seed.h2hWins),
		baseH2hLosses: Int32Array.from(seed.h2hLosses),
		baseH2hDraws: Int32Array.from(seed.h2hDraws),
		fixtureHome,
		fixtureAway,
		fixtureDate,
		pHomeWin,
		pDraw,
		remainingAfter,
		h2hRemainingAfter
	};
}
