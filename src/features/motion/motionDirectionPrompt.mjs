import { clamp } from "./motionMath.mjs";
import { hexColor } from "./motionPalette.mjs";
import { MAX_LINES, vocabulary } from "./motionDirectionVocabulary.mjs";
import { analyzeRepeatStructure, groupShots, heldWordIndex } from "./motionSongAnalysis.mjs";

const MAX_PROMPT_LINES = 140;

/**
 * What the AI reads: numbered lines with their words, timing and
 * translation, and what the song's structure and sound say about each:
 * its energy (0 to 9 against the rest of the song, from options.energy),
 * whether it belongs to a recurring block (a chorus), the earlier line it
 * repeats, the word held over a long note and the other voices singing
 * with it.
 */
export const promptLines = (model, options = {}) => {
	const lines = Array.isArray(model) ? model : [];
	const energy = Array.isArray(options.energy) && options.energy.length === lines.length ? options.energy : null;
	const { original, section } = analyzeRepeatStructure(lines);
	return lines.slice(0, MAX_PROMPT_LINES).map((line, index, list) => {
		const first = original[index];
		const held = heldWordIndex(line);
		return {
			n: index,
			words: line.words.map((word) => word.text),
			start: Math.round(line.start / 100) / 10,
			duration: Math.round((line.end - line.start) / 100) / 10,
			pause: Math.round((index ? line.start - list[index - 1].end : line.start) / 100) / 10,
			translation: typeof line.translation === "string" ? line.translation.slice(0, 80) : "",
			energy: energy && Number.isFinite(Number(energy[index])) ? Math.round(clamp(Number(energy[index]), 0, 1) * 9) : null,
			chorus: section[index],
			repeats: first < index ? first : null,
			held: held >= 0 ? held : null,
			voices: (line.backing || []).length,
		};
	});
};

/**
 * The shots the song's structure suggests (groupShots: cut at sections,
 * long pauses and the edges of recurring blocks, returning sections cut
 * as the first time), for the AI to follow or improve on.
 */
export const promptShots = (model) => groupShots((Array.isArray(model) ? model : []).slice(0, MAX_PROMPT_LINES))
	.map((shot) => ({ from: shot.from, to: shot.to, chorus: shot.chorus === true, repeated: shot.repeated === true }));

// What each tempo asks of the edit (part of the prompt).
const TEMPO_NOTES = Object.freeze({
	slow: 'a slow song (ballad): let it breathe. Long, smooth camera moves (drift, fade, crane, orbit, push, pan, rise), soft entrances (glide, lift, blur, rise, wipe, open, track, wave, cascade, stretch, door), impact type with serif on the tender words (a serif shot or two at most), hero, column, corners, frame, margin, anamorph, seal, wave, crawl, carousel, constellation, stairs and swell shots, glow, gradient, underline and circle accents, rules and letterbox bars for the big lines; no whip, cut, glitch, pop, zoom or slam.',
	mid: 'a mid-tempo song: mix glides with a few bold turns (roll, twist, crane, swoop, orbit, tumble, through, hop, corkscrew, panel at section changes); lift, rise, swing, door, skew, open, cascade, ripple, flip, assemble, blur, wipe and only now and then pop; impact type, serif for a few key words; a kit drawn from compositions like lockup, chain, fill, anamorph, rails, carousel, reel, stairs, strip, split, radial, zigzag, wave, grid, constellation, corners and wall.',
	fast: 'a fast song: snappy and driving. Whip, twist, hop, corkscrew, spin, swoop, tumble and through between shots (panel or cut only at a big section change); smear, skew, slide, ripple, lift, swing, bounce, glitch and flicker words, with slam or zoom saved for the few loudest hits; reel, radial, strip, grid, collage, tower, carousel, flash, fill, lockup, marquee and bleed shots; impact type (often upper case), sticker, extrude, spark and trail accents, strong tilts.',
	rap: 'a rap or very dense song: keep up with the flow. type, slide, smear, skew, ripple, glitch and flicker words, slam only on a couple of punchlines; flash, lockup, chain, tower, grid, reel, collage, split, stairs and tunnel shots; whip, hop, twist and the odd cut between them; impact type, extrude, spark and sticker accents.'
});

/** The album cover's colours as the prompt reads them: "#rrggbb 41%" largest share first, and how dark it is. */
const coverFacts = (cover) => {
	const colors = (Array.isArray(cover?.colors) ? cover.colors : [])
		.map((entry) => ({ hex: hexColor(entry?.hex ?? entry), share: Number(entry?.share) }))
		.filter((entry) => entry.hex)
		.slice(0, 5);
	if (!colors.length) return '';
	const shades = colors.map((entry) => entry.hex + (Number.isFinite(entry.share) && entry.share > 0 ? ' ' + Math.round(entry.share * 100) + '%' : '')).join(', ');
	const light = Number(cover?.light);
	const tone = Number.isFinite(light) ? (light < 0.3 ? 'a dark cover' : light > 0.65 ? 'a light cover' : 'a mid-toned cover') : '';
	return shades + (tone ? '; ' + tone : '');
};

/** The fields of an earlier direction the AI is asked to revise (its custom shapes stay as they were). */
const revisable = (direction) => {
	const source = direction && typeof direction === 'object' ? direction : {};
	const kept = {};
	for (const key of ['concept', 'kit', 'sections', 'mood', 'palette', 'shots', 'lines']) if (source[key] !== undefined) kept[key] = source[key];
	return kept;
};

/**
 * The prompt an AI provider answers with a direction (normalizeDirection
 * checks the answer). Desktop sends it through AIAddonManager; the mobile
 * apps send it through their own providers.
 */
export const buildPrompt = ({ title = "", artist = "", lines = [], cuts = [], vocabulary: custom = null, tempo = null, language = "", cover = null, revision = null, retake = 0 } = {}) => {
	const vocab = { ...vocabulary(), ...(custom && typeof custom === "object" ? custom : {}) };
	const list = (values) => (Array.isArray(values) ? values : []).join('|');
	const formatted = (Array.isArray(lines) ? lines : []).map((line) => {
		const words = (Array.isArray(line?.words) ? line.words : []).map((word) => String(word ?? '').replace(/\s+/g, ' ').trim()).join(' | ');
		const pause = Number(line?.pause) >= 2.5 ? ' (pause ' + Number(line.pause).toFixed(1) + 's)' : '';
		const translation = line?.translation ? ' -> ' + String(line.translation).replace(/\s+/g, ' ').trim() : '';
		// What the song says about the line (promptLines): its energy, a chorus block, a repeat, a held word, other voices.
		const facts = [
			line?.energy !== null && line?.energy !== undefined && Number.isFinite(Number(line.energy)) ? 'energy ' + Math.round(Number(line.energy)) : '',
			line?.chorus ? 'chorus' : '',
			Number.isInteger(line?.repeats) ? '= #' + line.repeats : '',
			Number.isInteger(line?.held) ? 'held ' + line.held : '',
			Number(line?.voices) > 0 ? 'voices ' + Number(line.voices) : '',
		].filter(Boolean);
		return '#' + line.n + ' [' + Number(line.start || 0).toFixed(1) + 's ' + Number(line.duration || 0).toFixed(1) + 's]' + pause + ' ' + words + translation + (facts.length ? ' {' + facts.join(', ') + '}' : '');
	}).join('\n');
	const max = vocab.maxLines || MAX_LINES;
	const limits = Object.entries(max).filter(([, most]) => Number(most) < Math.max(...Object.values(max))).map(([name, most]) => name + ' at most ' + most).join(', ');
	const tempoName = TEMPO_NOTES[tempo?.tempo] ? tempo.tempo : 'mid';
	const tempoFacts = [
		Number.isFinite(Number(tempo?.sps)) && Number(tempo.sps) > 0 ? Number(tempo.sps).toFixed(1) + ' syllables per second' : '',
		Number.isFinite(Number(tempo?.bpm)) && Number(tempo.bpm) > 0 ? Math.round(Number(tempo.bpm)) + ' BPM' : ''
	].filter(Boolean).join(', ');
	const suggested = (Array.isArray(cuts) ? cuts : [])
		.filter((cut) => Number.isInteger(cut?.from) && Number.isInteger(cut?.to))
		.map((cut) => cut.from + '-' + cut.to + (cut.chorus ? ' C' : '') + (cut.repeated ? ' R' : ''))
		.join(', ');
	const coverLine = coverFacts(cover);
	const notes = (Array.isArray(revision?.notes) ? revision.notes : []).map((note) => String(note || '').trim()).filter(Boolean).slice(0, 10);
	const revising = notes.length > 0 && revision?.direction && typeof revision.direction === 'object';
	const take = Math.max(0, Math.floor(Number(retake) || 0));

	return 'You are a motion-graphics director with thirty years of experience cutting kinetic-typography lyric videos (the best After Effects and Alight Motion typography edits). Direct a full edit of this song: one with a clear idea, a visual language of its own and a shape that follows the song, not a sampler of every effect.\n\n'
		+ 'How the renderer works: consecutive lyric lines are grouped into SHOTS. Each shot is one composition of its lines in 3D space over the music video, and the camera flies, tilts, rolls and orbits from line to line while the video turns with it. Lines are not shown as a lyric sheet: a line\'s faint outline peeks in just before it is sung, each word appears as solid type the moment it is sung, the line keeps moving while it is held (its hold), and once the next line is under way it leaves with the shot\'s exit; at most the current line and the one before it are on screen. Every script gets matching display faces (Korean, Japanese, Chinese, Latin, Cyrillic, Arabic, Thai, Devanagari, Bengali...). You decide the grouping, the composition, the camera moves, the word animation, type, emphasis and the motifs; the renderer does the layout and timing.\n\n'
		+ 'Song: "' + String(title || '').trim() + '"' + (artist ? ' by ' + String(artist).trim() : '') + (language ? ' (language: ' + String(language) + ')' : '') + '\n'
		+ 'Tempo: ' + tempoName + (tempoFacts ? ' (' + tempoFacts + ')' : '') + ' - ' + TEMPO_NOTES[tempoName] + '\n'
		+ (coverLine ? 'Album cover colours (largest share first): ' + coverLine + '. The edit should belong with the cover: its mood and palette taken from these colours or answering them (the renderer keeps the cover\'s own main colour as the first accent and uses your palette for the second).\n' : '')
		+ (take > 0 ? 'Take ' + (take + 1) + ': the viewer has seen this song directed before and asked for a new edit. Choose a different concept and kit from the obvious first choice (other compositions, entrances, word animation and exits), still true to the song.\n' : '')
		+ 'Lines (#n [start, length] words separated by " | ", then the translation after "->" when known, then in {} what the song says about the line: energy 0-9 = how loud and dense it is against the rest of the song (measured from the audio when known); chorus = part of a block of lines that recurs; = #k = the same words as line k; held i = word i is sung over a long note; voices k = other voices sing with it):\n'
		+ formatted + '\n'
		+ (suggested ? 'Suggested shots from the song\'s structure (cut at its sections, long pauses and the edges of recurring blocks; C = a recurring chorus block, R = the return of an earlier block): ' + suggested + '\n' : '')
		+ '\n'
		+ 'How to direct, in this order (write the first three into your answer, briefly):\n'
		+ '1. concept: one sentence, the visual idea of this edit, taken from the words and the sound (say "neon night drive: rails and grids, neon accents, whips between shots" or "a diary on a quiet night: corners and margins, handwriting accents, soft wipes"). Everything after follows it.\n'
		+ '2. kit: the song\'s own visual language, picked before any shot for its mood, tempo and concept: 6 to 9 layouts, 4 to 6 entrances, 5 to 7 fx, 3 to 5 accents, 4 to 6 exits, 3 to 5 holds and 0 to 4 motifs. Nearly every shot draws on the kit; step outside it only for the bridge or the single biggest moment. An edit feels designed when it keeps coming back to its kit, not when every shot changes everything; a kit that fights the song (dreamy waves in a metal song, slams in a lullaby) is the worst mistake.\n'
		+ '3. sections: name the parts of the song (intro, verse, pre-chorus, chorus, bridge, final chorus, outro) from the lines, the pauses and the chorus marks, and give each its role. Verses carry the story: clean and readable (lockup, column, corners, frame, margin, chain, stairs, rails, slot), gentle or crisp fx, little decoration. A pre-chorus builds: swell, stairs, tunnel, a push hold, the energy rising shot by shot. Every chorus has the signature look of the song and keeps it each time it returns (the same layout, fx, accent and exit; a later chorus may add bars or a stronger entrance), the final chorus the biggest. The bridge is the contrast: something the song has not shown yet, often quieter. The loudest lines (highest energy) get the big compositions (hero, wall, fill, poster, bleed, tower, flash) and the few hits; quiet lines get air.\n'
		+ '4. shots: follow the suggested shots unless the meaning asks for another cut. A shot is a composition the camera explores: it holds the 2 to 4 lines that belong together (a couplet, a run of the chorus); one-line shots are for the few biggest moments, never a whole song of them, and lines that share one look go in one shot rather than a row of one-line shots with the same settings. For each shot pick from the kit what fits its lines: their energy, meaning and rhythm. The word animation follows the vocal: smooth for held and tender lines, letter by letter for quick syllables, a hit only on the loudest words. Long lines go in phrases, sharp rhythmic lines now and then word by word (split).\n'
		+ '5. lines: emphasise the words that carry each line (the image, the name, the verb that turns it, a held word): 0 to 2 per line, not on every line, chosen for meaning, never by position out of habit.\n\n'
		+ 'Return ONLY one JSON object, no markdown:\n'
		+ '{"concept": "...",\n'
		+ ' "kit": {"layouts": ["..."], "enters": ["..."], "fx": ["..."], "accents": ["..."], "exits": ["..."], "holds": ["..."], "motifs": ["..."]},\n'
		+ ' "sections": [{"from": 0, "to": 3, "name": "verse 1"}],\n'
		+ ' "mood": "' + list(vocab.moods) + '",\n'
		+ ' "palette": ["#rrggbb", "#rrggbb"],\n'
		+ ' "shots": [{"from": 0, "to": 2, "layout": "...", "enter": "...", "fx": "...", "accent": "...", "exit": "...", "hold": "...", "split": "line", "interlude": "...", "type": "impact", "serif": false, "upper": false, "bars": false, "rule": false, "dutch": 0, "motifs": ["..."], "echo": "..."}],\n'
		+ ' "lines": [{"n": 0, "emph": [1], "fx": "..."}],\n'
		+ ' "shapes": {"name": {"d": "M10 10 L90 50 L10 90 Z", "style": "fill"}}}\n\n'
		+ 'What every choice looks like:\n'
		+ '- layout, flat compositions: column = stacked lines the camera glides down (verses, storytelling); stairs = lines stepping down a diagonal staircase (a thought unfolding, descending or rising lines); strip = lines side by side on one long strip with a track drawn under them while the camera travels sideways (lists, journeys, a run of short lines; needs 2+ short lines); split = two columns facing each other across a centre line, lines alternating sides (duets, question and answer, contrasts; needs 2+ lines); swell = every line larger than the last (a build into the chorus, a rising plea; needs 2+ lines); zigzag = lines alternate horizontal and vertical and the screen turns 90 degrees each line (flowing, playful); spiral = 3 or 4 lines around a square while the screen turns a full circle (building, hypnotic); radial = 3+ lines radiating from a hub like spokes, the screen turning to read each (circling thoughts, obsession, festive); wall = a justified poster where short lines become huge (choruses, hooks, repeated phrases); collage = 3+ lines scattered with tilts and different sizes (busy, chaotic); hero = one or two short lines filling the screen (titles, punchlines, the biggest moments); tower = each line set in two justified rows of the same width (rap punchlines, chants, short hard lines).\n'
		+ '- layout, compositions in depth: tunnel = lines one behind another and the camera flies forward through them (driving, urgent); carousel = lines around a drum turning about its upright axis, the camera swinging round to face each while its neighbours curve away (turning points, memories going round; needs 2+ lines); reel = lines on a drum that rolls like a slot-machine reel, sung lines rolling away over the top (momentum, counting, fate; needs 3+ lines); crawl = lines lying on a plane tilted into the distance like an opening crawl (storytelling, intros, cinematic verses; needs 3+ lines).\n'
		+ '- layout, one thought at a time (after the best typography edits; use these often, they keep the screen clean and snappy): slot = one line at a time in the same place inside a dark band drawn across the screen, each line replacing the last (quick exchanges, lists, a run of short lines; needs 2+ lines); poster = one line at a time as large as the screen allows on a flat colour field that cuts to another colour with every line (hooks, shouts, the loudest lines; short lines only); spread = one line at a time with its words set apart like stepping stones across the width, each landing on its beat (lines of 2 to 6 clearly sung words); wordwall = the lines repeated across the whole screen as slanted outlines, each filling in where it is sung (chants, repeated phrases, choruses; needs 2+ short lines); arch = lines bent round a great circle like the lettering on a seal while the screen turns (cycles, seasons, going round; needs 2+ lines); pillar = lines set upright like banners, read top to bottom (only lines written wholly in Korean, Japanese or Chinese; poetic, traditional, quiet or solemn lines). The one-at-a-time compositions (slot, poster, spread) cannot hold lines sung over each other.\n'
		+ '- layout, editorial and graphic compositions: wave = the lines ride one long wave across the screen, each tilted with the slope it sits on, the camera rolling along the swell (flowing, sea, longing, a melody that rises and falls; needs 2+ lines); constellation = the lines scattered wide like stars on a chart, a thin line drawn from each to the next as it is sung (dreams, night, memories joined up, connections; needs 2+ lines); grid = a modular poster grid, each line set tight in its own cell with rules drawn between the cells (lists, statements, cool and graphic, rap; needs 2+ lines); corners = small type in the corners of the frame with the middle left open to the video (quiet verses, intros, intimate lines, letting the video speak; needs 2+ lines).\n'
		+ '- layout, from the motion-typography canon: lockup = one line at a time, its words packed into a tight block of one or two rows, each word sized by its stress (the key word huge, the little words small) (hooks, punchlines, any line with one word that matters); flash = one word at a time in the same place, each replacing the last on its beat, the little words small and the key words huge (fast, dense, rap lines, countdowns, lists; needs lines of 2+ words); chain = each line attached to the edge of the one before, every other line turned a quarter so the words build a mosaic and the camera rolls with them (storytelling, spoken flows, long verses); fill = one line at a time in capitals that always fill the width: each sung word stretches the line and the whole line rescales (shouted hooks, chants, statements; short lines); seal = one line at a time inside a ring like a stamp or a badge, the ring spinning in (titles, names, the hook, a declaration); frame = one line at a time with its words placed round the edges of the frame, the middle left open to the video (intimate, airy lines, a singer in the middle of the picture); margin = the lines set upright along the left and right edges of the screen, stepping inward (Japanese, Korean and Chinese read top to bottom; quiet, cool, cinematic verses); marquee = one line at a time with copies of it streaming across the screen in rows, alternate rows the other way (choruses, chants, repeated phrases, driving hooks); anamorph = the words of a line hang at different depths and only line up into the line from where the camera looks at it, breaking apart as the camera moves on (dreamlike, surreal, spatial verses); bleed = one short line at a time so large it runs off the screen, the view sliding along it as it is sung (huge statements, single shouted words); rails = lines riding a slanted grid of rules like a Saul Bass title, each sliding along its rule into place (cool, retro, cinematic, jazzy lines). Lockup, flash, fill, seal, frame, marquee and bleed cannot hold lines sung over each other.\n'
		+ '- enter (' + list(vocab.enters) + '): how the camera reaches the shot. pan = sideways, drop / rise = down / up, drift = a slow diagonal glide, crane = the camera lifts up and over to the next shot, roll = the screen turns 90 degrees, twist = the screen turns 45 degrees on a diagonal move, flip = turns 180 degrees, spin = a full barrel roll, corkscrew = dolly forward while turning a full circle, whip = a very fast blurred pan, hop = the camera leaps back and across, seeing both shots on its way, orbit = the camera swings around in 3D, swoop = it banks down and round into the next shot, tumble = it somersaults over the top, push = dolly forward through the previous shot, pull = dolly back out, through = dive into the last sung word and come out in the next shot, fade = a slow dissolve in place, panel = a colour panel sweeps across and reveals the next shot, cut = hard cut with a flash, iris = the next shot opens out of a growing circle in place, open = the next shot opens out of a thin band across the middle. Big moves (iris, open, roll, twist, flip, spin, corkscrew, orbit, swoop, tumble, hop, panel, cut, through) belong at section changes.\n'
		+ '- fx (' + list(vocab.fx) + '): how sung words appear. Gentle: glide = drifts in from the side, a breath; rise = floats up; lift = rises out of a mask at its own baseline (the classic clean reveal); blur = focus pull; wipe = revealed left to right; open = opens from its middle outwards; track = letters close in from wide spacing; wave = letters rise and float; cascade = letters fall softly into place one after another; stretch = grows over a held note; brush = revealed by a slanted soft stroke, like a brush pulled across; shutter = opens from a thin line across its middle. Lively: door = turns in from its first letter like a door; swing = hangs from its first letter and swings down into place; skew = leans in like a brush stroke and straightens; flip = 3D flip-up; spin = 3D card spin; slide = sweeps in sideways; smear = a fast motion smear that snaps into shape; type = letter by letter; assemble = scattered letters fly together; swirl = letters spiral in; ripple = each letter grows up from the baseline in a ripple; drop = letters bounce down; bounce = letters spring up; rain = letters start scattered high and low and drop or rise into one line; decode = each letter flickers through random characters and locks onto the right one. Hits: pop = scale up with a bounce; glitch = RGB-split glitch; flicker = letters flicker on like neon; slam = smash in big with the camera shaking; zoom = fly in from the camera. Match the vocal and the tempo. Set fx per shot and override it in "lines" only where a line differs.\n'
		+ '- type (' + list(vocab.types) + '): the face. impact = heavy display, the default for nearly every shot (it stays readable over video); serif = elegant Myeongjo / Mincho / Didone for a whole shot, rarely: a quiet bridge or the most tender lines, at most about one shot in seven and never two shots in a row; round = soft and friendly, only for playful songs; flex = a variable heavy sans whose words land thin and swell to full weight (and width) as they are sung, breathing with the beat on emphasised words (modern pop, electronic, hype, hooks; a shot in four or five at most). Never ask for thin or light type.\n'
		+ '- serif: true sets only the shot\'s emphasised words in the serif against the heavy type. Use it for a few poignant words, not every shot.\n'
		+ '- upper: true sets Latin, Cyrillic and Greek words in capitals (impact shots, hooks). bars: true brings cinematic letterbox bars for the shot (big, emotional moments). rule: true draws a thin line under each line as it is sung (quiet, elegant shots).\n'
		+ '- accent (' + list(vocab.accents) + '): how emphasised words stand out. color = accent colour; outline = hollow outlined letters; underline = a line drawn under; mark = a highlighter stroke; spark = sparks bursting around the word; glow = white neon glow that throbs with the beat (night, longing, electric); gradient = filled with a two-colour gradient (dreamy, pop); stamp = an outlined frame slammed on like a rubber stamp (declarations, punchlines); circle = circled by hand with a pen (the word that matters, tender or pointed); extrude = solid 3D block letters (retro, loud, confident); sticker = coloured letters with a thick white edge, slightly tilted (playful, cute, K-pop); script = the word alone in brush handwriting against the heavy type (asides, feelings, the personal word); giant = the word blown up far larger than its line (the one word that matters most; shouts); trail = outlined copies stepping out from behind the word (echoes, repeats, reverb); scribble = a wobbling pen line scrawled under it (casual, nervous, handwritten); bracket = a rule either side closing in on it (precise, cool, a word singled out); neon = a hollow glowing tube of the accent colour that throbs with the beat (night, clubs, retro, electric); chrome = polished metal letters with a light sweeping across them (80s, flex, glory, the title word); spectrum = coloured copies of the word fanned out behind it (pop, retro, euphoria, a word that echoes). Keep a returning section on its accent.\n'
		+ '- exit (' + list(vocab.exits) + '): how a sung line leaves once the next line is under way (in one-at-a-time compositions, as the next line comes in in its place). Whole words: fade = melts away; rise = floats up and fades; fall = drops away with gravity; scatter = its words fly apart; shrink = shrinks away; sweep = swept off sideways; blur = goes out of focus; wipe = wiped off; flip = flips away; stretch = squashed flat and gone; glitch = breaks up in digital jitter; drip = melts down and runs away; sink = sinks out of sight behind its own baseline (clean, editorial); shut = closes to a thin line across its middle (crisp, techno); zoom = flies at the camera out of focus (impact, a drop); twist = turns away and shrinks to a point (playful, dizzy); dash = smeared off sideways at speed (fast, sporty); hinge = swings down from its first letter like a sign losing a screw, then drops (comic, broken, a letdown). Letter by letter: crumble = its letters drop off one after another (falling apart, loss); dissolve = its letters go out one by one at random (fading memories, dreamy); erase = deleted from the end letter by letter like a cursor going back (regret, taking words back, chat-like); burst = its letters blown apart from the middle (explosive hooks, shouts); evaporate = its letters rise away like steam (tender, warm, sad endings); tumble = each letter tips over forwards like dominoes (rhythmic, quirky); scramble = its letters flicker through random characters and blink out (cyber, glitchy, secrets). Tender parts leave gently (fade, rise, blur, shrink, wipe, sink, dissolve, evaporate), driving parts get thrown off (fall, scatter, sweep, flip, stretch, zoom, dash, burst, crumble, shut). A kit mixes whole-word and letter-by-letter exits; keep a returning section on its exit.\n'
		+ '- hold (' + list(vocab.holds) + '): how a line keeps moving while it is held, so the screen never freezes: grow = slowly grows; drift = slides slowly along; float = its words bob gently; lean = slowly tilts; push = comes slowly toward the camera; breathe = pulses with the beat; wobble = rocks and leans like jelly (playful, drunk, dizzy lines); swivel = turns slowly in depth like a sign on a pole; still = holds still (rarely, only for short hard lines in fast songs). Slow songs always need one that moves.\n'
		+ '- split (' + list(vocab.splits) + '): how the shot breaks its lines; a line need not reach the screen all at once. line = each line whole (a very long line is still broken into phrases); phrase = lines of more than three or four words are broken into short phrases of two to four words at their natural breaks, each set, timed and leaving on its own while the camera moves from phrase to phrase (long lines, storytelling, any line too long to read at a glance); word = every word on its own, landing one after another in its own place, the line building up word by word until the next line (punchy, rhythmic lines of two to seven words, hooks, chants, fast songs; never for long dense lines or lines sung over each other). Use phrase for long lines, word now and then where the rhythm is sharp, line for short ones.\n'
		+ '- interlude (' + list(vocab.interludes) + '): only matters when an instrumental break (a long stretch with no singing) follows the shot\'s last line: the scene that plays over the video meanwhile (the lyrics are never shown in a break). pulse = rings bursting from the centre on every beat (anything with a clear beat); eq = equalizer bars dancing to the music (pop, EDM, rock); marquee = the song title in huge rows sliding past each other (anthems, confident songs); orbit = the song\'s motifs orbiting the centre (dreamy, playful, love songs); stripes = diagonal colour bands sweeping past a breathing frame (pop, funk, playful); grid = a neon grid floor rushing at the camera under a striped sun (synth, retro, electronic, night drives); count = big numbers counting down the seconds to the next lyric (build-ups, drops, tension); wave = oscilloscope waves swelling with the music (ballads, ambient, calm). Pick what fits the music in the break, and vary it from break to break.\n'
		+ '- lines: list only lines that need emphasis or their own fx. emph = 0 to 2 word indexes (0-based, in " | " order) that carry the meaning or are held long; they are set larger and take the shot\'s accent. Give nearly every shot at least one emphasised word, or its accent never shows; pick it for meaning (see step 5).\n'
		+ '- dutch: camera tilt in degrees, 0 for calm shots, up to 12 or -12 for energetic ones.\n'
		+ '- motifs: 0 or 1 per shot (2 at a big moment), only where the lines name or imply an image (moon for moon or 月, drop for tears or rain, heart for love, flame for fire); keep a motif with its idea through the song rather than decorating every shot. Library: ' + list(vocab.motifs) + '.\n'
		+ '- shapes: optional, at most 3 custom motifs when the library lacks an image the lyrics need: one SVG path "d" drawn in a 100x100 box with only M L H V C S Q T A Z commands and under 600 characters, style "fill" or "stroke"; use the name in a shot\'s motifs.\n'
		+ '- echo: optional, on about one shot in three: the key word or short phrase people will remember (at most 16 characters), copied exactly from the shot\'s lyrics and shown as a giant outline behind the shot.\n'
		+ '- palette: two vivid accent colours that fit the song and its concept and read well on dark video.\n\n'
		+ 'Rules (the renderer holds the edit to them anyway):\n'
		+ '- shots: cover every line exactly once, in order, without gaps. 1 to ' + Math.max(...Object.values(max)) + ' lines each (' + limits + '). Cut where the song changes section (verse, pre-chorus, chorus, bridge), after long pauses and where the meaning turns; keep lines that answer each other together, and never cut between lines sung over each other (a duet, a call and response). Most shots hold 2 to 4 lines. Background vocals and duet parts are shown with their line automatically.\n'
		+ '- No layout in two shots running (a chorus running on aside) and none in more than about a quarter of the shots; the same for entrances, fx and accents. Repetition belongs to the returning sections, where it is the point.\n'
		+ '- Restraint: most words should arrive smoothly and stay readable. The hits are spice: slam and zoom at most about one shot in eight, only on the loudest moments (a drop, the last chorus, a shouted punchline) of songs with drive, never in two shots running and never in calm, dreamy, melancholic or slow songs; pop, glitch and flicker at most one shot in five and never right after another hit; cut and panel only at a real section change after a pause. A word slammed in again and again stops meaning anything.\n'
		+ (revising
			? '\nREVISION. Your earlier direction for this song (below) was rendered and watched frame by frame' + (Number.isFinite(Number(revision.score)) ? ', scoring ' + Math.round(Number(revision.score)) + ' of 100' : '') + '. What a viewer would notice:\n'
				+ notes.map((note) => '- ' + note).join('\n') + '\n'
				+ 'Keep its concept, kit, sections and everything the notes do not name. Change only what they name (the shots holding those lines: their layout, split, entrance, fx, exit; the line overrides) so the problems go away, and return the complete revised direction as one JSON object in the same format.\n'
				+ 'Earlier direction: ' + JSON.stringify(revisable(revision.direction)) + '\n'
			: '');
};
