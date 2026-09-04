/**
 * games.json から当日ぶんの計算結果を作り、
 *   data/<year>/latest.json                （サイトが読む最新版）
 *   data/<year>/snapshots/<asOfDate>.json  （その日の記録。後から書き換えない）
 * に書き出す。
 *
 *   npm run snapshot
 *   npm run snapshot -- --year 2026 --iterations 50000
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankTeams, winPct } from '../src/engine/compare.ts';
import { leagueOutlook } from '../src/engine/elimination.ts';
import { buildLeagueState } from '../src/engine/leagueState.ts';
import { leagueMagic } from '../src/engine/magic.ts';
import { buildRecords, gamesBehind, remainingHeadToHead } from '../src/engine/standings.ts';
import { DEFAULT_SIMULATION, prepareSeason, simulate, toSeed } from '../src/engine/simulate.ts';
import { DEFAULT_STRENGTH, pythagoreanPct, seasonContext } from '../src/engine/strength.ts';
import { teamsOf } from '../src/engine/teams.ts';
import { SEASON_2026, type Game, type LeagueId, type TeamId } from '../src/engine/types.ts';
import type {
	ClinchDatePoint,
	LeagueSnapshot,
	Snapshot,
	TeamSnapshot
} from '../src/lib/snapshot.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

const YEAR = Number(argValue('--year') ?? 2026);
const ITERATIONS = Number(argValue('--iterations') ?? DEFAULT_SIMULATION.iterations);

function quantileDate(points: ClinchDatePoint[], q: number): string | null {
	for (const point of points) {
		if (point.cumulative >= q) return point.date;
	}
	return points.at(-1)?.date ?? null;
}

async function main() {
	const games = JSON.parse(
		await readFile(resolve(ROOT, 'data', String(YEAR), 'games.json'), 'utf8')
	) as Game[];

	const finalGames = games.filter((g) => g.status === 'final');
	if (finalGames.length === 0) throw new Error('確定した試合が1件もない');
	const asOfDate = finalGames.reduce((latest, g) => (g.date > latest ? g.date : latest), '');

	const records = buildRecords(games);
	const context = seasonContext(games);
	const leagues = {} as Record<LeagueId, LeagueSnapshot>;
	const seeds: { league: LeagueId; json: string }[] = [];

	for (const league of ['central', 'pacific'] as LeagueId[]) {
		const state = buildLeagueState(records, league, SEASON_2026);
		const ranked = rankTeams(
			teamsOf(league).map((t) => records.get(t.id)!),
			league
		);
		const leader = ranked[0]!;
		const magics = new Map(leagueMagic(state).map((m) => [m.teamId, m]));
		const outlooks = new Map(leagueOutlook(state).map((o) => [o.teamId, o]));

		const prepared = prepareSeason(games, records, league, SEASON_2026, DEFAULT_STRENGTH);
		const result = simulate(prepared, {
			...DEFAULT_SIMULATION,
			iterations: ITERATIONS,
			overrides: []
		});
		const simulations = new Map(result.teams.map((t) => [t.teamId, t]));
		seeds.push({ league, json: JSON.stringify(toSeed(prepared)) });

		const standings: TeamSnapshot[] = ranked.map((record, index) => {
			const magic = magics.get(record.teamId)!;
			const outlook = outlooks.get(record.teamId)!;
			const simulation = simulations.get(record.teamId)!;
			const strengthIndex = prepared.teamIds.indexOf(record.teamId);

			return {
				teamId: record.teamId,
				rank: index + 1,
				games: record.games,
				wins: record.wins,
				losses: record.losses,
				draws: record.draws,
				pct: winPct(record),
				gamesBehind: index === 0 ? 0 : gamesBehind(leader, record),
				remaining: SEASON_2026.totalGames - record.games,
				runsScored: record.runsScored,
				runsAllowed: record.runsAllowed,
				strength: prepared.strengths[strengthIndex]!,
				pythagoreanPct: pythagoreanPct(
					record.runsScored,
					record.runsAllowed,
					DEFAULT_STRENGTH.pythagoreanExponent
				),
				magicConventional: magic.magic.conventional,
				magicStrict: magic.magic.strict,
				magicTarget: magic.magic.conventionalTarget,
				magicLit: magic.lit,
				selfClinchPossible: magic.magic.selfClinchPossible,
				selfClinchBlockers: magic.magic.selfClinchBlockers,
				alive: outlook.alive,
				eliminationReason: outlook.eliminationReason,
				championProbability: simulation.championProbability,
				playoffProbability: simulation.playoffProbability,
				rankProbabilities: simulation.rankProbabilities,
				finalWins: simulation.finalWins,
				clinchDates: [...simulation.clinchDateCounts]
					.sort((a, b) => a[0].localeCompare(b[0]))
					.map(([date, count]) => ({ date, probability: count / result.iterations }))
			};
		});

		const distribution: ClinchDatePoint[] = [];
		let cumulative = 0;
		for (const [date, count] of [...result.clinchDateDistribution].sort((a, b) =>
			a[0].localeCompare(b[0])
		)) {
			const probability = count / result.iterations;
			cumulative += probability;
			distribution.push({ date, probability, cumulative });
		}

		const matrix = remainingHeadToHead(records, league, SEASON_2026);
		const remainingHeadToHeadPlain: Record<string, Record<string, number>> = {};
		for (const [teamId, row] of matrix) {
			remainingHeadToHeadPlain[teamId] = Object.fromEntries(row) as Record<TeamId, number>;
		}

		leagues[league] = {
			league,
			standings,
			remainingHeadToHead: remainingHeadToHeadPlain,
			clinchDateDistribution: distribution,
			clinchDateSummary:
				distribution.length === 0
					? null
					: {
							p10: quantileDate(distribution, 0.1)!,
							median: quantileDate(distribution, 0.5)!,
							p90: quantileDate(distribution, 0.9)!
						},
			tiebreakDecidedRate: result.tiebreakDecidedRate,
			remainingFixtures: prepared.fixtures.length,
			unscheduledFixtures: prepared.fixtures.filter((f) => !f.confirmed).length,
			iterations: result.iterations,
			elapsedMs: result.elapsedMs
		};
	}

	const snapshot: Snapshot = {
		generatedAt: new Date().toISOString(),
		season: YEAR,
		asOfDate,
		playedGames: finalGames.length,
		context,
		strengthOptions: DEFAULT_STRENGTH,
		leagues
	};

	const json = JSON.stringify(snapshot, null, '\t') + '\n';
	const latestPath = resolve(ROOT, 'data', String(YEAR), 'latest.json');
	const historyPath = resolve(ROOT, 'data', String(YEAR), 'snapshots', `${asOfDate}.json`);
	await mkdir(dirname(historyPath), { recursive: true });
	await writeFile(latestPath, json, 'utf8');
	await writeFile(historyPath, json, 'utf8');
	for (const seed of seeds) {
		await writeFile(
			resolve(ROOT, 'data', String(YEAR), `seed-${seed.league}.json`),
			seed.json,
			'utf8'
		);
	}

	console.log(`${asOfDate} 時点の計算結果を書き出した（${finalGames.length}試合を集計）`);
	for (const league of ['central', 'pacific'] as LeagueId[]) {
		const snapshotLeague = leagues[league];
		const top = snapshotLeague.standings[0]!;
		console.log(
			`  ${league}: ${top.teamId} 優勝確率 ${(top.championProbability * 100).toFixed(1)}%` +
				` / 決定日中央値 ${snapshotLeague.clinchDateSummary?.median ?? '-'}` +
				` (${snapshotLeague.iterations}試行 ${snapshotLeague.elapsedMs}ms)`
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
