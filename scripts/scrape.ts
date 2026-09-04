/**
 * npb.jp の月別日程ページから全試合を取得して data/<year>/games.json に書き出す。
 *
 *   npm run scrape              -- 当年・全月を取得
 *   npm run scrape -- --year 2025
 *   npm run scrape -- --months 08,09
 *
 * 取得は1日1回を想定。過去月は結果が変わらないので、既存の games.json に
 * 確定済みの試合がある月は --months で絞れるようにしてある。
 */
import { load } from 'cheerio';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_BY_SHORT } from '../src/engine/teams.ts';
import type { Game, GameStatus } from '../src/engine/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USER_AGENT =
	'npb-pennant/0.1 (personal pennant-race calculator; 1 request/day; contact: liver5671@gmail.com)';

/** レギュラーシーズンが載る月 */
const DEFAULT_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11];

interface Args {
	year: number;
	months: number[];
}

function parseArgs(argv: string[]): Args {
	const year = Number(valueOf(argv, '--year') ?? new Date().getFullYear());
	const monthsArg = valueOf(argv, '--months');
	const months = monthsArg ? monthsArg.split(',').map((m) => Number(m.trim())) : DEFAULT_MONTHS;
	if (!Number.isInteger(year)) throw new Error(`--year が不正: ${year}`);
	if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
		throw new Error(`--months が不正: ${monthsArg}`);
	}
	return { year, months };
}

function valueOf(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	return index >= 0 ? argv[index + 1] : undefined;
}

async function fetchMonth(year: number, month: number): Promise<string | null> {
	const mm = String(month).padStart(2, '0');
	const url = `https://npb.jp/games/${year}/schedule_${mm}_detail.html`;
	const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`${url} が ${response.status} を返した`);
	return response.text();
}

/** 全角スペースや連続空白を潰す */
function normalize(text: string): string {
	return text.replace(/　/g, '').replace(/\s+/g, ' ').trim();
}

function parseScore(raw: string): number | null {
	const text = normalize(raw);
	if (!/^\d+$/.test(text)) return null;
	return Number(text);
}

interface ParseResult {
	games: Game[];
	skipped: string[];
}

export function parseMonth(html: string, year: number): ParseResult {
	const $ = load(html);
	const games: Game[] = [];
	const skipped: string[] = [];

	$('#schedule_detail tbody tr[id^="date"]').each((_, element) => {
		const row = $(element);
		const id = row.attr('id') ?? '';
		const match = /^date(\d{2})(\d{2})$/.exec(id);
		if (!match) {
			skipped.push(`日付IDを解釈できない: ${id}`);
			return;
		}
		const [, month, day] = match;
		const date = `${year}-${month}-${day}`;

		const homeShort = normalize(row.find('.team1').first().text());
		const awayShort = normalize(row.find('.team2').first().text());
		if (!homeShort || !awayShort) return;

		const home = TEAM_BY_SHORT.get(homeShort);
		const away = TEAM_BY_SHORT.get(awayShort);
		if (!home || !away) {
			// オールスターなど12球団以外のカード
			skipped.push(`${date} 球団として解釈できないカード: ${homeShort} vs ${awayShort}`);
			return;
		}

		const cancelled = row.find('.cancel').length > 0;
		const homeScore = parseScore(row.find('.score1').first().text());
		const awayScore = parseScore(row.find('.score2').first().text());

		let status: GameStatus;
		if (cancelled) status = 'cancelled';
		else if (homeScore !== null && awayScore !== null) status = 'final';
		else status = 'scheduled';

		const startTime = normalize(row.find('.time').first().text()) || null;

		games.push({
			date,
			home: home.id,
			away: away.id,
			homeScore: status === 'final' ? homeScore : null,
			awayScore: status === 'final' ? awayScore : null,
			status,
			venue: normalize(row.find('.place').first().text()),
			startTime: status === 'final' ? null : startTime
		});
	});

	return { games, skipped };
}

/** 既にあるデータを読む。まだ無ければ空で返す */
async function readExisting(path: string): Promise<Game[]> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as Game[];
	} catch {
		return [];
	}
}

async function main() {
	const { year, months } = parseArgs(process.argv.slice(2));
	const all: Game[] = [];
	const allSkipped: string[] = [];

	for (const month of months) {
		const html = await fetchMonth(year, month);
		if (html === null) {
			console.log(`  ${month}月: ページなし（スキップ）`);
			continue;
		}
		const { games, skipped } = parseMonth(html, year);
		all.push(...games);
		allSkipped.push(...skipped);
		const final = games.filter((g) => g.status === 'final').length;
		const cancelled = games.filter((g) => g.status === 'cancelled').length;
		console.log(
			`  ${month}月: ${games.length}件（確定 ${final} / 中止 ${cancelled} / 予定 ${games.length - final - cancelled}）`
		);
		// npb.jp への負荷を避けるため1秒あける
		await new Promise((r) => setTimeout(r, 1000));
	}

	if (all.length === 0) {
		throw new Error('1件も取得できなかった。HTML構造が変わった可能性がある');
	}

	const outPath = resolve(ROOT, 'data', String(year), 'games.json');

	// --months で一部の月だけ取得したときに、それ以外の月を消してしまわないようにする。
	// 取得した月ぶんだけを既存データから外し、新しい結果で置き換える。
	const fetched = new Set(months.map((month) => String(month).padStart(2, '0')));
	const kept = (await readExisting(outPath)).filter((game) => !fetched.has(game.date.slice(5, 7)));
	const merged = [...kept, ...all].sort(
		(a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home)
	);

	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, JSON.stringify(merged, null, '\t') + '\n', 'utf8');

	console.log(
		`\n${merged.length}試合を ${outPath} に書き出した` +
			(kept.length > 0 ? `（取得しなかった月の ${kept.length}試合はそのまま残した）` : '')
	);
	if (allSkipped.length > 0) {
		console.log(`\nスキップした行 (${allSkipped.length}件):`);
		for (const message of new Set(allSkipped)) console.log(`  - ${message}`);
	}
}

if (process.argv[1] !== undefined && /scrape[.]ts$/.test(process.argv[1])) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
