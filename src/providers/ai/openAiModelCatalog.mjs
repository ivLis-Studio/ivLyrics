export function createOpenAiModelCatalog({ defaultBaseUrl, getAiRequest, getApiKeys, getSetting, debug }) {
    /**
     * OpenAI API에서 사용 가능한 모델 목록을 가져옴 (채팅/텍스트 생성용 모델만)
     */
    async function fetchAvailableModels(apiKey, baseUrl) {
        if (!apiKey) return [];

        const normalizedBaseUrl = (baseUrl || defaultBaseUrl).replace(/\/$/, '');
        const isOpenAIBaseUrl = normalizedBaseUrl === 'https://api.openai.com/v1';

        // 제외할 모델 패턴 (이미지 생성, 음성, 임베딩 등)
        const excludePatterns = [
            'dall-e',        // 이미지 생성
            'whisper',       // 음성 인식
            'tts',           // 텍스트 음성 변환
            'embedding',     // 임베딩
            'text-embedding',// 임베딩
            'davinci',       // 레거시 completion 모델
            'curie',         // 레거시
            'babbage',       // 레거시
            'ada',           // 레거시 (ada만, 단독으로)
            'audio',         // 오디오 관련
            'moderation',    // 콘텐츠 모더레이션
            'search',        // 검색
            'similarity',    // 유사도
            'code-',         // 레거시 코드 모델
            'text-davinci',  // 레거시
            'gpt-3.5-turbo-instruct', // instruct 모델
            'image',         // 이미지 관련
        ];

        try {
            const endpoint = `${normalizedBaseUrl}/models`;
            const response = await getAiRequest()(endpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                debug('[ChatGPT Addon] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            let models = (data.data || [])
                .filter(m => m.id)
                .map(m => ({
                    id: m.id,
                    name: m.id,
                    owned_by: m.owned_by || ''
                }));

            // OpenAI 기본 API에서는 기존처럼 채팅용 모델만 추려서 노출한다.
            // 사용자가 Base URL을 바꾼 OpenAI 호환 서버는 임의 모델명을 쓸 수 있으므로 이름 검사를 건너뛴다.
            if (isOpenAIBaseUrl) {
                models = models
                    .filter(m => {
                        const id = m.id.toLowerCase();
                        // GPT 또는 chat 모델만 포함
                        if (!id.startsWith('gpt') && !id.includes('chat') && !id.includes('o1') && !id.includes('o3')) return false;
                        // 제외 패턴 체크
                        for (const pattern of excludePatterns) {
                            if (id.includes(pattern.toLowerCase())) return false;
                        }
                        // realtime 모델 제외
                        if (id.includes('realtime')) return false;
                        return true;
                    })
                    // 정렬: gpt-5 > gpt-4 > o3 > o1 순서
                    .sort((a, b) => {
                        // GPT 모델과 o-시리즈 구분
                        const aIsGpt = a.id.startsWith('gpt-');
                        const bIsGpt = b.id.startsWith('gpt-');
                        const aIsO = a.id.match(/^o(\d)/);
                        const bIsO = b.id.match(/^o(\d)/);

                        // GPT 모델이 o-시리즈보다 먼저
                        if (aIsGpt && !bIsGpt) return -1;
                        if (!aIsGpt && bIsGpt) return 1;

                        // 둘 다 GPT 모델인 경우: gpt-5 > gpt-4 > gpt-3.5
                        if (aIsGpt && bIsGpt) {
                            const aMatch = a.id.match(/gpt-(\d+(?:\.\d+)?)/);
                            const bMatch = b.id.match(/gpt-(\d+(?:\.\d+)?)/);
                            const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
                            const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
                            if (bNum !== aNum) return bNum - aNum;

                            // 같은 버전이면 turbo, mini 순서
                            if (a.id.includes('turbo') && !b.id.includes('turbo')) return -1;
                            if (!a.id.includes('turbo') && b.id.includes('turbo')) return 1;
                        }

                        // 둘 다 o-시리즈인 경우: o3 > o1
                        if (aIsO && bIsO) {
                            return parseInt(bIsO[1]) - parseInt(aIsO[1]);
                        }

                        return a.id.localeCompare(b.id);
                    });
            } else {
                models.sort((a, b) => a.id.localeCompare(b.id));
            }

            // 첫 번째 모델을 기본값으로 설정
            if (models.length > 0) {
                models[0].default = true;
            }

            return models;
        } catch (e) {
            debug('[ChatGPT Addon] Error fetching models:', e.message);
            return [];
        }
    }

    /**
     * 모델 목록 가져오기 (매번 API에서 로드)
     */
    async function getModels() {
        const apiKeys = getApiKeys();
        const baseUrl = getSetting('base-url', defaultBaseUrl);
        if (apiKeys.length === 0) return [];
        return await fetchAvailableModels(apiKeys[0], baseUrl);
    }

    return { fetchAvailableModels, getModels };
}
