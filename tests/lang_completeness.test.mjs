import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const directory = new URL('../src/i18n/langs/', import.meta.url);
function flatten(value, prefix = '', result = {}) {
    for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, result);
        else result[path] = item;
    }
    return result;
}
function load(name) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    const tokens = (source.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) || [])
        .filter(token => !token.startsWith('//') && !token.startsWith('/*'));
    const objects = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token === '{' || token === '[') objects.push(new Set());
        else if (token === '}' || token === ']') objects.pop();
        else if (token.startsWith('"') && tokens[index + 1] === ':') {
            const key = JSON.parse(token);
            assert.ok(!objects.at(-1).has(key), `${name}: duplicate key ${key}`);
            objects.at(-1).add(key);
        }
    }
    return flatten(readLanguageTable(name));
}
const reference = load('LangKo.js');
const placeholders = text => (text.match(/\{\w+\}|%(?:\d+\$)?[sd]/g) || []).sort();
for (const file of readdirSync(directory).filter(name => /^Lang.*\.js$/.test(name))) {
    test(`${file} includes every Korean key and preserves translation placeholders`, () => {
        const translated = load(file);
        for (const [key, value] of Object.entries(reference)) {
            assert.ok(key in translated, `${file}: missing ${key}`);
            assert.equal(typeof translated[key], typeof value, `${file}: wrong type for ${key}`);
            if (typeof value !== 'string') continue;
            assert.ok(translated[key].trim(), `${file}: empty ${key}`);
            assert.deepEqual(placeholders(translated[key]), placeholders(value), `${file}: placeholders in ${key}`);
        }
    });
}
