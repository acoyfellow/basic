const measure = (page, selector) =>
	page.$eval(selector, (element) => ({ height: Math.round(element.getBoundingClientRect().height), client: element.clientHeight, scroll: element.scrollHeight }));

const scrollsEarly = ({ client, scroll }, limit) => scroll > client + 1 && client < limit - 4;

export const checkComposerFits = async (page, selector, { limit = 160, narrow = 360, wide = 1280, height = 800 } = {}) => {
	const problems = [];
	const original = page.viewportSize();
	const at = async (width, label, text) => {
		await page.setViewportSize({ width, height });
		await page.fill(selector, text);
		await page.waitForTimeout(150);
		const box = await measure(page, selector);
		if (scrollsEarly(box, limit)) problems.push(`${label}: content ${box.scroll}px in a ${box.client}px box scrolls before the ${limit}px limit`);
		return box;
	};
	const placeholderNarrow = await at(narrow, `empty at ${narrow}px`, "");
	const placeholderWide = await at(wide, `empty at ${wide}px`, "");
	await at(narrow, `wrapped text at ${narrow}px`, "word ".repeat(40));
	const cleared = await at(narrow, `cleared at ${narrow}px`, "");
	if (cleared.height !== placeholderNarrow.height) problems.push(`after clearing the composer is ${cleared.height}px, not ${placeholderNarrow.height}px`);
	if (placeholderWide.height > placeholderNarrow.height) problems.push(`the empty composer is taller when wide (${placeholderWide.height}px) than narrow (${placeholderNarrow.height}px)`);
	if (original !== null) await page.setViewportSize(original);
	return problems;
};
