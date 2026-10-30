import { DurableObject } from "cloudflare:workers";
import { Schema } from "effect";
import { ACCOUNTS, ClientFrame, type Me, SESSION_COOKIE, type ServerFrame } from "../shared/protocol.ts";
import { pickScript } from "../shared/script.ts";

type Env = { readonly ASSETS: Fetcher; readonly SESSIONS: DurableObjectNamespace<Sessions> };

const SessionRecord = Schema.Struct({ email: Schema.String, account: Schema.NullOr(Schema.String), revoked: Schema.Boolean, expired: Schema.Boolean });

type SessionRecord = typeof SessionRecord.Type;

const decodeRecord = Schema.decodeUnknownOption(SessionRecord);
const decodeFrame = Schema.decodeUnknownOption(Schema.fromJsonString(ClientFrame));
const decodeAccount = Schema.decodeUnknownOption(Schema.Struct({ account: Schema.String }));

export class Sessions extends DurableObject<Env> {
	async read(): Promise<SessionRecord | null> {
		const stored = decodeRecord(await this.ctx.storage.get("session"));
		return stored._tag === "Some" ? stored.value : null;
	}

	async create(email: string): Promise<void> {
		await this.ctx.storage.put("session", { email, account: null, revoked: false, expired: false } satisfies SessionRecord);
	}

	async patch(change: Partial<SessionRecord>): Promise<void> {
		const current = await this.read();
		if (current !== null) await this.ctx.storage.put("session", { ...current, ...change });
	}
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

const refuse = (reason: string) => json({ error: reason, signIn: "/auth/sign-in" }, 401);

const SESSION_ID = /^[a-f0-9-]{36}$/;

const cookieOf = (request: Request) => {
	const value =
		(request.headers.get("cookie") ?? "")
			.split(";")
			.map((part) => part.trim().split("="))
			.find(([name]) => name === SESSION_COOKIE)?.[1] ?? "";
	return SESSION_ID.test(value) ? value : null;
};

const sessionCookie = (value: string, maxAge: number, secure: boolean) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`;

const isSecure = (request: Request) => new URL(request.url).protocol === "https:";

const safeReturn = (value: string | null) => (value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/");

const stubFor = (env: Env, id: string) => env.SESSIONS.get(env.SESSIONS.idFromName(id));

type Session = { readonly id: string; readonly record: SessionRecord };

const sessionOf = async (request: Request, env: Env): Promise<Session | "missing" | "expired"> => {
	const id = cookieOf(request);
	if (id === null) return "missing";
	const record = await stubFor(env, id).read();
	if (record === null || record.revoked) return "missing";
	if (record.expired) return "expired";
	return { id, record };
};

const sameOrigin = (request: Request) => request.headers.get("origin") === new URL(request.url).origin;

const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const identityProvider = (returnTo: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in to Cloudflare (simulated)</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px system-ui,sans-serif;background:#f5f0ff;color:#18181b}main{background:#fff;border:1px solid #ddd0fb;border-radius:14px;padding:28px;max-width:400px;width:calc(100% - 40px)}h1{font-size:19px;margin:14px 0 6px}p{color:#5c5c66;margin:0 0 18px;line-height:1.5}label{display:block;font-size:13px;margin:0 0 6px;color:#5c5c66}input{width:100%;box-sizing:border-box;font:inherit;padding:9px 11px;border:1px solid #d4d4d0;border-radius:8px;margin-bottom:16px}.row{display:flex;gap:8px}button{font:inherit;font-weight:500;padding:9px 14px;border-radius:8px;cursor:pointer}.go{background:#7c5cff;color:#fff;border:1px solid #7c5cff}.no{background:#fff;color:#18181b;border:1px solid #d4d4d0}small{display:block;margin-top:16px;color:#8a8a93}</style></head>
<body><main><img src="/brand/cloudflare-cloud.svg" alt="Cloudflare" width="66" height="30"><h1>Allow basic to know who you are?</h1><p>This is a simulated Cloudflare sign-in page. basic gets your email address and nothing else.</p>
<form method="post" action="/idp/decide"><input type="hidden" name="return" value="${escapeHtml(returnTo)}"><label for="email">Email</label><input id="email" name="email" type="email" value="reader@example.com" required><div class="row"><button class="go" id="allow" name="decision" value="allow">Allow</button><button class="no" id="cancel" name="decision" value="cancel" formnovalidate>Cancel</button></div></form><small>No password. No model. Nothing leaves this page.</small></main></body></html>`;

const socket = async (request: Request, env: Env) => {
	if (request.headers.get("upgrade") !== "websocket") return json({ error: "Expected a WebSocket upgrade" }, 426);
	const session = await sessionOf(request, env);
	if (session === "missing") return refuse("Not signed in");
	const pair = new WebSocketPair();
	const client = pair[0];
	const server = pair[1];
	server.accept();
	const send = (frame: ServerFrame) => server.send(JSON.stringify(frame));
	if (session === "expired") {
		send({ _tag: "Expired" });
		server.close(4001, "session expired");
		return new Response(null, { status: 101, webSocket: client });
	}
	send({ _tag: "Hello", email: session.record.email });
	server.addEventListener("message", async (event) => {
		const frame = decodeFrame(typeof event.data === "string" ? event.data : "");
		if (frame._tag === "None") return;
		if (frame.value._tag === "Ping") return send({ _tag: "Pong" });
		const fresh = await stubFor(env, session.id).read();
		if (fresh === null || fresh.revoked || fresh.expired) {
			send({ _tag: "Expired" });
			return server.close(4001, "session expired");
		}
		send({ _tag: "Scripted", turnId: frame.value.turnId, script: pickScript(frame.value.prompt) });
	});
	return new Response(null, { status: 101, webSocket: client });
};

const api = async (request: Request, env: Env, path: string) => {
	if (path === "/api/ws") return socket(request, env);
	const session = await sessionOf(request, env);
	if (session === "missing") return refuse("Not signed in");
	if (session === "expired") return refuse("Your session expired");
	if (request.method !== "GET" && !sameOrigin(request)) return json({ error: "Writes must come from the app origin" }, 403);
	if (path === "/api/me" && request.method === "GET") return json({ email: session.record.email, account: session.record.account, accounts: ACCOUNTS } satisfies Me);
	if (path === "/api/account" && request.method === "POST") {
		const body = decodeAccount(await request.json().catch(() => null));
		if (body._tag === "None" || !ACCOUNTS.includes(body.value.account)) return json({ error: "Pick one of the listed accounts" }, 400);
		await stubFor(env, session.id).patch({ account: body.value.account });
		return json({ ok: true });
	}
	if (path === "/api/debug/expire" && request.method === "POST") {
		await stubFor(env, session.id).patch({ expired: true });
		return json({ ok: true });
	}
	return json({ error: "Not found" }, 404);
};

const signOut = async (request: Request, env: Env) => {
	if (!sameOrigin(request)) return json({ error: "Writes must come from the app origin" }, 403);
	const id = cookieOf(request);
	if (id !== null) await stubFor(env, id).patch({ revoked: true });
	return new Response(null, { status: 303, headers: { location: "/?signed_out=1", "set-cookie": sessionCookie("", 0, isSecure(request)), "cache-control": "no-store" } });
};

const decide = async (request: Request, env: Env, origin: string) => {
	const form = await request.formData();
	const returnTo = safeReturn(String(form.get("return") ?? "/"));
	if (form.get("decision") !== "allow") return Response.redirect(`${origin}/?error=cancelled&return=${encodeURIComponent(returnTo)}`, 303);
	const email = String(form.get("email") ?? "").trim();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.redirect(`${origin}/?error=failed&return=${encodeURIComponent(returnTo)}`, 303);
	const id = crypto.randomUUID();
	await stubFor(env, id).create(email);
	return new Response(null, { status: 303, headers: { location: returnTo, "set-cookie": sessionCookie(id, 60 * 60 * 24 * 7, isSecure(request)), "cache-control": "no-store" } });
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/")) return api(request, env, url.pathname);
		if (url.pathname === "/auth/sign-in") return Response.redirect(`${url.origin}/idp?return=${encodeURIComponent(safeReturn(url.searchParams.get("return")))}`, 302);
		if (url.pathname === "/auth/sign-out" && request.method === "POST") return signOut(request, env);
		if (url.pathname === "/idp" && request.method === "GET")
			return new Response(identityProvider(safeReturn(url.searchParams.get("return"))), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
		if (url.pathname === "/idp/decide" && request.method === "POST") return decide(request, env, url.origin);
		const asset = await env.ASSETS.fetch(request);
		const headers = new Headers(asset.headers);
		if ((headers.get("content-type") ?? "").includes("text/html")) headers.set("cache-control", "no-store");
		return new Response(asset.body, { status: asset.status, headers });
	},
} satisfies ExportedHandler<Env>;
