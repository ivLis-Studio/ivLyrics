import assert from 'node:assert/strict';
import test from 'node:test';
import { getGeminiGenerationConfig } from '../src/providers/ai/geminiModelCatalog.mjs';

function config(model, enabled = false, budget = 1024) {
    const settings = { 'adv-thinking-enabled': enabled, 'adv-thinking-budget': budget };
    return getGeminiGenerationConfig((key, fallback) => settings[key] ?? fallback, () => model);
}

test('Gemini 3 requests use supported levels instead of a zero token budget', () => {
    for (const model of ['gemini-3.1-flash-lite', 'models/gemini-3.5-flash-lite', 'gemini-3.5-flash-lite-preview']) {
        assert.deepEqual(config(model).thinkingConfig, { thinkingLevel: 'minimal' });
        assert.deepEqual(config(model, true).thinkingConfig, { thinkingLevel: 'high' });
    }
    for (const model of ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.8-flash']) {
        assert.deepEqual(config(model).thinkingConfig, { thinkingLevel: 'low' });
        assert.deepEqual(config(model, true).thinkingConfig, { thinkingLevel: 'high' });
    }
});

test('2.5 budgets respect model limits and unsupported models receive no thinking field', () => {
    assert.deepEqual(config('gemini-2.5-flash').thinkingConfig, { thinkingBudget: 0 });
    assert.deepEqual(config('gemini-2.5-flash-lite', true, 1).thinkingConfig, { thinkingBudget: 512 });
    assert.deepEqual(config('gemini-2.5-pro', true, 1).thinkingConfig, { thinkingBudget: 128 });
    assert.deepEqual(config('gemini-2.5-flash', true, 999999).thinkingConfig, { thinkingBudget: 24576 });
    for (const model of ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemma-3-27b-it', 'custom-model']) {
        assert.equal(config(model).thinkingConfig, undefined);
        assert.equal(config(model).maxOutputTokens, 32768);
    }
});
