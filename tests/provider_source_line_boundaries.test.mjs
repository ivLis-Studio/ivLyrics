import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Optional source directory lets this same suite demonstrate failures against a
// saved provider revision. Fixtures contain synthetic text only; no API access.
const sourceFile = (name) => process.env.IVLYRICS_PROVIDER_SOURCE_DIR
	? resolve(process.env.IVLYRICS_PROVIDER_SOURCE_DIR, name)
	: new URL(`../${name}`, import.meta.url);
const normalize = (value) => JSON.parse(JSON.stringify(value));

// Node has no DOMParser. Supply the small DOM surface used by the production
// TTML parser with a synthetic document. XML tokenization is outside this test;
// paragraph parsing, word timing, roles, speaker mapping and normalization run
// through the complete, unmodified provider functions below.
const element = (name, attributes = {}, children = []) => ({
	nodeType: 1,
	localName: name,
	tagName: name,
	attributes: Object.entries(attributes).map(([key, value]) => ({
		name: key, localName: key.split(":").at(-1), value: String(value),
	})),
	childNodes: children,
	getAttribute(key) { return attributes[key] ?? null; },
	get textContent() { return children.map((child) => child.textContent).join(""); },
	getElementsByTagName(tag) {
		return children.flatMap((child) => child.nodeType === 1
			? [...(tag === "*" || child.tagName === tag ? [child] : []), ...child.getElementsByTagName(tag)]
			: []);
	},
});
const textNode = (text) => ({ nodeType: 3, nodeValue: text, textContent: text });
const token = (text, startTime, endTime) => ({ text, startTime, endTime });
const row = (key, text, startTime, endTime, { singer = "v1", background = [] } = {}) => ({
	key, singer, lead: [token(text, startTime, endTime)], background,
});
const bounds = (source) => {
	const syllables = [...source.lead, ...source.background];
	return {
		startTime: Math.min(...syllables.map((part) => part.startTime)),
		endTime: Math.max(...syllables.map((part) => part.endTime)),
	};
};
const makeDocument = (rows) => {
	const span = (part) => element("span", {
		begin: `${part.startTime}ms`, end: `${part.endTime}ms`,
	}, [textNode(part.text)]);
	return element("tt", {}, [
		element("head", {}, [element("metadata", {}, ["v1", "v2"].map((id) =>
			element("agent", { "xml:id": id })))]),
		element("body", {}, [element("div", {}, rows.map((source) => {
			const { startTime, endTime } = bounds(source);
			return element("p", {
				"xml:id": source.key, "ttm:agent": source.singer,
				begin: `${startTime}ms`, end: `${endTime}ms`,
			}, [
				...source.lead.map(span),
				...(source.background.length ? [element("span", { "ttm:role": "x-bg" }, source.background.map(span))] : []),
			]);
		}))]),
	]);
};

const createProviders = () => {
	let currentDocument;
	const window = { LyricsAddonManager: { register() {} } };
	const context = vm.createContext({
		window, console, URL, atob,
		DOMParser: class {
			parseFromString(_xml, type) {
				assert.equal(type, "application/xml");
				assert.ok(currentDocument, "a synthetic TTML document must be supplied");
				return currentDocument;
			}
		},
		setTimeout() { throw new Error("provider tests must not schedule network/registration work"); },
	});
	for (const name of ["Unison", "LyricsPlus", "Paxsenix"]) {
		vm.runInContext(readFileSync(sourceFile(`Addon_Lyrics_${name}.js`), "utf8"), context,
			{ filename: `Addon_Lyrics_${name}.js` });
	}
	return {
		unison(rows) {
			currentDocument = makeDocument(rows);
			return normalize(window.ivLyricsLyricsParser.parseTtmlLyrics("<tt></tt>", 60000));
		},
		lyricsPlus(rows) {
			const payload = { type: "Word", metadata: { agents: {} }, lyrics: rows.map((source) => {
				const { startTime, endTime } = bounds(source);
				return {
					time: startTime, duration: endTime - startTime,
					text: [...source.lead, ...source.background].map((part) => part.text).join(""),
					element: { key: source.key, singer: source.singer },
					syllabus: [
						...source.lead.map((part) => ({ ...part, isBackground: false })),
						...source.background.map((part) => ({ ...part, isBackground: true })),
					].map((part) => ({
						text: part.text, time: part.startTime, duration: part.endTime - part.startTime,
						isBackground: part.isBackground,
					})),
				};
			}) };
			return normalize(window.__ivLyricsPlusDebug.parseLyricsPayload(payload, 60000));
		},
		paxsenix(payload) {
			return normalize(window.__ivLyricsPaxsenixDebug.parsePayload(payload, 60000));
		},
		paxsenixTtml(rows) {
			currentDocument = makeDocument(rows);
			return normalize(window.__ivLyricsPaxsenixDebug.parsePayload({ ttmlContent: "<tt></tt>" }, 60000));
		},
	};
};

const scenarios = [
	["a 50 ms tail overlap", [row("first", "First", 1000, 3000), row("next", "Next", 2950, 4200)]],
	["a transitive four-paragraph chain connected through explicit background", [
		row("chain-a", "Alpha", 10000, 12000),
		row("chain-b", "Beta", 11950, 12800, { background: [token("Echo", 12900, 13200)] }),
		row("chain-c", "Gamma", 13100, 15000),
		row("chain-d", "Delta", 14950, 17000),
	]],
	["an early short line followed by a long line with a 50 ms overlap", [
		row("short", "Short", 1000, 3000), row("long", "Long", 2950, 13000),
	]],
	["explicit paragraph backgrounds that begin before their leads", [
		row("group-a", "MainA", 1100, 4000, { background: [token("EchoA", 1000, 3300)] }),
		row("group-b", "MainB", 4100, 6100, { background: [token("EchoB", 3950, 6200)] }),
	]],
	["simultaneous duet agents with stable source order", [
		row("duet-a", "VoiceA", 1000, 3000), row("duet-b", "VoiceB", 1000, 5000, { singer: "v2" }),
	]],
	["ordinary separate lines", [row("solo-a", "Hello", 1000, 2000), row("solo-b", "World", 2200, 3000)]],
];

const assertSourceLines = (result, rows, provider) => {
	const keyField = provider === "lyricsPlus" ? "lyricsPlusLineKey" : "unisonLineKey";
	const singerField = provider === "lyricsPlus" ? "lyricsPlusSinger" : "unisonAgent";
	assert.equal(result.karaoke.length, rows.length, "each source paragraph must remain its own karaoke line");
	assert.equal(result.synced.length, rows.length);
	rows.forEach((source, index) => {
		const line = result.karaoke[index];
		assert.equal(line[keyField], source.key, "source identity and reading order must survive");
		assert.equal(line[singerField], source.singer, "the original singer must survive");
		assert.deepEqual({ startTime: line.startTime, endTime: line.endTime }, bounds(source),
			"overlap must not trim the source line's end time");
		const lead = line.vocals?.lead;
		assert.deepEqual(normalize(lead?.syllables ?? line.syllables), source.lead,
			"primary words and their individual timestamps must remain primary");
		if (source.background.length) {
			assert.equal(lead.role, "lead");
			assert.equal(lead.id, `${source.key}-lead`);
			assert.equal(line.vocals.background.length, 1);
			const background = line.vocals.background[0];
			assert.equal(background.role, "background");
			assert.equal(background.id, `${source.key}-background-1`);
			assert.deepEqual(background.syllables, source.background,
				"only the background explicitly belonging to this paragraph may be attached");
		} else {
			assert.ok(!line.vocals?.background?.length, "another main line must not become background");
		}
	});
};

for (const provider of ["unison", "lyricsPlus"]) {
	for (const [name, rows] of scenarios) {
		test(`${provider} preserves source lines and roles for ${name}`, () => {
			assertSourceLines(createProviders()[provider](rows), rows, provider);
		});
	}
}

test("Paxsenix structured lyrics preserve a long explicit end and its background across a following line", () => {
	const payload = {
		syncType: "syllable", metadata: { language: "en" },
		lyrics: [
			{ key: "long", timestamp: 1000, endtime: 30000, agent: "v1",
				text: [{ text: "Sustain", timestamp: 1000, endtime: 30000 }],
				backgroundText: [{ text: "Echo", timestamp: 1500, endtime: 25000 }] },
			{ key: "next", timestamp: 2000, endtime: 4000, agent: "v2",
				text: [{ text: "Next", timestamp: 2000, endtime: 4000 }] },
		],
	};
	const result = createProviders().paxsenix(payload);
	assert.equal(result.karaoke.length, 2);
	assert.deepEqual(result.karaoke.map((line) => [line.paxsenixLineKey, line.startTime, line.endTime]),
		[["long", 1000, 30000], ["next", 2000, 4000]]);
	const { lead, background } = result.karaoke[0].vocals;
	assert.equal(lead.role, "lead");
	assert.deepEqual(lead.syllables, [token("Sustain", 1000, 30000)]);
	assert.equal(background.length, 1);
	assert.equal(background[0].role, "background");
	assert.deepEqual(background[0].syllables, [token("Echo", 1500, 25000)]);
});

test("Paxsenix TTML fallback preserves the same paragraph boundaries as Unison", () => {
	const rows = scenarios[1][1];
	assertSourceLines(createProviders().paxsenixTtml(rows), rows, "unison");
});
