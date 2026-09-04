import type { Game, TeamRecord } from './types.ts';

/**
 * チーム実力の推定と、1試合あたりの勝敗確率。
 *
 * 実勝率だけを使うと「たまたま接戦に勝っている」チームを過大評価するので、
 *   1. 得失点から求めるピタゴラス勝率とブレンドし
 *   2. 平均（.500）へ縮小推定（regression to the mean）する
 * の2段階で補正する。
 */

export interface StrengthOptions {
	/**
	 * ピタゴラス勝率の指数。MLB では 1.83 が慣用値だが、
	 * NPB では 1.72 前後のほうが実勝率との誤差が小さいとされる。
	 */
	pythagoreanExponent: number;
	/** ピタゴラス勝率を混ぜる比率（0 なら実勝率のみ、1 ならピタゴラス勝率のみ） */
	pythagoreanWeight: number;
	/** 縮小推定の強さ。「.500 のチームと k 試合戦った」ぶんの重みを足す */
	shrinkageGames: number;
}

export const DEFAULT_STRENGTH: StrengthOptions = {
	pythagoreanExponent: 1.72,
	pythagoreanWeight: 0.5,
	shrinkageGames: 70
};

/** ピタゴラス勝率 = 得点^γ / (得点^γ + 失点^γ) */
export function pythagoreanPct(runsScored: number, runsAllowed: number, exponent: number): number {
	if (runsScored <= 0 && runsAllowed <= 0) return 0.5;
	const scored = Math.pow(runsScored, exponent);
	const allowed = Math.pow(runsAllowed, exponent);
	return scored / (scored + allowed);
}

/** 1球団の「本来の実力」推定値 */
export function estimateStrength(record: TeamRecord, options: StrengthOptions): number {
	const decided = record.wins + record.losses;
	const actual = decided === 0 ? 0.5 : record.wins / decided;
	const pythagorean = pythagoreanPct(
		record.runsScored,
		record.runsAllowed,
		options.pythagoreanExponent
	);
	const blended =
		(1 - options.pythagoreanWeight) * actual + options.pythagoreanWeight * pythagorean;

	// 平均への回帰
	return (blended * decided + 0.5 * options.shrinkageGames) / (decided + options.shrinkageGames);
}

/**
 * log5（Bill James）。実力 pA のチームが実力 pB のチームに勝つ確率。
 * どちらもリーグ平均 .500 に対する勝率として定義されている前提。
 */
export function log5(a: number, b: number): number {
	const denominator = a + b - 2 * a * b;
	if (denominator <= 0) return 0.5;
	return (a - a * b) / denominator;
}

function logit(p: number): number {
	const clamped = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
	return Math.log(clamped / (1 - clamped));
}

function expit(x: number): number {
	return 1 / (1 + Math.exp(-x));
}

/** そのシーズンの実測から求めたリーグ全体の傾向 */
export interface LeagueContext {
	/** 決着した試合のうちホームチームが勝つ確率 */
	homeWinRate: number;
	/** 全試合に占める引き分けの割合 */
	drawRate: number;
	/** 集計に使った試合数 */
	sampleSize: number;
}

export interface ContextOptions {
	/**
	 * ホーム勝率の事前分布。NPB のホームアドバンテージは長期的に 54〜55% 程度とされる
	 * （日本体育学会などの研究で NPB ≒ MLB の水準と報告されている）。
	 */
	homeWinPrior: number;
	/** 事前分布の重み（この試合数ぶんの観測に相当するとみなす） */
	homeWinPriorWeight: number;
	drawRatePrior: number;
	drawRatePriorWeight: number;
}

export const DEFAULT_CONTEXT: ContextOptions = {
	homeWinPrior: 0.54,
	homeWinPriorWeight: 500,
	drawRatePrior: 0.03,
	drawRatePriorWeight: 100
};

/**
 * ホームアドバンテージと引き分け率をシーズン実データから推定する。
 *
 * リーグ別に分けると1リーグ約300試合しかなく、標準誤差が3%近くになってしまう
 * （2026年のパ・リーグは 58.3% と .500 から 2.9σ 離れているが、これはほぼ標本誤差）。
 * ホームアドバンテージも延長規定もセ・パで違わないので、12球団をまとめて集計し、
 * さらに長期的な水準へ縮小推定する。
 */
export function seasonContext(
	games: readonly Game[],
	options: ContextOptions = DEFAULT_CONTEXT
): LeagueContext {
	let homeWins = 0;
	let decided = 0;
	let draws = 0;
	let total = 0;

	for (const game of games) {
		if (game.status !== 'final') continue;
		if (game.homeScore === null || game.awayScore === null) continue;
		total++;
		if (game.homeScore === game.awayScore) {
			draws++;
			continue;
		}
		decided++;
		if (game.homeScore > game.awayScore) homeWins++;
	}

	const homeWinRate =
		(homeWins + options.homeWinPrior * options.homeWinPriorWeight) /
		(decided + options.homeWinPriorWeight);
	const drawRate =
		(draws + options.drawRatePrior * options.drawRatePriorWeight) /
		(total + options.drawRatePriorWeight);

	return { homeWinRate, drawRate, sampleSize: total };
}

/** 1試合の結果確率。draw + homeWin + awayWin = 1 */
export interface GameProbabilities {
	homeWin: number;
	draw: number;
}

/**
 * ホームの実力 / ビジターの実力 / リーグ傾向から、1試合の結果確率を作る。
 * ホームアドバンテージはロジット空間でのシフトとして扱う。
 */
export function gameProbabilities(
	homeStrength: number,
	awayStrength: number,
	context: LeagueContext
): GameProbabilities {
	const base = log5(homeStrength, awayStrength);
	const shift = logit(context.homeWinRate);
	const homeWinIfDecided = expit(logit(base) + shift);
	return {
		homeWin: (1 - context.drawRate) * homeWinIfDecided,
		draw: context.drawRate
	};
}
