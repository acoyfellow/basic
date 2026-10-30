export type Inline = { readonly kind: "text" | "strong" | "em" | "code"; readonly text: string } | { readonly kind: "link"; readonly text: string; readonly href: string };

export type Block =
	| { readonly kind: "heading"; readonly level: number; readonly inline: ReadonlyArray<Inline> }
	| { readonly kind: "paragraph"; readonly inline: ReadonlyArray<Inline> }
	| { readonly kind: "list"; readonly ordered: boolean; readonly items: ReadonlyArray<ReadonlyArray<Inline>> }
	| { readonly kind: "code"; readonly language: string; readonly code: string; readonly closed: boolean }
	| { readonly kind: "table"; readonly head: ReadonlyArray<ReadonlyArray<Inline>>; readonly rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Inline>>> };

const INLINE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;

export const parseInline = (text: string): ReadonlyArray<Inline> => {
	const parts: Inline[] = [];
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		const index = match.index ?? 0;
		if (index > last) parts.push({ kind: "text", text: text.slice(last, index) });
		if (match[2] !== undefined) parts.push({ kind: "strong", text: match[2] });
		else if (match[4] !== undefined) parts.push({ kind: "em", text: match[4] });
		else if (match[6] !== undefined) parts.push({ kind: "code", text: match[6] });
		else if (match[8] !== undefined && match[9] !== undefined) parts.push({ kind: "link", text: match[8], href: match[9] });
		last = index + match[0].length;
	}
	if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
	return parts;
};

const cells = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, "")
		.split("|")
		.map((cell) => parseInline(cell.trim()));

export const parseMarkdown = (source: string): ReadonlyArray<Block> => {
	const lines = source.split("\n");
	const blocks: Block[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] ?? "";
		const fence = /^```(\w*)\s*$/.exec(line);
		if (fence !== null) {
			const body: string[] = [];
			index += 1;
			while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
				body.push(lines[index] ?? "");
				index += 1;
			}
			const closed = index < lines.length;
			blocks.push({ kind: "code", language: fence[1] || "text", code: body.join("\n"), closed });
			index += 1;
			continue;
		}
		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		if (heading !== null) {
			blocks.push({ kind: "heading", level: heading[1]?.length ?? 2, inline: parseInline(heading[2] ?? "") });
			index += 1;
			continue;
		}
		if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] ?? "")) {
			const head = cells(line);
			const rows: ReadonlyArray<Inline>[][] = [];
			index += 2;
			while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] ?? "")) {
				rows.push([...cells(lines[index] ?? "")]);
				index += 1;
			}
			blocks.push({ kind: "table", head, rows });
			continue;
		}
		const bullet = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
		if (bullet !== null) {
			const ordered = /\d/.test(bullet[1] ?? "");
			const items: ReadonlyArray<Inline>[] = [];
			while (index < lines.length) {
				const item = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[index] ?? "");
				if (item === null) break;
				items.push(parseInline(item[2] ?? ""));
				index += 1;
			}
			blocks.push({ kind: "list", ordered, items });
			continue;
		}
		if (line.trim() === "") {
			index += 1;
			continue;
		}
		const paragraph: string[] = [line];
		index += 1;
		while (index < lines.length && (lines[index] ?? "").trim() !== "" && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s|\s*\|.*\|\s*$)/.test(lines[index] ?? "")) {
			paragraph.push(lines[index] ?? "");
			index += 1;
		}
		blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" ")) });
	}
	return blocks;
};
