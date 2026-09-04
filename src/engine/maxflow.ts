/**
 * 最小限の最大流（Dinic 法）。
 * 敗退判定のネットワークは「ペアノード最大10＋球団ノード5」程度なので、
 * ライブラリを持ち込まずここで完結させる。
 */
export class MaxFlow {
	private readonly graph: { to: number; cap: number; rev: number }[][];

	constructor(nodeCount: number) {
		this.graph = Array.from({ length: nodeCount }, () => []);
	}

	addEdge(from: number, to: number, capacity: number): void {
		const forward = this.graph[from];
		const backward = this.graph[to];
		if (!forward || !backward) throw new Error(`ノード範囲外: ${from} -> ${to}`);
		forward.push({ to, cap: capacity, rev: backward.length });
		backward.push({ to: from, cap: 0, rev: forward.length - 1 });
	}

	run(source: number, sink: number): number {
		let flow = 0;
		for (;;) {
			const level = this.levels(source);
			if (level[sink] === undefined || level[sink] < 0) return flow;
			const iter = new Array<number>(this.graph.length).fill(0);
			for (;;) {
				const pushed = this.augment(source, sink, Infinity, level, iter);
				if (pushed <= 0) break;
				flow += pushed;
			}
		}
	}

	private levels(source: number): number[] {
		const level = new Array<number>(this.graph.length).fill(-1);
		level[source] = 0;
		const queue = [source];
		while (queue.length > 0) {
			const node = queue.shift()!;
			for (const edge of this.graph[node] ?? []) {
				if (edge.cap > 0 && level[edge.to] === -1) {
					level[edge.to] = (level[node] ?? 0) + 1;
					queue.push(edge.to);
				}
			}
		}
		return level;
	}

	private augment(
		node: number,
		sink: number,
		limit: number,
		level: number[],
		iter: number[]
	): number {
		if (node === sink) return limit;
		const edges = this.graph[node] ?? [];
		for (; (iter[node] ?? 0) < edges.length; iter[node] = (iter[node] ?? 0) + 1) {
			const edge = edges[iter[node] ?? 0];
			if (!edge) continue;
			if (edge.cap <= 0) continue;
			if ((level[edge.to] ?? -1) !== (level[node] ?? -1) + 1) continue;

			const pushed = this.augment(edge.to, sink, Math.min(limit, edge.cap), level, iter);
			if (pushed > 0) {
				edge.cap -= pushed;
				const back = this.graph[edge.to]?.[edge.rev];
				if (back) back.cap += pushed;
				return pushed;
			}
		}
		return 0;
	}
}
