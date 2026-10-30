import { Schema } from "effect";

export const SubStep = Schema.Union([
	Schema.TaggedStruct("Think", { text: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Say", { text: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Tool", { id: Schema.String, name: Schema.String, input: Schema.String, output: Schema.String, ms: Schema.Number, ok: Schema.Boolean }),
]);

export type SubStep = typeof SubStep.Type;

export const Step = Schema.Union([
	Schema.TaggedStruct("Wait", { ms: Schema.Number }),
	Schema.TaggedStruct("Think", { text: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Say", { text: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Tool", { id: Schema.String, name: Schema.String, input: Schema.String, output: Schema.String, ms: Schema.Number, ok: Schema.Boolean }),
	Schema.TaggedStruct("Stuck", { id: Schema.String, name: Schema.String, input: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Subagent", { id: Schema.String, name: Schema.String, task: Schema.String, steps: Schema.Array(SubStep) }),
	Schema.TaggedStruct("Html", { title: Schema.String, html: Schema.String, ms: Schema.Number }),
	Schema.TaggedStruct("Fail", { summary: Schema.String, detail: Schema.String }),
	Schema.TaggedStruct("Restart", { tool: Schema.String, checkpoint: Schema.String, ms: Schema.Number }),
]);

export type Step = typeof Step.Type;

export const Script = Schema.Struct({ name: Schema.String, steps: Schema.Array(Step) });

export type Script = typeof Script.Type;

const wait = (ms: number): Step => ({ _tag: "Wait", ms });
const think = (text: string, ms: number): Step => ({ _tag: "Think", text, ms });
const say = (text: string, ms: number): Step => ({ _tag: "Say", text, ms });
const tool = (id: string, name: string, input: string, output: string, ms: number, ok = true): Step => ({ _tag: "Tool", id, name, input, output, ms, ok });
const subThink = (text: string, ms: number): SubStep => ({ _tag: "Think", text, ms });
const subSay = (text: string, ms: number): SubStep => ({ _tag: "Say", text, ms });
const subTool = (id: string, name: string, input: string, output: string, ms: number, ok = true): SubStep => ({ _tag: "Tool", id, name, input, output, ms, ok });

const EXPLAIN = `## Durable Objects in one minute

A **Durable Object** is a single instance of a class with its own storage. Every request for the same name reaches the same instance, so you get *one writer* without a lock.

- One object per chat, per user or per document.
- Storage is SQLite, local to the object.
- The object sleeps when idle and wakes on the next request.

\`\`\`ts
export class Counter extends DurableObject {
  async increment(): Promise<number> {
    const next = ((await this.ctx.storage.get<number>("n")) ?? 0) + 1;
    await this.ctx.storage.put("n", next);
    return next;
  }
}
\`\`\`

| Need | Use |
| --- | --- |
| One writer per key | Durable Object |
| Global reads | KV |
| Big files | R2 |

Ask me to **run the tests** to see tool calls, or to **plan with subagents** to see delegation.`;

const CODE = `Here is the same idea in three languages.

\`\`\`ts
const greet = (name: string): string => \`Hello, \${name}\`;
console.log(greet("world"));
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}"

print(greet("world"))
\`\`\`

\`\`\`sh
echo "Hello, world" | tr a-z A-Z
\`\`\`

Use the **copy** button on a block to take just the code.`;

const COUNT = Array.from({ length: 30 }, (_, index) => `${index + 1}`).join("\n\n");

const TRACEBACK = `TypeError: Cannot read properties of undefined (reading 'id')
    at normaliseInvoice (src/billing/normalise.ts:41:23)
    at Array.map (<anonymous>)
    at buildStatement (src/billing/statement.ts:88:31)
    at async StatementWorkflow.run (src/billing/workflow.ts:52:18)
    at async WorkflowEntrypoint.dispatch (node_modules/cloudflare/workflows.js:211:9)
Caused by: invoice inv_0193 has no customer record (deleted 2026-10-02)`;

const CHART = `<!doctype html><html><head><style>
body{margin:0;font:13px system-ui,sans-serif;color:#18181b;background:#fff;padding:14px}
h3{margin:0 0 10px;font-size:13px;font-weight:600}
.row{display:grid;grid-template-columns:72px 1fr 40px;gap:8px;align-items:center;margin:6px 0}
.bar{height:12px;border-radius:6px;background:#7c5cff}
.n{text-align:right;font-variant-numeric:tabular-nums;color:#5c5c66}
@media (prefers-color-scheme:dark){body{background:#18181b;color:#ececee}.n{color:#a1a1aa}}
</style></head><body><h3>p95 latency by region (ms)</h3>
<div class="row"><span>us-east</span><div class="bar" style="width:38%"></div><span class="n">38</span></div>
<div class="row"><span>eu-west</span><div class="bar" style="width:44%"></div><span class="n">44</span></div>
<div class="row"><span>ap-south</span><div class="bar" style="width:71%"></div><span class="n">71</span></div>
<div class="row"><span>sa-east</span><div class="bar" style="width:92%"></div><span class="n">92</span></div>
</body></html>`;

export const SCRIPTS: Readonly<Record<string, Script>> = {
	explain: {
		name: "explain",
		steps: [wait(500), think("The reader wants the short version. Lead with what an object is, then one code sample and a table that maps needs to products.", 1200), say(EXPLAIN, 5200)],
	},
	fast: { name: "fast", steps: [wait(120), say("ok", 80)] },
	slow: { name: "slow", steps: [wait(500), say(COUNT, 30000)] },
	code: { name: "code", steps: [wait(450), say(CODE, 3800)] },
	tools: {
		name: "tools",
		steps: [
			wait(500),
			think("Read the failing test first, then run the suite, then patch the smallest thing.", 900),
			tool("t1", "read_file", '{ "path": "src/cart.ts" }', "export const total = (items) => items.reduce((sum, item) => sum + item.price, 0);", 1400),
			tool("t2", "run_tests", '{ "filter": "cart" }', "✗ total counts quantity (expected 30, got 10)\n1 failed, 11 passed", 3600, false),
			tool("t3", "edit_file", '{ "path": "src/cart.ts", "find": "item.price", "replace": "item.price * item.quantity" }', "1 change written", 1100),
			tool("t4", "run_tests", '{ "filter": "cart" }', "12 passed", 2600),
			say("The total ignored **quantity**. I changed one line in `src/cart.ts`:\n\n```ts\nexport const total = (items) =>\n  items.reduce((sum, item) => sum + item.price * item.quantity, 0);\n```\n\nAll 12 cart tests pass now.", 2600),
		],
	},
	long: {
		name: "long",
		steps: [
			wait(400),
			think("This is a long job. Index the repo, then check each package in turn.", 1500),
			tool("l1", "index_repo", '{ "root": "." }', "1,284 files indexed", 12000),
			tool("l2", "typecheck", '{ "workspace": "all" }', "0 errors in 14 packages", 24000),
			tool("l3", "run_tests", '{ "workspace": "all" }', "418 passed", 30000),
			say("Everything is green: 1,284 files indexed, 0 type errors and 418 passing tests.", 2000),
		],
	},
	subagents: {
		name: "subagents",
		steps: [
			wait(400),
			think("Split the work: one subagent reads the current schema, one reviews the plan for risk.", 1100),
			{
				_tag: "Subagent",
				id: "s1",
				name: "researcher",
				task: "Read the current schema and list the tables that change.",
				steps: [subThink("Start from the migrations folder.", 600), subTool("s1t1", "list_files", '{ "glob": "migrations/*.sql" }', "0001_init.sql\n0002_orders.sql\n0003_refunds.sql", 1200), subSay("Three migrations. **orders** and **refunds** both gain a `currency` column.", 1600)],
			},
			{
				_tag: "Subagent",
				id: "s2",
				name: "reviewer",
				task: "Review the plan for data loss and lock time.",
				steps: [subTool("s2t1", "estimate_lock", '{ "table": "orders", "rows": 4200000 }', "ALTER ... ADD COLUMN with a default: 40 ms metadata-only change", 1500), subSay("No rewrite is needed, so the lock is about **40 ms**. Backfill in batches of 10,000.", 1500)],
			},
			say("## Plan\n\n1. Add `currency` to **orders** and **refunds** with a default of `'USD'`.\n2. Backfill in batches of 10,000 rows.\n3. Make the column required after the backfill.\n\nBoth subagents agree the lock stays near 40 ms.", 3200),
		],
	},
	html: {
		name: "html",
		steps: [wait(400), say("Here is the latency chart as inline HTML. It runs in a sandboxed frame with no scripts.", 1500), { _tag: "Html", title: "p95 latency by region", html: CHART, ms: 300 }, say("**sa-east** is the outlier at 92 ms.", 900)],
	},
	error: {
		name: "error",
		steps: [
			wait(400),
			tool("e1", "run_workflow", '{ "name": "monthly-statement" }', TRACEBACK, 2200, false),
			{ _tag: "Fail", summary: "The statement workflow failed: invoice inv_0193 has no customer record.", detail: TRACEBACK },
		],
	},
	empty: { name: "empty", steps: [wait(900)] },
	stuck: { name: "stuck", steps: [wait(300), say("Deploying the preview now.", 700), { _tag: "Stuck", id: "k1", name: "deploy_preview", input: '{ "branch": "feature/cart" }', ms: 2600 }] },
	restart: {
		name: "restart",
		steps: [
			wait(300),
			tool("r1", "run_migrations", '{ "steps": 4 }', "checkpoint 2 of 4 saved", 1800),
			{ _tag: "Restart", tool: "run_migrations", checkpoint: "checkpoint 2 of 4", ms: 900 },
			tool("r2", "run_migrations", '{ "from": "checkpoint 2 of 4" }', "4 of 4 applied", 1600),
			say("All 4 migrations are applied. The run continued from checkpoint 2 after the restart, so nothing ran twice.", 1800),
		],
	},
};

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
	[/count slowly|\bslow\b/i, "slow"],
	[/single word|^\s*(ok|hi|hello)\s*$/i, "fast"],
	[/subagent|delegate|\bteam\b/i, "subagents"],
	[/\bhtml\b|chart|preview as/i, "html"],
	[/\bempty\b|nothing visible|no reply/i, "empty"],
	[/\bstuck\b|\bhang/i, "stuck"],
	[/restart|resume/i, "restart"],
	[/\blong\b|minutes/i, "long"],
	[/run the tests|\btests?\b|\bfix\b|\btools?\b/i, "tools"],
	[/show the error|\berror\b|workflow/i, "error"],
	[/\bcode\b|snippet|languages/i, "code"],
];

export const pickScript = (prompt: string): Script => SCRIPTS[RULES.find(([pattern]) => pattern.test(prompt))?.[1] ?? "explain"] ?? { name: "explain", steps: [] };

export const subDuration = (step: SubStep): number => step.ms;

export const stepDuration = (step: Step): number => {
	switch (step._tag) {
		case "Subagent":
			return step.steps.reduce((sum, sub) => sum + subDuration(sub), 0);
		case "Fail":
			return 0;
		default:
			return step.ms;
	}
};

export const scriptDuration = (script: Script): number => script.steps.reduce((sum, step) => sum + stepDuration(step), 0);

export const DEFAULT_STARTERS: ReadonlyArray<string> = ["Run the tests and fix what fails", "Plan a schema change with subagents", "Show a latency chart as inline HTML", "Explain Durable Objects in one minute"];
