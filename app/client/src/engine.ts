import type { Script, Step, SubStep } from "../../shared/script.ts";
import { stepDuration, subDuration } from "../../shared/script.ts";

export type ToolStatus = "running" | "ok" | "error" | "stuck" | "stopped";

export type ToolView = { readonly kind: "tool"; readonly id: string; readonly name: string; readonly input: string; readonly output: string; readonly status: ToolStatus; readonly elapsedMs: number };

export type SubView = { readonly kind: "think"; readonly text: string; readonly done: boolean } | { readonly kind: "say"; readonly text: string; readonly done: boolean } | ToolView;

export type ItemView =
	| { readonly kind: "think"; readonly text: string; readonly done: boolean }
	| { readonly kind: "say"; readonly text: string; readonly done: boolean }
	| ToolView
	| { readonly kind: "subagent"; readonly id: string; readonly name: string; readonly task: string; readonly items: ReadonlyArray<SubView>; readonly running: boolean; readonly elapsedMs: number }
	| { readonly kind: "html"; readonly title: string; readonly html: string }
	| { readonly kind: "fail"; readonly summary: string; readonly detail: string }
	| { readonly kind: "restart"; readonly tool: string; readonly checkpoint: string; readonly done: boolean };

export type Phase = "awaiting" | "waiting" | "streaming" | "done" | "stopped" | "failed" | "empty" | "stuck";

export type TurnView = { readonly phase: Phase; readonly items: ReadonlyArray<ItemView>; readonly elapsedMs: number; readonly visible: boolean; readonly restarting: boolean };

export type TraceEvent = { readonly atMs: number; readonly label: string; readonly detail: string };

const reveal = (text: string, fraction: number): string => {
	if (fraction >= 1) return text;
	const cut = Math.floor(text.length * Math.max(0, fraction));
	const space = text.lastIndexOf(" ", cut);
	return text.slice(0, space > cut - 12 && space > 0 ? space : cut);
};

const toolView = (step: { readonly id: string; readonly name: string; readonly input: string; readonly output: string; readonly ok: boolean; readonly ms: number }, local: number, stopped: boolean): ToolView => {
	const finished = local >= step.ms;
	return {
		kind: "tool",
		id: step.id,
		name: step.name,
		input: step.input,
		output: finished ? step.output : "",
		status: finished ? (step.ok ? "ok" : "error") : stopped ? "stopped" : "running",
		elapsedMs: Math.min(local, step.ms),
	};
};

const subItem = (step: SubStep, local: number, stopped: boolean): SubView => {
	switch (step._tag) {
		case "Think":
			return { kind: "think", text: reveal(step.text, local / step.ms), done: local >= step.ms };
		case "Say":
			return { kind: "say", text: reveal(step.text, local / step.ms), done: local >= step.ms };
		case "Tool":
			return toolView(step, local, stopped);
	}
};

const subagentView = (step: Extract<Step, { _tag: "Subagent" }>, local: number, stopped: boolean): ItemView => {
	const items: SubView[] = [];
	let offset = 0;
	for (const sub of step.steps) {
		if (local < offset) break;
		items.push(subItem(sub, local - offset, stopped));
		offset += subDuration(sub);
	}
	const total = stepDuration(step);
	return { kind: "subagent", id: step.id, name: step.name, task: step.task, items, running: local < total && !stopped, elapsedMs: Math.min(local, total) };
};

const itemOf = (step: Step, local: number, stopped: boolean, final: boolean): ItemView | null => {
	switch (step._tag) {
		case "Wait":
			return null;
		case "Think":
			return { kind: "think", text: reveal(step.text, local / step.ms), done: local >= step.ms };
		case "Say":
			return { kind: "say", text: reveal(step.text, local / step.ms), done: local >= step.ms };
		case "Tool":
			return toolView(step, local, stopped);
		case "Stuck":
			return { kind: "tool", id: step.id, name: step.name, input: step.input, output: "", status: final ? "stuck" : stopped ? "stopped" : "running", elapsedMs: Math.min(local, step.ms) };
		case "Subagent":
			return subagentView(step, local, stopped);
		case "Html":
			return local >= step.ms ? { kind: "html", title: step.title, html: step.html } : null;
		case "Fail":
			return { kind: "fail", summary: step.summary, detail: step.detail };
		case "Restart":
			return { kind: "restart", tool: step.tool, checkpoint: step.checkpoint, done: local >= step.ms };
	}
};

const isVisible = (item: ItemView): boolean => item.kind !== "think" && !(item.kind === "say" && item.text.trim() === "");

export const playTurn = (script: Script, elapsedMs: number, stoppedMs: number | null, awaiting: boolean): TurnView => {
	if (awaiting) return { phase: stoppedMs === null ? "awaiting" : "stopped", items: [], elapsedMs: stoppedMs ?? elapsedMs, visible: false, restarting: false };
	const clock = stoppedMs === null ? elapsedMs : Math.min(elapsedMs, stoppedMs);
	const total = script.steps.reduce((sum, step) => sum + stepDuration(step), 0);
	const ended = clock >= total;
	const stopped = stoppedMs !== null && !ended;
	const items: ItemView[] = [];
	let offset = 0;
	let restarting = false;
	for (const step of script.steps) {
		if (clock < offset) break;
		const local = clock - offset;
		const item = itemOf(step, local, stopped, ended);
		if (item !== null) items.push(item);
		if (step._tag === "Restart" && local < step.ms) restarting = true;
		offset += stepDuration(step);
	}
	const visible = items.some(isVisible);
	const failed = items.some((item) => item.kind === "fail");
	const stuck = items.some((item) => item.kind === "tool" && item.status === "stuck");
	const phase: Phase = stopped ? "stopped" : !ended ? (visible || items.length > 0 ? "streaming" : "waiting") : failed ? "failed" : stuck ? "stuck" : visible ? "done" : "empty";
	return { phase, items, elapsedMs: clock, visible, restarting: restarting && !stopped };
};

export const isRunningPhase = (phase: Phase): boolean => phase === "awaiting" || phase === "waiting" || phase === "streaming";

export const traceOf = (script: Script, elapsedMs: number): ReadonlyArray<TraceEvent> => {
	const events: TraceEvent[] = [];
	let offset = 0;
	for (const step of script.steps) {
		if (elapsedMs < offset) break;
		const label = step._tag === "Tool" || step._tag === "Stuck" ? `${step._tag.toLowerCase()} ${step.name}` : step._tag === "Subagent" ? `subagent ${step.name}` : step._tag.toLowerCase();
		const detail = step._tag === "Tool" || step._tag === "Stuck" ? step.input : step._tag === "Subagent" ? step.task : step._tag === "Fail" ? step.summary : step._tag === "Restart" ? step.checkpoint : step._tag === "Wait" ? "time to first token" : step._tag === "Html" ? step.title : `${step.text.length} chars`;
		events.push({ atMs: offset, label, detail });
		offset += stepDuration(step);
	}
	return events;
};

export const plainText = (view: TurnView): string =>
	view.items
		.flatMap((item) => (item.kind === "say" ? [item.text] : item.kind === "fail" ? [item.summary] : []))
		.join("\n\n")
		.trim();

export const formatSeconds = (ms: number): string => `${Math.floor(ms / 1000)}s`;

export const formatTask = (ms: number): string => {
	const seconds = Math.floor(ms / 1000);
	return `task ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};
