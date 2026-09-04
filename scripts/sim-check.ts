import { readFile } from 'node:fs/promises';
import { buildRecords } from '../src/engine/standings.ts';
import { getTeam } from '../src/engine/teams.ts';
import { simulateSeason } from '../src/engine/simulate.ts';
import { SEASON_2026, type Game, type LeagueId } from '../src/engine/types.ts';

const year = process.argv[2] ?? '2026';
const games = JSON.parse(await readFile(`data/${year}/games.json`, 'utf8')) as Game[];
const records = buildRecords(games);

for (const league of ['central', 'pacific'] as LeagueId[]) {
	const { prepared, result } = simulateSeason(games, records, league, SEASON_2026);

	console.log(`\n=== ${league} ===`);
	console.log(
		`残り ${prepared.fixtures.length}試合（うち日程未定の仮置き ${prepared.fixtures.filter((f) => !f.confirmed).length}）` +
			` / 開催日 ${prepared.dates.length}日 / ${result.iterations}試行 ${result.elapsedMs}ms`
	);
	console.log(
		`ホーム勝率 ${(prepared.context.homeWinRate * 100).toFixed(1)}% / 引分率 ${(prepared.context.drawRate * 100).toFixed(1)}% (${prepared.context.sampleSize}試合)`
	);

	console.log('\n球団       実力  優勝%   CS%   予想勝数(10-50-90%)');
	const sorted = [...result.teams].sort((a, b) => b.championProbability - a.championProbability);
	for (const team of sorted) {
		const index = prepared.teamIds.indexOf(team.teamId);
		console.log(
			[
				getTeam(team.teamId).short.padEnd(6, '　'),
				prepared.strengths[index]!.toFixed(3).padStart(6),
				(team.championProbability * 100).toFixed(1).padStart(6),
				(team.playoffProbability * 100).toFixed(1).padStart(6),
				`   ${team.finalWins.p10}-${team.finalWins.median}-${team.finalWins.p90}`
			].join(' ')
		);
	}

	const distribution = [...result.clinchDateDistribution].sort((a, b) => a[0].localeCompare(b[0]));
	const total = distribution.reduce((sum, [, count]) => sum + count, 0);
	console.log(
		`\n優勝決定日の分布（${((total / result.iterations) * 100).toFixed(1)}%の試行で確定）`
	);
	let cumulative = 0;
	for (const [date, count] of distribution) {
		cumulative += count;
		const share = count / result.iterations;
		if (share < 0.005) continue;
		const bar = '#'.repeat(Math.round(share * 200));
		console.log(
			`  ${date}  ${(share * 100).toFixed(1).padStart(5)}%  累計${((cumulative / result.iterations) * 100).toFixed(1).padStart(5)}%  ${bar}`
		);
	}
	console.log(`  うち最終戦のタイブレーク決着 ${(result.tiebreakDecidedRate * 100).toFixed(1)}%`);
}
