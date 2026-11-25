function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function dedupeSortedTimes(times, minGap) {
    return times.filter((time, index, array) => index === 0 || (time - array[index - 1]) >= minGap);
}

export {
    clamp,
    clamp01,
    dedupeSortedTimes,
};
