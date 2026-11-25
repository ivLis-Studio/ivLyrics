import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiTransport } from '../src/providers/ai/geminiTransport.mjs';
import { createAIRequest } from '../src/providers/ai/AIRequest.js';
import { openEventResponse } from './fixtures/ai-provider.mjs';

const prompt = { systemPrompt: ' Fixtures only ', userPrompt: 'Two lines of fixture text' };
const candidate = (parts, finishReason) => ({ candidates: [{ content: { parts }, finishReason }] });

function sseResponse(events) {
    // One byte per chunk exercises UTF-8 decoding and split SSE fields.
    const bytes = new TextEncoder().encode(events.map(event => 'data: ' + JSON.stringify(event)).join('\r\n'));
    return new Response(new ReadableStream({
        start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
        },
    }));
}

function setup(responses, requestImplementation) {
    const requests = [];
    const request = async (url, options, timeout) => {
        requests.push({ url: new URL(url), body: JSON.parse(options.body), timeout });
        return requestImplementation ? requestImplementation(url, options, timeout) : responses.shift();
    };
    const transport = createGeminiTransport({
        getAiRequest: () => request,
        getApiKeys: () => ['fixture-first', 'fixture-second'],
        getBaseUrl: () => 'https://gemini.example.test/',
        getSelectedModel: () => 'fixture-model',
        getGenerationConfig: () => ({ maxOutputTokens: 500 }),
        readRequestAttempts: () => 1,
        debug() {},
    });
    return { ...transport, requests };
}

test('Gemini rolls back rejected provisional output before trying the next key', async () => {
    const transport = setup([
        sseResponse([candidate([{ text: '잠정\n' }]), candidate([], 'MAX_TOKENS')]),
        sseResponse([
            candidate([{ text: '숨김\n', thought: true }, { text: '첫 줄\n' }]),
            candidate([{ text: '둘째 줄' }], 'STOP'),
        ]),
    ]);
    const changes = [];
    const received = await transport.callGeminiAPIStream(
        prompt,
        (index, text) => changes.push(['line', index, text]),
        data => changes.push(['reset', data]),
        undefined,
        text => text.split('\n'),
        5000,
    );
    assert.deepEqual(received, ['첫 줄', '둘째 줄']);
    assert.deepEqual(changes, [
        ['line', 0, '잠정'],
        ['reset', { reason: 'failed', error: '[Gemini] Response rejected (MAX_TOKENS)' }],
        ['line', 0, '첫 줄'],
        ['line', 1, '둘째 줄'],
    ]);
    assert.deepEqual(transport.requests.map(request => request.url.searchParams.get('key')), ['fixture-first', 'fixture-second']);
    assert.equal(transport.requests[0].timeout, 5000);
    assert.deepEqual(transport.requests[0].body.systemInstruction, { parts: [{ text: 'Fixtures only' }] });
});

test('Gemini reports a missing terminal reason and clears emitted lines without a reset handler', async () => {
    const transport = setup([
        sseResponse([candidate([{ text: 'First\n' }]), candidate([{ text: 'Second' }])]),
        new Response(null, { status: 429 }),
    ]);
    const lines = [];
    await assert.rejects(transport.callGeminiAPIStream(prompt, (index, text) => lines.push([index, text])), {
        code: 'GEMINI_RESPONSE_REJECTED',
        reason: 'MISSING_FINISH_REASON',
    });
    assert.deepEqual(lines, [[0, 'First'], [1, 'Second'], [0, ''], [1, '']]);
});

test('Gemini delivers each line in the final SSE frame before returning the result', async () => {
    const transport = setup([sseResponse([candidate([{ text: '첫 줄\n둘째 줄\n마지막 줄' }], 'STOP')])]);
    const lines = [];
    const result = await transport.callGeminiAPIStream(prompt, (index, line) => lines.push([index, line]));
    assert.equal(result, '첫 줄\n둘째 줄\n마지막 줄');
    assert.deepEqual(lines, [[0, '첫 줄'], [1, '둘째 줄'], [2, '마지막 줄']]);
});

test('Gemini delivers the final STOP chunk while releasing the open response', { timeout: 1500 }, async () => {
    const event = candidate([{ text: 'First\nLast' }], 'STOP');
    const { response, cancelled } = openEventResponse(`data: ${JSON.stringify(event)}\n\n`);
    const transport = setup([response]);
    const lines = [];
    assert.equal(await transport.callGeminiAPIStream(prompt, (i, line) => lines.push([i, line])), 'First\nLast');
    assert.deepEqual(lines, [[0, 'First'], [1, 'Last']]);
    await cancelled;
    assert.equal(response.body.locked, false);
});

test('Gemini accepts buffered JSON when the proxy converts the stream into a completion', async () => {
    const transport = setup([Response.json(candidate([{ text: '숨김', thought: true }, { text: '첫 줄\n둘째 줄' }], 'STOP'))]);
    const lines = [];
    const result = await transport.callGeminiAPIStream(prompt, (index, line) => lines.push([index, line]));
    assert.equal(result, '첫 줄\n둘째 줄');
    assert.deepEqual(lines, [[0, '첫 줄'], [1, '둘째 줄']]);
    assert.equal(transport.requests.length, 1);
});

test('Cosmos preserves the event framing when a Gemini URL requests SSE directly', async () => {
    const body = 'data: ' + JSON.stringify(candidate([{ text: '첫 줄\n둘째 줄' }], 'STOP'));
    let cosmosCalls = 0;
    const request = createAIRequest({
        host: { fetch: async () => { throw new TypeError('Failed to fetch'); } },
        getSpicetify: () => ({
            CosmosAsync: { request: async (_method, url) => {
                cosmosCalls++;
                assert.match(url, /:streamGenerateContent\?alt=sse/);
                return { status: 200, body };
            } },
        }),
    });
    const transport = setup([], request);
    const lines = [];
    assert.equal(await transport.callGeminiAPIStream(prompt, (index, line) => lines.push([index, line])), '첫 줄\n둘째 줄');
    assert.deepEqual(lines, [[0, '첫 줄'], [1, '둘째 줄']]);
    assert.equal(cosmosCalls, 1);
});
