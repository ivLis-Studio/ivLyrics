/** NVIDIA hosted NIM APIs use the OpenAI-compatible chat protocol. */
import { createOpenAICompatibleAddon } from "./Addon_AI_ChatGPT.js";
import { createBuiltinAiProviderServices } from "./builtinAiProviderServices.mjs";

export default function initializeNvidiaNimAddon(services = createBuiltinAiProviderServices(window)) {
    return createOpenAICompatibleAddon({
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        requestDefaults: { max_tokens: 16000, temperature: 0.3 },
        info: {
            id: 'nvidia-nim',
            name: 'NVIDIA NIM',
            author: 'default',
            version: '1.0.0',
            apiKeyUrl: 'https://build.nvidia.com/',
            description: {
                ko: 'NVIDIA NIM 모델을 사용하는 번역, 발음 및 가사 학습',
                en: 'Translation, pronunciation and lyrics study using NVIDIA NIM models',
                ja: 'NVIDIA NIMモデルを使用した翻訳、発音、歌詞学習',
                'zh-CN': '使用 NVIDIA NIM 模型进行翻译、发音和歌词学习',
                'zh-TW': '使用 NVIDIA NIM 模型進行翻譯、發音和歌詞學習',
                hi: 'NVIDIA NIM मॉडल का उपयोग करके अनुवाद, उच्चारण और लिरिक्स अध्ययन',
                es: 'Traducción, pronunciación y estudio de letras con modelos de NVIDIA NIM',
                fr: 'Traduction, prononciation et étude des paroles avec les modèles NVIDIA NIM',
                ar: 'الترجمة والنطق ودراسة كلمات الأغاني باستخدام نماذج NVIDIA NIM',
                fa: 'ترجمه، تلفظ و مطالعه متن ترانه با استفاده از مدل‌های NVIDIA NIM',
                de: 'Übersetzung, Aussprache und Lernen mit Songtexten mithilfe der Modelle von NVIDIA NIM',
                ru: 'Перевод, произношение и изучение текстов песен с помощью моделей NVIDIA NIM',
                sv: 'Översättning, uttal och inlärning med låttexter via NVIDIA NIM-modeller',
                pt: 'Tradução, pronúncia e estudo de letras com modelos do NVIDIA NIM',
                bn: 'NVIDIA NIM মডেল ব্যবহার করে অনুবাদ, উচ্চারণ ও লিরিক্স দিয়ে শেখা',
                cs: 'Překlad, výslovnost a studium textů písní pomocí modelů NVIDIA NIM',
                it: 'Traduzione, pronuncia e studio dei testi con i modelli NVIDIA NIM',
                th: 'การแปล คำอ่าน และการเรียนรู้จากเนื้อเพลงโดยใช้โมเดล NVIDIA NIM',
                vi: 'Dịch thuật, phát âm và học qua lời bài hát bằng các mô hình NVIDIA NIM',
                id: 'Terjemahan, pelafalan, dan belajar lewat lirik menggunakan model NVIDIA NIM',
                ms: 'Terjemahan, sebutan dan pembelajaran melalui lirik menggunakan model NVIDIA NIM',
                tr: 'NVIDIA NIM modelleriyle çeviri, telaffuz ve şarkı sözleriyle öğrenme'
            },
            supports: {
                translate: true, pronunciation: true, metadata: true, tmi: true,
                researchWebSearch: false, lyricsStudy: true,
                characterPronunciation: true, culturalAnnotations: true,
                // generateSettingsAssistant comes from the shared OpenAI-compatible addon.
                settingsAssistant: true
            },
            models: []
        }
    }, services);
}
