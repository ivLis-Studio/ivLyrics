/* Canonical ivLyrics sync v6 codec. No host, UI, network or storage dependency.
 * The backend vendors this exact file as SyncDataCodec.cjs. Golden vectors are
 * shared with the backend; older native readers use the legacy GET view.
 * Update both copies through scripts/sync-codec.mjs.
 */
(function (root, factory) {
  const api = factory();
  if (root) root.SyncDataCodec = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const VERSION = 6;
  const MAX_LINES = 5000, MAX_LENGTH = 2000, MAX_TIME = 86400000;
  const META = ['speaker', 'speaker-color', 'speaker-fallback', 'kind'];
  const units = new Set(['line', 'word', 'character']);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error('Invalid sync v6: ' + message); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max, label) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(label);
    return value;
  };
  const keys = (value, allowed, label) => {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(label);
  };
  const ms = value => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('time must be finite');
    const rounded = Math.round(value * 1000);
    if (Math.abs(value - rounded / 1000) > 1e-8) fail('sub-millisecond timing cannot be converted without precision loss');
    return integer(rounded, 0, MAX_TIME, 'time out of range');
  };
  const metadata = target => Object.fromEntries(META.filter(key => target[key] !== undefined).map(key => [key, target[key]]));
  const readMeta = value => {
    if (value === undefined) return {};
    keys(value, META, 'unknown metadata');
    return clone(value);
  };
  const rangesToLocal = (ranges, offset) => ranges?.map(range => [range.start - offset, range.end - offset + 1]);
  const readRanges = (ranges, offset, length) => {
    if (!Array.isArray(ranges) || ranges.length > MAX_LENGTH) fail('ranges');
    let previous = 0;
    return ranges.map(range => {
      if (!Array.isArray(range) || range.length !== 2) fail('range must be [from, toExclusive]');
      const from = integer(range[0], previous, length - 1, 'range start');
      const to = integer(range[1], from + 1, length, 'range end');
      previous = to;
      return { start: offset + from, end: offset + to - 1 };
    });
  };
  const countRanges = ranges => ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
  const cumulative = (start, deltas) => {
    let value = start;
    return [start, ...deltas.map(delta => value += delta)];
  };
  const packTimes = times => ({ startMs: times[0], deltaMs: times.slice(1).map((time, index) => time - times[index]) });
  const timeValues = (timing, length, includeChars = true) => {
    keys(timing, ['unit', 'startMs', 'deltaMs', 'lengths', 'endMs', 'declared', 'runs'], 'timing fields');
    if (timing.declared !== undefined && timing.declared !== false) fail('declared must be false or omitted');
    if (timing.unit === 'mixed') {
      if (!Array.isArray(timing.runs) || !timing.runs.length || timing.runs.length > length
        || timing.startMs !== undefined || timing.deltaMs !== undefined || timing.lengths !== undefined) fail('mixed timing');
      let consumed = 0;
      const values = [];
      for (const run of timing.runs) {
        keys(run, ['length', 'timing'], 'mixed run');
        const size = integer(run.length, 1, length - consumed, 'mixed run length');
        if (run.timing?.unit === 'mixed') fail('nested mixed timing');
        if (run.timing?.endMs !== undefined) fail('mixed holds belong to the target endMs');
        values.push(...timeValues(run.timing, size).chars);
        consumed += size;
      }
      if (consumed !== length || values.some((time, index) => index && time < values[index - 1])) fail('mixed timing coverage/order');
      checkEnd(timing, values);
      return { chars: values };
    }
    if (!units.has(timing.unit) || timing.runs !== undefined) fail('timing unit');
    const start = integer(timing.startMs, 0, MAX_TIME, 'startMs');
    let sizes;
    if (timing.unit === 'line') {
      if (timing.deltaMs !== undefined || timing.lengths !== undefined) fail('line timing has extra marks');
      sizes = [length];
    } else if (timing.unit === 'word') {
      if (!Array.isArray(timing.lengths) || !timing.lengths.length || timing.lengths.length > length) fail('word lengths');
      sizes = timing.lengths.map(size => integer(size, 1, length, 'word length'));
      if (sizes.reduce((a, b) => a + b, 0) !== length) fail('word coverage');
    } else {
      if (timing.lengths !== undefined) fail('character timing has word boundaries');
      sizes = new Array(length).fill(1);
    }
    const deltas = timing.unit === 'line' ? [] : timing.deltaMs;
    if (!Array.isArray(deltas) || deltas.length !== sizes.length - 1) fail('delta count');
    deltas.forEach(delta => integer(delta, 0, MAX_TIME, 'deltaMs'));
    const times = cumulative(start, deltas);
    if (times.at(-1) > MAX_TIME) fail('timing overflow');
    const chars = includeChars ? sizes.flatMap((size, index) => new Array(size).fill(times[index])) : null;
    checkEnd(timing, times);
    return { chars, times, sizes };
  };
  function checkEnd(timing, chars) {
    if (timing.endMs !== undefined) integer(timing.endMs, chars.at(-1) + 1, Math.min(MAX_TIME, chars.at(-1) + 60000), 'endMs');
  }
  const expanded = (target, length) => {
    if (Array.isArray(target.chars)) {
      if (target.chars.length !== length) fail('legacy character coverage');
      return target.chars.map(ms);
    }
    if (target.granularity === 'line' && typeof target.timing === 'number') return new Array(length).fill(ms(target.timing));
    if (target.granularity !== 'word' || !Array.isArray(target.timing)) fail('missing legacy timing');
    let from = 0;
    const values = [];
    for (const mark of target.timing) {
      if (!Array.isArray(mark) || mark.length !== 2) fail('legacy word mark');
      const to = integer(mark[0], from, length - 1, 'legacy word end');
      values.push(...new Array(to - from + 1).fill(ms(mark[1])));
      from = to + 1;
    }
    if (from !== length) fail('legacy word coverage');
    return values;
  };
  const timingCache = new WeakMap();
  function encodeTiming(target, length, boundaries) {
    const values = expanded(target, length);
    if (values.some((time, index) => index && time < values[index - 1])) fail('time goes backwards');
    const previous = timingCache.get(target);
    if (previous && target.granularity === previous.granularity
      && (target.lastCharEnd === undefined ? undefined : ms(target.lastCharEnd)) === previous.timing.endMs
      && previous.chars.length === values.length && previous.chars.every((time, index) => time === values[index])) return clone(previous.timing);
    const unit = units.has(target.granularity) ? target.granularity : 'character';
    let timing;
    if (unit === 'character' && Array.isArray(target.unitLayout) && target.unitLayout.reduce((sum, run) => sum + run.length, 0) === length) {
      let cursor = 0;
      timing = { unit: 'mixed', runs: target.unitLayout.map(run => {
        const size = integer(run.length, 1, length - cursor, 'unit layout length');
        if (!units.has(run.unit)) fail('unit layout');
        const marks = values.slice(cursor, cursor + size); cursor += size;
        const legacy = { granularity: run.unit, chars: marks.map(time => time / 1000) };
        const boundaries = run.unit === 'word' && Array.isArray(run.lengths)
          ? run.lengths.map((size, index) => ({ end: run.lengths.slice(0, index + 1).reduce((a,b) => a+b, 0) - 1 })) : null;
        const encoded = encodeTiming(legacy, size, boundaries);
        if (run.declared === false) encoded.declared = false;
        return { length: size, timing: encoded };
      }) };
      // Edits can refine a word into characters; mixed runs must stay flat.
      timing.runs = timing.runs.flatMap(run => run.timing.unit === 'mixed' ? run.timing.runs : [run]);
    } else if (unit === 'line' && values.every(time => time === values[0])) timing = { unit, startMs: values[0] };
    else if (unit === 'word') {
      let sizes;
      if (Array.isArray(boundaries) && boundaries.length) {
        let from = 0;
        sizes = boundaries.map(range => { const size = range.end - from + 1; from = range.end + 1; return size; });
        if (sizes.some(size => !Number.isSafeInteger(size) || size <= 0) || sizes.reduce((a, b) => a + b, 0) !== length) fail('word boundary coverage');
      } else if (Array.isArray(target.timing)) {
        let from = 0;
        sizes = target.timing.map(([end]) => { const size = end - from + 1; from = end + 1; return size; });
      } else {
        // An existing compact word timeline has authoritative boundaries; for
        // expanded legacy files retain exact equal-time runs without guessing.
        sizes = [];
        values.forEach((time, index) => { if (!index || time !== values[index - 1]) sizes.push(1); else sizes[sizes.length - 1]++; });
      }
      let cursor = 0;
      const runs = sizes.map(size => {
        const times = values.slice(cursor, cursor + size); cursor += size;
        const uniform = times.every(time => time === times[0]);
        return { length: size, timing: uniform ? { unit: 'word', lengths: [size], ...packTimes([times[0]]) }
          : { unit: 'character', ...packTimes(times) } };
      });
      if (runs.every(run => run.timing.unit === 'word')) timing = { unit: 'word', lengths: sizes, ...packTimes(runs.map(run => run.timing.startMs)) };
      else timing = { unit: 'mixed', runs };
    } else timing = { unit: 'character', ...packTimes(values) };
    if (target.granularity === undefined) timing.declared = false;
    if (target.lastCharEnd !== undefined) timing.endMs = ms(target.lastCharEnd);
    timeValues(timing, length);
    return timing;
  }
  function decodeTiming(timing, length) {
    const { chars, times, sizes } = timeValues(timing, length, !['line', 'word'].includes(timing.unit));
    let result;
    if (timing.unit === 'line') result = { granularity: 'line', timing: timing.startMs / 1000 };
    else if (timing.unit === 'word') {
      let end = -1;
      result = { granularity: 'word', timing: sizes.map((size, index) => [end += size, times[index] / 1000]) };
    } else result = { granularity: 'character', chars: chars.map(value => value / 1000) };
    if (timing.unit === 'mixed') result.unitLayout = timing.runs.map(run => ({ length: run.length, unit: run.timing.unit,
      ...(run.timing.lengths ? { lengths: clone(run.timing.lengths) } : {}), ...(run.timing.declared === false ? { declared: false } : {}) }));
    if (timing.declared === false) delete result.granularity;
    if (timing.endMs !== undefined) result.lastCharEnd = timing.endMs / 1000;
    timingCache.set(result, { chars: chars || [], timing: clone(timing), granularity: result.granularity });
    return result;
  }
  // A parent is derivable only with exact, single coverage. Overlaps, hidden
  // gaps and intentionally different parent marks retain an explicit timeline.
  function parentMarks(line) {
    const values = new Array(line.end - line.start + 1);
    for (const part of line.parallel?.parts || []) {
      if (part.chars === undefined && part.timing === undefined) return null;
      const marks = expanded(part, countRanges(part.ranges)); let cursor = 0;
      for (const range of part.ranges) for (let index = range.start; index <= range.end; index++) {
        const local = index - line.start;
        if (local < 0 || local >= values.length || values[local] !== undefined) return null;
        values[local] = marks[cursor++];
      }
    }
    if (values.includes(undefined) || values.some((time, index) => index && time < values[index-1])) return null;
    return values;
  }
  function restoreParentTiming(shape, values) {
    keys(shape, ['unit', 'lengths', 'declared', 'endMs'], 'derived timing fields');
    if (!units.has(shape.unit)) fail('derived unit');
    const target = { granularity: shape.unit, chars: values.map(value => value / 1000),
      ...(shape.endMs === undefined ? {} : { lastCharEnd: shape.endMs / 1000 }) };
    const boundaries = shape.unit === 'word' && Array.isArray(shape.lengths)
      ? shape.lengths.map((size, index) => ({ end: shape.lengths.slice(0,index+1).reduce((a,b)=>a+b,0)-1 })) : null;
    const timing = encodeTiming(target, values.length, boundaries);
    if (timing.unit !== shape.unit || shape.unit === 'word' && JSON.stringify(timing.lengths) !== JSON.stringify(shape.lengths)) fail('derived timing coverage');
    if (shape.declared === false) timing.declared = false;
    else if (shape.declared !== undefined) fail('derived declared');
    return timing;
  }
  function encode(data, options = {}) {
    if (data?.version === VERSION) { validate(data); return clone(data); }
    if (!object(data) || !Array.isArray(data.lines) || data.lines.length > MAX_LINES) fail('document');
    const sourceChars = options.chars || [];
    const targetTiming = (target, length, chars) => encodeTiming(target, length,
      target.granularity === 'word' && options.wordRanges && chars.length === length ? options.wordRanges(chars) : null);
    const result = { version: VERSION, timeUnit: 'ms', indexUnit: 'nfc-codepoint',
      ...(data.source !== undefined ? { source: clone(data.source) } : {}),
      ...(data.trackDurationMs !== undefined ? { trackDurationMs: data.trackDurationMs } : {}),
      lines: data.lines.map(line => {
        const offset = integer(line.start, 0, 10000000, 'line offset');
        const length = integer(line.end - offset + 1, 1, MAX_LENGTH, 'line length');
        const value = { id: 'l' + offset.toString(36), offset, length,
          timing: targetTiming(line, length, sourceChars.slice(offset, offset + length)) };
        const meta = metadata(line); if (Object.keys(meta).length) value.meta = meta;
        if (line.styleRanges?.length) value.styles = line.styleRanges.map(style => ({ range: [style.start - offset, style.end - offset + 1], ...metadata(style) }));
        if (line.hiddenRanges?.length) value.hidden = rangesToLocal(line.hiddenRanges, offset);
        if (line.mergedLineContinuationStarts?.length) value.continuations = line.mergedLineContinuationStarts.map(start => start - offset);
        if (line.parallel) {
          value.parallel = { layout: line.parallel.layout,
            parts: line.parallel.parts.map(part => {
              const chars = (part.ranges || []).flatMap(range => sourceChars.slice(range.start, range.end + 1));
              const next = { id: part.id, role: part.role, ranges: rangesToLocal(part.ranges, offset), join: clone(part.join || []),
                ...(part.chars === undefined && part.timing === undefined && units.has(part.granularity) ? { pendingUnit: part.granularity } : {}),
                ...(part.chars !== undefined || part.timing !== undefined ? { timing: targetTiming(part, countRanges(part.ranges), chars) } : {}) };
              const partMeta = metadata(part); if (Object.keys(partMeta).length) next.meta = partMeta;
              return next;
            }),
            ...(line.parallel.hiddenRanges?.length ? { hidden: rangesToLocal(line.parallel.hiddenRanges, offset) } : {}),
            ...(line.parallel.manualSplitPoints !== undefined ? { splits: clone(line.parallel.manualSplitPoints) } : {}) };
        }
        if (line.parallel && value.timing.unit !== 'mixed') {
          const marks = parentMarks(line);
          if (marks && JSON.stringify(marks) === JSON.stringify(expanded(line, length))) {
            value.derivedTiming = Object.fromEntries(Object.entries(value.timing).filter(([key]) => !['startMs','deltaMs'].includes(key)));
            delete value.timing;
          }
        }
        return value;
      }) };
    validate(result);
    return result;
  }
  function decode(data) {
    if (data?.version !== VERSION) return data;
    keys(data, ['version', 'timeUnit', 'indexUnit', 'source', 'trackDurationMs', 'lines'], 'document fields');
    if (data.timeUnit !== 'ms' || data.indexUnit !== 'nfc-codepoint' || !Array.isArray(data.lines) || data.lines.length > MAX_LINES) fail('document encoding');
    if (data.trackDurationMs !== undefined) integer(data.trackDurationMs, 1, MAX_TIME, 'trackDurationMs');
    if (data.source !== undefined && !object(data.source)) fail('source');
    let previous = 0, totalLength = 0;
    const ids = new Set();
    const lines = data.lines.map(line => {
      keys(line, ['id', 'offset', 'length', 'timing', 'derivedTiming', 'meta', 'styles', 'hidden', 'continuations', 'parallel'], 'line fields');
      const offset = integer(line.offset, previous, 10000000, 'line offset');
      const length = integer(line.length, 1, MAX_LENGTH, 'line length');
      totalLength += length;
      if (totalLength > 1000000) fail('document character budget');
      if (line.id !== 'l' + offset.toString(36) || ids.has(line.id)) fail('line id');
      ids.add(line.id); previous = offset + length;
      if ((line.timing === undefined) === (line.derivedTiming === undefined)) fail('one parent timing is required');
      const result = { start: offset, end: offset + length - 1, ...readMeta(line.meta) };
      if (line.hidden !== undefined) result.hiddenRanges = readRanges(line.hidden, offset, length);
      if (line.styles !== undefined) {
        if (!Array.isArray(line.styles) || line.styles.length > length) fail('styles');
        result.styleRanges = line.styles.map(style => {
          keys(style, ['range', ...META], 'style fields');
          return { ...readRanges([style.range], offset, length)[0], ...metadata(style) };
        });
      }
      if (line.continuations !== undefined) {
        if (!Array.isArray(line.continuations)) fail('continuations');
        result.mergedLineContinuationStarts = line.continuations.map(start => offset + integer(start, 1, length - 1, 'continuation'));
      }
      if (line.parallel !== undefined) {
        const parallel = line.parallel;
        keys(parallel, ['layout', 'parts', 'hidden', 'splits'], 'parallel fields');
        if (parallel.layout !== 'stack' || !Array.isArray(parallel.parts) || !parallel.parts.length || parallel.parts.length > 16) fail('parallel layout');
        const partIds = new Set();
        result.parallel = { layout: 'stack', parts: parallel.parts.map(part => {
          keys(part, ['id', 'role', 'ranges', 'join', 'timing', 'meta', 'pendingUnit'], 'part fields');
          if (typeof part.id !== 'string' || !part.id.length || part.id.length > 32 || partIds.has(part.id)) fail('part id');
          partIds.add(part.id);
          if (!['lead', 'background'].includes(part.role)) fail('part role');
          const ranges = readRanges(part.ranges, offset, length);
          totalLength += countRanges(ranges);
          if (totalLength > 1000000) fail('document character budget');
          if (!ranges.length || !Array.isArray(part.join) || part.join.length !== ranges.length - 1
            || part.join.some(join => !Number.isInteger(join) || join < 0 || join > 2)) fail('part join');
          const decoded = part.timing === undefined ? {} : decodeTiming(part.timing, countRanges(ranges));
          if (part.pendingUnit !== undefined) {
            if (part.timing !== undefined || !units.has(part.pendingUnit)) fail('pending unit');
            decoded.granularity = part.pendingUnit;
          }
          const value = { id: part.id, role: part.role, ranges, join: clone(part.join), ...decoded, ...readMeta(part.meta) };
          if (part.timing !== undefined) timingCache.set(value, timingCache.get(decoded));
          return value;
        }) };
        if (parallel.hidden !== undefined) result.parallel.hiddenRanges = readRanges(parallel.hidden, offset, length);
        if (parallel.splits !== undefined) {
          if (!Array.isArray(parallel.splits)) fail('parallel splits');
          result.parallel.manualSplitPoints = parallel.splits.map(value => integer(value,1,length-1,'parallel split'));
        }
      }
      const marks = line.derivedTiming === undefined ? null : parentMarks(result);
      if (line.derivedTiming !== undefined && !marks) fail('parent cannot be derived from parts');
      const timing = decodeTiming(marks ? restoreParentTiming(line.derivedTiming, marks) : line.timing, length);
      Object.assign(result, timing);
      timingCache.set(result, timingCache.get(timing));
      return result;
    });
    return { version: 5, ...(data.source !== undefined ? { source: clone(data.source) } : {}),
      ...(data.trackDurationMs !== undefined ? { trackDurationMs: data.trackDurationMs } : {}), lines };
  }
  function validate(data) { if (data?.version !== VERSION) fail('document version'); decode(data); return data; }
  const stable = value => Array.isArray(value) ? value.map(stable) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().filter(key => !['searchSource', 'candidateKey'].includes(key)).map(key => [key, stable(value[key])])) : value;
  const canonical = data => JSON.stringify(stable(data?.version === VERSION ? encode(decode(data)) : encode(data)));
  const fingerprint = data => {
    // Deterministic content identity; callers requiring an authenticity hash
    // hash canonical() with SHA-256. This fingerprint is never authorization.
    const text = canonical(data); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0') + '-' + text.length;
  };
  function diff(before, after) {
    const next = encode(after); const previous = before ? encode(before) : null;
    if (!previous) return { document: next };
    const old = new Map(previous.lines.map(line => [line.id, line]));
    const ids = new Set(next.lines.map(line => line.id));
    const put = next.lines.filter(line => JSON.stringify(stable(line)) !== JSON.stringify(stable(old.get(line.id))));
    const remove = previous.lines.filter(line => !ids.has(line.id)).map(line => line.id);
    const meta = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'lines'));
    return { put, remove, ...(JSON.stringify(stable(meta(previous))) !== JSON.stringify(stable(meta(next))) ? { meta: meta(next) } : {}) };
  }
  function applyPatch(before, patch) {
    keys(patch, ['document', 'put', 'remove', 'meta'], 'patch fields');
    if (patch.document !== undefined) {
      if (Object.keys(patch).length !== 1) fail('ambiguous snapshot patch');
      if (patch.document?.version !== VERSION) fail('patch document version');
      return encode(patch.document);
    }
    if (!before || !Array.isArray(patch.put) || !Array.isArray(patch.remove) || patch.put.length > MAX_LINES || patch.remove.length > MAX_LINES) fail('patch');
    const previous = encode(before), lines = new Map(previous.lines.map(line => [line.id, line]));
    const changes = new Set();
    for (const id of patch.remove) { if (typeof id !== 'string' || changes.has(id) || !lines.delete(id)) fail('remove id'); changes.add(id); }
    for (const line of patch.put) { if (!object(line) || typeof line.id !== 'string' || changes.has(line.id)) fail('put id'); changes.add(line.id); lines.set(line.id, clone(line)); }
    let meta = Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'lines'));
    if (patch.meta !== undefined) { keys(patch.meta, ['version', 'timeUnit', 'indexUnit', 'source', 'trackDurationMs'], 'patch metadata'); meta = clone(patch.meta); }
    const result = { ...meta, lines: [...lines.values()].sort((a, b) => a.offset - b.offset) };
    validate(result);
    return result;
  }
  function projectUnits(before, after, indexes) {
    if (!Array.isArray(before?.unitLayout) || !Array.isArray(after?.chars)) return after;
    const unitsByChar = []; let word = 0;
    before.unitLayout.forEach((run, group) => {
      const lengths = run.unit === 'word' ? run.lengths || [run.length] : [run.length];
      for (const length of lengths) {
        for (let i=0; i<length; i++) unitsByChar.push({ unit: run.unit, declared: run.declared, group, word });
        word++;
      }
    });
    if (indexes.length !== after.chars.length || indexes.some(index => !Number.isInteger(index) || !unitsByChar[index])) return after;
    const layout = [];
    let lastWord;
    for (const index of indexes) {
      const item = unitsByChar[index]; let run = layout.at(-1);
      if (!run || run.group !== item.group) {
        run = { length: 0, unit: item.unit, group: item.group, ...(item.declared === false ? { declared: false } : {}),
          ...(item.unit === 'word' ? { lengths: [] } : {}) }; layout.push(run); lastWord = undefined;
      }
      run.length++;
      if (run.lengths) { if (lastWord !== item.word) run.lengths.push(1); else run.lengths[run.lengths.length-1]++; lastWord = item.word; }
    }
    return { ...after, unitLayout: layout.map(({group,...run})=>run), granularity: 'character' };
  }
  function recordedUnits(before, after, indexes, unit, wordRanges) {
    if (!before || !units.has(unit) || !Array.isArray(after?.chars) || !indexes?.length) return after;
    const length = after.chars.length;
    let old;
    try { old = encodeTiming(before, length, before.granularity === 'word' ? wordRanges : null); } catch { return after; }
    const labels = unitRuns(old, length).flatMap(run => new Array(run.length).fill(run.unit));
    const selected = new Set(indexes.filter(index => Number.isInteger(index) && index >= 0 && index < length));
    for (const index of selected) labels[index] = unit;
    const runs = [];
    for (let from = 0; from < length;) {
      let to = from + 1; while (to < length && labels[to] === labels[from] && (labels[from] !== 'line' || after.chars[to] === after.chars[from])) to++;
      const run = { length: to - from, unit: labels[from] || 'character', ...(labels[from] ? {} : { declared: false }) };
      if (run.unit === 'word') {
        const boundaries = (wordRanges || []).map(range => range.end + 1).filter(end => end > from && end < to);
        const ends = [...boundaries, to]; let cursor = from;
        run.lengths = ends.map(end => { const size = end - cursor; cursor = end; return size; });
      }
      runs.push(run); from = to;
    }
    if (runs.length === 1 && !runs[0].declared) {
      const result = { ...after, granularity: runs[0].unit }; delete result.unitLayout; return result;
    }
    // Keep an explicit layout even when all marks happen to coincide. Equality
    // of timestamps is not proof that character work became word/line work.
    return { ...after, granularity: 'character', unitLayout: runs };
  }
  const unitRuns = (timing, length) => timing.unit === 'mixed'
    ? timing.runs.flatMap(run => unitRuns(run.timing, run.length))
    : [{ unit: timing.declared === false ? null : timing.unit, length }];
  async function hash(data, cryptoApi = globalThis.crypto) {
    const bytes = new TextEncoder().encode(canonical(data));
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return { VERSION, MAX_LENGTH, encode, decode, validate, encodeTiming, decodeTiming, hash,
    timeValues, expanded, canonical, fingerprint, diff, applyPatch, unitRuns, recordedUnits, projectUnits,
    timingFor: target => timingCache.get(target)?.timing || null };
});
