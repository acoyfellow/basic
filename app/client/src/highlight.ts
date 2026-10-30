export type Token = { readonly text: string; readonly kind: "plain" | "keyword" | "string" | "number" | "comment" | "fn" };

const KEYWORDS = new Set([
	"const",
	"let",
	"var",
	"function",
	"return",
	"if",
	"else",
	"for",
	"while",
	"class",
	"extends",
	"async",
	"await",
	"export",
	"import",
	"from",
	"new",
	"def",
	"print",
	"type",
	"interface",
	"true",
	"false",
	"null",
	"undefined",
	"echo",
	"curl",
]);

const PATTERN = /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

export const tokenize = (source: string, language: string): ReadonlyArray<Token> => {
	const tokens: Token[] = [];
	let last = 0;
	const hashComments = language === "python" || language === "sh" || language === "bash";
	for (const match of source.matchAll(PATTERN)) {
		const index = match.index ?? 0;
		if (index > last) tokens.push({ text: source.slice(last, index), kind: "plain" });
		const [whole, comment, text, number, fn, word] = match;
		if (comment !== undefined && (comment.startsWith("//") || hashComments)) tokens.push({ text: whole, kind: "comment" });
		else if (comment !== undefined) tokens.push({ text: whole, kind: "plain" });
		else if (text !== undefined) tokens.push({ text: whole, kind: "string" });
		else if (number !== undefined) tokens.push({ text: whole, kind: "number" });
		else if (fn !== undefined) tokens.push({ text: whole, kind: KEYWORDS.has(fn) ? "keyword" : "fn" });
		else if (word !== undefined) tokens.push({ text: whole, kind: KEYWORDS.has(word) ? "keyword" : "plain" });
		last = index + whole.length;
	}
	if (last < source.length) tokens.push({ text: source.slice(last), kind: "plain" });
	return tokens;
};
