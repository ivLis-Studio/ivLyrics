import { parseKeyboardShortcut } from "../../core/keyboardShortcut.mjs";
import { FULLSCREEN_SHORTCUT, TV_SHORTCUT } from "./fullscreenShortcutSettings.mjs";

export function createFullscreenShortcutBindings({ primaryModifier, now = Date.now }) {
    const names = [FULLSCREEN_SHORTCUT, TV_SHORTCUT];
    const sequenceTimeout = 1000;
    let bindings = [];
    let knownChords = new Set();

    function configure(values) {
        const sequences = names.map(name => parseKeyboardShortcut(values[name], primaryModifier));
        if (sequences.every((sequence, index) => sequence.join(" ") === bindings[index]?.sequence.join(" "))) return;
        bindings = sequences.map(sequence => ({ sequence, index: 0, last: 0 }));
        knownChords = new Set(sequences.flat());
    }

    function reset() {
        for (const binding of bindings) binding.index = 0;
    }

    function match(chord, fullscreen) {
        const time = now();
        let action = null;
        // TV wins if both shortcuts are assigned the same chord while fullscreen.
        bindings.forEach((binding, index) => {
            const { sequence } = binding;
            if (time - binding.last > sequenceTimeout || (index === 1 && !fullscreen)) binding.index = 0;
            if (!sequence.length || (index === 1 && !fullscreen)) return;
            if (chord === sequence[binding.index]) binding.index++;
            else binding.index = Number(chord === sequence[0]);
            binding.last = time;
            if (binding.index === sequence.length) {
                binding.index = 0;
                action = names[index];
            }
        });
        return action;
    }

    return {
        configure, reset, match, includes: chord => knownChords.has(chord),
        hasPartialMatch: () => bindings.some(binding => binding.index > 0),
    };
}
