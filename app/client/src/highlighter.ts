import type { Token } from "./highlight.ts";

type Tokenize = (source: string, language: string) => ReadonlyArray<Token>;

const loaded: { tokenize: Tokenize | null } = { tokenize: null };

export const loadHighlighter = async () => {
	const module = await import("./highlight.ts");
	loaded.tokenize = module.tokenize;
};

export const highlighted = (source: string, language: string): ReadonlyArray<Token> | null => loaded.tokenize?.(source, language) ?? null;
