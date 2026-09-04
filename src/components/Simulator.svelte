<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { FixtureOverride, SeasonSeed, SimulationResult } from '../engine/simulate.ts';
	import type { LeagueId, TeamId } from '../engine/types.ts';
	import { getTeam, LEAGUE_NAMES } from '../engine/teams.ts';
	import { percent, shortDate } from '../lib/format.ts';
	import type { WorkerRequest, WorkerResponse } from '../workers/simulate.worker.ts';

	type Mode = 'auto' | 'winAll' | 'loseAll';

	interface Props {
		seeds: Record<LeagueId, SeasonSeed>;
	}

	const { seeds }: Props = $props();

	let league = $state<LeagueId>('central');
	let modes = $state<Record<string, Mode>>({});
	let iterations = $state(20000);
	let results = $state<Record<string, SimulationResult | null>>({
		central: null,
		pacific: null
	});
	let running = $state(false);
	let failure = $state<string | null>(null);
	/** ワーカー側で init が済んだリーグ */
	let ready = $state<Record<string, boolean>>({ central: false, pacific: false });
	/** init 待ちで見送った実行があるか */
	let queued = $state(false);

	let worker: Worker | null = null;
	let requestId = 0;
	let pendingId = 0;

	const seed = $derived(seeds[league]);
	const result = $derived(results[league] ?? null);

	/**
	 * 各球団に設定したモードから、1試合ごとの結果を決める。
	 * 両チームが「全勝」（または両方「全敗」）だと矛盾するので、その試合だけは確率に任せる。
	 */
	function buildOverrides(current: SeasonSeed, current_modes: Record<string, Mode>) {
		const overrides: FixtureOverride[] = [];
		let conflicts = 0;

		current.fixtures.forEach((fixture, index) => {
			const home = current_modes[fixture.home] ?? 'auto';
			const away = current_modes[fixture.away] ?? 'auto';
			if (home === 'auto' && away === 'auto') return;

			const homeWants = home === 'winAll' ? 1 : home === 'loseAll' ? -1 : 0;
			const awayWants = away === 'winAll' ? -1 : away === 'loseAll' ? 1 : 0;
			const total = homeWants + awayWants;

			if (total === 0 && homeWants !== 0) {
				conflicts++;
				return;
			}
			if (total > 0) overrides.push({ index, result: 'home' });
			else if (total < 0) overrides.push({ index, result: 'away' });
		});

		return { overrides, conflicts };
	}

	const built = $derived(seed ? buildOverrides(seed, modes) : { overrides: [], conflicts: 0 });

	/**
	 * ワーカーへ送る前に素のオブジェクトへ落とす。
	 *
	 * Svelte が props や $state をプロキシで包むため、そのまま postMessage すると
	 * 構造化複製アルゴリズムがプロキシを扱えず DataCloneError で落ちる。
	 * 送るのは数値・文字列・配列だけなので JSON 経由で剥がすのが確実。
	 */
	function send(message: WorkerRequest) {
		if (!worker) return;
		worker.postMessage(JSON.parse(JSON.stringify(message)) as WorkerRequest);
	}

	function run() {
		if (!worker || !seed) return;
		// init の完了前に走らせない。完了時にあらためて run する
		if (!ready[league]) {
			queued = true;
			return;
		}
		running = true;
		failure = null;
		pendingId = ++requestId;
		send({ type: 'run', id: pendingId, league, overrides: built.overrides, iterations });
	}

	function setMode(teamId: TeamId, mode: Mode) {
		modes = { ...modes, [teamId]: modes[teamId] === mode ? 'auto' : mode };
		run();
	}

	function reset() {
		modes = {};
		run();
	}

	onMount(() => {
		worker = new Worker(new URL('../workers/simulate.worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			if (message.type === 'error') {
				failure = message.message;
				running = false;
				return;
			}
			if (message.type === 'ready') {
				ready = { ...ready, [message.league]: true };
				// 初期化待ちで見送った実行があればここで走らせる
				if (queued && ready[league]) {
					queued = false;
					run();
				}
				return;
			}
			if (message.type === 'result') {
				// 古いリクエストの結果は捨てる
				if (message.id !== pendingId) return;
				results = { ...results, [message.league]: message.result };
				running = false;
			}
		};
		for (const id of ['central', 'pacific'] as LeagueId[]) {
			send({ type: 'init', id: ++requestId, league: id, seed: seeds[id] });
		}
		run();
	});

	onDestroy(() => worker?.terminate());

	const teamRows = $derived(
		seed
			? seed.teamIds
					.map((teamId, index) => ({
						teamId,
						team: getTeam(teamId),
						wins: seed.wins[index] ?? 0,
						losses: seed.losses[index] ?? 0,
						draws: seed.draws[index] ?? 0,
						championProbability:
							result?.teams.find((t) => t.teamId === teamId)?.championProbability ?? 0,
						playoffProbability:
							result?.teams.find((t) => t.teamId === teamId)?.playoffProbability ?? 0,
						medianWins: result?.teams.find((t) => t.teamId === teamId)?.finalWins.median ?? 0
					}))
					.sort((a, b) => b.championProbability - a.championProbability)
			: []
	);

	const clinchSummary = $derived.by(() => {
		if (!result) return null;
		const points = [...result.clinchDateDistribution].sort((a, b) => a[0].localeCompare(b[0]));
		let cumulative = 0;
		let median: string | null = null;
		for (const [date, count] of points) {
			cumulative += count / result.iterations;
			if (median === null && cumulative >= 0.5) median = date;
		}
		return median;
	});
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-center gap-3">
		<div class="inline-flex overflow-hidden rounded-lg border" style="border-color: var(--line)">
			{#each ['central', 'pacific'] as const as id (id)}
				<button
					type="button"
					class="px-3.5 py-1.5 text-sm"
					style={league === id
						? 'background: var(--ink); color: var(--card); font-weight: 600'
						: 'color: var(--ink-soft)'}
					onclick={() => {
						league = id;
						run();
					}}
				>
					{LEAGUE_NAMES[id].short}
				</button>
			{/each}
		</div>

		<button
			type="button"
			class="rounded-lg border px-3 py-1.5 text-sm"
			style="border-color: var(--line); color: var(--ink-soft)"
			onclick={reset}
		>
			条件をリセット
		</button>

		<span class="text-xs" style="color: var(--ink-faint)">
			{#if running}
				計算中…
			{:else if result}
				{result.iterations.toLocaleString('ja-JP')}試行 / {result.elapsedMs}ms
			{/if}
		</span>
	</div>

	{#if failure}
		<p class="rounded-lg p-3 text-sm" style="background: var(--card); color: var(--bad)">
			計算に失敗しました: {failure}
		</p>
	{/if}

	<div class="card scroll-x">
		<table class="tnum w-full min-w-[40rem] border-collapse text-sm">
			<thead>
				<tr style="color: var(--ink-soft); border-color: var(--line)" class="border-b text-xs">
					<th class="px-3 py-2.5 text-left font-medium">球団</th>
					<th class="px-2 py-2.5 text-right font-medium">現在</th>
					<th class="px-3 py-2.5 text-center font-medium">残り試合の仮定</th>
					<th class="px-3 py-2.5 text-right font-medium">優勝</th>
					<th class="px-2 py-2.5 text-right font-medium">CS</th>
					<th class="px-2 py-2.5 text-right font-medium">予想勝数</th>
				</tr>
			</thead>
			<tbody>
				{#each teamRows as row (row.teamId)}
					<tr style="border-color: var(--line)" class="border-b last:border-b-0">
						<td class="px-3 py-2.5">
							<span class="flex items-center gap-2 whitespace-nowrap">
								<span
									aria-hidden="true"
									class="inline-block h-3.5 w-1 rounded-full"
									style={`background: ${row.team.color}`}
								></span>
								{row.team.short}
							</span>
						</td>
						<td class="px-2 py-2.5 text-right text-xs" style="color: var(--ink-soft)">
							{row.wins}-{row.losses}-{row.draws}
						</td>
						<td class="px-3 py-2.5">
							<div class="flex justify-center gap-1">
								{#each [{ mode: 'winAll' as Mode, label: '全勝' }, { mode: 'loseAll' as Mode, label: '全敗' }] as option (option.mode)}
									{@const active = (modes[row.teamId] ?? 'auto') === option.mode}
									<button
										type="button"
										class="rounded border px-2 py-0.5 text-xs"
										style={active
											? `border-color: ${row.team.color}; background: ${row.team.color}; color: ${row.team.color === '#f2c200' || row.team.color === '#f5c400' ? '#14181d' : '#fff'}; font-weight: 600`
											: 'border-color: var(--line); color: var(--ink-faint)'}
										aria-pressed={active}
										onclick={() => setMode(row.teamId, option.mode)}
									>
										{option.label}
									</button>
								{/each}
							</div>
						</td>
						<td class="px-3 py-2.5 text-right font-semibold">
							{percent(row.championProbability)}
						</td>
						<td class="px-2 py-2.5 text-right" style="color: var(--ink-soft)">
							{percent(row.playoffProbability)}
						</td>
						<td class="px-2 py-2.5 text-right" style="color: var(--ink-soft)">
							{row.medianWins}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-wrap items-baseline justify-between gap-3 text-sm">
		<p style="color: var(--ink-soft)">
			{#if clinchSummary}
				この条件だと、優勝が決まる日の中央値は
				<strong style="color: var(--ink)">{shortDate(clinchSummary)}</strong>。
			{/if}
		</p>
		{#if built.overrides.length > 0}
			<p class="text-xs" style="color: var(--ink-faint)">
				{built.overrides.length}試合の結果を固定中
				{#if built.conflicts > 0}
					（うち{built.conflicts}試合は両チームの指定が矛盾するため確率に任せている）
				{/if}
			</p>
		{/if}
	</div>

	<div class="flex items-center gap-3 text-xs" style="color: var(--ink-faint)">
		<label for="iterations">試行回数</label>
		<input
			id="iterations"
			type="range"
			min="2000"
			max="100000"
			step="2000"
			bind:value={iterations}
			onchange={run}
			class="max-w-56 flex-1"
		/>
		<span class="tnum">{iterations.toLocaleString('ja-JP')}</span>
	</div>
</div>
