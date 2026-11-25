export function createLrclibTrackMatcher() {
    // An artist match alone does not make a candidate the same song: searches
    // also return the artist's other songs. Same-song spellings ("F.E.E.L." /
    // "FEEL", "Señorita" / "Senorita") score 0.85 and up, another song by the
    // same artist far less ("Lady Of Namek" / "The Color Violet" 0.47).
    const LRCLIB_ARTIST_MATCH_TITLE_THRESHOLD = 0.8;

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * 문자열 정규화 함수 (normalize)
     * ────────────────────────────────────────────────────────────────────────────
     *
     * 【목적】
     * 서로 다른 형식의 문자열을 비교하기 위해 통일된 형태로 변환합니다.
     * 예: "Hello  World" vs "hello world" → 동일하게 처리
     *
     * 【정규화 단계】
     * 1. NFKC 유니코드 정규화 - 호환 문자를 표준 형태로 통일
     *    예: ＡＢＣ(전각) → ABC(반각), ｶﾅ(반각) → カナ(전각)
     * 2. 소문자 변환 - 대소문자 구분 제거
     * 3. 양끝 공백 제거 (trim)
     * 4. 스마트 따옴표를 일반 따옴표로 변환
     *    예: '' "" → ' "
     * 5. 모든 종류의 괄호 제거 - 부가 정보(feat., remix 등) 무시
     * 6. 연속 공백을 단일 공백으로 치환
     *
     * @param {string} s - 정규화할 원본 문자열
     * @returns {string} 정규화된 문자열 (비어있으면 빈 문자열 반환)
     */
    const NORMALIZE_CACHE_MAX_SIZE = 512;
    const NORMALIZE_CACHE_MAX_KEY_LENGTH = 512;
    let normalizeCache = null;

    function normalize(s) {
        if (!s) return '';  // null/undefined 처리

        const canCache = typeof s === 'string' && s.length <= NORMALIZE_CACHE_MAX_KEY_LENGTH;
        const cached = canCache ? normalizeCache?.get(s) : undefined;
        if (cached !== undefined) {
            return cached;
        }

        const normalized = s.normalize('NFKC')       // 유니코드 NFKC 정규화
            .toLowerCase()               // 소문자 변환
            .trim()                      // 앞뒤 공백 제거
            .replace(/[\u2018\u2019]/g, "'")   // ''(스마트 작은따옴표) → '
            .replace(/[\u201c\u201d]/g, '"')   // ""(스마트 큰따옴표) → "
            .replace(/[()[\]{}]/g, '')   // 모든 괄호류 제거: () [] {}
            .replace(/\s+/g, ' ');       // 연속 공백 → 단일 공백

        if (canCache && typeof normalized === 'string') {
            const cache = normalizeCache || (normalizeCache = new Map());
            if (cache.size >= NORMALIZE_CACHE_MAX_SIZE) {
                cache.delete(cache.keys().next().value);
            }
            cache.set(s, normalized);
        }

        return normalized;
    }

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * Jaro-Winkler 유사도 계산 함수
     * ────────────────────────────────────────────────────────────────────────────
     *
     * 【알고리즘 개요】
     * Jaro-Winkler는 두 문자열 간의 유사도를 0.0 ~ 1.0 사이 값으로 반환합니다.
     * 특히 짧은 문자열이나 오타 검출에 효과적이며, 제목/아티스트 매칭에 적합합니다.
     *
     * 【계산 과정】
     * 1단계: Jaro 유사도 (dj) 계산
     *   - 일치 윈도우 = max(len1, len2) / 2 - 1
     *   - 윈도우 내에서 일치하는 문자 수 계산
     *   - 순서가 다른 일치(transposition) 계산
     *   - dj = (m/l1 + m/l2 + (m-t)/m) / 3
     *
     * 2단계: Winkler 보정
     *   - 공통 접두사(최대 4자)에 가중치 부여
     *   - 최종 점수 = dj + prefix * 0.1 * (1 - dj)
     *
     * 【예시】
     * - "MARTHA" vs "MARHTA" → 약 0.96 (철자 오류에도 높은 유사도)
     * - "DWAYNE" vs "DUANE" → 약 0.84
     * - "ABC" vs "XYZ" → 0.0 (완전 불일치)
     *
     * @param {string} s1 - 비교할 첫 번째 문자열
     * @param {string} s2 - 비교할 두 번째 문자열
     * @returns {number} 유사도 점수 (0.0 = 완전 불일치, 1.0 = 완전 일치)
     */
    function jaroWinkler(s1, s2) {
        // 먼저 두 문자열을 정규화하여 공정한 비교 수행
        s1 = normalize(s1);
        s2 = normalize(s2);

        // Edge case 처리
        if (!s1 || !s2) return 0;  // 빈 문자열은 유사도 0
        if (s1 === s2) return 1;   // 완전 일치는 유사도 1

        const l1 = s1.length;  // 첫 번째 문자열 길이
        const l2 = s2.length;  // 두 번째 문자열 길이

        // 【일치 윈도우 계산】
        // 두 문자가 "일치"로 간주되려면 위치 차이가 윈도우 이내여야 함
        const matchWindow = Math.floor(Math.max(l1, l2) / 2) - 1;

        // 각 문자열에서 어떤 문자가 일치로 표시되었는지 추적
        const s1Matches = new Array(l1).fill(false);
        const s2Matches = new Array(l2).fill(false);

        // 【1단계: 일치하는 문자 찾기】
        let matches = 0;
        for (let i = 0; i < l1; i++) {
            // 현재 문자 s1[i]와 일치할 수 있는 s2의 범위 계산
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, l2);

            for (let j = start; j < end; j++) {
                if (s2Matches[j]) continue;  // 이미 매칭된 문자는 스킵
                if (s1[i] === s2[j]) {
                    s1Matches[i] = true;
                    s2Matches[j] = true;
                    matches++;
                    break;  // 이 문자에 대한 매칭 완료
                }
            }
        }

        // 일치하는 문자가 하나도 없으면 유사도 0
        if (matches === 0) return 0;

        // 【2단계: Transposition(순서 차이) 계산】
        // 일치한 문자들의 순서가 다른 경우를 계산
        let t = 0;  // transposition 카운트
        let k = 0;  // s2에서의 현재 위치
        for (let i = 0; i < l1; i++) {
            if (!s1Matches[i]) continue;  // 일치하지 않은 문자는 스킵
            while (!s2Matches[k]) k++;     // s2에서 다음 일치 문자 찾기
            if (s1[i] !== s2[k]) t++;       // 순서가 다르면 transposition
            k++;
        }
        t /= 2;  // transposition은 쌍으로 계산되므로 2로 나눔

        // 【3단계: Jaro 유사도 계산】
        // dj = (일치율_s1 + 일치율_s2 + 순서일치율) / 3
        const dj = (matches / l1 + matches / l2 + (matches - t) / matches) / 3;

        // 【4단계: Winkler 보정 - 공통 접두사 가중치】
        // 앞부분이 같으면 추가 점수 (최대 4자까지만 고려)
        let prefix = 0;
        for (let i = 0; i < Math.min(l1, l2, 4); i++) {
            if (s1[i] === s2[i]) prefix++;
            else break;  // 첫 불일치에서 중단
        }

        // 최종 Jaro-Winkler 점수 반환
        // 접두사가 같을수록 점수가 높아짐 (최대 0.1 * 4 = 0.4 보너스)
        return dj + prefix * 0.1 * (1 - dj);
    }

    /**
     * 아티스트 문자열을 비교 가능한 단위로 분리합니다.
     * 예: "Artist A, Artist B & Artist C" -> ["Artist A", "Artist B", "Artist C"]
     *
     * @param {string} artistText - 원본 아티스트 문자열
     * @returns {string[]} 정리된 아티스트 배열
     */
    function splitArtists(artistText) {
        if (!artistText || typeof artistText !== 'string') return [];
        return artistText
            .split(/[&,]/g)
            .map(part => part.trim())
            .filter(Boolean);
    }

    /**
     * 제목 문자열 사이의 비교 점수를 계산합니다.
     * 완전 일치나 포함 관계가 있으면 높은 점수를 주고,
     * 그 외에는 Jaro-Winkler 점수를 사용합니다.
     *
     * @param {string} expectedTitle - 현재 트랙 제목
     * @param {string} candidateTitle - LRCLIB 후보 제목
     * @returns {number} 제목 유사도 점수
     */
    function getTitleScore(expectedTitle, candidateTitle) {
        const normalizedExpected = normalize(expectedTitle);
        const normalizedCandidate = normalize(candidateTitle);

        if (!normalizedExpected || !normalizedCandidate) return 0;
        if (normalizedExpected === normalizedCandidate) return 1;
        if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) return 0.99;

        return jaroWinkler(normalizedExpected, normalizedCandidate);
    }

    /**
     * Whether two titles use the same writing system (Latin or not), so their
     * similarity means anything: a Korean Spotify title and its romanized
     * LRCLIB title share no letters.
     *
     * @param {string} expectedTitle - title of the playing track
     * @param {string} candidateTitle - LRCLIB candidate title
     * @returns {boolean} true when both titles are mostly Latin or both are not
     */
    function hasComparableTitleScripts(expectedTitle, candidateTitle) {
        const latinShare = (text) => {
            const letters = String(text || '').match(/\p{L}/gu) || [];
            if (!letters.length) return null;
            return letters.filter(letter => /\p{Script=Latin}/u.test(letter)).length / letters.length;
        };
        const expected = latinShare(expectedTitle);
        const candidate = latinShare(candidateTitle);
        if (expected === null || candidate === null) return false;
        return (expected >= 0.5) === (candidate >= 0.5);
    }

    /**
     * An artist-matched candidate is this song only with title evidence: a
     * similar title, or community sync data that identified this LRCLIB entry
     * or its exact line shape. Titles in different scripts cannot be compared
     * and keep the artist match alone.
     *
     * @param {Object} candidate - scored LRCLIB candidate
     * @param {string} expectedTitle - title of the playing track
     * @returns {boolean} true when the candidate may stand for this song
     */
    function hasSameSongTitleEvidence(candidate, expectedTitle) {
        if (Number(candidate?.syncSourceMatchScore || 0) > 0 || candidate?.syncLineExactMatch) return true;
        if (Number(candidate?.titleScore || 0) >= LRCLIB_ARTIST_MATCH_TITLE_THRESHOLD) return true;
        const candidateTitle = candidate?.trackName || candidate?.name || '';
        return !hasComparableTitleScripts(expectedTitle, candidateTitle);
    }

    /**
     * 자유검색에서 제목 기반으로 후보를 허용할 수 있을 만큼
     * 재생 시간이 충분히 정확하게 일치하는지 확인합니다.
     * LRCLIB와 Spotify의 길이 표기가 초 단위인 경우가 많아 반올림 후 비교합니다.
     *
     * @param {number} expectedDurationSec - 현재 트랙 길이(초)
     * @param {number} candidateDurationSec - LRCLIB 후보 길이(초)
     * @returns {boolean} 초 단위 반올림 기준 정확히 일치하면 true
     */
    function hasExactDurationMatch(expectedDurationSec, candidateDurationSec) {
        if (!Number.isFinite(expectedDurationSec) || !Number.isFinite(candidateDurationSec)) return false;
        return Math.round(expectedDurationSec) === Math.round(candidateDurationSec);
    }

    /**
     * 기대 아티스트 목록과 후보 아티스트 목록 사이의 최고 Jaro-Winkler 점수를 계산합니다.
     *
     * @param {string[]} expectedArtists - 현재 트랙의 아티스트 목록
     * @param {string[]} candidateArtists - LRCLIB 후보의 아티스트 목록
     * @returns {number} 최고 유사도 점수
     */
    function getBestArtistScore(expectedArtists, candidateArtists) {
        if (!Array.isArray(expectedArtists) || !Array.isArray(candidateArtists)) return 0;
        if (expectedArtists.length === 0 || candidateArtists.length === 0) return 0;

        let bestScore = 0;
        for (const expectedArtist of expectedArtists) {
            for (const candidateArtist of candidateArtists) {
                bestScore = Math.max(bestScore, jaroWinkler(expectedArtist, candidateArtist));
            }
        }
        return bestScore;
    }

    return {
        normalize,
        splitArtists,
        getTitleScore,
        hasSameSongTitleEvidence,
        hasExactDurationMatch,
        getBestArtistScore
    };
}
