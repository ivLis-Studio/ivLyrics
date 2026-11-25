import { consumeJsonSse } from "./aiEventStream.mjs";
import { createChatCompletionReader } from "./chatCompletionResponse.mjs";

const { readChoice: readChatCompletion, rejectResponse: rejectChatCompletion } =
    createChatCompletionReader('ChatGPT', 'CHATGPT_RESPONSE_REJECTED');
export { readChatCompletion };

export function createResponsesAPIError(data, fallback = 'Responses API request failed') {
    const response = data?.response || data;
    const error = response?.error || data?.error;
    const reason = response?.incomplete_details?.reason || response?.status || data?.type || '';
    return new Error(`[ChatGPT Web Search] ${error?.message || error?.code || reason || fallback}`);
}

function readResponsesOutputText(data) {
    if (data?.error || data?.status === 'failed' || data?.status === 'incomplete') {
        throw createResponsesAPIError(data);
    }
    return (Array.isArray(data?.output) ? data.output : [])
        .flatMap(item => Array.isArray(item?.content) ? item.content : [])
        .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('');
}

async function consumeChatCompletion(body, output) {
    let finishReason = '';
    await consumeJsonSse(body, {
        onChunk: output.emit,
        onEvent(data) {
            const chunk = readChatCompletion(data, true);
            output.append(chunk.text);
            if (chunk.finishReason) finishReason = chunk.finishReason;
        },
    });
    output.emit(true);
    if (finishReason !== 'stop') throw rejectChatCompletion(finishReason);
}

async function consumeResponsesOutput(body, output) {
    let completed = false;
    await consumeJsonSse(body, {
        onChunk: output.emit,
        onEvent(event) {
            switch (event.type) {
                case 'response.output_text.delta':
                    if (typeof event.delta === 'string') output.append(event.delta);
                    break;
                case 'response.output_text.done':
                    if (!output.text && typeof event.text === 'string') output.append(event.text);
                    break;
                case 'response.refusal.done':
                case 'response.refusal.delta':
                    throw new Error(`[ChatGPT Web Search] ${event.refusal || event.delta || 'Request refused'}`);
                case 'response.failed':
                case 'response.incomplete':
                case 'error':
                    throw createResponsesAPIError(event);
                case 'response.completed':
                    completed = true;
                    if (!output.text) output.append(readResponsesOutputText(event.response));
                    return false;
            }
        },
    });
    output.emit(true);
    if (!completed) throw new Error('[ChatGPT Web Search] Responses API stream ended before completion');
}

export async function readOpenAiStream(response, output, { responsesApi, onRawChunk, transformResult }) {
    const prefix = responsesApi ? '[ChatGPT Web Search]' : '[ChatGPT]';
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!response.body || !contentType.includes('text/event-stream')) {
        const data = await response.json();
        const text = responsesApi ? readResponsesOutputText(data) : readChatCompletion(data).text;
        if (!text.trim()) throw new Error(`${prefix} Empty response from API`);
        if (typeof onRawChunk === 'function') output.append(text);
        return output.finish(text, transformResult);
    }

    if (responsesApi) await consumeResponsesOutput(response.body, output);
    else await consumeChatCompletion(response.body, output);
    if (!output.text.trim()) throw new Error(`${prefix} Empty response from streaming API`);
    return output.finish(output.text, transformResult, { replayLines: responsesApi, clearEmptyLines: false });
}
