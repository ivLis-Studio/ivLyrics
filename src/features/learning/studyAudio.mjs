export function createStudyAudio({ host, isOpen, readPlayback, matchesPlayback, pausePlayer, resumePlayer, clearLyricPlaybackTimer }) {
    let activeSpeech = null;

    let audioContext = null;
    const getAudioContext = () => {
        const AudioContextCtor = host.AudioContext || host.webkitAudioContext;
        if (!AudioContextCtor) return null;
        if (!audioContext) {
            audioContext = new AudioContextCtor();
        }
        if (audioContext.state === "suspended") {
            audioContext.resume?.().catch(() => {});
        }
        return audioContext;
    };

    const playTone = (context, { frequency, startTime, duration, gainValue, type }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.025);
    };

    const playQuizSound = (correct) => {
        const context = getAudioContext();
        if (!context) return;
        const now = context.currentTime;

        if (correct) {
            playTone(context, { frequency: 523.25, startTime: now, duration: 0.12, gainValue: 0.14, type: "triangle" });
            playTone(context, { frequency: 659.25, startTime: now + 0.09, duration: 0.13, gainValue: 0.13, type: "triangle" });
            playTone(context, { frequency: 783.99, startTime: now + 0.18, duration: 0.16, gainValue: 0.12, type: "triangle" });
            return;
        }

        playTone(context, { frequency: 196, startTime: now, duration: 0.17, gainValue: 0.13, type: "sawtooth" });
        playTone(context, { frequency: 146.83, startTime: now + 0.12, duration: 0.2, gainValue: 0.115, type: "sawtooth" });
    };

    const normalizeSpeechLang = (lang = "") => {
        const value = String(lang || "").toLowerCase();
        if (!value || value === "auto") return "";
        if (value.startsWith("ja")) return "ja-JP";
        if (value.startsWith("en")) return "en-US";
        if (value.startsWith("ko")) return "ko-KR";
        if (value.startsWith("zh")) return "zh-CN";
        return value;
    };

    const detectSpeechLang = (text, fallbackLang = "") => {
        const value = String(text || "");
        if (/[\u3040-\u30ff]/.test(value)) return "ja-JP";
        if (/[a-zA-Z]/.test(value)) return "en-US";
        if (/[\uac00-\ud7af]/.test(value)) return "ko-KR";
        return normalizeSpeechLang(fallbackLang) || "";
    };

    const getBestSpeechVoice = (lang = "") => {
        const target = normalizeSpeechLang(lang);
        if (!target || !host.speechSynthesis?.getVoices) return null;
        const voices = host.speechSynthesis.getVoices() || [];
        if (voices.length === 0) return null;
        const targetLower = target.toLowerCase();
        const base = targetLower.split("-")[0];
        return voices.find((voice) => String(voice.lang || "").toLowerCase() === targetLower)
            || voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(`${base}-`))
            || voices.find((voice) => String(voice.name || "").toLowerCase().includes(base))
            || null;
    };

    const resumeAfterSpeech = (speech) => {
        if (!speech.resume) return;
        const current = readPlayback();
        if (current.isPlaying || !matchesPlayback(speech.playback, current)) return;
        try {
            resumePlayer(current.player);
        } catch (error) {
            console.warn("[LearningMode] failed to resume after speech:", error);
        }
    };

    const cancelSpeech = (resume = false) => {
        const speech = activeSpeech;
        if (!speech) return;
        // Cancel can fire the utterance's error callback synchronously.
        activeSpeech = null;
        if (speech.timer != null) host.clearTimeout(speech.timer);
        try {
            host.speechSynthesis.cancel();
        } catch (error) {
            console.warn("[LearningMode] failed to cancel speech:", error);
        }
        if (resume) resumeAfterSpeech(speech);
    };

    const speakText = (text, lang = "") => {
        const value = String(text || "").trim();
        if (!isOpen() || !value || !host.speechSynthesis || !host.SpeechSynthesisUtterance) return;
        try {
            const playback = readPlayback();
            const resume = playback.isPlaying || Boolean(activeSpeech?.resume && matchesPlayback(activeSpeech.playback, playback));
            const utterance = new host.SpeechSynthesisUtterance(value);
            const speechLang = detectSpeechLang(value, lang);
            const voice = getBestSpeechVoice(speechLang);
            clearLyricPlaybackTimer();
            cancelSpeech();
            const speech = { playback, resume, timer: null };
            activeSpeech = speech;
            if (playback.isPlaying) pausePlayer(playback.player);
            if (speechLang) utterance.lang = speechLang;
            if (voice) utterance.voice = voice;
            utterance.volume = 1;
            utterance.rate = speechLang.startsWith("ja") ? 0.78 : 0.82;
            utterance.pitch = 1.08;
            const resumePlayback = () => {
                if (activeSpeech !== speech || speech.timer != null) return;
                if (!speech.resume) {
                    activeSpeech = null;
                    return;
                }
                speech.timer = host.setTimeout(() => {
                    if (activeSpeech !== speech) return;
                    activeSpeech = null;
                    resumeAfterSpeech(speech);
                }, 180);
            };
            utterance.onend = resumePlayback;
            utterance.onerror = resumePlayback;
            host.speechSynthesis.speak(utterance);
        } catch (error) {
            cancelSpeech(true);
            console.warn("[LearningMode] speech synthesis failed:", error);
        }
    };

    return { cancelSpeech, isSpeaking: () => activeSpeech !== null, speakText, detectSpeechLang, playQuizSound };
}
