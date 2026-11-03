export const notPointer = (page) =>
	page.$$eval("button:not(:disabled), a[href], summary, [role=button], [role=menuitem]", (nodes) =>
		nodes
			.filter((node) => {
				const box = node.getBoundingClientRect();
				return box.width > 0 && box.height > 0 && getComputedStyle(node).cursor !== "pointer";
			})
			.map((node) => node.id || node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 30) || node.tagName),
	);

const UNGROUPED = /(?<![\w.,:/#@$-])\d{5,}(?![\w.,:/%-]?\d|[\w/])/;

export const ungroupedNumbers = (page, selector) =>
	page.$$eval(selector, (nodes, pattern) => nodes.map((node) => node.textContent ?? "").filter((text) => new RegExp(pattern).test(text)), UNGROUPED.source);
