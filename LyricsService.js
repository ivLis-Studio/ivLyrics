// ============================================
// LyricsService Extension for ivLyrics
// 가사, 번역, 발음을 불러오는 시스템을 Extension 형태로 분리
// Spotify의 모든 페이지에서 작동 가능
// ============================================

(function LyricsServiceExtension() {
    "use strict";

    const TrackIdentity = (() => {
        const api = {
            isSpotifyTrackId(value) {
                return typeof value === "string" && /^[A-Za-z0-9]{22}$/.test(value.trim());
            },

            isSpotifyTrackUri(uri) {
                return typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri.trim());
            },

            isLocalTrackUri(uri) {
                return typeof uri === "string" && uri.startsWith("spotify:local:");
            },

            extractTrackId(uri) {
                if (!uri || typeof uri !== "string") return null;
                const value = uri.trim();
                if (api.isSpotifyTrackId(value)) return value;

                const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]{22})(?:$|[?#])/);
                if (uriMatch) return uriMatch[1];

                const webMatch = value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/);
                return webMatch ? webMatch[1] : null;
            }
        };

        window.ivLyricsTrackIdentity = {
            ...(window.ivLyricsTrackIdentity || {}),
            ...api
        };
        return window.ivLyricsTrackIdentity;
    })();

    const MODULE_KEY = "__ivLyricsLyricsServiceModule";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        waitTimer: null
    });

    // Spicetify가 준비될 때까지 대기
    if (!window.Spicetify || !Spicetify.LocalStorage) {
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setTimeout(() => {
                moduleState.waitTimer = null;
                LyricsServiceExtension();
            }, 300);
        }
        return;
    }

    moduleState.waitTimer = null;
    if (moduleState.initialized) {
        return;
    }
    moduleState.initialized = true;

    const restoreRouteAfterReload = () => {
        const FLAG_KEY = "ivLyrics:restore-route-after-reload";
        let attempts = 0;

        const tryRestore = () => {
            attempts += 1;

            let payload = null;
            try {
                const rawValue = localStorage.getItem(FLAG_KEY);
                if (!rawValue) return;
                payload = JSON.parse(rawValue);
            } catch (error) {
                localStorage.removeItem(FLAG_KEY);
                return;
            }

            if (!payload?.path) {
                localStorage.removeItem(FLAG_KEY);
                return;
            }

            if (payload.expiresAt && Date.now() > payload.expiresAt) {
                localStorage.removeItem(FLAG_KEY);
                return;
            }

            const history = Spicetify.Platform?.History;
            if (!history?.push || !history?.location) {
                if (attempts < 40) {
                    setTimeout(tryRestore, 150);
                }
                return;
            }

            const currentPath = history.location.pathname || "";
            if (currentPath.startsWith(payload.path)) {
                localStorage.removeItem(FLAG_KEY);
                return;
            }

            history.push(payload.path);
            localStorage.removeItem(FLAG_KEY);
        };

        tryRestore();
    };

    restoreRouteAfterReload();

    const LYRICS_SERVICE_DEBUG = false;
    const serviceDebug = (...args) => {
        if (LYRICS_SERVICE_DEBUG) {
            console.log(...args);
        }
    };
    const helperDebug = (...args) => {
        if (LYRICS_SERVICE_DEBUG) {
            console.log(...args);
        }
    };
    const getTranslationPartText = (part) => {
        const directText = typeof part?.text === "string" ? part.text.trim() : "";
        if (directText) {
            return directText;
        }

        if (Array.isArray(part?.syllables)) {
            return part.syllables.map(syllable => syllable?.text || "").join("").trim();
        }

        return "";
    };

    const getDisplayedVocalParts = (line) => {
        if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) {
            return null;
        }

        const parts = [];
        const leadText = getTranslationPartText(line.vocals.lead);
        if (leadText) {
            parts.push({
                role: 'lead',
                index: -1,
                text: leadText
            });
        }

        if (Array.isArray(line.vocals.background)) {
            line.vocals.background.forEach((part, index) => {
                if (!Array.isArray(part?.syllables) || part.syllables.length === 0) {
                    return;
                }

                const text = getTranslationPartText(part);
                if (text) {
                    parts.push({
                        role: 'background',
                        index,
                        text
                    });
                }
            });
        }

        return parts.length > 1 ? parts : null;
    };

    const getDisplayedVocalPartTexts = (line) => {
        const parts = getDisplayedVocalParts(line);
        if (!parts) return null;
        return parts.map(part => part.text);
    };

    const getTranslationRequestLineText = (line) => {
        const vocalPartTexts = getDisplayedVocalPartTexts(line);
        if (vocalPartTexts) {
            return vocalPartTexts.join(" / ");
        }

        return (line?.originalText || line?.text || "").trim();
    };

    const getLyricsTextCacheHash = (text) => {
        const value = String(text || '').normalize('NFC');
        let hash = 2166136261;
        for (const char of value) {
            hash ^= char.codePointAt(0) || 0;
            hash = Math.imul(hash, 16777619);
        }
        return `src-${(hash >>> 0).toString(36)}-${value.length.toString(36)}`;
    };

    const cleanupWorker = (worker) => {
        if (!worker) return;
        try {
            worker.postMessage('stop');
        } catch (e) { }
        try {
            worker.terminate();
        } catch (e) { }
    };
    const clearSettingsPolling = (target) => {
        if (!target) return;
        if (target._settingsTimer) {
            clearInterval(target._settingsTimer);
            target._settingsTimer = null;
        }
        target._isSettingsOpen = false;
    };

    serviceDebug("[LyricsService] Initializing LyricsService Extension...");

    // ============================================
    // LRU Cache implementation for better cache performance
    // ============================================
    class LRUCache {
        constructor(maxSize = 100) {
            this.cache = new Map();
            this.maxSize = maxSize;
        }

        get(key) {
            if (!this.cache.has(key)) return undefined;
            const value = this.cache.get(key);
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) this.cache.delete(key);
            this.cache.set(key, value);
            if (this.cache.size > this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
        }

        has(key) {
            return this.cache.has(key);
        }

        get size() {
            return this.cache.size;
        }

        clear() {
            this.cache.clear();
        }
    }

    // ============================================
    // Utils - 유틸리티 함수들 (Extension 전용)
    // ============================================
    const IVLYRICS_PROGRESS_GUARD_KEY = "__ivLyricsPlaybackProgressGuard";
    const IVLYRICS_PROGRESS_CORRECTION_THRESHOLD_MS = 350;
    const IVLYRICS_PROGRESS_DISCONTINUITY_THRESHOLD_MS = 1500;

    const clampPlayerProgress = (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : 0;
    };

    const ensurePlaybackProgressGuard = () => {
        if (window[IVLYRICS_PROGRESS_GUARD_KEY]) {
            return window[IVLYRICS_PROGRESS_GUARD_KEY];
        }

        const guard = {
            initialized: false,
            currentUri: "",
            correctionMs: 0,
            songChangeAt: 0,
            lastRawProgress: 0,
            lastAdjustedProgress: 0,
            lastSampleAt: 0,
            applyCurrentState() {
                const uri = Spicetify.Player?.data?.item?.uri || "";
                const rawProgress = clampPlayerProgress(Spicetify.Player?.getProgress?.());
                const now = performance.now();

                this.currentUri = uri;
                this.songChangeAt = now;
                this.correctionMs = 0;
                this.lastRawProgress = rawProgress;
                this.lastAdjustedProgress = rawProgress;
                this.lastSampleAt = now;
            },
            applySongChangeState() {
                const uri = Spicetify.Player?.data?.item?.uri || "";
                const rawProgress = clampPlayerProgress(Spicetify.Player?.getProgress?.());
                const now = performance.now();

                this.currentUri = uri;
                this.songChangeAt = now;
                this.correctionMs =
                    rawProgress >= IVLYRICS_PROGRESS_CORRECTION_THRESHOLD_MS
                        ? rawProgress
                        : 0;
                this.lastRawProgress = rawProgress;
                this.lastAdjustedProgress = Math.max(0, rawProgress - this.correctionMs);
                this.lastSampleAt = now;
            },
            ensureInitialized() {
                if (this.initialized || typeof Spicetify.Player?.addEventListener !== "function") {
                    return;
                }

                this.initialized = true;
                Spicetify.Player.addEventListener("songchange", () => {
                    this.applySongChangeState();
                });
                this.applyCurrentState();
            },
            clearCorrection() {
                this.correctionMs = 0;
            },
            getAdjustedProgress() {
                this.ensureInitialized();

                const uri = Spicetify.Player?.data?.item?.uri || "";
                const rawProgress = clampPlayerProgress(Spicetify.Player?.getProgress?.());
                const now = performance.now();

                if (uri !== this.currentUri) {
                    this.currentUri = uri;
                    this.songChangeAt = now;
                    this.correctionMs =
                        rawProgress >= IVLYRICS_PROGRESS_CORRECTION_THRESHOLD_MS
                            ? rawProgress
                            : 0;
                    this.lastRawProgress = rawProgress;
                    this.lastAdjustedProgress = Math.max(0, rawProgress - this.correctionMs);
                    this.lastSampleAt = now;
                    return this.lastAdjustedProgress;
                }

                if (this.lastSampleAt > 0) {
                    const elapsedMs = Math.max(0, now - this.lastSampleAt);
                    const driftMs = rawProgress - this.lastRawProgress - elapsedMs;
                    if (Math.abs(driftMs) >= IVLYRICS_PROGRESS_DISCONTINUITY_THRESHOLD_MS) {
                        this.clearCorrection();
                    }
                }

                const adjustedProgress = Math.max(0, rawProgress - this.correctionMs);
                this.lastRawProgress = rawProgress;
                this.lastAdjustedProgress = adjustedProgress;
                this.lastSampleAt = now;
                return adjustedProgress;
            }
        };

        window[IVLYRICS_PROGRESS_GUARD_KEY] = guard;
        return guard;
    };

    const Utils = {
        _langDetectCache: new Map(),
        _maxLangCacheSize: 500,
        _cjkMatchRegex: null,

        _cacheLanguageResult(cacheKey, result) {
            if (this._langDetectCache.size >= this._maxLangCacheSize) {
                const firstKey = this._langDetectCache.keys().next().value;
                this._langDetectCache.delete(firstKey);
            }
            this._langDetectCache.set(cacheKey, result);
        },

        getSafePlayerProgress() {
            return ensurePlaybackProgressGuard().getAdjustedProgress();
        },

        clearSafePlayerProgressCorrection() {
            ensurePlaybackProgressGuard().clearCorrection();
        },

        isSpotifyTrackId(value) {
            return TrackIdentity.isSpotifyTrackId(value);
        },

        isSpotifyTrackUri(uri) {
            return TrackIdentity.isSpotifyTrackUri(uri);
        },

        isLocalTrackUri(uri) {
            return TrackIdentity.isLocalTrackUri(uri);
        },

        extractTrackId(uri) {
            return TrackIdentity.extractTrackId(uri);
        },

        detectLanguage(lyrics) {
            // Safe array check
            if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) {
                return null;
            }

            // Safe text extraction
            const extractTextSafely = (line) => {
                if (!line) return "";
                if (typeof line === "string") return line;
                if (typeof line === "object") {
                    if (line.$$typeof) return ""; // React element
                    return line.originalText || line.text || "";
                }
                return String(line || "");
            };

            let cacheKey = "";
            for (const line of lyrics) {
                const text = extractTextSafely(line);
                if (!text) continue;
                cacheKey = cacheKey ? `${cacheKey} ${text}` : text;
                if (cacheKey.length >= 200) {
                    cacheKey = cacheKey.substring(0, 200);
                    break;
                }
            }
            if (!cacheKey) {
                return null;
            }
            if (this._langDetectCache.has(cacheKey)) {
                return this._langDetectCache.get(cacheKey);
            }

            const rawLyrics = lyrics.map(extractTextSafely).join(" ");
            if (!rawLyrics || rawLyrics.length === 0) {
                return null;
            }

            // Language detection regex patterns
            const kanaRegex = /[\u3001-\u3003]|[\u3005\u3007]|[\u301d-\u301f]|[\u3021-\u3035]|[\u3038-\u303a]|[\u3040-\u30ff]|[\uff66-\uff9f]/gu;
            const hangulRegex = /(\S*[\u3131-\u314e|\u314f-\u3163|\uac00-\ud7a3]+\S*)/g;
            const simpRegex = /[万与丑专业丛东丝丢两严丧个丬丰临为丽举么义乌乐乔习乡书买乱争于亏云亘亚产亩亲亵亸亿仅从仑仓仪们价众优伙会伛伞伟传伤伥伦伧伪伫体余佣佥侠侣侥侦侧侨侩侪侬俣俦俨俩俪俭债倾偬偻偾偿傥傧储傩儿兑兖党兰关兴兹养兽冁内冈册写军农冢冯冲决况冻净凄凉凌减凑凛几凤凫凭凯击凼凿刍划刘则刚创删别刬刭刽刿剀剂剐剑剥剧劝办务劢动励劲劳势勋勐勚匀匦匮区医华协单卖卢卤卧卫却卺厂厅历厉压厌厍厕厢厣厦厨厩厮县参叆叇双发变叙叠叶号叹叽吁后吓吕吗吣吨听启吴呒呓呕呖呗员呙呛呜咏咔咙咛咝咤咴咸哌响哑哒哓哔哕哗哙哜哝哟唛唝唠唡唢唣唤唿啧啬啭啮啰啴啸喷喽喾嗫呵嗳嘘嘤嘱噜噼嚣嚯团园囱围囵国图圆圣圹场坂坏块坚坛坜坝坞坟坠垄垅垆垒垦垧垩垫垭垯垱垲垴埘埙埚埝埯堑堕塆墙壮声壳壶壸处备复够头夸夹夺奁奂奋奖奥妆妇妈妩妪妫姗姜娄娅娆娇娈娱娲娴婳婴婵婶媪嫒嫔嫱嬷孙学孪宁宝实宠审宪宫宽宾寝对寻导寿将尔尘尧尴尸尽层屃屉届属屡屦屿岁岂岖岗岘岙岚岛岭岳岽岿峃峄峡峣峤峥峦崂崃崄崭嵘嵚嵛嵝嵴巅巩巯币帅师帏帐帘帜带帧帮帱帻帼幂幞干并广庄庆庐庑库应庙庞废庼廪开异弃张弥弪弯弹强归当录彟彦彻径徕御忆忏忧忾怀态怂怃怄怅怆怜总怼怿恋恳恶恸恹恺恻恼恽悦悫悬悭悯惊惧惨惩惫惬惭惮惯愍愠愤愦愿慑慭憷懑懒懔戆戋戏戗战戬户扎扑扦执扩扪扫扬扰抚抛抟抠抡抢护报担拟拢拣拥拦拧拨择挂挚挛挜挝挞挟挠挡挢挣挤挥挦捞损捡换捣据捻掳掴掷掸掺掼揸揽揿搀搁搂搅携摄摅摆摇摈摊撄撑撵撷撸撺擞攒敌敛数斋斓斗斩断无旧时旷旸昙昼昽显晋晒晓晔晕晖暂暧札术朴机杀杂权条来杨杩杰极构枞枢枣枥枧枨枪枫枭柜柠柽栀栅标栈栉栊栋栌栎栏树栖样栾桊桠桡桢档桤桥桦桧桨桩梦梼梾检棂椁椟椠椤椭楼榄榇榈榉槚槛槟槠横樯樱橥橱橹橼檐檩欢欤欧歼殁殇残殒殓殚殡殴毁毂毕毙毡毵氇气氢氩氲汇汉污汤汹沓沟没沣沤沥沦沧沨沩沪沵泞泪泶泷泸泺泻泼泽泾洁洒洼浃浅浆浇浈浉浊测浍济浏浐浑浒浓浔浕涂涌涛涝涞涟涠涡涢涣涤润涧涨涩淀渊渌渍渎渐渑渔渖渗温游湾湿溃溅溆溇滗滚滞滟滠满滢滤滥滦滨滩滪漤潆潇潋潍潜潴澜濑濒灏灭灯灵灾灿炀炉炖炜炝点炼炽烁烂烃烛烟烦烧烨烩烫烬热焕焖焘煅煳熘爱爷牍牦牵牺犊犟状犷犸犹狈狍狝狞独狭狮狯狰狱狲猃猎猕猡猪猫猬献獭玑玙玚玛玮环现玱玺珉珏珐珑珰珲琎琏琐琼瑶瑷璇璎瓒瓮瓯电画畅畲畴疖疗疟疠疡疬疮疯疱疴痈痉痒痖痨痪痫痴瘅瘆瘗瘘瘪瘫瘾瘿癞癣癫癯皑皱皲盏盐监盖盗盘眍眦眬着睁睐睑瞒瞩矫矶矾矿砀码砖砗砚砜砺砻砾础硁硅硕硖硗硙硚确硷碍碛碜碱碹磙礼祎祢祯祷祸禀禄禅离秃秆种积称秽秾稆税稣稳穑穷窃窍窑窜窝窥窦窭竖竞笃笋笔笕笺笼笾筑筚筛筜筝筹签简箓箦箧箨箩箪箫篑篓篮篱簖籁籴类籼粜粝粤粪粮糁糇紧絷纟纠纡红纣纤纥约级纨纩纪纫纬纭纮纯纰纱纲纳纴纵纶纷纸纹纺纻纼纽纾线绀绁绂练组绅细织终绉绊绋绌绍绎经绐绑绒结绔绕绖绗绘给绚绛络绝绞统绠绡绢绣绤绥绦继绨绩绪绫绬续绮绯绰绱绲绳维绵绶绷绸绹绺绻综绽绾绿缀缁缂缃缄缅缆缇缈缉缊缋缌缍缎缏缐缑缒缓缔缕编缗缘缙缚缛缜缝缞缟缠缡缢缣缤缥缦缧缨缩缪缫缬缭缮缯缰缱缲缳缴缵罂网罗罚罢罴羁羟羡翘翙翚耢耧耸耻聂聋职聍联聵聽聰肅腸膚膁腎腫脹脅膽勝朧腖臚脛膠脈膾髒臍腦膿臠腳脫腡臉臘醃膕齶膩靦膃騰臏臢輿艤艦艙艫艱豔艸藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇檾蘋莖蘢蔦塋煢繭荊薦薘莢蕘蓽蕎薈薺蕩榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞蓧萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蕆蕢蔣蔞藍薊蘺蕷鎣驀薔蘞藺藹蘄蘊藪槁蘚虜慮虛蟲虯虮雖蝦蠆蝕蟻螞蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑螿蟎蠨釁銜補襯袞襖嫋褘襪襲襏裝襠褌褳襝褲襇褸襤繈襴見觀覎規覓視覘覽覺覬覡覿覥覦覯覲覷觴觸觶讋譽謄訁計訂訃認譏訐訌討讓訕訖訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖穀豶貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗讚贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋踴躊蹤躓躑躡蹣躕躥躪躦軀車軋軌軑軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞輬輟輜輳輻輯轀輸轡轅轄輾轆轍轔辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郤郟鄶鄭鄆酈鄖鄲醞醱醬釅釃釀釋裏钜鑒鑾鏨釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鈍鈔鍾鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈹鐸鉶銬銠鉺銪鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺錯錨錡錁錕錩錫錮鑼錘錐錦鍁錈錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鏌鎮鎛鎘鑷鐫鎳鎿鎦鎬鎊鎰鎔鏢鏜鏍鏰鏞鏡鏑鏃鏇鏐鐔钁鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑲長門閂閃閆閈閉問闖閏闈閑閎間閔閌悶閘鬧閨聞闼閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸雋難雛讎靂霧霽黴靄靚靜靨韃鞽韉韝韋韌韍韓韙韞韜韻页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞飨餍饤饥饦饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓魇魉鱼鱽鱾鱿鲀鲁鲂鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳛鳜鳝鳞鳟鳠鳡鳢鳣鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹖鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹯鹰鹱鹲鹳鹴鹾麦麸黄黉黡黩黪黾鼋鼌鼍鼗鼹齄齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟志制咨只里系范松没尝尝闹面准钟别闲干尽脏拼]/gu;
            const tradRegex = /[萬與醜專業叢東絲丟兩嚴喪個爿豐臨為麗舉麼義烏樂喬習鄉書買亂爭於虧雲亙亞產畝親褻嚲億僅從侖倉儀們價眾優夥會傴傘偉傳傷倀倫傖偽佇體餘傭僉俠侶僥偵側僑儈儕儂俁儔儼倆儷儉債傾傯僂僨償儻儐儲儺兒兌兗黨蘭關興茲養獸囅內岡冊寫軍農塚馮衝決況凍淨淒涼淩減湊凜幾鳳鳧憑凱擊氹鑿芻劃劉則剛創刪別剗剄劊劌剴劑剮劍剝劇勸辦務勱動勵勁勞勣勳猛勩勻匭匱區醫華協單賣盧鹵臥衛卻巹廠廳曆厲壓厭厙廁廂厴廈廚廄廝縣參靉靆雙發變敘疊葉號歎嘰籲後嚇呂嗎唚噸聽啟吳嘸囈嘔嚦唄員咼嗆嗚詠哢嚨嚀噝吒噅鹹呱響啞噠嘵嗶噦嘩噲嚌噥喲嘜嗊嘮啢嗩唕喚呼嘖嗇囀齧囉嘽嘯噴嘍嚳囁嗬噯噓嚶囑嚕劈囂謔團園囪圍圇國圖圓聖壙場阪壞塊堅壇壢壩塢墳墜壟壟壚壘墾坰堊墊埡墶壋塏堖塒塤堝墊垵塹墮壪牆壯聲殼壺壼處備複夠頭誇夾奪奩奐奮獎奧妝婦媽嫵嫗媯姍薑婁婭嬈嬌孌娛媧嫻嫿嬰嬋嬸媼嬡嬪嬙嬤孫學孿寧寶實寵審憲宮寬賓寢對尋導壽將爾塵堯尷屍盡層屭屜屆屬屢屨嶼歲豈嶇崗峴嶴嵐島嶺嶽崠巋嶨嶧峽嶢嶠崢巒嶗崍嶮嶄嶸嶔崳嶁脊巔鞏巰幣帥師幃帳簾幟帶幀幫幬幘幗冪襆幹並廣莊慶廬廡庫應廟龐廢廎廩開異棄張彌弳彎彈強歸當錄彠彥徹徑徠禦憶懺憂愾懷態慫憮慪悵愴憐總懟懌戀懇惡慟懨愷惻惱惲悅愨懸慳憫驚懼慘懲憊愜慚憚慣湣慍憤憒願懾憖怵懣懶懍戇戔戲戧戰戬戶紮撲扡執擴捫掃揚擾撫拋摶摳掄搶護報擔擬攏揀擁攔擰撥擇掛摯攣掗撾撻挾撓擋撟掙擠揮撏撈損撿換搗據撚擄摑擲撣摻摜摣攬撳攙擱摟攪攜攝攄擺搖擯攤攖撐攆擷擼攛擻攢敵斂數齋斕鬥斬斷無舊時曠暘曇晝曨顯晉曬曉曄暈暉暫曖劄術樸機殺雜權條來楊榪傑極構樅樞棗櫪梘棖槍楓梟櫃檸檉梔柵標棧櫛櫳棟櫨櫟欄樹棲樣欒棬椏橈楨檔榿橋樺檜槳樁夢檮棶檢欞槨櫝槧欏橢樓欖櫬櫚櫸檟檻檳櫧橫檣櫻櫫櫥櫓櫞簷檁歡歟歐殲歿殤殘殞殮殫殯毆毀轂畢斃氈毿氌氣氫氬氲彙漢汙湯洶遝溝沒灃漚瀝淪滄渢溈滬濔濘淚澩瀧瀘濼瀉潑澤涇潔灑窪浹淺漿澆湞溮濁測澮濟瀏滻渾滸濃潯濜塗湧濤澇淶漣潿渦溳渙滌潤澗漲澀澱淵淥漬瀆漸澠漁瀋滲溫遊灣濕潰濺漵漊潷滾滯灩灄滿瀅濾濫灤濱灘澦濫瀠瀟瀲濰潛瀦瀾瀨瀕灝滅燈靈災燦煬爐燉煒熗點煉熾爍爛烴燭煙煩燒燁燴燙燼熱煥燜燾煆糊溜愛爺牘犛牽犧犢強狀獷獁猶狽麅獮獰獨狹獅獪猙獄猻獫獵獼玀豬貓蝟獻獺璣璵瑒瑪瑋環現瑲璽瑉玨琺瓏璫琿璡璉瑣瓊瑤璦璿瓔瓚甕甌電畫暢佘疇癤療瘧癘瘍鬁瘡瘋皰屙癰痙癢瘂癆瘓癇癡癉瘮瘞瘺癟癱癮癭癩癬癲臒皚皺皸盞鹽監蓋盜盤瞘眥矓著睜睞瞼瞞矚矯磯礬礦碭碼磚硨硯碸礪礱礫礎硜矽碩硤磽磑礄確鹼礙磧磣堿镟滾禮禕禰禎禱禍稟祿禪離禿稈種積稱穢穠穭稅穌穩穡窮竊竅窯竄窩窺竇窶豎競篤筍筆筧箋籠籩築篳篩簹箏籌簽簡籙簀篋籜籮簞簫簣簍籃籬籪籟糴類秈糶糲粵糞糧糝餱緊縶糸糾紆紅紂纖紇約級紈纊紀紉緯紜紘純紕紗綱納紝縱綸紛紙紋紡紵紖紐紓線紺絏紱練組紳細織終縐絆紼絀紹繹經紿綁絨結絝繞絰絎繪給絢絳絡絕絞統綆綃絹繡綌綏絛繼綈績緒綾緓續綺緋綽緔緄繩維綿綬繃綢綯綹綣綜綻綰綠綴緇緙緗緘緬纜緹緲緝縕繢緦綞緞緶線緱縋緩締縷編緡緣縉縛縟縝縫縗縞纏縭縊縑繽縹縵縲纓縮繆繅纈繚繕繒韁繾繰繯繳纘罌網羅罰罷羆羈羥羨翹翽翬耮耬聳恥聶聾職聹聯聵聽聰肅腸膚膁腎腫脹脅膽勝朧腖臚脛膠脈膾髒臍腦膿臠腳脫腡臉臘醃膕齶膩靦膃騰臏臢輿艤艦艙艫艱豔艸藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇檾蘋莖蘢蔦塋煢繭荊薦薘莢蕘蓽蕎薈薺蕩榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞蓧萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蕆蕢蔣蔞藍薊蘺蕷鎣驀薔蘞藺藹蘄蘊藪槁蘚虜慮虛蟲虯虮雖蝦蠆蝕蟻螞蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑螿蟎蠨釁銜補襯袞襖嫋褘襪襲襏裝襠褌褳襝褲襇褸襤繈襴見觀覎規覓視覘覽覺覬覡覿覥覦覯覲覷觴觸觶讋譽謄訁計訂訃認譏訐訌討讓訕訖訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖穀豶貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗讚贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋踴躊蹤躓躑躡蹣躕躥躪躦軀車軋軌軑軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞輬輟輜輳輻輯轀輸轡轅轄輾轆轍轔辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郤郟鄶鄭鄆酈鄖鄲醞醱醬釅釃釀釋裏钜鑒鑾鏨釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鈍鈔鍾鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈹鐸鉶銬銠鉺銪鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺錯錨錡錁錕錩錫錮鑼錘錐錦鍁錈錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鏌鎮鎛鎘鑷鐫鎳鎿鎦鎬鎊鎰鎔鏢鏜鏍鏰鏞鏡鏑鏃鏇鏐鐔钁鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑲長門閂閃閆閈閉問闖閏闈閑閎間閔閌悶閘鬧閨聞闼閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸雋難雛讎靂霧霽黴靄靚靜靨韃鞽韉韝韋韌韍韓韙韞韜韻页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞飨餍饤饥饦饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓魇魉鱼鱽鱾鱿鲀鲁鲂鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳛鳜鳝鳞鳟鳠鳡鳢鳣鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹖鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹯鹰鹱鹲鹳鹴鹾麦麸黄黉黡黩黪黾鼋鼌鼍鼗鼹齄齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟志制咨只里系范松没尝尝闹面准钟别闲干尽脏拼]/gu;
            const hanziRegex = /\p{Script=Han}/gu;
            const cyrillicRegex = /[\u0400-\u04FF]/gu;
            const vietnameseRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gu;
            const vietnameseUniqueRegex = /[đĐưƯơƠăĂạảẠẢắằẳẵặẮẰẲẴẶấầẩẫậẤẦẨẪẬếềểễệẾỀỂỄỆịỉĨỈỊọỏộốồổỗỌỎỐỒỔỖớờởỡợỚỜỞỠỢụủứừửữựỤỦƯỨỪỬỮỰỵỷỹỲỴỶỸ]/gu;
            const swedishRegex = /[åäöÅÄÖ]/gu;
            const swedishUniqueRegex = /[åÅ]/gu;
            const germanCharsRegex = /[äöüßÄÖÜ]/gu;
            const germanUniqueRegex = /[üßÜ]/gu;
            const spanishRegex = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/gu;
            const frenchRegex = /[àâæçéèêëïîôùûüÿœÀÂÆÇÉÈÊËÏÎÔÙÛÜŸŒ]/gu;
            const frenchUniqueRegex = /[æœçëïÿÆŒÇËÏŸ]/gu;
            const portugueseRegex = /[ãõáàâéêíóôõúüçÃÕÁÀÂÉÊÍÓÔÕÚÜÇ]/gu;
            const turkishRegex = /[çğıöşüÇĞİÖŞÜ]/gu;
            const turkishUniqueRegex = /[ğıİışĞIŞ]/gu;
            const polishRegex = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gu;
            const arabicRegex = /[\u0600-\u06FF]/gu;
            const thaiRegex = /[\u0E00-\u0E7F]/gu;
            const devanagariRegex = /[\u0900-\u097F]/gu;
            const latinExtendedRegex = /[a-zA-ZÀ-ÿ]/gu;
            const latinWordRegex = /[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)?/giu;

            const cjkMatchRegex = this._cjkMatchRegex || (
                this._cjkMatchRegex = new RegExp(`${kanaRegex.source}|${hanziRegex.source}|${hangulRegex.source}`, "gu")
            );
            const cjkMatch = rawLyrics.match(cjkMatchRegex);

            const cyrillicMatch = rawLyrics.match(cyrillicRegex);
            const vietnameseMatch = rawLyrics.match(vietnameseRegex);
            const vietnameseUniqueMatch = rawLyrics.match(vietnameseUniqueRegex);
            const swedishMatch = rawLyrics.match(swedishRegex);
            const swedishUniqueMatch = rawLyrics.match(swedishUniqueRegex);
            const germanMatch = rawLyrics.match(germanCharsRegex);
            const germanUniqueMatch = rawLyrics.match(germanUniqueRegex);
            const spanishMatch = rawLyrics.match(spanishRegex);
            const frenchMatch = rawLyrics.match(frenchRegex);
            const frenchUniqueMatch = rawLyrics.match(frenchUniqueRegex);
            const portugueseMatch = rawLyrics.match(portugueseRegex);
            const turkishMatch = rawLyrics.match(turkishRegex);
            const turkishUniqueMatch = rawLyrics.match(turkishUniqueRegex);
            const polishMatch = rawLyrics.match(polishRegex);
            const arabicMatch = rawLyrics.match(arabicRegex);
            const thaiMatch = rawLyrics.match(thaiRegex);
            const hindiMatch = rawLyrics.match(devanagariRegex);
            const latinMatch = rawLyrics.match(latinExtendedRegex);
            const normalizedLatinLyrics = rawLyrics.toLowerCase().normalize("NFC");
            const latinWords = normalizedLatinLyrics.match(latinWordRegex) || [];

            const detectLatinLanguageByScore = () => {
                if (latinWords.length < 4) {
                    if (/\b(aku cinta kamu|aku sayang kamu|cinta kamu)\b/u.test(normalizedLatinLyrics)) return "id";
                    if (/\b(aku sayang awak|saya sayang awak|cinta awak)\b/u.test(normalizedLatinLyrics)) return "ms";
                    return null;
                }

                const languageHints = {
                    de: {
                        strong: ["ich", "du", "nicht", "kein", "keine", "der", "die", "das", "den", "dem", "ein", "eine", "einen", "einem", "bin", "bist", "ist", "sind", "war", "waren", "werde", "wird", "werden", "mein", "meine", "dein", "deine", "mir", "dir", "mich", "dich", "für", "über", "schön", "liebe", "nacht", "herz"],
                        weak: ["und", "oder", "aber", "mit", "auf", "im", "in", "zu", "zum", "zur", "nur", "noch", "schon", "wie", "was", "wenn", "dann", "doch", "alles", "immer"]
                    },
                    en: {
                        strong: ["i", "you", "the", "and", "that", "with", "not", "for", "this", "your", "my", "me", "we", "are", "am", "is", "be", "was", "were", "have", "has", "do", "does", "don't", "can't", "love", "night", "heart"],
                        weak: ["to", "in", "on", "of", "it", "all", "so", "no", "yes", "but", "if", "when", "now", "here", "there"]
                    },
                    fr: {
                        strong: ["je", "tu", "nous", "vous", "pas", "ne", "est", "suis", "es", "sommes", "avec", "pour", "dans", "mon", "ma", "mes", "ton", "ta", "tes", "que", "qui", "sur", "plus", "amour", "coeur"],
                        weak: ["le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "mais", "ce", "ces", "en"]
                    },
                    es: {
                        strong: ["yo", "tú", "tu", "usted", "nosotros", "vosotros", "soy", "eres", "estoy", "estás", "no", "con", "para", "por", "mi", "mis", "tus", "quiero", "amor", "corazón"],
                        weak: ["el", "la", "los", "las", "un", "una", "de", "y", "o", "pero", "que", "en", "es", "como"]
                    },
                    it: {
                        strong: ["io", "tu", "noi", "voi", "sono", "sei", "non", "con", "per", "mio", "mia", "tuo", "tua", "amore", "cuore", "notte"],
                        weak: ["il", "lo", "la", "gli", "le", "un", "una", "di", "e", "o", "ma", "che", "in", "come"]
                    },
                    pt: {
                        strong: ["eu", "você", "voce", "nós", "nos", "sou", "és", "esta", "está", "não", "nao", "com", "para", "por", "meu", "minha", "teu", "tua", "amor", "coração", "coracao"],
                        weak: ["o", "a", "os", "as", "um", "uma", "de", "e", "ou", "mas", "que", "em", "como"]
                    },
                    sv: {
                        strong: ["jag", "du", "vi", "ni", "inte", "är", "var", "med", "för", "min", "mitt", "din", "ditt", "kärlek", "hjärta", "natt"],
                        weak: ["och", "eller", "men", "det", "den", "en", "ett", "i", "på", "som", "om", "allt"]
                    },
                    tr: {
                        strong: ["ben", "sen", "biz", "siz", "değil", "degil", "için", "icin", "çok", "cok", "gibi", "beni", "seni", "aşk", "ask", "kalp", "gece"],
                        weak: ["ve", "bir", "bu", "o", "da", "de", "mi", "ne", "ile", "ama", "her"]
                    },
                    pl: {
                        strong: ["ja", "ty", "my", "wy", "nie", "jest", "są", "sa", "dla", "przez", "mój", "moj", "moja", "twój", "twoj", "twoja", "miłość", "milosc", "serce", "noc"],
                        weak: ["i", "lub", "ale", "to", "ten", "ta", "te", "w", "na", "z", "do", "jak"]
                    },
                    nl: {
                        strong: ["ik", "jij", "je", "wij", "niet", "ben", "bent", "is", "zijn", "met", "voor", "mijn", "jouw", "liefde", "hart", "nacht"],
                        weak: ["de", "het", "een", "en", "of", "maar", "dat", "dit", "in", "op", "als"]
                    },
                    id: {
                        strong: ["aku", "kamu", "kau", "tidak", "tak", "bisa", "ingin", "karena", "denganmu", "bersamamu", "dirimu", "cinta", "hati", "hatiku", "rindu", "malam", "sendiri", "selalu", "pernah"],
                        weak: ["yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini", "itu", "ada", "akan", "bukan", "hanya", "jangan", "semua", "tanpa", "membuat", "percaya"]
                    },
                    ms: {
                        strong: ["aku", "saya", "awak", "kau", "tidak", "tak", "mahu", "boleh", "kerana", "denganmu", "bersamamu", "dirimu", "cinta", "hati", "hatiku", "rindu", "malam", "sendiri", "selalu", "pernah"],
                        weak: ["yang", "dan", "di", "ke", "dari", "untuk", "dengan", "ini", "itu", "ada", "akan", "bukan", "hanya", "jangan", "semua", "tanpa", "percaya"]
                    }
                };

                const scores = {};
                Object.keys(languageHints).forEach((lang) => {
                    scores[lang] = 0;
                });

                Object.entries(languageHints).forEach(([lang, hints]) => {
                    const strong = new Set(hints.strong);
                    const weak = new Set(hints.weak);
                    latinWords.forEach((word) => {
                        if (strong.has(word)) scores[lang] += 2;
                        else if (weak.has(word)) scores[lang] += 1;
                    });
                });

                const charBonus = (regex, weight) => {
                    const match = normalizedLatinLyrics.match(regex);
                    return match ? match.length * weight : 0;
                };

                scores.de += charBonus(/[ß]/gu, 5) + charBonus(/[ä]/gu, 3) + charBonus(/[öü]/gu, 1);
                scores.tr += charBonus(/[ğıış]/gu, 5) + charBonus(/[ç]/gu, 2);
                scores.sv += charBonus(/[å]/gu, 5) + charBonus(/[äö]/gu, 1);
                scores.fr += charBonus(/[æœçëïÿêèùû]/gu, 3);
                scores.es += charBonus(/[ñ¿¡]/gu, 5) + charBonus(/[áéíóú]/gu, 1);
                scores.pt += charBonus(/[ãõ]/gu, 5) + charBonus(/[ç]/gu, 1);
                scores.pl += charBonus(/[ąćęłńśźż]/gu, 5);

                if (/\b(ich bin|du bist|ich hab|ich habe|du hast|wir sind|es ist|nicht mehr|für dich|mit dir)\b/u.test(normalizedLatinLyrics)) {
                    scores.de += 4;
                }
                if (/\b(i am|you are|don't|can't|with you|for you|my heart)\b/u.test(normalizedLatinLyrics)) {
                    scores.en += 4;
                }
                if (/\b(je suis|tu es|avec toi|mon coeur|mon cœur|pour toi)\b/u.test(normalizedLatinLyrics)) {
                    scores.fr += 4;
                }
                if (/\b(yo soy|estoy aquí|estoy aqui|contigo|mi corazón|mi corazon)\b/u.test(normalizedLatinLyrics)) {
                    scores.es += 4;
                }
                if (/\b(aku (ingin|bisa|tak bisa|tidak bisa)|kau dan aku|karena (aku|kamu)|bersamamu|denganmu|cinta ini)\b/u.test(normalizedLatinLyrics)) {
                    scores.id += 4;
                }
                if (/\b(aku (mahu|boleh)|kau dan aku|kerana (aku|awak|kau)|bersamamu|denganmu|cinta ini)\b/u.test(normalizedLatinLyrics)) {
                    scores.ms += 4;
                }

                const sorted = Object.entries(scores).sort((left, right) => right[1] - left[1]);
                const [bestLang, bestScore] = sorted[0];
                const nextScore = sorted[1]?.[1] || 0;
                const minScore = latinWords.length < 8 ? 4 : 5;

                if (bestScore >= minScore && bestScore - nextScore >= 2) {
                    return bestLang;
                }
                return null;
            };

            // Arabic
            if (arabicMatch && arabicMatch.length > 5) {
                this._cacheLanguageResult(cacheKey, "ar");
                return "ar";
            }
            // Thai
            if (thaiMatch && thaiMatch.length > 5) {
                this._cacheLanguageResult(cacheKey, "th");
                return "th";
            }
            // Hindi
            if (hindiMatch && hindiMatch.length > 5) {
                this._cacheLanguageResult(cacheKey, "hi");
                return "hi";
            }
            // Russian
            if (cyrillicMatch && cyrillicMatch.length > 10) {
                this._cacheLanguageResult(cacheKey, "ru");
                return "ru";
            }

            // Vietnamese vs French
            const vietnameseUniqueCount = vietnameseUniqueMatch ? vietnameseUniqueMatch.length : 0;
            const frenchUniqueCount = frenchUniqueMatch ? frenchUniqueMatch.length : 0;
            const vietnameseCount = vietnameseMatch ? vietnameseMatch.length : 0;
            const frenchCount = frenchMatch ? frenchMatch.length : 0;
            const swedishCount = swedishMatch ? swedishMatch.length : 0;
            const swedishUniqueCount = swedishUniqueMatch ? swedishUniqueMatch.length : 0;
            const germanUniqueCount = germanUniqueMatch ? germanUniqueMatch.length : 0;
            const turkishUniqueCount = turkishUniqueMatch ? turkishUniqueMatch.length : 0;
            const latinScoreLanguage = !cjkMatch ? detectLatinLanguageByScore() : null;

            if (latinScoreLanguage) {
                this._cacheLanguageResult(cacheKey, latinScoreLanguage);
                return latinScoreLanguage;
            }

            if (vietnameseUniqueCount >= 2) {
                this._cacheLanguageResult(cacheKey, "vi");
                return "vi";
            }
            if (frenchUniqueCount >= 1 && frenchCount > 3) {
                this._cacheLanguageResult(cacheKey, "fr");
                return "fr";
            }
            if (frenchCount > 5 && vietnameseUniqueCount === 0) {
                this._cacheLanguageResult(cacheKey, "fr");
                return "fr";
            }
            if (vietnameseCount > 5 && vietnameseUniqueCount >= 1) {
                this._cacheLanguageResult(cacheKey, "vi");
                return "vi";
            }

            // Turkish
            if (turkishMatch && turkishMatch.length > 3 && turkishUniqueCount > 0) {
                this._cacheLanguageResult(cacheKey, "tr");
                return "tr";
            }
            // Polish
            if (polishMatch && polishMatch.length > 3) {
                this._cacheLanguageResult(cacheKey, "pl");
                return "pl";
            }
            // Swedish
            if (swedishUniqueCount >= 1 || (swedishCount > 5 && germanUniqueCount === 0)) {
                this._cacheLanguageResult(cacheKey, "sv");
                return "sv";
            }
            // German
            if (germanMatch && germanMatch.length > 2) {
                this._cacheLanguageResult(cacheKey, "de");
                return "de";
            }
            // Spanish
            if (spanishMatch && spanishMatch.length > 3) {
                this._cacheLanguageResult(cacheKey, "es");
                return "es";
            }
            // Fallback French
            if (vietnameseCount > 10 && vietnameseUniqueCount === 0) {
                this._cacheLanguageResult(cacheKey, "fr");
                return "fr";
            }
            // Portuguese
            if (portugueseMatch && portugueseMatch.length > 3) {
                this._cacheLanguageResult(cacheKey, "pt");
                return "pt";
            }

            // CJK languages
            if (cjkMatch) {
                const counts = { kana: 0, hanzi: 0, simp: 0, trad: 0, hangul: 0 };

                cjkMatch.forEach((glyph) => {
                    const code = glyph.charCodeAt(0);
                    if (code >= 0xAC00 && code <= 0xD7A3) {
                        counts.hangul++;
                    } else if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
                        counts.kana++;
                    } else if (hanziRegex.test(glyph)) {
                        counts.hanzi++;
                        if (simpRegex.test(glyph)) counts.simp++;
                        if (tradRegex.test(glyph)) counts.trad++;
                    }
                });

                const totalLength = cjkMatch.length;
                const kanaPercentage = counts.kana / totalLength;
                const hanziPercentage = counts.hanzi / totalLength;
                const simpPercentage = counts.simp / totalLength;
                const tradPercentage = counts.trad / totalLength;

                // Korean
                if (counts.hangul !== 0) {
                    this._cacheLanguageResult(cacheKey, "ko");
                    return "ko";
                }

                // Japanese - 설정에서 threshold 읽기
                const jaThreshold = Number(Spicetify.LocalStorage.get("ivLyrics:visual:ja-detect-threshold")) || 40;
                if (((kanaPercentage - hanziPercentage + 1) / 2) * 100 >= jaThreshold) {
                    this._cacheLanguageResult(cacheKey, "ja");
                    return "ja";
                }

                // Chinese
                const hansThreshold = Number(Spicetify.LocalStorage.get("ivLyrics:visual:hans-detect-threshold")) || 40;
                const result = ((simpPercentage - tradPercentage + 1) / 2) * 100 >= hansThreshold ? "zh-hans" : "zh-hant";
                this._cacheLanguageResult(cacheKey, result);
                return result;
            }

            // Latin-based (English)
            if (latinMatch) {
                this._cacheLanguageResult(cacheKey, "en");
                return "en";
            }

            this._cacheLanguageResult(cacheKey, null);
            return null;
        }
    };

    // window.Utils로 노출 (Extension 전용 Utils)
    window.Utils = Utils;

    // ============================================
    // API 요청/응답 추적 시스템 (Debug용)
    // ============================================
    const ApiTracker = {
        _logs: [],
        _maxLogs: 100,
        _currentTrackId: null,
        _listeners: [],

        setCurrentTrack(trackId) {
            if (this._currentTrackId !== trackId) {
                this._logs = [];
                this._currentTrackId = trackId;
                this._notifyListeners();
            }
        },

        logRequest(category, endpoint, request = null) {
            const logEntry = {
                id: Date.now() + Math.random(),
                category,
                endpoint,
                request,
                response: null,
                status: 'pending',
                startTime: Date.now(),
                endTime: null,
                duration: null,
                error: null,
                cached: false
            };

            this._logs.push(logEntry);

            if (this._logs.length > this._maxLogs) {
                this._logs.shift();
            }

            this._notifyListeners();
            return logEntry.id;
        },

        logResponse(logId, response, status = 'success', error = null, cached = false) {
            let entry = null;
            for (let i = this._logs.length - 1; i >= 0; i--) {
                if (this._logs[i].id === logId) {
                    entry = this._logs[i];
                    break;
                }
            }
            if (entry) {
                entry.response = response;
                entry.status = status;
                entry.error = error;
                entry.cached = cached;
                entry.endTime = Date.now();
                entry.duration = entry.endTime - entry.startTime;
                this._notifyListeners();
            }
        },

        logCacheHit(category, cacheKey, data) {
            const logEntry = {
                id: Date.now() + Math.random(),
                category,
                endpoint: `[CACHE] ${cacheKey}`,
                request: null,
                response: data,
                status: 'cached',
                startTime: Date.now(),
                endTime: Date.now(),
                duration: 0,
                error: null,
                cached: true
            };

            this._logs.push(logEntry);

            if (this._logs.length > this._maxLogs) {
                this._logs.shift();
            }

            this._notifyListeners();
        },

        getLogs() {
            return [...this._logs];
        },

        getLogsByCategory(category) {
            return this._logs.filter(l => l.category === category);
        },

        clear() {
            this._logs = [];
            this._notifyListeners();
        },

        addListener(callback) {
            this._listeners.push(callback);
            return () => {
                this._listeners = this._listeners.filter(l => l !== callback);
            };
        },

        _notifyListeners() {
            this._listeners.forEach(cb => {
                try { cb(this._logs); } catch (e) { }
            });
        },

        getSummary() {
            const summary = {
                total: this._logs.length,
                pending: 0,
                success: 0,
                error: 0,
                cached: 0,
                byCategory: {}
            };

            this._logs.forEach(log => {
                if (log.status === 'pending') summary.pending++;
                else if (log.status === 'success') summary.success++;
                else if (log.status === 'error') summary.error++;
                if (log.cached) summary.cached++;

                if (!summary.byCategory[log.category]) {
                    summary.byCategory[log.category] = { total: 0, success: 0, error: 0, cached: 0 };
                }
                summary.byCategory[log.category].total++;
                if (log.status === 'success') summary.byCategory[log.category].success++;
                if (log.status === 'error') summary.byCategory[log.category].error++;
                if (log.cached) summary.byCategory[log.category].cached++;
            });

            return summary;
        }
    };

    // 전역 접근 가능하도록 window에 등록
    window.ApiTracker = ApiTracker;

    // ============================================
    // IndexedDB 기반 로컬 캐시 시스템
    // ============================================
    const LyricsCache = {
        DB_NAME: 'ivLyricsCache',
        DB_VERSION: 6,

        EXPIRY: {
            lyrics: 7,
            translation: 30,
            phonetic: 30,
            metadata: 30,
            sync: 7,
            youtube: 7,
            tmi: 30
        },

        _db: null,
        _dbPromise: null,

        async _openDB() {
            if (this._db) return this._db;
            if (this._dbPromise) return this._dbPromise;

            this._dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

                request.onerror = () => {
                    console.error('[LyricsCache] Failed to open database:', request.error);
                    this._dbPromise = null;
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this._db = request.result;
                    resolve(this._db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const oldVersion = event.oldVersion;

                    if (oldVersion < 4 && db.objectStoreNames.contains('lyrics')) {
                        db.deleteObjectStore('lyrics');
                    }
                    if (!db.objectStoreNames.contains('lyrics')) {
                        const lyricsStore = db.createObjectStore('lyrics', { keyPath: 'cacheKey' });
                        lyricsStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                        lyricsStore.createIndex('trackId', 'trackId', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('translations')) {
                        const transStore = db.createObjectStore('translations', { keyPath: 'cacheKey' });
                        transStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('youtube')) {
                        const ytStore = db.createObjectStore('youtube', { keyPath: 'trackId' });
                        ytStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('metadata')) {
                        const metaStore = db.createObjectStore('metadata', { keyPath: 'cacheKey' });
                        metaStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('sync')) {
                        const syncStore = db.createObjectStore('sync', { keyPath: 'trackId' });
                        syncStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('tmi')) {
                        const tmiStore = db.createObjectStore('tmi', { keyPath: 'cacheKey' });
                        tmiStore.createIndex('cachedAt', 'cachedAt', { unique: false });
                        tmiStore.createIndex('trackId', 'trackId', { unique: false });
                    }
                };
            });

            return this._dbPromise;
        },

        _isExpired(cachedAt, type) {
            if (!cachedAt) return true;
            const expiryDays = this.EXPIRY[type] || 7;
            const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
            return Date.now() - cachedAt > expiryMs;
        },

        _getLyricsKey(trackId, provider) {
            return `${trackId}:${provider || 'unknown'}`;
        },

        async getLyrics(trackId, provider) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('lyrics', 'readonly');
                const store = tx.objectStore('lyrics');
                const cacheKey = this._getLyricsKey(trackId, provider);

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(cacheKey);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                if (result && !this._isExpired(result.cachedAt, 'lyrics')) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getLyrics error:', error);
                return null;
            }
        },

        async setLyrics(trackId, provider, data) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('lyrics', 'readwrite');
                const store = tx.objectStore('lyrics');
                const cacheKey = this._getLyricsKey(trackId, provider);

                store.put({
                    cacheKey,
                    trackId,
                    provider,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setLyrics error:', error);
                return false;
            }
        },

        _getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash = null) {
            const providerSuffix = provider ? `:${provider}` : '';
            const sourceSuffix = sourceHash ? `:${sourceHash}` : '';
            return `${trackId}:${lang}:${isPhonetic ? 'phonetic' : 'translation'}${providerSuffix}${sourceSuffix}`;
        },

        async getTranslation(trackId, lang, isPhonetic = false, provider = null, sourceHash = null) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('translations', 'readonly');
                const store = tx.objectStore('translations');
                const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash);

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(cacheKey);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                const type = isPhonetic ? 'phonetic' : 'translation';
                if (result && !this._isExpired(result.cachedAt, type)) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getTranslation error:', error);
                return null;
            }
        },

        async setTranslation(trackId, lang, isPhonetic, data, provider = null, sourceHash = null) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('translations', 'readwrite');
                const store = tx.objectStore('translations');
                const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash);

                store.put({
                    cacheKey,
                    trackId,
                    lang,
                    isPhonetic,
                    provider,
                    sourceHash,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setTranslation error:', error);
                return false;
            }
        },

        async getMetadata(trackId, lang) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('metadata', 'readonly');
                const store = tx.objectStore('metadata');
                const cacheKey = `${trackId}:${lang}`;

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(cacheKey);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                if (result && !this._isExpired(result.cachedAt, 'metadata')) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getMetadata error:', error);
                return null;
            }
        },

        async setMetadata(trackId, lang, data) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('metadata', 'readwrite');
                const store = tx.objectStore('metadata');
                const cacheKey = `${trackId}:${lang}`;

                store.put({
                    cacheKey,
                    trackId,
                    lang,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setMetadata error:', error);
                return false;
            }
        },

        async getYouTube(trackId) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('youtube', 'readonly');
                const store = tx.objectStore('youtube');

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(trackId);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                if (result && !this._isExpired(result.cachedAt, 'youtube')) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getYouTube error:', error);
                return null;
            }
        },

        async setYouTube(trackId, data) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('youtube', 'readwrite');
                const store = tx.objectStore('youtube');

                store.put({
                    trackId,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setYouTube error:', error);
                return false;
            }
        },

        async getSync(trackId) {
            try {
                const db = await this._openDB();

                if (!db.objectStoreNames.contains('sync')) {
                    return null;
                }

                const tx = db.transaction('sync', 'readonly');
                const store = tx.objectStore('sync');

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(trackId);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                if (result && !this._isExpired(result.cachedAt, 'sync')) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getSync error:', error);
                return null;
            }
        },

        async setSync(trackId, data) {
            try {
                const db = await this._openDB();

                if (!db.objectStoreNames.contains('sync')) {
                    return false;
                }

                const tx = db.transaction('sync', 'readwrite');
                const store = tx.objectStore('sync');

                store.put({
                    trackId,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setSync error:', error);
                return false;
            }
        },

        async deleteSync(trackId) {
            try {
                const db = await this._openDB();

                if (!db.objectStoreNames.contains('sync')) {
                    return false;
                }

                const tx = db.transaction('sync', 'readwrite');
                const store = tx.objectStore('sync');

                store.delete(trackId);

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] deleteSync error:', error);
                return false;
            }
        },

        async getTMI(trackId, lang) {
            try {
                const db = await this._openDB();

                if (!db.objectStoreNames.contains('tmi')) {
                    return null;
                }

                const tx = db.transaction('tmi', 'readonly');
                const store = tx.objectStore('tmi');
                const cacheKey = `${trackId}:${lang}`;

                const result = await new Promise((resolve, reject) => {
                    const request = store.get(cacheKey);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                if (result && !this._isExpired(result.cachedAt, 'tmi')) {
                    return result.data;
                }

                return null;
            } catch (error) {
                console.error('[LyricsCache] getTMI error:', error);
                return null;
            }
        },

        async setTMI(trackId, lang, data) {
            try {
                const db = await this._openDB();

                if (!db.objectStoreNames.contains('tmi')) {
                    return false;
                }

                const tx = db.transaction('tmi', 'readwrite');
                const store = tx.objectStore('tmi');
                const cacheKey = `${trackId}:${lang}`;

                store.put({
                    cacheKey,
                    trackId,
                    lang,
                    data,
                    cachedAt: Date.now()
                });

                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });

                return true;
            } catch (error) {
                console.error('[LyricsCache] setTMI error:', error);
                return false;
            }
        },

        async cleanup() {
            try {
                const db = await this._openDB();
                const stores = ['lyrics', 'translations', 'youtube', 'metadata', 'sync', 'tmi'];

                for (const storeName of stores) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        continue;
                    }

                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);

                    const request = store.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const type = storeName === 'translations'
                                ? (cursor.value.isPhonetic ? 'phonetic' : 'translation')
                                : storeName;

                            if (this._isExpired(cursor.value.cachedAt, type)) {
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                }

                serviceDebug('[LyricsCache] Cleanup completed');
            } catch (error) {
                console.error('[LyricsCache] cleanup error:', error);
            }
        },

        async clearTranslationForTrack(trackId) {
            try {
                const db = await this._openDB();

                return new Promise((resolve, reject) => {
                    const transTx = db.transaction('translations', 'readwrite');
                    const transStore = transTx.objectStore('translations');
                    const transRequest = transStore.openCursor();

                    transRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            if (cursor.value.trackId === trackId) {
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };

                    transTx.oncomplete = () => {
                        resolve(true);
                    };
                    transTx.onerror = () => reject(transTx.error);
                });
            } catch (error) {
                console.error('[LyricsCache] clearTranslationForTrack error:', error);
                return false;
            }
        },

        async clearTrack(trackId) {
            try {
                const db = await this._openDB();
                const deletePromises = [];

                // 가사 삭제
                deletePromises.push(new Promise((resolve, reject) => {
                    const lyricsTx = db.transaction('lyrics', 'readwrite');
                    const lyricsStore = lyricsTx.objectStore('lyrics');
                    const lyricsIndex = lyricsStore.index('trackId');
                    const lyricsRequest = lyricsIndex.openCursor(IDBKeyRange.only(trackId));
                    lyricsRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            cursor.delete();
                            cursor.continue();
                        }
                    };
                    lyricsTx.oncomplete = () => resolve();
                    lyricsTx.onerror = () => reject(lyricsTx.error);
                }));

                // 번역 삭제
                deletePromises.push(new Promise((resolve, reject) => {
                    const transTx = db.transaction('translations', 'readwrite');
                    const transStore = transTx.objectStore('translations');
                    const transRequest = transStore.openCursor();
                    transRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            if (cursor.value.trackId === trackId) {
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                    transTx.oncomplete = () => resolve();
                    transTx.onerror = () => reject(transTx.error);
                }));

                // YouTube 삭제
                deletePromises.push(new Promise((resolve, reject) => {
                    const ytTx = db.transaction('youtube', 'readwrite');
                    ytTx.objectStore('youtube').delete(trackId);
                    ytTx.oncomplete = () => resolve();
                    ytTx.onerror = () => reject(ytTx.error);
                }));

                // 메타데이터 삭제
                deletePromises.push(new Promise((resolve, reject) => {
                    const metaTx = db.transaction('metadata', 'readwrite');
                    const metaStore = metaTx.objectStore('metadata');
                    const metaRequest = metaStore.openCursor();
                    metaRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            if (cursor.value.trackId === trackId) {
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                    metaTx.oncomplete = () => resolve();
                    metaTx.onerror = () => reject(metaTx.error);
                }));

                // Sync 삭제
                if (db.objectStoreNames.contains('sync')) {
                    deletePromises.push(new Promise((resolve, reject) => {
                        const syncTx = db.transaction('sync', 'readwrite');
                        syncTx.objectStore('sync').delete(trackId);
                        syncTx.oncomplete = () => resolve();
                        syncTx.onerror = () => reject(syncTx.error);
                    }));
                }

                // TMI 삭제
                if (db.objectStoreNames.contains('tmi')) {
                    deletePromises.push(new Promise((resolve, reject) => {
                        const tmiTx = db.transaction('tmi', 'readwrite');
                        const tmiStore = tmiTx.objectStore('tmi');
                        const tmiIndex = tmiStore.index('trackId');
                        const tmiRequest = tmiIndex.openCursor(IDBKeyRange.only(trackId));
                        tmiRequest.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor) {
                                cursor.delete();
                                cursor.continue();
                            }
                        };
                        tmiTx.oncomplete = () => resolve();
                        tmiTx.onerror = () => reject(tmiTx.error);
                    }));
                }

                await Promise.all(deletePromises);
                return true;
            } catch (error) {
                console.error('[LyricsCache] clearTrack error:', error);
                return false;
            }
        },

        async clearAll() {
            try {
                const db = await this._openDB();
                const stores = ['lyrics', 'translations', 'youtube', 'metadata', 'sync', 'tmi'];

                const clearPromises = stores.map(storeName => {
                    return new Promise((resolve, reject) => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            resolve();
                            return;
                        }
                        const tx = db.transaction(storeName, 'readwrite');
                        tx.objectStore(storeName).clear();
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);
                    });
                });

                await Promise.all(clearPromises);
                return true;
            } catch (error) {
                console.error('[LyricsCache] clearAll error:', error);
                return false;
            }
        },

        async getStats() {
            try {
                const db = await this._openDB();
                const stores = ['lyrics', 'translations', 'youtube', 'metadata', 'sync', 'tmi'];
                const stats = {};

                for (const storeName of stores) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        stats[storeName] = 0;
                        continue;
                    }
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);

                    stats[storeName] = await new Promise((resolve, reject) => {
                        const request = store.count();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                }

                return stats;
            } catch (error) {
                console.error('[LyricsCache] getStats error:', error);
                return null;
            }
        }
    };

    // 시작 시 만료된 캐시 정리 (5초 후 백그라운드에서)
    setTimeout(() => LyricsCache.cleanup(), 5000);

    // 전역에 등록
    window.LyricsCache = LyricsCache;


    // ============================================
    // SyncDataService - 커뮤니티 싱크 데이터 서비스
    // 가사 없이 타이밍 정보만 저장/적용하는 시스템
    // ============================================
    const SyncDataService = (() => {
        const API_BASE = 'https://lyrics.api.ivl.is';
        const SYNC_DATA_REQUEST_VERSION = '20260701';
        const _syncDataCache = new Map();
        const _inflightRequests = new Map(); // 진행 중인 요청 추적
        const _isrcLookupCache = new Map(); // trackId -> { isrc, expiresAt }
        const _isrcInflightRequests = new Map(); // trackId -> Promise<string>
        const _fullyLoadedTracks = new Set(); // 전체 목록이 로드된 트랙 ID
        const _syncTrackMetadataReported = new Set(); // ISRC별 sync-data 메타데이터 보고 방지
        const _serverCacheBypassUntil = new Map(); // 로컬 캐시 삭제 직후 서버 캐시 우회
        const _trackCacheGenerations = new Map(); // 캐시 삭제 전 시작된 요청의 재저장을 방지
        const SERVER_CACHE_BYPASS_MS = 30 * 1000;
        const ISRC_LOOKUP_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
        const OPENDB_BASE_URL = 'https://ivlis.kr/ivLyrics/opendb/';
        const OPENDB_MANIFEST_URL = `${OPENDB_BASE_URL}data/manifest.json`;
        const OPENDB_STORAGE_KEY = 'ivLyrics:sync-data-opendb:v1';
        const OPENDB_FRESH_MS = 60 * 1000;
        const OPENDB_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
        let _serverCacheBypassAllUntil = 0;
        let _syncDataCacheGeneration = 0;
        let _spotifyProfilePromise = null;
        let _openDbState = null;
        let _openDbLoadPromise = null;

        function syncDataConsoleLog(message, details = null, level = 'info') {
            const prefix = '[ivLyrics sync-data]';
            const logger = level === 'warn' ? console.warn : console.info;
            if (details === null || details === undefined) {
                logger(prefix, message);
                return;
            }
            logger(prefix, message, details);
        }

        function getCacheGeneration(identityKey) {
            return `${_syncDataCacheGeneration}:${_trackCacheGenerations.get(identityKey) || 0}`;
        }

        function bumpCacheGeneration(identityKey) {
            if (!identityKey) {
                _syncDataCacheGeneration += 1;
                return;
            }
            _trackCacheGenerations.set(identityKey, (_trackCacheGenerations.get(identityKey) || 0) + 1);
        }

        function clearInflightRequests(identityKey) {
            if (!identityKey) {
                _inflightRequests.clear();
                return;
            }
            for (const key of _inflightRequests.keys()) {
                if (key === identityKey || key.startsWith(`${identityKey}:`)) {
                    _inflightRequests.delete(key);
                }
            }
        }

        function markServerCacheBypass(identityKey) {
            const expiresAt = Date.now() + SERVER_CACHE_BYPASS_MS;
            if (!identityKey) {
                _serverCacheBypassAllUntil = expiresAt;
                return;
            }
            _serverCacheBypassUntil.set(identityKey, expiresAt);
        }

        function shouldBypassServerCache(identityKey) {
            if (_serverCacheBypassAllUntil > Date.now()) {
                return true;
            }
            if (_serverCacheBypassAllUntil > 0) {
                _serverCacheBypassAllUntil = 0;
            }
            if (!identityKey) {
                return false;
            }
            const expiresAt = _serverCacheBypassUntil.get(identityKey) || 0;
            if (expiresAt <= Date.now()) {
                _serverCacheBypassUntil.delete(identityKey);
                return false;
            }
            return true;
        }

        function normalizeSyncDataIsrc(value) {
            if (typeof value !== 'string') return '';
            const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase();
            return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
        }

        function normalizeSyncDataTrackId(value) {
            if (typeof value !== 'string') return '';
            const trackId = value.trim();
            return /^[A-Za-z0-9]{22}$/.test(trackId) ? trackId : '';
        }

        function spotifyTrackIdToGid(trackId) {
            const normalizedTrackId = normalizeSyncDataTrackId(trackId);
            if (!normalizedTrackId) return '';

            try {
                const spotifyUriHelper = typeof Spicetify !== 'undefined' ? Spicetify.URI : null;
                const idToHex = spotifyUriHelper?.idToHex;
                if (typeof idToHex === 'function') {
                    const gid = idToHex(normalizedTrackId);
                    if (typeof gid === 'string' && /^[a-f0-9]{32}$/i.test(gid)) {
                        return gid.toLowerCase();
                    }
                }
            } catch (error) {
                syncDataConsoleLog('resolveTrackIsrc:idToHex-failed', {
                    trackId: normalizedTrackId,
                    message: error?.message || String(error)
                }, 'warn');
            }

            const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let value = 0n;
            for (const char of normalizedTrackId) {
                const digit = alphabet.indexOf(char);
                if (digit < 0) return '';
                value = value * 62n + BigInt(digit);
            }

            return value.toString(16).padStart(32, '0');
        }

        function getSpicetifySessionAccessToken() {
            const session = typeof Spicetify !== 'undefined' ? Spicetify.Platform?.Session : null;
            const token = session?.accessToken || session?.access_token;
            return typeof token === 'string' ? token.replace(/^Bearer\s+/i, '').trim() : '';
        }

        function findIsrcFromSpclientMetadataBytes(bytes) {
            if (!bytes || typeof TextDecoder === 'undefined') return '';
            const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            return firstNormalizedSyncDataIsrc(
                text.match(/isrc[\s\S]{0,20}([A-Z]{2}[A-Z0-9]{3}\d{7})/i)?.[1],
                text.match(/[A-Z]{2}[A-Z0-9]{3}\d{7}/)?.[0]
            );
        }

        function findIsrcFromSpclientMetadataJson(payload) {
            if (!payload || typeof payload !== 'object') return '';

            const candidates = [
                payload?.isrc,
                payload?.external_ids?.isrc,
                payload?.externalIds?.isrc,
                payload?.external_id?.isrc
            ];

            const externalIdEntries = [
                ...(Array.isArray(payload?.external_id) ? payload.external_id : []),
                ...(Array.isArray(payload?.external_ids) ? payload.external_ids : []),
                ...(Array.isArray(payload?.externalIds) ? payload.externalIds : [])
            ];

            for (const entry of externalIdEntries) {
                const type = typeof entry?.type === 'string' ? entry.type.toLowerCase() : '';
                if (type === 'isrc') {
                    candidates.push(entry?.id, entry?.value);
                }
            }

            return firstNormalizedSyncDataIsrc(...candidates);
        }

        async function fetchSpclientTrackMetadataIsrcWithRequestBuilder(trackGid, trackIdForLog) {
            const requestBuilder = typeof Spicetify !== 'undefined' ? Spicetify.Platform?.RequestBuilder : null;
            if (!requestBuilder?.build) {
                throw new Error('Spicetify Platform RequestBuilder missing');
            }

            syncDataConsoleLog('resolveTrackIsrc:metadata-request', {
                trackId: trackIdForLog,
                gid: trackGid,
                transport: 'platform-request-builder-json'
            });

            let builder = requestBuilder.build()
                .withHost('https://spclient.wg.spotify.com/metadata/4')
                .withPath(`/track/${trackGid}`)
                .withEndpointIdentifier('/track/{hexId}')
                .withQueryParameters({ 'response-format': 'json' });

            if (typeof builder.withoutMarket === 'function') {
                builder = builder.withoutMarket();
            }

            const response = await builder.send();
            const status = Number(response?.status ?? response?.statusCode ?? 200);
            const body = response?.body ?? response;
            const payload = typeof body === 'string' ? JSON.parse(body) : body;
            const isrc = findIsrcFromSpclientMetadataJson(payload);

            syncDataConsoleLog('resolveTrackIsrc:metadata-json-response', {
                trackId: trackIdForLog,
                gid: trackGid,
                status,
                isrc: isrc || null
            }, status >= 200 && status < 300 && isrc ? 'info' : 'warn');

            if (status < 200 || status >= 300) {
                throw new Error(`metadata request failed: ${status}`);
            }

            return isrc;
        }

        async function fetchSpclientTrackMetadataIsrcWithLegacyFetch(trackGid, trackIdForLog) {
            const token = getSpicetifySessionAccessToken();
            if (!token) {
                throw new Error('Spicetify session access token missing');
            }

            const httpsUrl = `https://spclient.wg.spotify.com/metadata/4/track/${trackGid}?market=from_token`;
            syncDataConsoleLog('resolveTrackIsrc:metadata-request', {
                trackId: trackIdForLog,
                gid: trackGid,
                url: httpsUrl,
                transport: 'fetch-protobuf'
            });
            const response = await fetch(httpsUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'App-Platform': 'WebPlayer',
                    Accept: 'application/x-protobuf'
                }
            });
            syncDataConsoleLog('resolveTrackIsrc:metadata-fetch-response', {
                trackId: trackIdForLog,
                gid: trackGid,
                status: response.status,
                ok: response.ok,
                contentType: response.headers.get('content-type') || null,
                fromCache: response.headers.get('age') !== null
            }, response.ok ? 'info' : 'warn');
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`metadata request failed: ${response.status}${body ? ` ${body.slice(0, 120)}` : ''}`);
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            const isrc = findIsrcFromSpclientMetadataBytes(bytes);
            syncDataConsoleLog('resolveTrackIsrc:metadata-protobuf-response', {
                trackId: trackIdForLog,
                gid: trackGid,
                byteLength: bytes.byteLength,
                isrc: isrc || null
            }, isrc ? 'info' : 'warn');
            return isrc;
        }

        async function fetchSpclientTrackMetadataIsrc(trackGid, trackIdForLog) {
            try {
                const isrc = await fetchSpclientTrackMetadataIsrcWithRequestBuilder(trackGid, trackIdForLog);
                if (isrc) return isrc;

                syncDataConsoleLog('resolveTrackIsrc:metadata-json-missing-isrc', {
                    trackId: trackIdForLog,
                    gid: trackGid
                }, 'warn');
            } catch (error) {
                syncDataConsoleLog('resolveTrackIsrc:metadata-requestbuilder-error', {
                    trackId: trackIdForLog,
                    gid: trackGid,
                    message: error?.message || String(error)
                }, 'warn');
            }

            return await fetchSpclientTrackMetadataIsrcWithLegacyFetch(trackGid, trackIdForLog);
        }

        function getTrackIdFromInput(trackId, metadata = {}) {
            return normalizeSyncDataTrackId(trackId)
                || normalizeSyncDataTrackId(metadata?.trackId)
                || normalizeSyncDataTrackId(metadata?.id)
                || normalizeSyncDataTrackId(TrackIdentity.extractTrackId(metadata?.uri))
                || normalizeSyncDataTrackId(metadata?.track?.id)
                || normalizeSyncDataTrackId(TrackIdentity.extractTrackId(metadata?.track?.uri));
        }

        function firstNormalizedSyncDataIsrc(...values) {
            for (const value of values) {
                const isrc = normalizeSyncDataIsrc(value);
                if (isrc) return isrc;
            }
            return '';
        }

        function getTrackIsrc(trackId, metadata = {}) {
            const playerData = typeof Spicetify !== 'undefined' ? Spicetify.Player?.data : null;
            const playerItem = playerData?.item || null;
            const playerTrack = playerData?.track || null;
            const explicitIsrc = firstNormalizedSyncDataIsrc(
                metadata?.isrc,
                metadata?.metadata?.isrc,
                metadata?.external_ids?.isrc,
                metadata?.externalIds?.isrc,
                metadata?.track?.isrc,
                metadata?.track?.metadata?.isrc,
                metadata?.track?.external_ids?.isrc,
                metadata?.track?.externalIds?.isrc,
                metadata?.item?.metadata?.isrc,
                metadata?.item?.external_ids?.isrc,
                metadata?.item?.externalIds?.isrc,
                playerItem?.metadata?.isrc,
                playerItem?.external_ids?.isrc,
                playerItem?.externalIds?.isrc,
                playerTrack?.metadata?.isrc,
                playerTrack?.external_ids?.isrc,
                playerTrack?.externalIds?.isrc
            );
            if (explicitIsrc) return explicitIsrc;

            try {
                const currentUri = Spicetify.Player?.data?.item?.uri || '';
                const targetUri = trackId
                    ? (currentUri.includes(trackId) ? currentUri : `spotify:track:${trackId}`)
                    : currentUri;
                const spotifyData = window.SpotifyDataHelper?.extractSpotifyData?.(targetUri);
                return normalizeSyncDataIsrc(spotifyData?.isrc || spotifyData?.external_ids?.isrc);
            } catch (e) {
                return '';
            }
        }

        async function resolveTrackIsrc(trackId, metadata = {}) {
            const localIsrc = getTrackIsrc(trackId, metadata);
            const normalizedTrackId = getTrackIdFromInput(trackId, metadata);
            syncDataConsoleLog('resolveTrackIsrc:start', {
                trackId: normalizedTrackId || trackId || null,
                metadataIsrc: metadata?.isrc || metadata?.metadata?.isrc || null,
                hasLocalIsrc: !!localIsrc
            });
            if (localIsrc) {
                if (normalizedTrackId) {
                    _isrcLookupCache.set(normalizedTrackId, {
                        isrc: localIsrc,
                        expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
                    });
                }
                syncDataConsoleLog('resolveTrackIsrc:local-hit', {
                    trackId: normalizedTrackId || trackId || null,
                    isrc: localIsrc
                });
                return localIsrc;
            }

            if (!normalizedTrackId) {
                syncDataConsoleLog('resolveTrackIsrc:missing-track-id', {
                    trackId: trackId || null,
                    metadataUri: metadata?.uri || null
                }, 'warn');
                return '';
            }

            const cached = _isrcLookupCache.get(normalizedTrackId);
            if (cached && cached.expiresAt > Date.now()) {
                if (cached.isrc) {
                    syncDataConsoleLog('resolveTrackIsrc:cache-hit', {
                        trackId: normalizedTrackId,
                        isrc: cached.isrc,
                        success: true
                    });
                    return cached.isrc;
                }
                syncDataConsoleLog('resolveTrackIsrc:ignore-failed-cache', {
                    trackId: normalizedTrackId
                }, 'warn');
                _isrcLookupCache.delete(normalizedTrackId);
            }
            if (cached) {
                _isrcLookupCache.delete(normalizedTrackId);
            }

            if (_isrcInflightRequests.has(normalizedTrackId)) {
                syncDataConsoleLog('resolveTrackIsrc:join-inflight', {
                    trackId: normalizedTrackId
                });
                return await _isrcInflightRequests.get(normalizedTrackId);
            }

            const promise = (async () => {
                try {
					const trackGid = spotifyTrackIdToGid(normalizedTrackId);
					if (!trackGid) {
                        syncDataConsoleLog('resolveTrackIsrc:gid-failed', {
                            trackId: normalizedTrackId
                        }, 'warn');
                        return '';
                    }

					const resolvedIsrc = await fetchSpclientTrackMetadataIsrc(trackGid, normalizedTrackId);
                    syncDataConsoleLog('resolveTrackIsrc:metadata-response', {
                        trackId: normalizedTrackId,
                        gid: trackGid,
                        isrc: resolvedIsrc || null
                    }, resolvedIsrc ? 'info' : 'warn');
                    if (resolvedIsrc) {
                        _isrcLookupCache.set(normalizedTrackId, {
                            isrc: resolvedIsrc,
                            expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
                        });
                    }
                    return resolvedIsrc;
                } catch (error) {
                    syncDataConsoleLog('resolveTrackIsrc:metadata-error', {
                        trackId: normalizedTrackId,
                        status: error?.status || error?.statusCode || null,
                        message: error?.message || String(error)
                    }, 'warn');
                    window.__ivLyricsDebugLog?.('[SyncDataService] Failed to resolve ISRC from Spotify spclient metadata', {
                        trackId: normalizedTrackId,
                        status: error?.status || error?.statusCode,
                        message: error?.message || String(error)
                    });
                    return '';
                } finally {
                    _isrcInflightRequests.delete(normalizedTrackId);
                }
            })();

            _isrcInflightRequests.set(normalizedTrackId, promise);
            return await promise;
        }

        function rememberTrackIsrc(trackId, isrcValue) {
            const normalizedTrackId = getTrackIdFromInput(trackId, {});
            const isrc = normalizeSyncDataIsrc(isrcValue);
            if (!normalizedTrackId || !isrc) return '';

            _isrcLookupCache.set(normalizedTrackId, {
                isrc,
                expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
            });
            return isrc;
        }

        function buildSyncDataIdentity(trackId, metadata = {}, isrcValue = '') {
            const trackIdentity = getTrackIdFromInput(trackId, metadata);
            const isrc = normalizeSyncDataIsrc(isrcValue);
            if (!isrc) {
                return null;
            }
            return {
                isrc,
                trackId: trackIdentity || null
            };
        }

        function getSyncDataIdentity(trackId, metadata = {}) {
            return buildSyncDataIdentity(trackId, metadata, getTrackIsrc(trackId, metadata));
        }

        async function resolveSyncDataIdentity(trackId, metadata = {}) {
            const localIsrc = getTrackIsrc(trackId, metadata);
            const resolvedIsrc = localIsrc || await resolveTrackIsrc(trackId, metadata);
            return buildSyncDataIdentity(trackId, metadata, resolvedIsrc);
        }

        function normalizeSyncDataText(value, maxLength = 256) {
            if (typeof value !== 'string') return '';
            return value.trim().slice(0, maxLength);
        }

        function normalizeSyncDataArtistText(value, maxLength = 256) {
            if (Array.isArray(value)) {
                return normalizeSyncDataText(value.map(entry => {
                    if (typeof entry === 'string') return entry;
                    if (entry && typeof entry.name === 'string') return entry.name;
                    return '';
                }).filter(Boolean).join(', '), maxLength);
            }

            return normalizeSyncDataText(value, maxLength);
        }

        function getSyncDataTrackMetadata(trackId, metadata = {}) {
            const currentItem = Spicetify.Player?.data?.item || null;
            const title = normalizeSyncDataText(
                metadata?.title ||
                metadata?.trackTitle ||
                metadata?.trackName ||
                metadata?.name ||
                metadata?.track?.name ||
                currentItem?.name
            );
            const artist = normalizeSyncDataArtistText(
                metadata?.artist ||
                metadata?.artists ||
                metadata?.trackArtist ||
                metadata?.artistName ||
                metadata?.track?.artists ||
                currentItem?.artists
            );
            const album = normalizeSyncDataText(
                metadata?.album ||
                metadata?.albumName ||
                metadata?.trackAlbum ||
                metadata?.albumTitle ||
                metadata?.track?.album?.name ||
                metadata?.track?.album ||
                currentItem?.album?.name ||
                currentItem?.metadata?.album_title
            );
            const durationMs = normalizeSyncDataDurationMs(
                metadata?.durationMs,
                metadata?.trackDurationMs,
                metadata?.duration_ms,
                metadata?.duration?.milliseconds,
                metadata?.duration,
                currentItem?.duration?.milliseconds,
                Spicetify.Player?.getDuration?.()
            );

            return {
                trackId: normalizeSyncDataTrackId(trackId),
                title,
                artist,
                album,
                durationMs
            };
        }

        function normalizeSyncDataDurationMs(...values) {
            for (const value of values) {
                if (value === null || value === undefined || value === '') continue;
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0 && numeric <= 86400 * 1000) {
                    return Math.round(numeric);
                }
            }
            return 0;
        }

        function appendSyncDataQueryParams(url, identity, metadata = {}, provider = null) {
            const isrc = normalizeSyncDataIsrc(identity?.isrc);
            if (!isrc) {
                throw new Error(getMissingIsrcMessage());
            }
            url.searchParams.set('isrc', isrc);
            url.searchParams.set('request-version', SYNC_DATA_REQUEST_VERSION);
            if (provider) {
                url.searchParams.set('provider', provider);
            }

            const trackMetadata = getSyncDataTrackMetadata(identity.trackId, metadata);
            const metadataTrackId = trackMetadata.trackId;
            const identityKey = getSyncDataIdentityCacheKey(identity);
            const shouldReportMetadata = !_syncTrackMetadataReported.has(identityKey)
                && (metadataTrackId || trackMetadata.title || trackMetadata.artist || trackMetadata.album);

            if (shouldReportMetadata) {
                url.searchParams.set('metadata', '1');
                if (metadataTrackId) url.searchParams.set('trackId', metadataTrackId);
                if (trackMetadata.title) url.searchParams.set('title', trackMetadata.title);
                if (trackMetadata.artist) url.searchParams.set('artist', trackMetadata.artist);
                if (trackMetadata.album) url.searchParams.set('album', trackMetadata.album);
            }

            return shouldReportMetadata;
        }

        function getSyncDataIdentityCacheKey(identity) {
            if (!identity) return '';
            return normalizeSyncDataIsrc(identity.isrc);
        }

        function getSyncDataIdentityKey(trackId, metadata = {}) {
            return getSyncDataIdentityCacheKey(getSyncDataIdentity(trackId, metadata));
        }

        function normalizeSyncDataCacheIdentityKey(identityValue, metadata = {}) {
            const isrc = normalizeSyncDataIsrc(identityValue);
            if (isrc) return isrc;
            const trackId = normalizeSyncDataTrackId(identityValue);
            if (trackId) return `track:${trackId}`;
            if (typeof identityValue === 'string' && identityValue.startsWith('track:')) {
                const prefixedTrackId = normalizeSyncDataTrackId(identityValue.slice('track:'.length));
                if (prefixedTrackId) return `track:${prefixedTrackId}`;
            }
            return getSyncDataIdentityKey(identityValue, metadata) || '';
        }

        function getMissingIsrcMessage() {
            return '이 곡의 ISRC를 확인할 수 없어 sync-data를 사용할 수 없습니다.';
        }

        function getOpenDbStorage() {
            try {
                return window.localStorage || localStorage || null;
            } catch (e) {
                return null;
            }
        }

        function readOpenDbStorage() {
            try {
                const storage = getOpenDbStorage();
                if (!storage) return null;
                const raw = storage.getItem(OPENDB_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (e) {
                return null;
            }
        }

        function writeOpenDbStorage(state) {
            try {
                const storage = getOpenDbStorage();
                if (!storage || !state?.providerMap) return;
                storage.setItem(OPENDB_STORAGE_KEY, JSON.stringify({
                    fetchedAt: state.fetchedAt || Date.now(),
                    signature: state.signature || '',
                    baseDate: state.baseDate || '',
                    providerMap: state.providerMap
                }));
            } catch (e) {
            }
        }

        function clearOpenDbStorage() {
            _openDbState = null;
            _openDbLoadPromise = null;
            try {
                const storage = getOpenDbStorage();
                if (storage) {
                    storage.removeItem(OPENDB_STORAGE_KEY);
                }
            } catch (e) {
            }
        }

        function isOpenDbStateFresh(state) {
            if (!state || !Number.isFinite(Number(state.fetchedAt))) {
                return false;
            }
            const age = Date.now() - Number(state.fetchedAt);
            return state.unavailable
                ? age < OPENDB_UNAVAILABLE_RETRY_MS
                : age < OPENDB_FRESH_MS;
        }

        function normalizeOpenDbProviderMap(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                return {};
            }

            const map = {};
            for (const [providerValue, listValue] of Object.entries(value)) {
                const provider = typeof providerValue === 'string' ? providerValue.trim() : '';
                if (!provider || !Array.isArray(listValue)) continue;
                const items = listValue
                    .map(normalizeSyncDataIsrc)
                    .filter(Boolean);
                map[provider] = Array.from(new Set(items)).sort();
            }
            return map;
        }

        function mergeOpenDbProviderMap(target, source, mode = 'add') {
            const sourceMap = normalizeOpenDbProviderMap(source);
            for (const [provider, list] of Object.entries(sourceMap)) {
                const items = new Set(Array.isArray(target[provider]) ? target[provider] : []);
                for (const isrc of list) {
                    if (mode === 'remove') {
                        items.delete(isrc);
                    } else {
                        items.add(isrc);
                    }
                }
                target[provider] = Array.from(items).sort();
            }
            return target;
        }

        function applyOpenDbPayload(providerMap, payload) {
            if (!payload || typeof payload !== 'object') return providerMap;
            mergeOpenDbProviderMap(providerMap, payload.items, 'add');
            mergeOpenDbProviderMap(providerMap, payload.add, 'add');
            mergeOpenDbProviderMap(providerMap, payload.remove, 'remove');
            return providerMap;
        }

        function getOpenDbFileUrl(value) {
            return new URL(String(value || ''), OPENDB_BASE_URL).toString();
        }

        function getOpenDbManifestSignature(manifest) {
            const deltas = Array.isArray(manifest?.deltas) ? manifest.deltas : [];
            return JSON.stringify({
                schema: manifest?.schema || 0,
                base: manifest?.base?.sha256 || manifest?.base?.url || '',
                deltas: deltas.map(delta => delta?.sha256 || delta?.url || delta?.date || ''),
                current: manifest?.current?.sha256 || manifest?.current?.updatedAt || manifest?.current?.url || ''
            });
        }

        async function fetchOpenDbJson(url) {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`OpenDB request failed: ${response.status}`);
            }
            return await response.json();
        }

        async function loadOpenDbState(force = false) {
            if (!force && isOpenDbStateFresh(_openDbState)) {
                return _openDbState;
            }

            const cached = readOpenDbStorage();
            if (!force && isOpenDbStateFresh(cached)) {
                _openDbState = { ...cached, providerMap: normalizeOpenDbProviderMap(cached.providerMap) };
                return _openDbState;
            }

            if (_openDbLoadPromise) {
                return await _openDbLoadPromise;
            }

            _openDbLoadPromise = (async () => {
                try {
                    const manifest = await fetchOpenDbJson(OPENDB_MANIFEST_URL);
                    const signature = getOpenDbManifestSignature(manifest);
                    const stored = readOpenDbStorage();
                    if (stored?.signature === signature && stored?.providerMap) {
                        _openDbState = {
                            ...stored,
                            fetchedAt: Date.now(),
                            stale: false,
                            unavailable: false,
                            providerMap: normalizeOpenDbProviderMap(stored.providerMap)
                        };
                        writeOpenDbStorage(_openDbState);
                        return _openDbState;
                    }

                    const providerMap = {};
                    if (manifest?.base?.url) {
                        applyOpenDbPayload(providerMap, await fetchOpenDbJson(getOpenDbFileUrl(manifest.base.url)));
                    }
                    for (const delta of Array.isArray(manifest?.deltas) ? manifest.deltas : []) {
                        if (delta?.url) {
                            applyOpenDbPayload(providerMap, await fetchOpenDbJson(getOpenDbFileUrl(delta.url)));
                        }
                    }
                    if (manifest?.current?.url) {
                        applyOpenDbPayload(providerMap, await fetchOpenDbJson(getOpenDbFileUrl(manifest.current.url)));
                    }

                    _openDbState = {
                        fetchedAt: Date.now(),
                        signature,
                        baseDate: manifest?.base?.date || '',
                        stale: false,
                        unavailable: false,
                        providerMap: normalizeOpenDbProviderMap(providerMap)
                    };
                    writeOpenDbStorage(_openDbState);
                    return _openDbState;
                } catch (error) {
                    syncDataConsoleLog('opendb:load-failed', {
                        message: error?.message || String(error)
                    }, 'warn');
                    const stored = readOpenDbStorage();
                    if (stored?.providerMap) {
                        _openDbState = {
                            ...stored,
                            fetchedAt: Date.now(),
                            stale: true,
                            unavailable: true,
                            providerMap: normalizeOpenDbProviderMap(stored.providerMap)
                        };
                        return _openDbState;
                    }
                    _openDbState = {
                        fetchedAt: Date.now(),
                        stale: true,
                        unavailable: true,
                        providerMap: {}
                    };
                    return _openDbState;
                } finally {
                    _openDbLoadPromise = null;
                }
            })();

            return await _openDbLoadPromise;
        }

        function getOpenDbProvidersFromState(state, isrcValue) {
            const isrc = normalizeSyncDataIsrc(isrcValue);
            if (!isrc || !state?.providerMap) return [];
            return Object.entries(state.providerMap)
                .filter(([, list]) => Array.isArray(list) && list.includes(isrc))
                .map(([provider]) => ({
                    provider,
                    trackId: null,
                    createdAt: null,
                    updatedAt: null,
                    source: 'opendb'
                }));
        }

        async function getOpenDbProvidersForIsrc(isrcValue) {
            const state = await loadOpenDbState();
            if (state?.unavailable) return [];
            const providers = getOpenDbProvidersFromState(state, isrcValue);
            if (state?.stale && providers.length === 0) {
                return [];
            }
            return providers;
        }

        function openDbStateHasProvider(state, isrcValue, providerValue) {
            const isrc = normalizeSyncDataIsrc(isrcValue);
            const provider = typeof providerValue === 'string' ? providerValue.trim() : '';
            if (!isrc || !provider || !state?.providerMap) return false;
            const hasExact = Array.isArray(state.providerMap[provider])
                && state.providerMap[provider].includes(isrc);
            if (hasExact) return true;
            return provider.startsWith('spotify-')
                && Array.isArray(state.providerMap.spotify)
                && state.providerMap.spotify.includes(isrc);
        }

        async function hasOpenDbSyncDataEntry(isrcValue, providerValue) {
            const state = await loadOpenDbState();
            if (state?.unavailable) return false;
            const found = openDbStateHasProvider(state, isrcValue, providerValue);
            if (state?.stale && !found) return false;
            return found;
        }

        async function isOpenDbUnavailable() {
            const state = await loadOpenDbState();
            return !!state?.unavailable;
        }

        function rememberOpenDbSyncDataEntry(isrcValue, providerValue) {
            const isrc = normalizeSyncDataIsrc(isrcValue);
            const provider = typeof providerValue === 'string' ? providerValue.trim() : '';
            if (!isrc || !provider) return;

            const state = _openDbState?.providerMap
                ? _openDbState
                : (readOpenDbStorage() || { fetchedAt: Date.now(), signature: '', providerMap: {} });
            const providerMap = normalizeOpenDbProviderMap(state.providerMap);
            mergeOpenDbProviderMap(providerMap, { [provider]: [isrc] }, 'add');
            _openDbState = {
                ...state,
                fetchedAt: Date.now(),
                stale: false,
                unavailable: false,
                providerMap
            };
            writeOpenDbStorage(_openDbState);
        }

        async function getAvailableProviders(trackId, metadata = {}) {
            const identity = await resolveSyncDataIdentity(trackId, metadata);
            if (!identity) {
                syncDataConsoleLog('providers:skip-missing-identity', {
                    trackId: getTrackIdFromInput(trackId, metadata) || trackId || null
                }, 'warn');
                return [];
            }
            const identityKey = getSyncDataIdentityCacheKey(identity);
            const cacheKey = `${identityKey}:providers`;

            if (_syncDataCache.has(cacheKey)) {
                const cachedProviders = _syncDataCache.get(cacheKey);
                if (Array.isArray(cachedProviders) && cachedProviders.length === 0) {
                    _syncDataCache.delete(cacheKey);
                } else {
                    syncDataConsoleLog('providers:cache-hit', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null
                    });
                    return cachedProviders;
                }
            }

            const bypassServerCache = shouldBypassServerCache(identity.isrc);
            if (bypassServerCache && await isOpenDbUnavailable()) {
                syncDataConsoleLog('providers:opendb-unavailable-skip', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null
                }, 'warn');
                return [];
            }

            if (!bypassServerCache) {
                const openDbProviders = await getOpenDbProvidersForIsrc(identity.isrc);
                if (openDbProviders) {
                    syncDataConsoleLog('providers:opendb', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        count: openDbProviders.length
                    });
                    if (openDbProviders.length > 0) {
                        _syncDataCache.set(cacheKey, openDbProviders);
                    }
                    return openDbProviders;
                }
            }

            try {
                const url = new URL(`${API_BASE}/lyrics/sync-data`);
                const reportsMetadata = appendSyncDataQueryParams(url, identity, metadata);
                let requestUrl = url.toString();
                if (identity.isrc && shouldBypassServerCache(identity.isrc)) {
                    requestUrl += '&bypassCache=1';
                }
                syncDataConsoleLog('providers:request', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    url: requestUrl
                });
                const response = await fetch(requestUrl, { cache: 'no-store' });
                syncDataConsoleLog('providers:response', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    status: response.status,
                    ok: response.ok
                }, response.ok ? 'info' : 'warn');
                if (!response.ok) {
                    if (response.status === 404) return [];
                    throw new Error(`API Error: ${response.status}`);
                }
                const result = await response.json();
                const resolvedIsrc = normalizeSyncDataIsrc(result?.isrc || result?.data?.isrc);
                if (resolvedIsrc && identity.trackId) {
                    _isrcLookupCache.set(identity.trackId, {
                        isrc: resolvedIsrc,
                        expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
                    });
                }
                if (reportsMetadata) {
                    _syncTrackMetadataReported.add(identityKey);
                }
                const providers = Array.isArray(result.providers) ? result.providers : [];
                _syncDataCache.set(cacheKey, providers);
                return providers;
            } catch (e) {
                console.warn(`[SyncDataService] Failed to fetch sync providers for ${identityKey}`, e);
                return [];
            }
        }

        async function getSyncData(trackId, provider = null, metadata = {}) {
            syncDataConsoleLog('getSyncData:called', {
                trackId: getTrackIdFromInput(trackId, metadata) || trackId || null,
                provider: provider || null,
                metadataIsrc: metadata?.isrc || null
            });
            const identity = await resolveSyncDataIdentity(trackId, metadata);
            if (!identity) {
                syncDataConsoleLog('getSyncData:skip-missing-identity', {
                    trackId: getTrackIdFromInput(trackId, metadata) || trackId || null,
                    provider: provider || null
                }, 'warn');
                window.__ivLyricsDebugLog?.('[SyncDataService] Missing ISRC for sync-data lookup', { trackId, provider });
                return null;
            }
            const identityKey = getSyncDataIdentityCacheKey(identity);

            if (!provider) {
                const providers = await getAvailableProviders(trackId, metadata);
                if (providers.length === 0) return null;
                provider = providers[0].provider;
            }

            const queryProvider = provider === 'legacy' ? 'spotify' : provider;
            const specificKey = `${identityKey}:${queryProvider}`;
            const requestGeneration = getCacheGeneration(identityKey);

            if (_syncDataCache.has(specificKey)) {
                syncDataConsoleLog('getSyncData:cache-hit', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider
                });
                return _syncDataCache.get(specificKey);
            }

            const bypassServerCache = shouldBypassServerCache(identity.isrc);
            if (bypassServerCache && await isOpenDbUnavailable()) {
                syncDataConsoleLog('getSyncData:opendb-unavailable-skip', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider
                }, 'warn');
                return null;
            }

            if (!bypassServerCache) {
                const openDbHasEntry = await hasOpenDbSyncDataEntry(identity.isrc, queryProvider);
                if (openDbHasEntry === false) {
                    syncDataConsoleLog('getSyncData:opendb-skip', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        provider: queryProvider
                    });
                    return null;
                }
            }

            try {
                if (_inflightRequests.has(specificKey)) {
                    syncDataConsoleLog('getSyncData:join-inflight', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        provider: queryProvider
                    });
                    return _inflightRequests.get(specificKey);
                }

                const fetchPromise = (async () => {
                    const url = new URL(`${API_BASE}/lyrics/sync-data`);
                    const reportsMetadata = appendSyncDataQueryParams(url, identity, metadata, queryProvider);
                    let requestUrl = url.toString();
                    if (identity.isrc && shouldBypassServerCache(identity.isrc)) {
                        requestUrl += '&bypassCache=1';
                    }
                    syncDataConsoleLog('getSyncData:request', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        provider: queryProvider,
                        url: requestUrl
                    });
                    const response = await fetch(requestUrl, { cache: 'no-store' });
                    syncDataConsoleLog('getSyncData:response', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        provider: queryProvider,
                        status: response.status,
                        ok: response.ok
                    }, response.ok ? 'info' : 'warn');

                    if (!response.ok) {
                        if (response.status === 404) return null;
                        if (response.status === 426) {
                            const result = await response.json().catch(() => null);
                            console.warn(result?.message || getMissingIsrcMessage());
                            return null;
                        }
                        throw new Error(`API Error: ${response.status}`);
                    }

                    const result = await response.json();
                    syncDataConsoleLog('getSyncData:json', {
                        isrc: identity.isrc || null,
                        trackId: identity.trackId || null,
                        provider: queryProvider,
                        hasData: !!(result?.data || result),
                        hasSyncData: !!(result?.data?.syncData || result?.syncData),
                        providerReturned: result?.data?.provider || result?.provider || null
                    });
                    if (reportsMetadata) {
                        _syncTrackMetadataReported.add(identityKey);
                    }
                    const data = result.data || result;

                    if (data) {
                        let syncDataBody = null;

                        if (Array.isArray(data)) {
                            syncDataBody = { lines: data };
                        } else if (Array.isArray(data.lines)) {
                            syncDataBody = data;
                        } else if (data.syncData && Array.isArray(data.syncData.lines)) {
                            syncDataBody = data.syncData;
                        }

                        if (!syncDataBody?.lines) return null;

                        const resolvedIsrc = normalizeSyncDataIsrc(data.isrc) || identity.isrc;
                        const resolvedTrackId = identity.trackId || data.trackId || data.storedTrackId || null;
                        if (resolvedIsrc && resolvedTrackId) {
                            _isrcLookupCache.set(resolvedTrackId, {
                                isrc: resolvedIsrc,
                                expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
                            });
                        }
                        const syncData = {
                            isrc: resolvedIsrc,
                            trackId: resolvedTrackId,
                            storedTrackId: data.storedTrackId || data.trackId || null,
                            provider: data.provider || provider,
                            syncData: syncDataBody,
                            contributors: data.contributors || [],
                            createdAt: data.createdAt || null,
                            updatedAt: data.updatedAt || null
                        };
                        if (requestGeneration !== getCacheGeneration(identityKey)) {
                            return null;
                        }
                        _syncDataCache.set(specificKey, syncData);
                        if (resolvedIsrc) {
                            _syncDataCache.set(`${resolvedIsrc}:${queryProvider}`, syncData);
                        }
                        if (resolvedTrackId) {
                            _syncDataCache.set(`track:${resolvedTrackId}:${queryProvider}`, syncData);
                        }
                        return syncData;
                    }
                    return null;
                })();

                _inflightRequests.set(specificKey, fetchPromise);
                const result = await fetchPromise;
                _inflightRequests.delete(specificKey);
                return result;
            } catch (e) {
                console.warn(`[SyncDataService] Failed to fetch sync data for ${identityKey}:${provider}`, e);
                _inflightRequests.delete(specificKey);
                return null;
            }
        }

        async function hasSyncData(trackId, provider, metadata = {}) {
            const providers = await getAvailableProviders(trackId, metadata);
            return providers.some(p => p.provider === provider);
        }

        function clearCache(identityValue, metadata = {}) {
            const identityKey = normalizeSyncDataCacheIdentityKey(identityValue, metadata) || identityValue;
            if (metadata?.preserveOpenDb !== true) {
                clearOpenDbStorage();
            }
            if (identityKey) {
                bumpCacheGeneration(identityKey);
                clearInflightRequests(identityKey);
                _syncDataCache.delete(identityKey);
                for (const key of _syncDataCache.keys()) {
                    if (key.startsWith(`${identityKey}:`)) {
                        _syncDataCache.delete(key);
                    }
                }
                _fullyLoadedTracks.delete(identityKey);
                _syncTrackMetadataReported.delete(identityKey);
                markServerCacheBypass(identityKey);
            } else {
                bumpCacheGeneration();
                clearInflightRequests();
                _syncDataCache.clear();
                _fullyLoadedTracks.clear();
                _syncTrackMetadataReported.clear();
                _serverCacheBypassUntil.clear();
                markServerCacheBypass();
            }
        }

        function normalizeSpotifyProfile(profile) {
            if (!profile || typeof profile !== 'object') return null;

            const uriUserId = typeof profile.uri === 'string' && profile.uri.startsWith('spotify:user:')
                ? profile.uri.split(':').pop()
                : '';
            const id = profile.id || profile.username || profile.userId || uriUserId;
            if (typeof id !== 'string' || !id.trim()) return null;

            return {
                id: id.trim(),
                displayName: (
                    profile.display_name ||
                    profile.displayName ||
                    profile.name ||
                    profile.username ||
                    ''
                ).trim()
            };
        }

        async function fetchSpotifyWebApiJsonWithRequestBuilder(apiPath, endpointIdentifier, queryParameters = {}) {
            const requestBuilder = typeof Spicetify !== 'undefined' ? Spicetify.Platform?.RequestBuilder : null;
            if (!requestBuilder?.build) {
                throw new Error('Spicetify Platform RequestBuilder missing');
            }

            let builder = requestBuilder.build()
                .withHost('https://api.spotify.com')
                .withPath(apiPath)
                .withEndpointIdentifier(endpointIdentifier);

            if (queryParameters && Object.keys(queryParameters).length > 0) {
                builder = builder.withQueryParameters(queryParameters);
            }
            if (typeof builder.withoutMarket === 'function') {
                builder = builder.withoutMarket();
            }

            const response = await builder.send();
            const status = Number(response?.status ?? response?.statusCode ?? 200);
            if (status < 200 || status >= 300) {
                throw new Error(`Spotify Web API request failed: ${status}`);
            }
            const body = response?.body ?? response;
            return typeof body === 'string' ? JSON.parse(body) : body;
        }

        async function getCurrentSpotifyProfile() {
            if (_spotifyProfilePromise) {
                return _spotifyProfilePromise;
            }

            _spotifyProfilePromise = (async () => {
                const timeout = new Promise(resolve => setTimeout(() => resolve(null), 1200));
                const load = (async () => {
                    try {
                        if (Spicetify?.Platform?.UserAPI?.getUser) {
                            const platformProfile = await Spicetify.Platform.UserAPI.getUser();
                            const normalized = normalizeSpotifyProfile(platformProfile);
                            if (normalized) return normalized;
                        }
                    } catch (error) {
                        console.warn('[SyncDataService] Failed to read Spotify profile from Platform.UserAPI', error);
                    }

                    try {
                        const requestBuilderProfile = await fetchSpotifyWebApiJsonWithRequestBuilder('/v1/me', '/v1/me');
                        const normalized = normalizeSpotifyProfile(requestBuilderProfile);
                        if (normalized) return normalized;
                    } catch (error) {
                        console.warn('[SyncDataService] Failed to read Spotify profile from RequestBuilder', error);
                    }

                    try {
                        if (Spicetify?.CosmosAsync?.get) {
                            const cosmosProfile = await Spicetify.CosmosAsync.get('https://api.spotify.com/v1/me');
                            const normalized = normalizeSpotifyProfile(cosmosProfile);
                            if (normalized) return normalized;
                        }
                    } catch (error) {
                        console.warn('[SyncDataService] Failed to read Spotify profile from CosmosAsync', error);
                    }

                    return null;
                })();

                return await Promise.race([load, timeout]);
            })();

            return _spotifyProfilePromise;
        }

        async function submitSyncData(trackId, provider, syncData, metadata = {}) {
            const identity = await resolveSyncDataIdentity(trackId, metadata);
            if (!identity) {
                throw new Error('이 곡의 ISRC를 확인할 수 없어 sync-data를 등록할 수 없습니다.');
            }

            const userHash = getUserHash();
            const authToken = typeof Utils !== "undefined" && Utils.getAuthToken
                ? Utils.getAuthToken()
                : Spicetify.LocalStorage.get("ivLyrics:auth-token");
            const trackMetadata = getSyncDataTrackMetadata(identity.trackId, metadata);
            const title = trackMetadata.title;
            const artist = trackMetadata.artist;
            const album = trackMetadata.album;
            const durationMs = trackMetadata.durationMs;
            const spotifyProfile = await getCurrentSpotifyProfile();

            if (typeof Utils !== "undefined" && Utils.requireDiscordAuth) {
                await Utils.requireDiscordAuth(I18n.t('syncCreator.loginRequired'));
            } else {
                const profileResponse = await fetch(`${API_BASE}/user/profile?userHash=${encodeURIComponent(userHash)}`, {
                    cache: 'no-store',
                    headers: {
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                    },
                });
                const profile = await profileResponse.json();

                if (!profileResponse.ok) {
                    throw new Error(profile.error || I18n.t('settingsAdvanced.aboutTab.account.loadFailed'));
                }

                if (!profile?.authenticated || !profile?.linked || !profile?.account) {
                    throw new Error(I18n.t('syncCreator.loginRequired'));
                }
            }

            const submitAuthToken = typeof Utils !== "undefined" && Utils.getAuthToken
                ? Utils.getAuthToken()
                : authToken;

            const response = await fetch(`${API_BASE}/lyrics/sync-data`, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": `spicetify v${Spicetify.Config.version}`,
                    ...(submitAuthToken ? { Authorization: `Bearer ${submitAuthToken}` } : {}),
                },
                body: JSON.stringify({
                    isrc: identity.isrc,
                    'request-version': SYNC_DATA_REQUEST_VERSION,
                    ...(identity.trackId ? { trackId: identity.trackId } : {}),
                    provider,
                    syncData,
                    ...(title ? { title } : {}),
                    ...(artist ? { artist } : {}),
                    ...(album ? { album } : {}),
                    ...(durationMs ? { durationMs } : {}),
                    ...(spotifyProfile?.id ? {
                        spotifyUserId: spotifyProfile.id,
                        ...(spotifyProfile.displayName ? { spotifyDisplayName: spotifyProfile.displayName } : {})
                    } : {})
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || result.message || 'Failed to submit sync data');
            }

            const resolvedResultIsrc = normalizeSyncDataIsrc(result?.isrc || result?.data?.isrc);
            if (resolvedResultIsrc && identity.trackId) {
                _isrcLookupCache.set(identity.trackId, {
                    isrc: resolvedResultIsrc,
                    expiresAt: Date.now() + ISRC_LOOKUP_SUCCESS_TTL_MS
                });
            }
            rememberOpenDbSyncDataEntry(resolvedResultIsrc || identity.isrc, provider);
            clearCache(resolvedResultIsrc || identity.isrc, { preserveOpenDb: true });
            return result;
        }

        /**
         * 싱크 데이터를 가사에 적용하여 karaoke 형식으로 변환
         * @param {Array} lyrics - 원본 가사 라인 배열 [{text: "..."}, ...]
         * @param {Object} syncData - 싱크 데이터 { provider, syncData: { lines: [...] } }
         * @returns {Array} - karaoke 형식의 가사
         */
        const getSyncDataParenthesisClose = (char) => {
            if (char === '(') return ')';
            if (char === '\uFF08') return '\uFF09';
            return '';
        };

        const isSyncDataParenthesisClose = (char) => char === ')' || char === '\uFF09';

        const isSyncDataStandaloneParentheticalLine = (line) => {
            const chars = Array.from(String(line || '').trim());
            if (chars.length < 2 || !getSyncDataParenthesisClose(chars[0])) return false;

            const expectedStack = [];
            for (let index = 0; index < chars.length; index++) {
                const char = chars[index];
                const expectedClose = getSyncDataParenthesisClose(char);
                if (expectedClose) {
                    expectedStack.push(expectedClose);
                    continue;
                }
                if (isSyncDataParenthesisClose(char)) {
                    if (!expectedStack.length || expectedStack[expectedStack.length - 1] !== char) {
                        return false;
                    }
                    expectedStack.pop();
                    if (expectedStack.length === 0 && index < chars.length - 1) {
                        return false;
                    }
                }
            }

            return expectedStack.length === 0;
        };

        const stripSyncDataStandaloneParentheticalLine = (line) => {
            let value = String(line || '').normalize('NFC').trim();
            let changed = false;

            while (isSyncDataStandaloneParentheticalLine(value)) {
                const chars = Array.from(value);
                value = chars.slice(1, -1).join('').trim();
                changed = true;
            }

            return changed ? value : String(line || '').normalize('NFC');
        };

        const stripSyncDataLeadingParenthesis = (line) => {
            const value = String(line || '').normalize('NFC');
            const chars = Array.from(value);
            const index = chars.findIndex(char => !/\s/u.test(char));
            if (index < 0 || !getSyncDataParenthesisClose(chars[index])) return value;
            return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
        };

        const stripSyncDataTrailingParenthesis = (line, closeChar) => {
            const value = String(line || '').normalize('NFC');
            const chars = Array.from(value);
            for (let index = chars.length - 1; index >= 0; index--) {
                if (/\s/u.test(chars[index])) continue;
                if (chars[index] !== closeChar) return value;
                return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
            }
            return value;
        };

        const normalizeSyncDataStandaloneParentheticalBlocks = (lines) => {
            const normalizedLines = Array.isArray(lines) ? [...lines] : [];

            for (let index = 0; index < normalizedLines.length; index++) {
                const trimmed = String(normalizedLines[index] || '').trim();
                if (!trimmed) continue;

                const openChar = Array.from(trimmed)[0] || '';
                const closeChar = getSyncDataParenthesisClose(openChar);
                if (!closeChar || trimmed.includes(closeChar)) continue;

                let closeLineIndex = -1;
                for (let candidate = index + 1; candidate < normalizedLines.length; candidate++) {
                    const candidateTrimmed = String(normalizedLines[candidate] || '').trim();
                    if (!candidateTrimmed) continue;
                    if (candidateTrimmed.endsWith(closeChar)) {
                        closeLineIndex = candidate;
                        break;
                    }
                }

                if (closeLineIndex < 0) continue;

                normalizedLines[index] = stripSyncDataLeadingParenthesis(normalizedLines[index]).trim();
                normalizedLines[closeLineIndex] = stripSyncDataTrailingParenthesis(normalizedLines[closeLineIndex], closeChar).trim();
            }

            return normalizedLines;
        };

        const normalizeSyncDataStandaloneParentheticalLines = (text) => (
            normalizeSyncDataStandaloneParentheticalBlocks(
                String(text || '')
                    .normalize('NFC')
                    .split('\n')
                    .map(line => stripSyncDataStandaloneParentheticalLine(line))
            ).join('\n')
        );

        const trimSyncDataCharRangeWhitespace = (chars, start, end, pushHidden = () => {}) => {
            let nextStart = start;
            let nextEnd = end;

            while (nextStart <= nextEnd && /\s/u.test(chars[nextStart] || '')) {
                pushHidden(nextStart);
                nextStart++;
            }

            const trailingHiddenIndexes = [];
            while (nextEnd >= nextStart && /\s/u.test(chars[nextEnd] || '')) {
                trailingHiddenIndexes.push(nextEnd);
                nextEnd--;
            }
            trailingHiddenIndexes.reverse().forEach(pushHidden);

            return { start: nextStart, end: nextEnd };
        };

        const stripSyncDataStandaloneParentheticalCharRange = (chars, start, end, pushHidden = () => {}) => {
            const sourceChars = Array.isArray(chars) ? chars : [];
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= sourceChars.length || start > end) {
                return { start, end, changed: false };
            }

            let nextStart = start;
            let nextEnd = end;
            let changed = false;
            const pendingHiddenIndexes = [];
            const queueHidden = (index) => pendingHiddenIndexes.push(index);

            ({ start: nextStart, end: nextEnd } = trimSyncDataCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
            while (
                nextStart < nextEnd
                && isSyncDataStandaloneParentheticalLine(sourceChars.slice(nextStart, nextEnd + 1).join(''))
            ) {
                queueHidden(nextStart);
                queueHidden(nextEnd);
                nextStart++;
                nextEnd--;
                changed = true;
                ({ start: nextStart, end: nextEnd } = trimSyncDataCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
            }

            if (changed) {
                [...new Set(pendingHiddenIndexes)]
                    .sort((a, b) => a - b)
                    .forEach(pushHidden);
            }

            return { start: nextStart, end: nextEnd, changed };
        };

        const countSyncDataRangeChars = (ranges) => (Array.isArray(ranges) ? ranges : []).reduce((sum, range) => {
            const start = Number(range?.start);
            const end = Number(range?.end);
            return Number.isInteger(start) && Number.isInteger(end) && end >= start ? sum + end - start + 1 : sum;
        }, 0);

        const getNormalizedSyncDataHiddenRanges = (ranges) => (
            (Array.isArray(ranges) ? ranges : [])
                .map((range) => {
                    const start = Number(range?.start);
                    const end = Number(range?.end);
                    return Number.isInteger(start) && Number.isInteger(end) && end >= start
                        ? { start, end }
                        : null;
                })
                .filter(Boolean)
                .sort((a, b) => a.start - b.start || a.end - b.end)
        );

        const isSyncDataRangeGapFullyHidden = (hiddenRanges, gapStart, gapEnd) => {
            if (gapStart > gapEnd || !Array.isArray(hiddenRanges) || hiddenRanges.length === 0) return false;

            let cursor = gapStart;
            for (const hiddenRange of hiddenRanges) {
                if (hiddenRange.end < cursor) continue;
                if (hiddenRange.start > cursor) return false;
                cursor = Math.max(cursor, hiddenRange.end + 1);
                if (cursor > gapEnd) return true;
            }

            return false;
        };

        const getNextSyncDataPartId = (usedIds) => {
            for (const label of 'abcdefghijklmnopqrstuvwxyz') {
                if (!usedIds.has(label)) {
                    usedIds.add(label);
                    return label;
                }
            }

            let index = 1;
            while (index <= 16) {
                const id = `p${index}`;
                if (!usedIds.has(id)) {
                    usedIds.add(id);
                    return id;
                }
                index++;
            }

            return null;
        };

        const splitSyncDataHiddenDelimitedParallelPart = (part, hiddenRanges, usedIds) => {
            if (
                !part
                || typeof part !== 'object'
                || part.role !== 'background'
                || typeof part.id !== 'string'
                || !Array.isArray(part.ranges)
                || part.ranges.length < 2
                || !Array.isArray(part.join)
                || part.join.length !== part.ranges.length - 1
                || !part.join.every(joinMode => Number.isInteger(joinMode) && joinMode >= 0 && joinMode <= 2)
                || !Array.isArray(part.chars)
                || part.chars.length !== countSyncDataRangeChars(part.ranges)
            ) {
                return null;
            }
            if (part.join.some(joinMode => Number(joinMode) === 2)) {
                return null;
            }

            for (let index = 0; index < part.ranges.length; index++) {
                const range = part.ranges[index];
                const start = Number(range?.start);
                const end = Number(range?.end);
                if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
                if (index > 0) {
                    const previousRange = part.ranges[index - 1];
                    const previousEnd = Number(previousRange?.end);
                    if (!Number.isInteger(previousEnd) || start <= previousEnd) return null;
                    if (!isSyncDataRangeGapFullyHidden(hiddenRanges, previousEnd + 1, start - 1)) {
                        return null;
                    }
                }
            }

            const splitParts = [];
            let charOffset = 0;
            for (let index = 0; index < part.ranges.length; index++) {
                const range = part.ranges[index];
                const charCount = range.end - range.start + 1;
                const id = index === 0 ? part.id : getNextSyncDataPartId(usedIds);
                if (!id) return null;

                splitParts.push({
                    ...part,
                    id,
                    ranges: [{ ...range }],
                    join: [],
                    chars: part.chars.slice(charOffset, charOffset + charCount)
                });
                charOffset += charCount;
            }

            return splitParts;
        };

        const splitSyncDataHiddenDelimitedParallelParts = (parallel) => {
            if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts)) return parallel;
            const hiddenRanges = getNormalizedSyncDataHiddenRanges(parallel.hiddenRanges);
            if (hiddenRanges.length === 0) return parallel;

            const usedIds = new Set(parallel.parts
                .map(part => (typeof part?.id === 'string' ? part.id : null))
                .filter(Boolean));
            const parts = [];
            let changed = false;

            parallel.parts.forEach((part) => {
                const splitParts = splitSyncDataHiddenDelimitedParallelPart(part, hiddenRanges, usedIds);
                if (splitParts) {
                    changed = true;
                    parts.push(...splitParts);
                } else {
                    parts.push(part);
                }
            });

            return changed && parts.length <= 16 ? { ...parallel, parts } : parallel;
        };

        const normalizeSyncDataParallelParentheticalRanges = (lines, fullTextChars) => {
            const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
            if (!Array.isArray(lines) || sourceChars.length === 0) return lines;

            let changed = false;
            const normalizedLines = lines.map((line) => {
                if (!Array.isArray(line?.parallel?.parts)) return line;

                let lineChanged = false;
                const parts = line.parallel.parts.map((part) => {
                    if (!part || !Array.isArray(part.ranges) || part.ranges.length !== 1 || !Array.isArray(part.chars)) {
                        return part;
                    }

                    const range = part.ranges[0];
                    const start = Number(range?.start);
                    const end = Number(range?.end);
                    if (
                        !Number.isInteger(start)
                        || !Number.isInteger(end)
                        || start < 0
                        || end < start
                        || end >= sourceChars.length
                        || part.chars.length !== end - start + 1
                    ) {
                        return part;
                    }

                    const localChars = sourceChars.slice(start, end + 1);
                    const stripped = stripSyncDataStandaloneParentheticalCharRange(
                        localChars,
                        0,
                        localChars.length - 1
                    );
                    if (!stripped.changed || stripped.start > stripped.end) return part;

                    const nextChars = part.chars.slice(stripped.start, stripped.end + 1);
                    if (nextChars.length !== stripped.end - stripped.start + 1) return part;

                    changed = true;
                    lineChanged = true;
                    return {
                        ...part,
                        ranges: [{ ...range, start: start + stripped.start, end: start + stripped.end }],
                        chars: nextChars
                    };
                });

                const normalizedLine = lineChanged ? {
                    ...line,
                    parallel: {
                        ...line.parallel,
                        parts
                    }
                } : line;
                const splitParallel = splitSyncDataHiddenDelimitedParallelParts(normalizedLine.parallel);
                if (splitParallel !== normalizedLine.parallel) {
                    changed = true;
                    return {
                        ...normalizedLine,
                        parallel: splitParallel
                    };
                }

                return normalizedLine;
            });

            return changed ? normalizedLines : lines;
        };

        const getSyncDataBaseLyricsLines = (lyrics, normalizeStandaloneParentheticalLines) => {
            const sourceLines = (Array.isArray(lyrics) ? lyrics : [])
                .map(line => (line?.text || '').normalize('NFC').trim())
                .filter(line => line.trim().length > 0);

            if (!normalizeStandaloneParentheticalLines) {
                return sourceLines;
            }

            return normalizeSyncDataStandaloneParentheticalLines(sourceLines.join('\n'))
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.trim().length > 0);
        };

        const getSyncDataLineCharCounts = (lines) => (
            (Array.isArray(lines) ? lines : [])
                .map(line => Array.from(String(line || '').normalize('NFC')).length)
        );

        const hasExactSyncDataLineShape = (expectedCounts, actualCounts) => (
            Array.isArray(expectedCounts)
            && Array.isArray(actualCounts)
            && expectedCounts.length > 0
            && expectedCounts.length === actualCounts.length
            && expectedCounts.every((count, index) => Number(count) === Number(actualCounts[index]))
        );

        const findSyncDataLineShapePrefix = (expectedCounts, actualCounts) => {
            if (hasExactSyncDataLineShape(expectedCounts, actualCounts)) return 0;
            if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return -1;
            if (actualCounts.length === 0 || expectedCounts.length <= actualCounts.length) return -1;

            const maxPrefix = expectedCounts.length - actualCounts.length;
            for (let prefix = 1; prefix <= maxPrefix; prefix++) {
                const matches = actualCounts.every((count, index) => (
                    Number(count) === Number(expectedCounts[prefix + index])
                ));
                if (matches) return prefix;
            }

            return -1;
        };

        const getSyncDataLeadingCharOffset = (lineCounts, prefixLength) => (
            (Array.isArray(lineCounts) ? lineCounts.slice(0, prefixLength) : [])
                .reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0)
        );

        const shiftSyncDataRange = (range, charOffset) => {
            const start = Number(range?.start);
            const end = Number(range?.end);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
            if (end < charOffset) return null;
            return {
                ...range,
                start: Math.max(0, start - charOffset),
                end: Math.max(0, end - charOffset)
            };
        };

        const shiftSyncDataRanges = (ranges, charOffset) => (
            (Array.isArray(ranges) ? ranges : [])
                .map(range => shiftSyncDataRange(range, charOffset))
                .filter(Boolean)
        );

        const shiftSyncDataLineIndexes = (lines, charOffset) => {
            if (!charOffset) return lines;

            return (Array.isArray(lines) ? lines : [])
                .filter(line => Number(line?.end) >= charOffset)
                .map(line => {
                    const shifted = {
                        ...line,
                        start: Math.max(0, Number(line.start) - charOffset),
                        end: Math.max(0, Number(line.end) - charOffset)
                    };

                    if (line?.parallel) {
                        shifted.parallel = {
                            ...line.parallel,
                            hiddenRanges: shiftSyncDataRanges(line.parallel.hiddenRanges, charOffset),
                            parts: (Array.isArray(line.parallel.parts) ? line.parallel.parts : [])
                                .map(part => ({
                                    ...part,
                                    ranges: shiftSyncDataRanges(part.ranges, charOffset)
                                }))
                                .filter(part => part.ranges.length > 0)
                        };
                    }

                    return shifted;
                });
        };

        const getSyncDataLyricsFingerprint = (text) => {
            const value = String(text || '').normalize('NFC');
            let hash = 2166136261;
            for (const char of Array.from(value)) {
                hash ^= char.codePointAt(0) || 0;
                hash = Math.imul(hash, 16777619);
            }
            return `lrclib-${(hash >>> 0).toString(36)}-${Array.from(value).length.toString(36)}`;
        };

        const SYNC_DATA_DURATION_FRONT_OFFSET_RATIO = 0.3;
        const SYNC_DATA_DURATION_OFFSET_MIN_DIFF_MS = 500;

        function getCurrentSyncDataTrackDurationMs(options = {}) {
            const playerItem = typeof Spicetify !== 'undefined' ? Spicetify.Player?.data?.item : null;
            return normalizeSyncDataDurationMs(
                options?.durationMs,
                options?.trackDurationMs,
                options?.duration_ms,
                options?.trackInfo?.durationMs,
                options?.trackInfo?.duration_ms,
                options?.trackInfo?.duration?.milliseconds,
                options?.result?.durationMs,
                options?.result?.duration_ms,
                options?.result?.duration?.milliseconds,
                playerItem?.duration?.milliseconds,
                typeof Spicetify !== 'undefined' ? Spicetify.Player?.getDuration?.() : 0
            );
        }

        function getRegisteredSyncDataTrackDurationMs(syncData, syncBody) {
            return normalizeSyncDataDurationMs(
                syncBody?.trackDurationMs,
                syncData?.trackDurationMs,
                syncData?.durationMs
            );
        }

        function getSyncDataDurationOffsetMs(syncData, syncBody, options = {}) {
            const registeredDurationMs = getRegisteredSyncDataTrackDurationMs(syncData, syncBody);
            const currentDurationMs = getCurrentSyncDataTrackDurationMs(options);
            if (!registeredDurationMs || !currentDurationMs) {
                return { offsetMs: 0, registeredDurationMs, currentDurationMs, diffMs: 0 };
            }

            const diffMs = currentDurationMs - registeredDurationMs;
            if (Math.abs(diffMs) < SYNC_DATA_DURATION_OFFSET_MIN_DIFF_MS) {
                return { offsetMs: 0, registeredDurationMs, currentDurationMs, diffMs };
            }

            return {
                offsetMs: Math.round(diffMs * SYNC_DATA_DURATION_FRONT_OFFSET_RATIO),
                registeredDurationMs,
                currentDurationMs,
                diffMs
            };
        }

        function shiftSyncDataTimeSeconds(value, offsetSeconds) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return value;
            return Math.max(0, Number((numeric + offsetSeconds).toFixed(3)));
        }

        function shiftSyncDataTimingLine(line, offsetSeconds) {
            if (!line || typeof line !== 'object') return line;
            const shifted = {
                ...line,
                chars: Array.isArray(line.chars)
                    ? line.chars.map(value => shiftSyncDataTimeSeconds(value, offsetSeconds))
                    : line.chars
            };

            if (line.parallel && typeof line.parallel === 'object') {
                shifted.parallel = {
                    ...line.parallel,
                    parts: Array.isArray(line.parallel.parts)
                        ? line.parallel.parts.map(part => ({
                            ...part,
                            chars: Array.isArray(part?.chars)
                                ? part.chars.map(value => shiftSyncDataTimeSeconds(value, offsetSeconds))
                                : part?.chars
                        }))
                        : line.parallel.parts
                };
            }

            return shifted;
        }

        function applySyncDataDurationOffsetToLines(lines, offsetMs) {
            if (!Array.isArray(lines) || !offsetMs) return lines;
            const offsetSeconds = offsetMs / 1000;
            return lines.map(line => shiftSyncDataTimingLine(line, offsetSeconds));
        }

        /**
         * Applies community sync-data to base lyrics and produces karaoke lyrics.
         * sync-data v2 uses offsets from lyrics after standalone parenthetical vocal markers are removed.
         * sync-data v3 also strips standalone parenthetical wrappers from parallel vocal part ranges.
         */
        function applySyncDataToLyrics(lyrics, syncData, options = {}) {
            if (!lyrics || !syncData || !syncData.syncData || !syncData.syncData.lines) {
                return null;
            }

            const syncBody = syncData.syncData;
            const syncLines = syncBody.lines;
            const syncSource = syncBody.source || syncData.source || null;
            const hasNormalizedSourceLineShape = Array.isArray(syncSource?.lineCharCounts)
                && syncSource.lineCharCounts.length > 0;
            const shouldNormalizeParentheticalLines =
                Number(syncBody.version ?? syncData.version ?? 1) >= 2
                || hasNormalizedSourceLineShape;
            const baseLyricsLines = getSyncDataBaseLyricsLines(lyrics, shouldNormalizeParentheticalLines);
            const baseLyricsText = baseLyricsLines.join('\n');
            let normalizedSyncLines = syncLines;
            let sourceLinePrefix = 0;
            const sourceLineCharCounts = hasNormalizedSourceLineShape ? syncSource.lineCharCounts : null;
            if (sourceLineCharCounts) {
                const baseLineCharCounts = getSyncDataLineCharCounts(baseLyricsLines);
                sourceLinePrefix = findSyncDataLineShapePrefix(sourceLineCharCounts, baseLineCharCounts);
                if (sourceLinePrefix < 0) {
                    window.__ivLyricsDebugLog?.('[SyncDataService] Sync-data source line shape mismatch; skipping karaoke render', {
                        expectedLineCount: sourceLineCharCounts.length,
                        actualLineCount: baseLineCharCounts.length,
                        expectedPreview: sourceLineCharCounts.slice(0, 12),
                        actualPreview: baseLineCharCounts.slice(0, 12),
                        provider: syncData.provider,
                        sourceProvider: syncSource?.provider,
                        lrclibId: syncSource?.lrclibId
                    });
                    return null;
                }
                if (sourceLinePrefix > 0) {
                    const sourceCharOffset = getSyncDataLeadingCharOffset(sourceLineCharCounts, sourceLinePrefix);
                    normalizedSyncLines = shiftSyncDataLineIndexes(syncLines, sourceCharOffset);
                    window.__ivLyricsDebugLog?.('[SyncDataService] Trimmed leading sync-data source lines', {
                        prefixLineCount: sourceLinePrefix,
                        sourceCharOffset,
                        provider: syncData.provider,
                        sourceProvider: syncSource?.provider,
                        lrclibId: syncSource?.lrclibId
                    });
                }
            }
            if (sourceLinePrefix === 0 && syncSource?.lyricsFingerprint) {
                const baseLyricsFingerprint = getSyncDataLyricsFingerprint(baseLyricsText);
                if (syncSource.lyricsFingerprint !== baseLyricsFingerprint) {
                    window.__ivLyricsDebugLog?.('[SyncDataService] Sync-data source fingerprint mismatch; skipping karaoke render', {
                        expected: syncSource.lyricsFingerprint,
                        actual: baseLyricsFingerprint,
                        provider: syncData.provider,
                        sourceProvider: syncSource?.provider,
                        lrclibId: syncSource?.lrclibId
                    });
                    return null;
                }
            }
            const durationAdjustment = getSyncDataDurationOffsetMs(syncData, syncBody, options);
            if (durationAdjustment.offsetMs) {
                normalizedSyncLines = applySyncDataDurationOffsetToLines(normalizedSyncLines, durationAdjustment.offsetMs);
                window.__ivLyricsDebugLog?.('[SyncDataService] Applied duration mismatch offset to sync-data', {
                    provider: syncData.provider,
                    isrc: syncData.isrc || null,
                    registeredDurationMs: durationAdjustment.registeredDurationMs,
                    currentDurationMs: durationAdjustment.currentDurationMs,
                    diffMs: durationAdjustment.diffMs,
                    frontOffsetMs: durationAdjustment.offsetMs,
                    rearRemainderMs: durationAdjustment.diffMs - durationAdjustment.offsetMs,
                    frontRatio: SYNC_DATA_DURATION_FRONT_OFFSET_RATIO
                });
            }

            // 전체 가사 텍스트를 하나로 합침 (줄바꿈 없이 - SyncDataCreator와 동일하게)
            // SyncDataCreator에서는 각 줄의 글자 수만 계산하고 줄바꿈은 포함하지 않음
            // 중요 1: SyncDataCreator는 Array.from()으로 유니코드 코드 포인트 기준 인덱스를 사용하므로
            // 여기서도 동일하게 Array.from()을 사용해야 특수문자(서로게이트 페어, 결합 문자 등)가 포함된 경우에도 정확한 인덱싱이 가능함
            // 중요 2: SyncDataCreator에서는 filter(t => t.trim().length > 0)로 빈 줄/공백 줄을 제외하므로
            // 여기서도 동일하게 필터링해야 인덱스가 맞음
            // 중요 3: NFD(결합 문자) vs NFC(합성 문자) 정규화 차이로 인한 인덱스 불일치 방지
            // 예: "é"가 NFD에서는 "e" + 결합 액센트로 2개 코드포인트, NFC에서는 1개 코드포인트
            // SyncDataCreator와 동일하게 NFC로 정규화해야 함
            const fullTextChars = baseLyricsLines
                .map(line => Array.from(line))
                .flat();
            normalizedSyncLines = normalizeSyncDataParallelParentheticalRanges(normalizedSyncLines, fullTextChars);

            const result = [];

            for (let i = 0; i < normalizedSyncLines.length; i++) {
                const lineData = normalizedSyncLines[i];
                const nextLineData = normalizedSyncLines[i + 1];

                // 해당 범위의 텍스트 추출 (유니코드 문자 배열에서 slice 사용)
                const lineText = fullTextChars.slice(lineData.start, lineData.end + 1).join('');

                // 라인 시작/종료 시간 계산 (일단 다음 줄 시작 전까지로 잡지만, 아래에서 조정함)
                const lineStartTime = Math.round(lineData.chars[0] * 1000);
                let lineEndTime = nextLineData
                    ? Math.round(nextLineData.chars[0] * 1000)
                    : Math.round(lineData.chars[lineData.chars.length - 1] * 1000) + 2000;

                // 평균 글자 지속 시간 계산 (초 단위)
                const lineDuration = (nextLineData
                    ? nextLineData.chars[0]
                    : lineData.chars[lineData.chars.length - 1] + 1) - lineData.chars[0];
                const avgCharDuration = Math.max(0.2, lineDuration / Math.max(1, lineData.chars.length));

                // 마지막 글자의 자연스러운 최대 지속 시간 (평균의 2.5배 또는 최대 1.5초)
                // 너무 짧게 끊기지 않도록 최소 0.5초는 보장
                const lastCharMaxDuration = Math.max(0.5, Math.min(1.5, avgCharDuration * 2.5));

                // 각 글자별 syllable 생성
                const syllables = [];
                const chars = Array.from(lineText); // 유니코드 문자 지원

                for (let j = 0; j < lineData.chars.length && j < chars.length; j++) {
                    const charStartTime = Math.round(lineData.chars[j] * 1000);
                    let charEndTime;

                    if (j < lineData.chars.length - 1) {
                        charEndTime = Math.round(lineData.chars[j + 1] * 1000);
                    } else {
                        // 마지막 글자: 다음 줄 시작 시간과 자연스러운 종료 시간 중 더 빠른 것 선택
                        const naturalEndTime = Math.round((lineData.chars[j] + lastCharMaxDuration) * 1000);
                        charEndTime = Math.min(lineEndTime, naturalEndTime);

                        // 라인 전체 종료 시간도 이에 맞춰 조정 (너무 길게 늘어지는 것 방지)
                        lineEndTime = charEndTime;
                    }

                    syllables.push({
                        text: chars[j],
                        startTime: charStartTime,
                        endTime: charEndTime
                    });
                }

                const buildParallelPart = (part) => {
                    if (!part || !Array.isArray(part.ranges) || !Array.isArray(part.chars)) return null;
                    const partSyllables = [];
                    let partCharIndex = 0;
                    let text = '';

                    part.ranges.forEach((range, rangeIndex) => {
                        if (rangeIndex > 0) {
                            const joinMode = Array.isArray(part.join) ? Number(part.join[rangeIndex - 1]) : 1;
                            if (joinMode === 1 || joinMode === 2) {
                                text += ' ';
                                const previousTime = partSyllables[partSyllables.length - 1]?.endTime
                                    ?? Math.round((part.chars[Math.max(0, partCharIndex - 1)] || lineData.chars[0]) * 1000);
                                partSyllables.push({
                                    text: ' ',
                                    startTime: previousTime,
                                    endTime: previousTime
                                });
                            }
                        }

                        for (let sourceIndex = range.start; sourceIndex <= range.end; sourceIndex++) {
                            const char = fullTextChars[sourceIndex] || '';
                            const charStart = Math.round((part.chars[partCharIndex] ?? lineData.chars[0]) * 1000);
                            const nextPartTime = part.chars[partCharIndex + 1];
                            const charEnd = nextPartTime !== undefined
                                ? Math.round(nextPartTime * 1000)
                                : Math.min(lineEndTime, charStart + Math.round(lastCharMaxDuration * 1000));

                            text += char;
                            partSyllables.push({
                                text: char,
                                startTime: charStart,
                                endTime: charEnd
                            });
                            partCharIndex++;
                        }
                    });

                    if (!partSyllables.length) return null;
                    while (partSyllables.length && /^\s+$/u.test(partSyllables[0]?.text || '')) {
                        partSyllables.shift();
                    }
                    while (partSyllables.length && /^\s+$/u.test(partSyllables[partSyllables.length - 1]?.text || '')) {
                        partSyllables.pop();
                    }
                    if (!partSyllables.length) return null;
                    const normalizedText = partSyllables.map(syllable => syllable.text || '').join('');
	                    return {
	                        id: part.id || '',
	                        role: part.role || '',
	                        speaker: part.speaker || '',
	                        'speaker-color': part['speaker-color'] || '',
	                        'speaker-fallback': part['speaker-fallback'] || '',
	                        kind: part.kind || 'vocal',
	                        text: normalizedText,
	                        syllables: partSyllables,
	                        startTime: partSyllables[0].startTime,
                        endTime: partSyllables[partSyllables.length - 1].endTime
                    };
                };

                const parallelParts = Array.isArray(lineData.parallel?.parts)
                    ? lineData.parallel.parts.map(buildParallelPart).filter(Boolean)
                    : [];

                if (parallelParts.length > 1) {
                    const leadPart = parallelParts.find(part => part.role === 'lead') || parallelParts[0];
                    const backgroundParts = parallelParts.filter(part => part !== leadPart);
                    const allPartTimes = parallelParts.flatMap(part => [part.startTime, part.endTime]).filter(Number.isFinite);
	                    result.push({
	                        startTime: Math.min(...allPartTimes, lineStartTime),
	                        endTime: Math.max(...allPartTimes, lineEndTime),
	                        text: lineText,
	                        speaker: lineData.speaker || leadPart.speaker || '',
	                        'speaker-color': lineData['speaker-color'] || leadPart['speaker-color'] || '',
	                        'speaker-fallback': lineData['speaker-fallback'] || leadPart['speaker-fallback'] || '',
	                        kind: lineData.kind || leadPart.kind || 'vocal',
	                        vocals: {
	                            lead: {
	                                id: leadPart.id,
	                                role: leadPart.role,
	                                speaker: leadPart.speaker,
	                                'speaker-color': leadPart['speaker-color'] || '',
	                                'speaker-fallback': leadPart['speaker-fallback'] || '',
	                                kind: leadPart.kind,
	                                text: leadPart.text,
	                                syllables: leadPart.syllables
	                            },
	                            background: backgroundParts.map(part => ({
	                                id: part.id,
	                                role: part.role,
	                                speaker: part.speaker,
	                                'speaker-color': part['speaker-color'] || '',
	                                'speaker-fallback': part['speaker-fallback'] || '',
	                                kind: part.kind,
	                                text: part.text,
	                                syllables: part.syllables
	                            }))
                        }
                    });
                    continue;
                }

	                result.push({
	                    startTime: lineStartTime,
	                    endTime: lineEndTime,
	                    text: lineText,
	                    speaker: lineData.speaker || '',
	                    'speaker-color': lineData['speaker-color'] || '',
	                    'speaker-fallback': lineData['speaker-fallback'] || '',
	                    kind: lineData.kind || 'vocal',
	                    syllables
	                });
            }

            return result;
        }

        /**
         * sync-data에서 일반 싱크 가사 생성 (karaoke -> synced 변환)
         * @param {Array} karaoke - karaoke 형식 가사
         * @returns {Array} - synced 형식 가사
         */
        function convertKaraokeToSynced(karaoke) {
            if (!karaoke || !Array.isArray(karaoke)) return null;

            return karaoke.map(line => ({
                startTime: line.startTime,
                text: line.text,
                speaker: line.speaker,
                'speaker-color': line['speaker-color'],
                'speaker-fallback': line['speaker-fallback'],
                kind: line.kind
            }));
        }

        return {
            getSyncData,
            getAvailableProviders,
            hasSyncData,
            submitSyncData,
            applySyncDataToLyrics,
            convertKaraokeToSynced,
            getTrackIsrc,
            resolveTrackIsrc,
            rememberTrackIsrc,
            getSyncDataTrackMetadata,
            normalizeSyncDataIsrc,
            hasOpenDbSyncDataEntry,
            shouldBypassServerCache,
            clearCache
        };
    })();

    window.SyncDataService = SyncDataService;

    const PseudoKaraokeService = (() => {
        const SETTING_KEY = 'ivLyrics:visual:spotify-fake-karaoke-enabled';
        const CACHE_VERSION_BASE = 'pseudo-karaoke-v11';
        const LINE_TIMING_PSEUDO_SOURCE = 'line-timing-pseudo';
        const AGGRESSIVE_SCRIPT_REGEX = /[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
        const HANGUL_BASE_CODE = 0xac00;
        const HANGUL_END_CODE = 0xd7a3;
        const HANGUL_JUNGSEONG_COUNT = 21;
        const HANGUL_JONGSEONG_COUNT = 28;
        const HANGUL_COMPLEX_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]);
        const HANGUL_SUSTAIN_FINALS = new Set([4, 8, 16, 21, 27]);
        const KOREAN_SHORT_PARTICLES = new Set(['은', '는', '이', '가', '을', '를', '도', '만', '에', '엔', '로', '으로', '와', '과', '랑', '이랑', '한테', '께', '의', '야']);
        const JAPANESE_SMALL_KANA_REGEX = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮヵヶ]/;
        const JAPANESE_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'も', 'で', 'の', 'ね', 'よ', 'か', 'な', 'さ']);
        const HAN_PARTICLES = new Set(['的', '了', '吗', '呢', '啊', '呀', '吧', '啦', '嘛', '着', '过']);
        const _analysisCache = new Map();
        const _inflightAnalysis = new Map();
        const _analysisHintsCache = new WeakMap();
        const PSEUDO_SOURCES = new Set([
            'audio-analysis-pseudo',
            'spotify-audio-analysis',
            LINE_TIMING_PSEUDO_SOURCE
        ]);

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function clamp01(value) {
            return clamp(value, 0, 1);
        }

        function parseMs(value) {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            const parsed = parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : null;
        }

        function isEnabled() {
            try {
                return localStorage.getItem(SETTING_KEY) === 'true';
            } catch (error) {
                return false;
            }
        }

        function isAggressiveChar(char) {
            return AGGRESSIVE_SCRIPT_REGEX.test(char);
        }

        function isHangulSyllable(char) {
            if (!char) return false;
            const code = char.codePointAt(0);
            return code >= HANGUL_BASE_CODE && code <= HANGUL_END_CODE;
        }

        function isJapaneseChar(char) {
            if (!char) return false;
            return /[\u3040-\u30ff\u31f0-\u31ffー]/.test(char);
        }

        function isHanChar(char) {
            if (!char) return false;
            return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char);
        }

        function getHangulSyllableMeta(char) {
            if (!isHangulSyllable(char)) return null;
            const offset = char.codePointAt(0) - HANGUL_BASE_CODE;
            const jongseongIndex = offset % HANGUL_JONGSEONG_COUNT;
            const jungseongIndex = Math.floor(offset / HANGUL_JONGSEONG_COUNT) % HANGUL_JUNGSEONG_COUNT;
            return { jungseongIndex, jongseongIndex };
        }

        function getHangulUnitWeight(text, repeatedCount) {
            const chars = Array.from(text);
            let total = 0;

            for (const char of chars) {
                const meta = getHangulSyllableMeta(char);
                if (!meta) {
                    total += 0.8;
                    continue;
                }

                let syllableWeight = 0.96;
                if (HANGUL_COMPLEX_VOWELS.has(meta.jungseongIndex)) syllableWeight += 0.18;
                if (meta.jongseongIndex === 0) {
                    syllableWeight += 0.12;
                } else if (HANGUL_SUSTAIN_FINALS.has(meta.jongseongIndex)) {
                    syllableWeight += 0.03;
                } else {
                    syllableWeight -= 0.04;
                }
                total += syllableWeight;
            }

            const particlePenalty = KOREAN_SHORT_PARTICLES.has(text) ? 0.76 : 1;
            return clamp((total + (repeatedCount * 0.14)) * particlePenalty, 0.78, 7.2);
        }

        function getJapaneseUnitWeight(text, repeatedCount) {
            const chars = Array.from(text);
            let moraWeight = 0;

            for (const char of chars) {
                if (JAPANESE_SMALL_KANA_REGEX.test(char)) {
                    moraWeight += 0.1;
                    continue;
                }
                if (char === 'ー') {
                    moraWeight += 0.58;
                    continue;
                }
                if (char === 'っ' || char === 'ッ' || char === 'ん' || char === 'ン') {
                    moraWeight += 0.7;
                    continue;
                }
                moraWeight += 0.98;
            }

            const particlePenalty = JAPANESE_PARTICLES.has(text) ? 0.74 : 1;
            return clamp((moraWeight + (repeatedCount * 0.16)) * particlePenalty, 0.72, 7);
        }

        function getHanUnitWeight(text, repeatedCount) {
            const chars = Array.from(text);
            const base = chars.length * 0.97;
            const particlePenalty = chars.length <= 2 && HAN_PARTICLES.has(text) ? 0.8 : 1;
            return clamp((base + (repeatedCount * 0.12)) * particlePenalty, 0.8, 6.8);
        }

        function getCacheVersion() {
            return `${CACHE_VERSION_BASE}:${isEnabled() ? 'on' : 'off'}`;
        }

        function clearPseudoKaraoke(result) {
            if (!result || !PSEUDO_SOURCES.has(result.karaokeSource)) return result;
            result.karaoke = null;
            delete result.karaokeSource;
            delete result.pseudoKaraokeCacheVersion;
            return result;
        }

        async function getAudioAnalysis(trackId) {
            if (!trackId) return null;
            if (_analysisCache.has(trackId)) return _analysisCache.get(trackId);
            if (_inflightAnalysis.has(trackId)) return _inflightAnalysis.get(trackId);

            const promise = (async () => {
                try {
                    if (typeof Spicetify.getAudioData !== 'function') {
                        return null;
                    }
                    const analysis = await Spicetify.getAudioData(`spotify:track:${trackId}`);
                    _analysisCache.set(trackId, analysis);
                    return analysis;
                } catch (error) {
                    window.__ivLyricsDebugLog?.('[PseudoKaraokeService] Audio analysis fetch failed', error);
                    return null;
                } finally {
                    _inflightAnalysis.delete(trackId);
                }
            })();

            _inflightAnalysis.set(trackId, promise);
            return promise;
        }

        function normalizeSyncedLines(lines, fallbackDurationMs) {
            if (!Array.isArray(lines)) return [];

            return lines
                .map((line, index) => {
                    const startTime = parseMs(line?.startTime);
                    if (startTime === null) return null;

                    const directEnd = parseMs(line?.endTime);
                    const nextStart = parseMs(lines[index + 1]?.startTime);
                    const endTime = directEnd && directEnd > startTime
                        ? directEnd
                        : (nextStart && nextStart > startTime
                            ? nextStart
                            : (Number.isFinite(fallbackDurationMs) && fallbackDurationMs > startTime ? fallbackDurationMs : startTime + 4000));

                    return {
                        startTime,
                        endTime,
                        text: line?.text || ''
                    };
                })
                .filter(Boolean);
        }

        function estimateAggressiveChunkSize(coreToken, lineConfidence, lineDurationMs) {
            const charCount = Array.from(coreToken).length;
            if (charCount <= 1) return 1;

            const msPerChar = lineDurationMs / Math.max(1, charCount);
            if (lineConfidence >= 0.62 || msPerChar >= 170) return 1;
            if (lineConfidence >= 0.42 || msPerChar >= 110) return 2;
            return charCount >= 8 ? 3 : 2;
        }

        function tokenizeLine(text, options = {}) {
            if (!text) return [];

            const lineConfidence = clamp01(options.lineConfidence ?? 0.5);
            const lineDurationMs = Math.max(1, options.lineDurationMs ?? 2000);
            const coarseTokens = text.match(/\S+\s*|\s+/g) || [text];
            const units = [];

            for (const token of coarseTokens) {
                if (!token) continue;

                const trimmed = token.trim();
                if (!trimmed) {
                    units.push(token);
                    continue;
                }

                const shouldSplitAggressively = Array.from(trimmed).some(isAggressiveChar);
                if (!shouldSplitAggressively) {
                    units.push(token);
                    continue;
                }

                const trailingWhitespaceMatch = token.match(/\s+$/);
                const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';
                const coreToken = trailingWhitespace ? token.slice(0, -trailingWhitespace.length) : token;
                const chars = Array.from(coreToken);
                const chunkSize = estimateAggressiveChunkSize(coreToken, lineConfidence, lineDurationMs);

                if (!chars.length) {
                    units.push(token);
                    continue;
                }

                for (let index = 0; index < chars.length; index += chunkSize) {
                    const chunk = chars.slice(index, index + chunkSize).join('');
                    units.push(index + chunkSize >= chars.length && trailingWhitespace ? chunk + trailingWhitespace : chunk);
                }
            }

            return units;
        }

        function getUnitWeight(unitText) {
            const trimmed = unitText.trim();
            if (!trimmed) return Math.max(0.2, unitText.length * 0.15);

            const chars = Array.from(trimmed);
            const alphaNumericCount = chars.filter((char) => /[A-Za-z0-9]/.test(char)).length;
            const aggressiveCount = chars.filter(isAggressiveChar).length;
            const hangulCount = chars.filter(isHangulSyllable).length;
            const japaneseCount = chars.filter(isJapaneseChar).length;
            const hanCount = chars.filter(isHanChar).length;
            const punctuationCount = chars.filter((char) => /[.,!?;:'"()[\]{}\-]/.test(char)).length;
            const repeatedCount = chars.reduce((count, char, index) => {
                if (index === 0) return count;
                return count + (char === chars[index - 1] ? 1 : 0);
            }, 0);

            if (punctuationCount === chars.length) {
                return Math.max(0.22, chars.length * 0.18);
            }

            if (hangulCount === chars.length) {
                return getHangulUnitWeight(trimmed, repeatedCount);
            }

            if (japaneseCount === chars.length) {
                return getJapaneseUnitWeight(trimmed, repeatedCount);
            }

            if (hanCount === chars.length) {
                return getHanUnitWeight(trimmed, repeatedCount);
            }

            if (aggressiveCount === chars.length) {
                return Math.max(0.9, aggressiveCount + (repeatedCount * 0.28));
            }

            if (alphaNumericCount > 0) {
                const normalized = trimmed.toLowerCase();
                const vowelGroups = normalized.match(/[aeiouy]+/g)?.length || 0;
                const letterCount = chars.filter((char) => /[A-Za-z]/.test(char)).length;
                const digitCount = chars.filter((char) => /[0-9]/.test(char)).length;
                const pronunciationUnits = Math.max(
                    vowelGroups,
                    Math.ceil(letterCount / 3.4),
                    digitCount > 0 ? digitCount : 0
                );
                const connectorWords = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but']);
                const connectorPenalty = connectorWords.has(normalized) ? 0.72 : 1;
                const longEndingBoost = /(ing|ed|er|est|oo|ee|ah|oh)$/i.test(trimmed) ? 0.42 : 0;
                return clamp(
                    ((pronunciationUnits * 0.95) + longEndingBoost + (repeatedCount * 0.15)) * connectorPenalty,
                    0.75,
                    6.8
                );
            }

            return Math.max(0.45, chars.length * 0.4);
        }

        function dedupeSortedTimes(times, minGap) {
            return times.filter((time, index, array) => index === 0 || (time - array[index - 1]) >= minGap);
        }

        function getPitchStats(pitches) {
            if (!Array.isArray(pitches) || pitches.length === 0) return { peak: 0, focus: 0, spread: 0 };

            const sorted = [...pitches].sort((left, right) => right - left);
            const sum = pitches.reduce((total, value) => total + Math.max(0, value), 0);
            const peak = sorted[0] || 0;
            const focus = sum > 0 ? ((sorted[0] || 0) + (sorted[1] || 0) + (sorted[2] || 0)) / sum : 0;
            const mean = sum / pitches.length;
            const variance = pitches.reduce((total, value) => total + ((value - mean) ** 2), 0) / pitches.length;

            return { peak, focus, spread: Math.sqrt(variance) };
        }

        function getPitchPeakIndex(pitches) {
            if (!Array.isArray(pitches) || pitches.length === 0) return -1;

            let bestIndex = 0;
            let bestValue = pitches[0] || 0;
            for (let index = 1; index < pitches.length; index++) {
                if ((pitches[index] || 0) > bestValue) {
                    bestValue = pitches[index] || 0;
                    bestIndex = index;
                }
            }
            return bestValue > 0 ? bestIndex : -1;
        }

        function getPitchNeighborAffinity(segment, neighborSegment) {
            if (!segment || !neighborSegment) return 0;

            const segmentPeakIndex = Number.isFinite(segment?.pitchPeakIndex)
                ? segment.pitchPeakIndex
                : getPitchPeakIndex(segment?.pitches);
            const neighborPeakIndex = Number.isFinite(neighborSegment?.pitchPeakIndex)
                ? neighborSegment.pitchPeakIndex
                : getPitchPeakIndex(neighborSegment?.pitches);
            if (segmentPeakIndex < 0 || neighborPeakIndex < 0) return 0;

            const distance = Math.abs(segmentPeakIndex - neighborPeakIndex);
            const peakCloseness = clamp01(1 - (distance / 5));
            const segmentFocus = Number.isFinite(segment?.pitchFocus) ? segment.pitchFocus : getPitchStats(segment?.pitches).focus;
            const neighborFocus = Number.isFinite(neighborSegment?.pitchFocus) ? neighborSegment.pitchFocus : getPitchStats(neighborSegment?.pitches).focus;
            const focusCloseness = clamp01(1 - (Math.abs(segmentFocus - neighborFocus) / 0.32));
            return clamp01((peakCloseness * 0.62) + (focusCloseness * 0.38));
        }

        function getTimbreDelta(currentSegment, neighborSegment) {
            const current = currentSegment?.timbre;
            const neighbor = neighborSegment?.timbre;
            if (!Array.isArray(current) || !Array.isArray(neighbor) || !current.length || !neighbor.length) return 0;

            const length = Math.min(current.length, neighbor.length, 6);
            let sum = 0;
            for (let index = 0; index < length; index++) {
                sum += Math.abs(current[index] - neighbor[index]);
            }

            return clamp01(sum / (length * 45));
        }

        function scoreVocalCandidate(segment, previousSegment, nextSegment) {
            const durationMs = Math.max(1, (segment?.duration || 0) * 1000);
            if (durationMs < 35 || durationMs > 650) return null;

            const confidence = clamp01(typeof segment?.confidence === 'number' ? segment.confidence : 0);
            const loudnessStart = Number.isFinite(segment?.loudness_start) ? segment.loudness_start : -60;
            const loudnessMax = Number.isFinite(segment?.loudness_max) ? segment.loudness_max : loudnessStart;
            const loudnessRise = loudnessMax - loudnessStart;
            const loudnessMaxTime = Number.isFinite(segment?.loudness_max_time) ? segment.loudness_max_time : Math.min(segment?.duration || 0, 0.08);
            const attackRatio = clamp01(loudnessMaxTime / Math.max(segment?.duration || 0.001, 0.001));
            const attackScore = clamp01(1 - (Math.abs(attackRatio - 0.22) / 0.22));
            const onsetScore = clamp01((loudnessRise + 2) / 10);
            const sustainedScore = clamp01((durationMs - 60) / 180);
            const loudnessScore = clamp01((loudnessMax + 36) / 28);
            const pitchStats = getPitchStats(segment?.pitches);
            const harmonicScore = clamp01(((pitchStats.peak * 0.55) + (pitchStats.focus * 0.65) - 0.35) / 0.55);
            const contrastScore = Math.max(getTimbreDelta(segment, previousSegment), getTimbreDelta(segment, nextSegment));

            let score =
                (confidence * 0.16) +
                (onsetScore * 0.2) +
                (attackScore * 0.12) +
                (sustainedScore * 0.15) +
                (harmonicScore * 0.22) +
                (contrastScore * 0.1) +
                (loudnessScore * 0.05);

            if (durationMs < 90 && attackRatio < 0.12 && onsetScore > 0.55) score -= 0.18;
            if (pitchStats.focus < 0.38 && pitchStats.peak < 0.42) score -= 0.12;
            if (pitchStats.spread > 0.25 && durationMs < 110) score -= 0.08;

            return {
                baseScore: clamp01(score),
                durationMs,
                confidence,
                attackRatio,
                onsetScore,
                sustainedScore,
                loudnessScore,
                harmonicScore,
                contrastScore,
                pitchPeakIndex: getPitchPeakIndex(segment?.pitches),
                pitchSpread: pitchStats.spread,
                pitchFocus: pitchStats.focus
            };
        }

        function getSectionBoundsMs(section, fallbackEndMs) {
            const sectionStart = Math.max(0, Math.round((section?.start || 0) * 1000));
            const sectionDurationMs = Math.max(0, Math.round((section?.duration || 0) * 1000));
            const sectionEnd = sectionDurationMs > 0
                ? sectionStart + sectionDurationMs
                : Math.max(sectionStart, fallbackEndMs);
            return {
                start: sectionStart,
                end: Math.max(sectionStart + 1, sectionEnd)
            };
        }

        function buildTrackSeedProfile(scoredSegments) {
            if (!Array.isArray(scoredSegments) || !scoredSegments.length) return null;

            const seeds = scoredSegments.filter((candidate) =>
                candidate.baseScore >= 0.56 &&
                candidate.harmonicScore >= 0.5 &&
                candidate.pitchFocus >= 0.42 &&
                candidate.durationMs >= 70 &&
                candidate.durationMs <= 420
            );
            const source = seeds.length >= 4
                ? seeds
                : scoredSegments
                    .slice()
                    .sort((left, right) => right.baseScore - left.baseScore)
                    .slice(0, Math.min(8, scoredSegments.length));
            if (!source.length) return null;

            const totalWeight = source.reduce((sum, candidate) => sum + Math.max(0.1, candidate.baseScore), 0) || 1;
            const average = (key) => source.reduce(
                (sum, candidate) => sum + ((candidate[key] || 0) * Math.max(0.1, candidate.baseScore)),
                0
            ) / totalWeight;
            const timbreLength = Math.min(
                6,
                ...source.map((candidate) => Array.isArray(candidate.timbre) ? candidate.timbre.length : 0)
            );
            const timbreCentroid = Array.from({ length: Math.max(0, timbreLength) }, (_, index) =>
                source.reduce(
                    (sum, candidate) => sum + (((candidate.timbre?.[index]) || 0) * Math.max(0.1, candidate.baseScore)),
                    0
                ) / totalWeight
            );

            return {
                seedCount: source.length,
                averageDurationMs: average('durationMs'),
                averageAttackRatio: average('attackRatio'),
                averagePitchFocus: average('pitchFocus'),
                averagePitchSpread: average('pitchSpread'),
                averageHarmonicScore: average('harmonicScore'),
                averageLoudnessScore: average('loudnessScore'),
                timbreCentroid
            };
        }

        function getTimbreSimilarity(timbre, profile) {
            if (!Array.isArray(timbre) || !profile?.timbreCentroid?.length) return 0.5;

            const length = Math.min(timbre.length, profile.timbreCentroid.length);
            if (!length) return 0.5;

            let delta = 0;
            for (let index = 0; index < length; index++) {
                delta += Math.abs((timbre[index] || 0) - (profile.timbreCentroid[index] || 0));
            }

            return clamp01(1 - (delta / (length * 34)));
        }

        function scoreProfileSimilarity(candidate, profile) {
            if (!candidate || !profile) return 0.5;

            const durationSimilarity = clamp01(
                1 - (Math.abs(Math.log((candidate.durationMs || 1) / Math.max(1, profile.averageDurationMs || 1))) / Math.log(3.6))
            );
            const attackSimilarity = clamp01(
                1 - (Math.abs((candidate.attackRatio || 0) - (profile.averageAttackRatio || 0)) / 0.28)
            );
            const focusSimilarity = clamp01(
                1 - (Math.abs((candidate.pitchFocus || 0) - (profile.averagePitchFocus || 0)) / 0.34)
            );
            const spreadSimilarity = clamp01(
                1 - (Math.abs((candidate.pitchSpread || 0) - (profile.averagePitchSpread || 0)) / 0.2)
            );
            const harmonicSimilarity = clamp01(
                1 - (Math.abs((candidate.harmonicScore || 0) - (profile.averageHarmonicScore || 0)) / 0.32)
            );
            const loudnessSimilarity = clamp01(
                1 - (Math.abs((candidate.loudnessScore || 0) - (profile.averageLoudnessScore || 0)) / 0.4)
            );
            const timbreSimilarity = getTimbreSimilarity(candidate.timbre, profile);

            return clamp01(
                (durationSimilarity * 0.18) +
                (attackSimilarity * 0.12) +
                (focusSimilarity * 0.2) +
                (spreadSimilarity * 0.12) +
                (harmonicSimilarity * 0.2) +
                (loudnessSimilarity * 0.08) +
                (timbreSimilarity * 0.1)
            );
        }

        function buildSectionVocalityMap(analysis, scoredSegments) {
            if (!Array.isArray(analysis?.sections) || !analysis.sections.length) return [];

            const trackEndMs = Array.isArray(analysis?.segments) && analysis.segments.length
                ? Math.round(
                    ((analysis.segments[analysis.segments.length - 1]?.start || 0) * 1000) +
                    ((analysis.segments[analysis.segments.length - 1]?.duration || 0) * 1000)
                )
                : 0;

            return analysis.sections.map((section, index, sections) => {
                const nextSection = sections[index + 1];
                const nextSectionStart = nextSection ? Math.round((nextSection.start || 0) * 1000) : trackEndMs;
                const bounds = getSectionBoundsMs(section, nextSectionStart);
                const candidates = scoredSegments.filter((candidate) =>
                    candidate.segmentEnd > bounds.start &&
                    candidate.segmentStart < bounds.end
                );
                const sectionDuration = Math.max(1, bounds.end - bounds.start);
                const strongCount = candidates.filter((candidate) => candidate.baseScore >= 0.56).length;
                const weightedCoverage = clamp01(
                    candidates.reduce((sum, candidate) => {
                        const overlapStart = Math.max(bounds.start, candidate.segmentStart);
                        const overlapEnd = Math.min(bounds.end, candidate.segmentEnd);
                        const overlap = Math.max(0, overlapEnd - overlapStart);
                        return sum + (overlap * Math.max(0.18, candidate.baseScore));
                    }, 0) / Math.max(1, sectionDuration * 0.72)
                );
                const topAverage = candidates.length
                    ? candidates
                        .slice()
                        .sort((left, right) => right.baseScore - left.baseScore)
                        .slice(0, Math.min(6, candidates.length))
                        .reduce((sum, candidate) => sum + candidate.baseScore, 0) / Math.min(6, candidates.length)
                    : 0;
                const density = clamp01(strongCount / Math.max(1, Math.round(sectionDuration / 650)));
                const vocality = clamp01((topAverage * 0.46) + (weightedCoverage * 0.32) + (density * 0.22));

                return {
                    ...bounds,
                    vocality
                };
            });
        }

        function buildAnalysisHints(analysis) {
            if (!analysis || !Array.isArray(analysis?.segments)) {
                return {
                    scoredSegments: [],
                    vocalProfile: null,
                    sectionVocality: []
                };
            }

            const scoredSegments = [];
            for (let index = 0; index < analysis.segments.length; index++) {
                const segment = analysis.segments[index];
                const segmentStart = (segment?.start || 0) * 1000;
                const segmentEnd = segmentStart + ((segment?.duration || 0) * 1000);
                const descriptor = scoreVocalCandidate(segment, analysis.segments[index - 1], analysis.segments[index + 1]);
                if (!descriptor || descriptor.baseScore < 0.14) continue;

                const loudnessMaxTime = Number.isFinite(segment?.loudness_max_time)
                    ? segment.loudness_max_time * 1000
                    : Math.min(80, (segment?.duration || 0) * 380);

                scoredSegments.push({
                    time: Math.round(Math.max(0, segmentStart + loudnessMaxTime)),
                    segmentStart: Math.round(Math.max(0, segmentStart)),
                    segmentEnd: Math.round(Math.max(segmentStart + 1, segmentEnd)),
                    timbre: Array.isArray(segment?.timbre) ? segment.timbre.slice(0, 6) : [],
                    ...descriptor
                });
            }

            const vocalProfile = buildTrackSeedProfile(scoredSegments);
            const sectionVocality = buildSectionVocalityMap(analysis, scoredSegments);
            return { scoredSegments, vocalProfile, sectionVocality };
        }

        function getAnalysisHints(analysis) {
            if (!analysis || typeof analysis !== 'object') {
                return buildAnalysisHints(null);
            }

            const cached = _analysisHintsCache.get(analysis);
            if (cached) return cached;

            const hints = buildAnalysisHints(analysis);
            _analysisHintsCache.set(analysis, hints);
            return hints;
        }

        function getSectionVocalityAtTime(analysisHints, timeMs) {
            const sections = analysisHints?.sectionVocality || [];
            if (!sections.length) return 0.5;

            const section = sections.find((entry) => timeMs >= entry.start && timeMs < entry.end)
                || sections[sections.length - 1];
            return clamp01(section?.vocality ?? 0.5);
        }

        function getLineSectionVocality(analysisHints, startTime, endTime) {
            const sections = analysisHints?.sectionVocality || [];
            if (!sections.length) return 0.5;

            let weightedSum = 0;
            let covered = 0;
            for (const section of sections) {
                const overlapStart = Math.max(startTime, section.start);
                const overlapEnd = Math.min(endTime, section.end);
                const overlap = Math.max(0, overlapEnd - overlapStart);
                if (!overlap) continue;
                weightedSum += overlap * section.vocality;
                covered += overlap;
            }

            if (!covered) {
                const midPoint = Math.round((startTime + endTime) / 2);
                return getSectionVocalityAtTime(analysisHints, midPoint);
            }

            return clamp01(weightedSum / covered);
        }

        function buildRhythmAnchors(startTime, endTime, analysis) {
            const intervalMs = endTime - startTime;
            const anchors = [startTime, endTime];

            const addStarts = (items, minConfidence) => {
                if (!Array.isArray(items)) return;
                for (const item of items) {
                    const confidence = typeof item?.confidence === 'number' ? item.confidence : 1;
                    const itemStart = Math.round((item?.start || 0) * 1000);
                    if (confidence < minConfidence) continue;
                    if (itemStart <= startTime || itemStart >= endTime) continue;
                    anchors.push(itemStart);
                }
            };

            addStarts(analysis?.beats, 0.2);
            addStarts(analysis?.tatums, 0.12);

            return dedupeSortedTimes(
                anchors.sort((left, right) => left - right).filter((time) => time >= startTime && time <= endTime),
                Math.max(18, Math.min(90, intervalMs / 140))
            );
        }

        function buildVocalCandidates(startTime, endTime, analysis) {
            const analysisHints = getAnalysisHints(analysis);
            if (!analysisHints.scoredSegments.length) return [];

            const rawCandidates = analysisHints.scoredSegments
                .filter((candidate) => candidate.segmentEnd > startTime && candidate.segmentStart < endTime)
                .map((candidate) => ({
                    ...candidate,
                    time: Math.round(clamp(candidate.time, startTime, endTime)),
                    segmentStart: Math.round(Math.max(startTime, candidate.segmentStart)),
                    segmentEnd: Math.round(Math.min(endTime, candidate.segmentEnd))
                }))
                .filter((candidate) => candidate.segmentEnd > candidate.segmentStart && candidate.baseScore >= 0.18);

            const candidates = rawCandidates.map((candidate, index) => {
                const previous = rawCandidates[index - 1] || null;
                const next = rawCandidates[index + 1] || null;
                const previousGap = previous ? Math.max(0, candidate.segmentStart - previous.segmentEnd) : Number.POSITIVE_INFINITY;
                const nextGap = next ? Math.max(0, next.segmentStart - candidate.segmentEnd) : Number.POSITIVE_INFINITY;
                const previousSupport = previous && previousGap <= 110
                    ? previous.baseScore * getPitchNeighborAffinity(candidate, previous) * clamp01(1 - (previousGap / 130))
                    : 0;
                const nextSupport = next && nextGap <= 110
                    ? next.baseScore * getPitchNeighborAffinity(candidate, next) * clamp01(1 - (nextGap / 130))
                    : 0;
                const neighborSupport = (previousSupport + nextSupport) / 2;
                const runSupport = previousSupport > 0.2 && nextSupport > 0.2
                    ? Math.min(previousSupport, nextSupport) * 0.9
                    : 0;
                const profileSimilarity = scoreProfileSimilarity(candidate, analysisHints.vocalProfile);
                const sectionVocality = getSectionVocalityAtTime(analysisHints, candidate.time);
                const percussionPenalty =
                    (candidate.durationMs < 95 && candidate.attackRatio < 0.12 && candidate.onsetScore > 0.7 ? 0.16 : 0) +
                    (candidate.harmonicScore < 0.4 && candidate.contrastScore > 0.72 ? 0.11 : 0) +
                    (candidate.pitchSpread > 0.28 && candidate.durationMs < 120 ? 0.07 : 0) +
                    (sectionVocality < 0.28 && candidate.durationMs < 120 && candidate.attackRatio < 0.16 && candidate.onsetScore > 0.66 ? 0.12 : 0);
                const isolationPenalty = neighborSupport < 0.12 && candidate.baseScore < 0.52
                    ? (0.08 + (candidate.contrastScore * 0.06))
                    : 0;
                const harmonicRunBoost = candidate.harmonicScore > 0.58 && neighborSupport > 0.18
                    ? 0.08 + (neighborSupport * 0.12)
                    : 0;
                const profilePenalty = profileSimilarity < 0.3 && candidate.baseScore < 0.58
                    ? (0.06 + ((0.3 - profileSimilarity) * 0.18))
                    : 0;
                const lowVocalSectionPenalty = sectionVocality < 0.24 && candidate.harmonicScore < 0.56 && neighborSupport < 0.16
                    ? (0.08 + ((0.24 - sectionVocality) * 0.2))
                    : 0;
                const refinedScore = clamp01(
                    (candidate.baseScore * 0.6) +
                    (neighborSupport * 0.24) +
                    (runSupport * 0.18) +
                    (profileSimilarity * 0.18) +
                    (sectionVocality * 0.12) +
                    harmonicRunBoost -
                    percussionPenalty -
                    isolationPenalty -
                    profilePenalty -
                    lowVocalSectionPenalty
                );

                return {
                    ...candidate,
                    score: refinedScore,
                    supportScore: neighborSupport,
                    runSupportScore: runSupport,
                    profileSimilarity,
                    sectionVocality
                };
            }).filter((candidate) => {
                const requiredScore = candidate.sectionVocality < 0.3 ? 0.3 : 0.24;
                return candidate.score >= requiredScore;
            });

            candidates.sort((left, right) => left.time - right.time);
            return candidates.reduce((accumulator, candidate) => {
                const previous = accumulator[accumulator.length - 1];
                if (!previous || (candidate.time - previous.time) > 55) {
                    accumulator.push(candidate);
                } else if (candidate.score > previous.score) {
                    accumulator[accumulator.length - 1] = candidate;
                }
                return accumulator;
            }, []);
        }

        function buildVocalActivityWindow(startTime, endTime, vocalCandidates, confidence, unitCount) {
            const intervalMs = Math.max(1, endTime - startTime);
            if (!vocalCandidates.length) {
                return {
                    activeStart: startTime,
                    activeEnd: endTime,
                    leadTrim: 0,
                    tailTrim: 0
                };
            }

            const clusterGap = Math.max(180, Math.min(520, intervalMs * 0.16));
            const clusters = [];

            for (const candidate of vocalCandidates) {
                const previous = clusters[clusters.length - 1];
                if (!previous || (candidate.segmentStart - previous.end) > clusterGap) {
                    clusters.push({
                        start: candidate.segmentStart,
                        end: candidate.segmentEnd,
                        totalScore: candidate.score,
                        peakScore: candidate.score,
                        count: 1
                    });
                    continue;
                }

                previous.start = Math.min(previous.start, candidate.segmentStart);
                previous.end = Math.max(previous.end, candidate.segmentEnd);
                previous.totalScore += candidate.score;
                previous.peakScore = Math.max(previous.peakScore, candidate.score);
                previous.count += 1;
            }

            const bestCluster = clusters.reduce((best, cluster) => {
                if (!best) return cluster;
                const bestWeight = best.totalScore + (best.peakScore * 0.6) + (best.count * 0.08);
                const clusterWeight = cluster.totalScore + (cluster.peakScore * 0.6) + (cluster.count * 0.08);
                return clusterWeight > bestWeight ? cluster : best;
            }, null);

            const keptClusters = clusters.filter((cluster) => {
                if (!bestCluster) return true;
                if (cluster === bestCluster) return true;
                const isTrailingCluster = cluster.start >= bestCluster.end;
                const clusterGapFromBest = isTrailingCluster
                    ? cluster.start - bestCluster.end
                    : Math.max(0, bestCluster.start - cluster.end);
                if (isTrailingCluster && clusterGapFromBest > (clusterGap * 0.9)) {
                    return cluster.totalScore >= bestCluster.totalScore * 0.55 ||
                        cluster.peakScore >= Math.max(0.68, bestCluster.peakScore * 0.92);
                }
                if (cluster.totalScore >= bestCluster.totalScore * 0.32) return true;
                if (cluster.peakScore >= Math.max(0.58, bestCluster.peakScore * 0.82)) return true;
                return cluster.count >= 2 && cluster.totalScore >= 0.92;
            });

            const rawStart = Math.min(...keptClusters.map((cluster) => cluster.start));
            const rawEnd = Math.max(...keptClusters.map((cluster) => cluster.end));
            const minActiveDuration = Math.max(
                260,
                Math.min(intervalMs, Math.max((unitCount || 1) * 70, intervalMs * 0.24))
            );
            const leadPad = Math.max(30, Math.min(170, 45 + (intervalMs * 0.02)));
            const tailPad = Math.max(80, Math.min(280, 90 + (intervalMs * 0.045)));

            let activeStart = clamp(rawStart - leadPad, startTime, Math.max(startTime, endTime - minActiveDuration));
            let activeEnd = clamp(rawEnd + tailPad, activeStart + minActiveDuration, endTime);

            const leadTrim = Math.max(0, activeStart - startTime);
            const tailTrim = Math.max(0, endTime - activeEnd);
            const startTrimThreshold = Math.max(120, Math.min(420, intervalMs * (confidence >= 0.55 ? 0.08 : 0.13)));
            const endTrimThreshold = Math.max(180, Math.min(900, intervalMs * (confidence >= 0.5 ? 0.12 : 0.18)));
            const strongCandidates = vocalCandidates.filter((candidate) => candidate.score >= 0.58);
            const lastStrongCandidate = strongCandidates[strongCandidates.length - 1] || vocalCandidates[vocalCandidates.length - 1] || null;
            const tailSilenceMs = lastStrongCandidate ? Math.max(0, endTime - lastStrongCandidate.segmentEnd) : 0;
            const tailPresenceWindow = Math.max(160, Math.min(700, intervalMs * 0.12));
            const hasStrongTailPresence = strongCandidates.some((candidate) => candidate.segmentEnd >= (endTime - tailPresenceWindow));
            const forceTailTrimThreshold = Math.max(260, Math.min(1400, intervalMs * 0.18));
            const forceTailTrim = !!lastStrongCandidate &&
                tailSilenceMs >= forceTailTrimThreshold &&
                !hasStrongTailPresence &&
                (strongCandidates.length >= 2 || lastStrongCandidate.score >= 0.7);

            if (leadTrim < startTrimThreshold || confidence < 0.36) {
                activeStart = startTime;
            }

            if ((tailTrim < endTrimThreshold || confidence < 0.34) && !forceTailTrim) {
                activeEnd = endTime;
            }

            if ((activeEnd - activeStart) < minActiveDuration) {
                activeEnd = Math.min(endTime, activeStart + minActiveDuration);
                activeStart = Math.max(startTime, activeEnd - minActiveDuration);
            }

            return {
                activeStart,
                activeEnd,
                leadTrim: Math.max(0, activeStart - startTime),
                tailTrim: Math.max(0, endTime - activeEnd)
            };
        }

        function buildVocalMassCurve(startTime, endTime, vocalCandidates, rhythmAnchors, confidence) {
            const intervalMs = Math.max(1, endTime - startTime);
            const stepMs = Math.max(18, Math.min(36, Math.round(intervalMs / 88)));
            const frameCount = Math.max(2, Math.ceil(intervalMs / stepMs) + 1);
            const frames = [];
            const anchorSet = new Set((rhythmAnchors || []).map((time) => Math.round(time)));
            const baseMassFloor = vocalCandidates.length > 0
                ? Math.max(0.008, 0.012 - (confidence * 0.004))
                : 0.004;

            for (let index = 0; index < frameCount; index++) {
                const time = index === frameCount - 1
                    ? endTime
                    : Math.min(endTime, Math.round(startTime + (index * stepMs)));
                let mass = baseMassFloor;

                for (const candidate of vocalCandidates || []) {
                    const durationMs = Math.max(1, candidate.durationMs || (candidate.segmentEnd - candidate.segmentStart) || stepMs);
                    const peakRadius = Math.max(55, Math.min(220, durationMs * 0.6));
                    const sustainRadius = Math.max(90, Math.min(320, durationMs * 1.1));
                    const distanceToPeak = Math.abs(time - candidate.time);
                    const peakShape = clamp01(1 - (distanceToPeak / peakRadius));
                    const distanceToCenter = Math.abs(time - ((candidate.segmentStart + candidate.segmentEnd) / 2));
                    const sustainShape = clamp01(1 - (distanceToCenter / sustainRadius));
                    const inSegmentBoost = time >= candidate.segmentStart && time <= candidate.segmentEnd ? 1 : 0;

                    mass += candidate.score * (
                        (peakShape * 0.7) +
                        (sustainShape * 0.35) +
                        (inSegmentBoost * 0.18)
                    );
                }

                if (anchorSet.has(time) && confidence < 0.5) {
                    mass += 0.03 + ((0.5 - confidence) * 0.04);
                }

                frames.push({
                    time,
                    mass: Math.max(baseMassFloor, mass),
                    cumulative: 0
                });
            }

            let cumulative = 0;
            for (const frame of frames) {
                cumulative += frame.mass;
                frame.cumulative = cumulative;
            }

            return {
                frames,
                stepMs,
                totalMass: cumulative
            };
        }

        function buildSilenceSpans(massCurve, startTime, endTime, confidence) {
            const frames = massCurve?.frames || [];
            if (!frames.length) return [];

            const averageMass = frames.reduce((sum, frame) => sum + frame.mass, 0) / Math.max(1, frames.length);
            const threshold = averageMass * (confidence >= 0.52 ? 0.58 : 0.68);
            const minSpanMs = Math.max(70, Math.min(220, (endTime - startTime) * 0.06));
            const spans = [];
            let currentSpan = null;

            for (let index = 0; index < frames.length; index++) {
                const frame = frames[index];
                const nextTime = frames[index + 1]?.time ?? endTime;
                const frameEnd = Math.min(endTime, Math.max(frame.time, nextTime));
                const isSilent = frame.mass <= threshold;

                if (isSilent) {
                    if (!currentSpan) {
                        currentSpan = {
                            start: frame.time,
                            end: frameEnd,
                            minMass: frame.mass,
                            totalMass: frame.mass,
                            count: 1
                        };
                    } else {
                        currentSpan.end = frameEnd;
                        currentSpan.minMass = Math.min(currentSpan.minMass, frame.mass);
                        currentSpan.totalMass += frame.mass;
                        currentSpan.count += 1;
                    }
                    continue;
                }

                if (currentSpan && (currentSpan.end - currentSpan.start) >= minSpanMs) {
                    spans.push({
                        ...currentSpan,
                        avgMass: currentSpan.totalMass / Math.max(1, currentSpan.count),
                        center: Math.round((currentSpan.start + currentSpan.end) / 2)
                    });
                }
                currentSpan = null;
            }

            if (currentSpan && (currentSpan.end - currentSpan.start) >= minSpanMs) {
                spans.push({
                    ...currentSpan,
                    avgMass: currentSpan.totalMass / Math.max(1, currentSpan.count),
                    center: Math.round((currentSpan.start + currentSpan.end) / 2)
                });
            }

            return spans;
        }

        function getMassAtTime(massCurve, time, startTime, endTime) {
            const frames = massCurve?.frames || [];
            if (!frames.length) {
                const interval = Math.max(1, endTime - startTime);
                return clamp01((time - startTime) / interval);
            }

            const clampedTime = clamp(time, startTime, endTime);
            let previousFrame = { time: startTime, cumulative: 0 };

            for (const frame of frames) {
                if (frame.time >= clampedTime) {
                    const spanTime = frame.time - previousFrame.time;
                    const localRatio = spanTime > 0
                        ? (clampedTime - previousFrame.time) / spanTime
                        : 0;
                    return previousFrame.cumulative + ((frame.cumulative - previousFrame.cumulative) * localRatio);
                }

                previousFrame = frame;
            }

            return frames[frames.length - 1]?.cumulative || 0;
        }

        function getLocalMassAtTime(massCurve, time, startTime, endTime) {
            const frames = massCurve?.frames || [];
            if (!frames.length) return 0;

            const clampedTime = clamp(time, startTime, endTime);
            let previousFrame = frames[0];

            if (clampedTime <= previousFrame.time) {
                return previousFrame.mass;
            }

            for (let index = 1; index < frames.length; index++) {
                const frame = frames[index];
                if (frame.time >= clampedTime) {
                    const spanTime = frame.time - previousFrame.time;
                    const localRatio = spanTime > 0
                        ? (clampedTime - previousFrame.time) / spanTime
                        : 0;
                    return previousFrame.mass + ((frame.mass - previousFrame.mass) * localRatio);
                }
                previousFrame = frame;
            }

            return previousFrame.mass;
        }

        function getTimeByMassTarget(massCurve, targetMass, startTime, endTime) {
            const frames = massCurve?.frames || [];
            const totalMass = massCurve?.totalMass || 0;

            if (!frames.length || totalMass <= 0.0001) {
                const fallbackRatio = totalMass > 0.0001 ? clamp01(targetMass / totalMass) : 0.5;
                return Math.round(startTime + ((endTime - startTime) * fallbackRatio));
            }

            const clampedTargetMass = clamp(targetMass, 0, totalMass);
            let previousTime = startTime;
            let previousCumulative = 0;

            for (const frame of frames) {
                if (frame.cumulative >= clampedTargetMass) {
                    const spanMass = frame.cumulative - previousCumulative;
                    const localRatio = spanMass > 0
                        ? (clampedTargetMass - previousCumulative) / spanMass
                        : 0;
                    return Math.round(previousTime + ((frame.time - previousTime) * localRatio));
                }

                previousTime = frame.time;
                previousCumulative = frame.cumulative;
            }

            return Math.round(endTime);
        }

        function getTimeByMassRatio(massCurve, ratio, startTime, endTime) {
            const clampedRatio = clamp01(ratio);
            const totalMass = massCurve?.totalMass || 0;
            if (totalMass <= 0.0001) {
                return Math.round(startTime + ((endTime - startTime) * clampedRatio));
            }

            return getTimeByMassTarget(massCurve, totalMass * clampedRatio, startTime, endTime);
        }

        function buildUnitPhrases(units, weights) {
            if (!Array.isArray(units) || !units.length) return [];

            const phrases = [];
            let phraseStartIndex = 0;
            let phraseWeight = 0;
            let lexicalCount = 0;
            let aggressiveCount = 0;

            for (let index = 0; index < units.length; index++) {
                const unitText = units[index] || '';
                const trimmed = unitText.trim();
                const unitWeight = weights[index] || 1;
                const hasLexicalText = !!trimmed;
                const isWhitespaceOnly = hasLexicalText ? false : /\s/.test(unitText);
                const isAggressiveUnit = hasLexicalText && Array.from(trimmed).every(isAggressiveChar);
                const endsPhraseStrong = /[.!?;:)]["']?\s*$/.test(unitText);
                const hasTrailingWhitespace = /\s+$/.test(unitText);

                phraseWeight += unitWeight;
                if (hasLexicalText && !isWhitespaceOnly) {
                    lexicalCount += 1;
                }
                if (isAggressiveUnit) {
                    aggressiveCount += 1;
                }

                const nextUnit = units[index + 1] || '';
                const nextTrimmed = nextUnit.trim();
                const nextStartsLexical = !!nextTrimmed;
                const currentPhraseSize = index - phraseStartIndex + 1;
                const aggressiveDominant = aggressiveCount >= Math.max(2, lexicalCount);
                const shouldSoftBreak =
                    hasTrailingWhitespace &&
                    nextStartsLexical &&
                    (
                        (aggressiveDominant && (phraseWeight >= 3.2 || lexicalCount >= 5)) ||
                        (!aggressiveDominant && (phraseWeight >= 4.6 || lexicalCount >= 3))
                    );
                const shouldHardBreak = endsPhraseStrong || currentPhraseSize >= (aggressiveDominant ? 6 : 4);

                if (index === units.length - 1 || shouldHardBreak || shouldSoftBreak) {
                    phrases.push({
                        startIndex: phraseStartIndex,
                        endIndex: index,
                        weight: Math.max(0.2, phraseWeight)
                    });
                    phraseStartIndex = index + 1;
                    phraseWeight = 0;
                    lexicalCount = 0;
                    aggressiveCount = 0;
                }
            }

            return phrases.length
                ? phrases
                : [{ startIndex: 0, endIndex: units.length - 1, weight: weights.reduce((sum, weight) => sum + weight, 0) || units.length }];
        }

        function pickPhraseBoundaryTime(targetTime, timingModel, previousTime, remainingPhrases, endTime) {
            const minGap = 80;
            const minAllowed = previousTime + minGap;
            const maxAllowed = endTime - (remainingPhrases * minGap);
            if (maxAllowed <= minAllowed) return Math.round(minAllowed);

            const clampedTarget = Math.max(minAllowed, Math.min(maxAllowed, targetTime));
            const frames = timingModel?.vocalMassCurve?.frames || [];
            const silenceSpans = timingModel?.silenceSpans || [];
            const lineConfidence = clamp01(timingModel?.confidence ?? 0);
            const averageFrameMass = frames.length
                ? frames.reduce((sum, frame) => sum + frame.mass, 0) / frames.length
                : 0.0001;
            const valleyWindow = Math.max(140, Math.min(360, (endTime - previousTime) * (lineConfidence >= 0.5 ? 0.22 : 0.3)));
            const silenceWindow = Math.max(170, Math.min(420, valleyWindow * 1.15));

            let bestSilenceTime = null;
            let bestSilenceScore = Number.POSITIVE_INFINITY;
            for (const span of silenceSpans) {
                if (span.center < minAllowed || span.center > maxAllowed) continue;
                const distance = Math.abs(span.center - clampedTarget);
                if (distance > silenceWindow) continue;

                const distancePenalty = distance / Math.max(1, silenceWindow);
                const depthPenalty = span.avgMass / Math.max(0.0001, averageFrameMass);
                const score = (depthPenalty * 0.7) + (distancePenalty * 0.55);
                if (score < bestSilenceScore) {
                    bestSilenceScore = score;
                    bestSilenceTime = span.center;
                }
            }

            if (bestSilenceTime !== null) {
                return pickBoundaryTime(bestSilenceTime, timingModel, previousTime, remainingPhrases, endTime);
            }

            let bestValleyTime = clampedTarget;
            let bestValleyScore = Number.POSITIVE_INFINITY;

            for (const frame of frames) {
                if (frame.time < minAllowed || frame.time > maxAllowed) continue;
                const distance = Math.abs(frame.time - clampedTarget);
                if (distance > valleyWindow) continue;

                const distancePenalty = distance / Math.max(1, valleyWindow);
                const score = frame.mass + (distancePenalty * (0.08 + ((1 - lineConfidence) * 0.07)));
                if (score < bestValleyScore) {
                    bestValleyScore = score;
                    bestValleyTime = frame.time;
                }
            }

            return pickBoundaryTime(bestValleyTime, timingModel, previousTime, remainingPhrases, endTime);
        }

        function buildPhraseBoundaryCandidates(phraseStart, phraseEnd, timingModel, unitCount) {
            const minGap = 24;
            const frames = (timingModel?.vocalMassCurve?.frames || [])
                .filter((frame) => frame.time >= phraseStart && frame.time <= phraseEnd);
            const frameStride = Math.max(1, Math.floor(frames.length / Math.max(18, unitCount * 8)));
            const candidateTimes = [phraseStart, phraseEnd];

            for (let index = 0; index < frames.length; index += frameStride) {
                candidateTimes.push(frames[index].time);
            }

            for (const frame of frames) {
                if (frame.mass <= 0) continue;
                candidateTimes.push(frame.time);
            }

            for (const anchor of timingModel?.rhythmAnchors || []) {
                if (anchor > phraseStart && anchor < phraseEnd) {
                    candidateTimes.push(anchor);
                }
            }

            for (const span of timingModel?.silenceSpans || []) {
                if (span.center > phraseStart && span.center < phraseEnd) {
                    candidateTimes.push(span.center);
                }
                if (span.start > phraseStart && span.start < phraseEnd) {
                    candidateTimes.push(span.start);
                }
                if (span.end > phraseStart && span.end < phraseEnd) {
                    candidateTimes.push(span.end);
                }
            }

            for (const candidate of timingModel?.vocalCandidates || []) {
                if (candidate.time > phraseStart && candidate.time < phraseEnd) {
                    candidateTimes.push(candidate.time);
                }
                if (candidate.segmentStart > phraseStart && candidate.segmentStart < phraseEnd) {
                    candidateTimes.push(candidate.segmentStart);
                }
                if (candidate.segmentEnd > phraseStart && candidate.segmentEnd < phraseEnd) {
                    candidateTimes.push(candidate.segmentEnd);
                }
            }

            const sorted = dedupeSortedTimes(
                candidateTimes
                    .map((time) => Math.round(clamp(time, phraseStart, phraseEnd)))
                    .sort((left, right) => left - right),
                Math.max(8, minGap / 2)
            );

            if (sorted[0] !== phraseStart) sorted.unshift(phraseStart);
            if (sorted[sorted.length - 1] !== phraseEnd) sorted.push(phraseEnd);
            return sorted;
        }

        function buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd) {
            const totalWeight = phraseWeights.reduce((sum, weight) => sum + weight, 0) || phraseUnits.length;
            const phraseStartMass = getMassAtTime(timingModel.vocalMassCurve, phraseStart, activeStart, activeEnd);
            const phraseEndMass = getMassAtTime(timingModel.vocalMassCurve, phraseEnd, activeStart, activeEnd);
            const phraseBoundaries = [phraseStart];
            let accumulatedWeight = 0;

            for (let unitIndex = 1; unitIndex < phraseUnits.length; unitIndex++) {
                accumulatedWeight += phraseWeights[unitIndex - 1];
                const localRatio = accumulatedWeight / totalWeight;
                const targetMass = phraseStartMass + ((phraseEndMass - phraseStartMass) * localRatio);
                const targetTime = getTimeByMassTarget(
                    timingModel.vocalMassCurve,
                    targetMass,
                    phraseStart,
                    phraseEnd
                );
                phraseBoundaries.push(
                    pickBoundaryTime(
                        targetTime,
                        timingModel,
                        phraseBoundaries[phraseBoundaries.length - 1],
                        phraseUnits.length - unitIndex,
                        phraseEnd
                    )
                );
            }

            phraseBoundaries.push(phraseEnd);
            return phraseBoundaries;
        }

        function alignPhraseUnitsWithDP(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd) {
            if (!Array.isArray(phraseUnits) || phraseUnits.length <= 1) {
                return [phraseStart, phraseEnd];
            }

            const candidateTimes = buildPhraseBoundaryCandidates(phraseStart, phraseEnd, timingModel, phraseUnits.length);
            const lastCandidateIndex = candidateTimes.length - 1;
            if (lastCandidateIndex < phraseUnits.length) {
                return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
            }

            const minGap = 24;
            const phraseDuration = Math.max(1, phraseEnd - phraseStart);
            const phraseWeightTotal = phraseWeights.reduce((sum, weight) => sum + weight, 0) || phraseUnits.length;
            const phraseMassValues = candidateTimes.map((time) => getMassAtTime(timingModel.vocalMassCurve, time, activeStart, activeEnd));
            const phraseLocalMasses = candidateTimes.map((time) => getLocalMassAtTime(timingModel.vocalMassCurve, time, activeStart, activeEnd));
            const phraseTotalMass = Math.max(0.0001, phraseMassValues[lastCandidateIndex] - phraseMassValues[0]);
            const averageLocalMass = phraseLocalMasses.reduce((sum, value) => sum + value, 0) / Math.max(1, phraseLocalMasses.length);
            const averageDensity = phraseTotalMass / phraseDuration;
            const lineConfidence = clamp01(timingModel?.confidence ?? 0);
            const prefixWeights = [0];

            for (let index = 0; index < phraseWeights.length; index++) {
                prefixWeights.push(prefixWeights[index] + phraseWeights[index]);
            }

            const dp = Array.from({ length: phraseUnits.length + 1 }, () => Array(candidateTimes.length).fill(Number.POSITIVE_INFINITY));
            const backtrack = Array.from({ length: phraseUnits.length + 1 }, () => Array(candidateTimes.length).fill(-1));
            dp[0][0] = 0;

            for (let unitIndex = 1; unitIndex <= phraseUnits.length; unitIndex++) {
                const isFinalUnit = unitIndex === phraseUnits.length;
                const expectedSegmentRatio = phraseWeights[unitIndex - 1] / phraseWeightTotal;
                const expectedCumulativeRatio = prefixWeights[unitIndex] / phraseWeightTotal;
                const unitText = phraseUnits[unitIndex - 1] || '';
                const trimmedUnit = unitText.trim();
                const isWhitespaceOnly = !trimmedUnit && /\s/.test(unitText);
                const isPunctuationOnly = !!trimmedUnit && /^[.,!?;:'"()[\]{}\-]+$/.test(trimmedUnit);
                const isLexicalUnit = !!trimmedUnit && !isPunctuationOnly;
                const minCandidateIndex = unitIndex;
                const maxCandidateIndex = isFinalUnit
                    ? lastCandidateIndex
                    : lastCandidateIndex - (phraseUnits.length - unitIndex);

                for (let candidateIndex = minCandidateIndex; candidateIndex <= maxCandidateIndex; candidateIndex++) {
                    if (isFinalUnit && candidateIndex !== lastCandidateIndex) continue;
                    if (!isFinalUnit && candidateIndex === lastCandidateIndex) continue;

                    const actualCumulativeRatio = (phraseMassValues[candidateIndex] - phraseMassValues[0]) / phraseTotalMass;
                    const boundaryMassNorm = averageLocalMass > 0
                        ? phraseLocalMasses[candidateIndex] / averageLocalMass
                        : 1;

                    for (let previousIndex = unitIndex - 1; previousIndex < candidateIndex; previousIndex++) {
                        const previousCost = dp[unitIndex - 1][previousIndex];
                        if (!Number.isFinite(previousCost)) continue;

                        const segmentStart = candidateTimes[previousIndex];
                        const segmentEnd = candidateTimes[candidateIndex];
                        const segmentDuration = segmentEnd - segmentStart;
                        if (segmentDuration < minGap) continue;
                        if ((phraseEnd - segmentEnd) < ((phraseUnits.length - unitIndex) * minGap)) continue;

                        const segmentMass = Math.max(0.0001, phraseMassValues[candidateIndex] - phraseMassValues[previousIndex]);
                        const actualSegmentRatio = segmentMass / phraseTotalMass;
                        const actualDurationRatio = segmentDuration / phraseDuration;
                        const massError = Math.abs(actualSegmentRatio - expectedSegmentRatio);
                        const durationError = Math.abs(actualDurationRatio - expectedSegmentRatio);
                        const cumulativeError = Math.abs(actualCumulativeRatio - expectedCumulativeRatio);
                        const densityNorm = (segmentMass / segmentDuration) / Math.max(averageDensity, 0.0001);

                        let densityPenalty = 0;
                        if (isLexicalUnit) {
                            densityPenalty = Math.max(0, 0.82 - densityNorm) * 0.55;
                        } else if (isWhitespaceOnly) {
                            densityPenalty = Math.max(0, densityNorm - 0.7) * 0.18;
                        } else {
                            densityPenalty = Math.max(0, densityNorm - 1.15) * 0.12;
                        }

                        const boundaryPenalty = !isFinalUnit
                            ? boundaryMassNorm * (0.11 + (lineConfidence * 0.06))
                            : 0;
                        const massWeight = 4.2 + (lineConfidence * 0.55);
                        const durationWeight = isWhitespaceOnly ? 0.8 : 2.05;
                        const cumulativeWeight = 2.1;
                        const longTailPenalty = isLexicalUnit && actualDurationRatio > (expectedSegmentRatio * 2.4)
                            ? (actualDurationRatio - (expectedSegmentRatio * 2.4)) * 1.1
                            : 0;

                        const score = previousCost +
                            (massError * massWeight) +
                            (durationError * durationWeight) +
                            (cumulativeError * cumulativeWeight) +
                            densityPenalty +
                            boundaryPenalty +
                            longTailPenalty;

                        if (score < dp[unitIndex][candidateIndex]) {
                            dp[unitIndex][candidateIndex] = score;
                            backtrack[unitIndex][candidateIndex] = previousIndex;
                        }
                    }
                }
            }

            if (!Number.isFinite(dp[phraseUnits.length][lastCandidateIndex])) {
                return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
            }

            const boundaries = [candidateTimes[lastCandidateIndex]];
            let candidateIndex = lastCandidateIndex;

            for (let unitIndex = phraseUnits.length; unitIndex > 0; unitIndex--) {
                candidateIndex = backtrack[unitIndex][candidateIndex];
                if (candidateIndex < 0) {
                    return buildGreedyPhraseBoundaries(phraseUnits, phraseWeights, phraseStart, phraseEnd, timingModel, activeStart, activeEnd);
                }
                boundaries.push(candidateTimes[candidateIndex]);
            }

            return boundaries.reverse();
        }

        function buildLineTimingModel(startTime, endTime, analysis, unitCount = 1) {
            const analysisHints = getAnalysisHints(analysis);
            const vocalCandidates = buildVocalCandidates(startTime, endTime, analysis);
            const rhythmAnchors = buildRhythmAnchors(startTime, endTime, analysis);
            const intervalMs = Math.max(1, endTime - startTime);
            const expectedCandidates = Math.max(1, Math.round(intervalMs / 260));
            const strongCandidates = vocalCandidates.filter((candidate) => candidate.score >= 0.58).length;
            const topAverage = vocalCandidates.length
                ? vocalCandidates.slice().sort((left, right) => right.score - left.score).slice(0, Math.min(3, vocalCandidates.length))
                    .reduce((sum, candidate) => sum + candidate.score, 0) / Math.min(3, vocalCandidates.length)
                : 0;
            const coverage = clamp01(vocalCandidates.length / expectedCandidates);
            const density = clamp01(strongCandidates / Math.max(1, expectedCandidates - 0.25));
            const sectionVocality = getLineSectionVocality(analysisHints, startTime, endTime);
            const confidence = clamp01((topAverage * 0.42) + (coverage * 0.24) + (density * 0.16) + (sectionVocality * 0.18));
            const activeWindow = buildVocalActivityWindow(startTime, endTime, vocalCandidates, confidence, unitCount);
            const vocalMassCurve = buildVocalMassCurve(
                activeWindow.activeStart,
                activeWindow.activeEnd,
                vocalCandidates.filter((candidate) =>
                    candidate.segmentEnd > activeWindow.activeStart &&
                    candidate.segmentStart < activeWindow.activeEnd
                ),
                rhythmAnchors.filter((anchor) => anchor >= activeWindow.activeStart && anchor <= activeWindow.activeEnd),
                confidence
            );
            const silenceSpans = buildSilenceSpans(
                vocalMassCurve,
                activeWindow.activeStart,
                activeWindow.activeEnd,
                confidence
            );
            const conservativeMode = sectionVocality < 0.33 || (confidence < 0.36 && strongCandidates < 2);

            return {
                rhythmAnchors,
                vocalCandidates,
                vocalMassCurve,
                silenceSpans,
                confidence,
                sectionVocality,
                conservativeMode,
                ...activeWindow
            };
        }

        function pickBoundaryTime(targetTime, timingModel, previousTime, remainingUnits, endTime) {
            const minGap = 24;
            const minAllowed = previousTime + minGap;
            const maxAllowed = endTime - (remainingUnits * minGap);
            if (maxAllowed <= minAllowed) return Math.round(minAllowed);

            const clampedTarget = Math.max(minAllowed, Math.min(maxAllowed, targetTime));
            const lineConfidence = clamp01(timingModel?.confidence ?? 0);
            const vocalWindow = Math.max(110, Math.min(260, (endTime - previousTime) * (lineConfidence >= 0.5 ? 0.34 : 0.42)));
            const rhythmWindow = Math.max(85, Math.min(150, (endTime - previousTime) * 0.24));

            let bestVocalTime = null;
            let bestVocalScore = -1;
            for (const candidate of timingModel?.vocalCandidates || []) {
                if (candidate.time < minAllowed || candidate.time > maxAllowed) continue;
                const distance = Math.abs(candidate.time - clampedTarget);
                if (distance > vocalWindow) continue;

                const closeness = 1 - (distance / vocalWindow);
                const score = (candidate.score * 1.2) + (closeness * 0.85);
                if (score > bestVocalScore) {
                    bestVocalScore = score;
                    bestVocalTime = candidate.time;
                }
            }

            if (bestVocalTime !== null && bestVocalScore >= (0.95 - (lineConfidence * 0.15))) {
                return Math.round(bestVocalTime);
            }

            let bestRhythmTime = clampedTarget;
            let bestRhythmDistance = Number.POSITIVE_INFINITY;
            for (const anchor of timingModel?.rhythmAnchors || []) {
                if (anchor < minAllowed || anchor > maxAllowed) continue;
                const distance = Math.abs(anchor - clampedTarget);
                if (distance <= rhythmWindow && distance < bestRhythmDistance) {
                    bestRhythmDistance = distance;
                    bestRhythmTime = anchor;
                }
            }

            if (bestVocalTime !== null) {
                const blendedTime = lineConfidence >= 0.45
                    ? bestVocalTime
                    : Math.round(((bestVocalTime * (0.45 + lineConfidence)) + (bestRhythmTime * 0.55)) / (1 + lineConfidence));
                return Math.round(clamp(blendedTime, minAllowed, maxAllowed));
            }

            return Math.round(bestRhythmTime);
        }

        function mergeUnitsConservatively(units, confidence, sectionVocality) {
            if (!Array.isArray(units) || units.length <= 1) return units;
            if (confidence < 0.18 || sectionVocality < 0.16) {
                return [units.join('')];
            }

            const lexicalUnits = units.filter((unit) => !!unit.trim()).length;
            if (lexicalUnits <= 2) return units;

            const targetWeight = confidence < 0.28 || sectionVocality < 0.24 ? 2.6 : 2;
            const merged = [];
            let buffer = '';
            let bufferWeight = 0;

            for (const unit of units) {
                buffer += unit;
                bufferWeight += getUnitWeight(unit);
                const trimmed = unit.trim();
                const shouldBreak =
                    /\s+$/.test(unit) ||
                    /[.!?;:)]["']?$/.test(trimmed) ||
                    bufferWeight >= targetWeight;

                if (shouldBreak) {
                    merged.push(buffer);
                    buffer = '';
                    bufferWeight = 0;
                }
            }

            if (buffer) {
                merged.push(buffer);
            }

            return merged.filter((unit) => unit.length > 0);
        }

        function buildPseudoKaraokeLine(line, analysis) {
            const text = line?.text || '';
            const startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
            const endTime = Number.isFinite(line?.endTime) && line.endTime > startTime ? line.endTime : startTime + 2500;

            if (!text.trim()) {
                return { startTime, endTime, text, syllables: [] };
            }

            const previewUnits = tokenizeLine(text, { lineConfidence: 0.5, lineDurationMs: endTime - startTime });
            const timingModel = buildLineTimingModel(startTime, endTime, analysis, previewUnits.length || 1);
            const activeStart = Number.isFinite(timingModel.activeStart) ? timingModel.activeStart : startTime;
            const activeEnd = Number.isFinite(timingModel.activeEnd) ? timingModel.activeEnd : endTime;
            const effectiveLineConfidence = timingModel.conservativeMode
                ? timingModel.confidence * clamp(0.52 + (timingModel.sectionVocality * 0.4), 0.35, 0.7)
                : clamp01(timingModel.confidence + ((timingModel.sectionVocality - 0.5) * 0.1));
            let units = tokenizeLine(text, {
                lineConfidence: effectiveLineConfidence,
                lineDurationMs: Math.max(1, activeEnd - activeStart)
            });
            if (timingModel.conservativeMode) {
                units = mergeUnitsConservatively(units, effectiveLineConfidence, timingModel.sectionVocality);
            }
            if (!units.length) return null;

            const weights = units.map(getUnitWeight);
            const phrases = buildUnitPhrases(units, weights);
            const phraseWeightTotal = phrases.reduce((sum, phrase) => sum + phrase.weight, 0) || phrases.length;
            const phraseBoundaries = [activeStart];
            let accumulatedPhraseWeight = 0;

            for (let index = 0; index < phrases.length - 1; index++) {
                accumulatedPhraseWeight += phrases[index].weight;
                const targetRatio = accumulatedPhraseWeight / phraseWeightTotal;
                const targetTime = getTimeByMassRatio(
                    timingModel.vocalMassCurve,
                    targetRatio,
                    activeStart,
                    activeEnd
                );
                phraseBoundaries.push(
                    pickPhraseBoundaryTime(
                        targetTime,
                        timingModel,
                        phraseBoundaries[phraseBoundaries.length - 1],
                        phrases.length - index - 1,
                        activeEnd
                    )
                );
            }
            phraseBoundaries.push(activeEnd);

            const boundaries = [activeStart];
            for (let phraseIndex = 0; phraseIndex < phrases.length; phraseIndex++) {
                const phrase = phrases[phraseIndex];
                const phraseStart = phraseBoundaries[phraseIndex];
                const phraseEnd = phraseBoundaries[phraseIndex + 1];
                const phraseUnits = units.slice(phrase.startIndex, phrase.endIndex + 1);
                const phraseWeights = weights.slice(phrase.startIndex, phrase.endIndex + 1);
                const phraseInternalBoundaries = alignPhraseUnitsWithDP(
                    phraseUnits,
                    phraseWeights,
                    phraseStart,
                    phraseEnd,
                    timingModel,
                    activeStart,
                    activeEnd
                );

                for (let boundaryIndex = 1; boundaryIndex < phraseInternalBoundaries.length; boundaryIndex++) {
                    boundaries.push(phraseInternalBoundaries[boundaryIndex]);
                }
            }

            const syllables = units.map((unitText, index) => {
                const originalStart = boundaries[index];
                const originalEnd = Math.max(originalStart + 1, boundaries[index + 1]);
                return {
                    text: unitText,
                    startTime: originalStart,
                    endTime: originalEnd
                };
            });

            return {
                startTime: activeStart,
                endTime: syllables[syllables.length - 1]?.endTime || Math.max(1, activeEnd),
                text,
                syllables
            };
        }

        function buildLineTimingPseudoKaraokeLine(line) {
            const text = line?.text || '';
            const startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
            const endTime = Number.isFinite(line?.endTime) && line.endTime > startTime
                ? line.endTime
                : startTime + 2500;

            if (!text.trim()) {
                return { startTime, endTime, text, syllables: [] };
            }

            const lineDurationMs = Math.max(1, endTime - startTime);
            const units = tokenizeLine(text, {
                lineConfidence: 0.5,
                lineDurationMs
            });
            if (!units.length) return null;

            const weights = units.map(getUnitWeight);
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || units.length;
            let accumulatedWeight = 0;
            const syllables = units.map((unitText, index) => {
                const unitStart = startTime + (lineDurationMs * accumulatedWeight / totalWeight);
                accumulatedWeight += weights[index] || 1;
                const unitEnd = index === units.length - 1
                    ? endTime
                    : startTime + (lineDurationMs * accumulatedWeight / totalWeight);

                return {
                    text: unitText,
                    startTime: unitStart,
                    endTime: Math.max(unitStart + 1, unitEnd)
                };
            });

            return {
                startTime,
                endTime,
                text,
                syllables
            };
        }

        async function applyToResult(result, info = {}) {
            if (!result) return result;

            if (!isEnabled()) {
                return clearPseudoKaraoke(result);
            }

            if (result.karaoke && !PSEUDO_SOURCES.has(result.karaokeSource)) {
                return result;
            }

            const trackUri = result.uri || info?.uri || '';
            const trackId = Utils.extractTrackId(trackUri);
            const fallbackDurationMs = Number.isFinite(info?.duration)
                ? info.duration
                : parseMs(Spicetify.Player?.data?.item?.duration?.milliseconds);
            const baseLyrics = normalizeSyncedLines(result.synced, fallbackDurationMs);

            if (!baseLyrics.length) {
                return clearPseudoKaraoke(result);
            }

            if (
                result.karaoke &&
                PSEUDO_SOURCES.has(result.karaokeSource) &&
                result.pseudoKaraokeCacheVersion === getCacheVersion() &&
                (result.karaokeSource !== LINE_TIMING_PSEUDO_SOURCE || !trackId)
            ) {
                return result;
            }

            const analysis = trackId ? await getAudioAnalysis(trackId) : null;
            const karaoke = baseLyrics
                .map((line) => analysis
                    ? buildPseudoKaraokeLine(line, analysis)
                    : buildLineTimingPseudoKaraokeLine(line))
                .filter(Boolean);
            if (!karaoke.length) {
                return clearPseudoKaraoke(result);
            }

            result.karaoke = karaoke;
            result.karaokeSource = analysis ? 'audio-analysis-pseudo' : LINE_TIMING_PSEUDO_SOURCE;
            result.pseudoKaraokeCacheVersion = getCacheVersion();
            return result;
        }

        return {
            isEnabled,
            isPseudoSource: (source) => PSEUDO_SOURCES.has(source),
            getCacheVersion,
            applyToResult,
            clearPseudoKaraoke
        };
    })();

    window.PseudoKaraokeService = PseudoKaraokeService;



    // ============================================
    // LyricsService - 통합 API
    // 다른 모듈에서 가사/번역/발음을 가져오는 통합 인터페이스
    // ============================================
    const LyricsService = {
        // 버전 정보
        version: "1.0.0",

        // 캐시 접근
        cache: LyricsCache,

        // API 트래커 접근
        tracker: ApiTracker,

        // Track ID / local track 판별
        trackIdentity: TrackIdentity,

        isSpotifyTrackId(value) {
            return TrackIdentity.isSpotifyTrackId(value);
        },

        isSpotifyTrackUri(uri) {
            return TrackIdentity.isSpotifyTrackUri(uri);
        },

        isLocalTrackUri(uri) {
            return TrackIdentity.isLocalTrackUri(uri);
        },

        extractTrackId(uri) {
            return TrackIdentity.extractTrackId(uri);
        },

        // 언어 감지 (Extension 내 Utils에서 직접 참조)
        detectLanguage(lyrics) {
            return Utils.detectLanguage(lyrics);
        },

        /**
         * 사용자 해시 가져오기 (없으면 생성)
         * Utils에서 이동됨
         */
        getUserHash() {

            let hash = Spicetify.LocalStorage.get("ivLyrics:user-hash");
            if (!hash) {
                // Generate UUID
                hash = crypto.randomUUID ? crypto.randomUUID() :
                    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                        const r = Math.random() * 16 | 0;
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                Spicetify.LocalStorage.set("ivLyrics:user-hash", hash);
            }
            return hash;
        },



        /**
         * 여러 제공자에서 순차적으로 가사 가져오기
         * @param {Object} info - 트랙 정보
         * @param {string[]} providerOrder - (deprecated) LyricsAddonManager의 순서 사용
         * @param {number} mode - (deprecated) 가사 모드
         * @param {string|null} forcedProviderId - 이 트랙에서 강제로 사용할 제공자 ID
         * @returns {Promise<Object>} - 가사 결과
         */
        async getLyricsFromProviders(info, providerOrder = [], mode = 1, forcedProviderId = null) {
            // LyricsAddonManager를 통해 가사 가져오기
            if (window.LyricsAddonManager) {
                const result = await window.LyricsAddonManager.getLyrics(info, forcedProviderId);
                return result;
            }

            return { error: "No lyrics providers registered", uri: info.uri };
        },

        /**
         * 싱크 데이터 서비스 접근
         */
        syncData: SyncDataService,

        /**
         * 캐시된 가사 가져오기
         * @param {string} trackId - 트랙 ID
         * @param {string} provider - 제공자 이름
         * @returns {Promise<Object|null>} - 캐시된 가사 또는 null
         */
        async getCachedLyrics(trackId, provider = 'spotify') {
            return await LyricsCache.getLyrics(trackId, provider);
        },

        /**
         * 가사 캐시 저장
         * @param {string} trackId - 트랙 ID
         * @param {string} provider - 제공자 이름
         * @param {Object} data - 가사 데이터
         * @returns {Promise<boolean>}
         */
        async cacheLyrics(trackId, provider, data) {
            return await LyricsCache.setLyrics(trackId, provider, data);
        },

        /**
         * 번역 가져오기 (캐시 우선)
         * @param {string} trackId - 트랙 ID
         * @param {string} lang - 언어 코드
         * @param {boolean} isPhonetic - 발음 여부
         * @param {string} provider - 가사 제공자
         * @returns {Promise<Object|null>}
         */
        async getTranslation(trackId, lang, isPhonetic = false, provider = null, sourceHash = null) {
            return await LyricsCache.getTranslation(trackId, lang, isPhonetic, provider, sourceHash);
        },

        /**
         * 번역 저장
         * @param {string} trackId - 트랙 ID
         * @param {string} lang - 언어 코드
         * @param {boolean} isPhonetic - 발음 여부
         * @param {Object} data - 번역 데이터
         * @param {string} provider - 가사 제공자
         * @returns {Promise<boolean>}
         */
        async cacheTranslation(trackId, lang, isPhonetic, data, provider = null, sourceHash = null) {
            return await LyricsCache.setTranslation(trackId, lang, isPhonetic, data, provider, sourceHash);
        },

        /**
         * 특정 트랙의 모든 캐시 삭제
         * @param {string} trackId - 트랙 ID
         * @returns {Promise<boolean>}
         */
        async clearTrackCache(trackId) {
            return await LyricsCache.clearTrack(trackId);
        },

        /**
         * 특정 트랙의 번역 캐시만 삭제
         * @param {string} trackId - 트랙 ID
         * @returns {Promise<boolean>}
         */
        async clearTranslationCache(trackId) {
            return await LyricsCache.clearTranslationForTrack(trackId);
        },

        /**
         * 모든 캐시 삭제
         * @returns {Promise<boolean>}
         */
        async clearAllCache() {
            return await LyricsCache.clearAll();
        },

        /**
         * 캐시 통계 가져오기
         * @returns {Promise<Object>}
         */
        async getCacheStats() {
            return await LyricsCache.getStats();
        },

        /**
         * 현재 재생 중인 트랙 정보 가져오기
         * @returns {Object|null}
         */
        getCurrentTrackInfo() {
            const item = Spicetify.Player.data?.item;
            if (!item) return null;

            return {
                uri: item.uri,
                title: item.name,
                artist: item.artists?.map(a => a.name).join(', ') || '',
                album: item.album?.name || '',
                duration: item.duration?.milliseconds || 0,
                trackId: Utils.extractTrackId(item.uri)
            };
        },

        /**
         * 이벤트 발생 (가사 로드 완료 등)
         * @param {string} eventName - 이벤트 이름
         * @param {Object} data - 이벤트 데이터
         */
        emit(eventName, data) {
            window.dispatchEvent(new CustomEvent(`LyricsService:${eventName}`, { detail: data }));
        },

        /**
         * 이벤트 리스너 등록
         * @param {string} eventName - 이벤트 이름
         * @param {Function} callback - 콜백 함수
         * @returns {Function} - 리스너 해제 함수
         */
        on(eventName, callback) {
            const handler = (e) => callback(e.detail);
            window.addEventListener(`LyricsService:${eventName}`, handler);
            return () => window.removeEventListener(`LyricsService:${eventName}`, handler);
        },

        /**
         * 가사와 발음/번역을 한 번에 가져오기 (통합 API)
         * @param {Object} info - 트랙 정보 { uri, title, artist, duration }
         * @param {Object} options - 옵션
         * @param {string} options.displayMode1 - 첫 번째 표시 모드 (발음 등)
         * @param {string} options.displayMode2 - 두 번째 표시 모드 (번역 등)
         * @param {boolean} options.sendToOverlay - 오버레이로 전송 여부 (기본: true)
         * @param {string[]} options.providerOrder - provider 순서
         * @returns {Promise<Object>} - { lyrics, provider, error }
         */
        async getFullLyrics(info, options = {}) {
            const {
                displayMode1 = null,
                displayMode2 = null,
                sendToOverlay = true
            } = options;

            try {
                // 1. 가사 가져오기 (LyricsAddonManager 사용)
                const lyricsResult = await this.getLyricsFromProviders(info);

                if (lyricsResult.error) {
                    // 가사 없음 - 오버레이에 트랙 정보만 전송
                    if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                        await window.OverlaySender.sendLyrics(
                            { uri: info.uri, title: info.title, artist: info.artist },
                            [],
                            true
                        );
                    }
                    if (window.lyricsHelperSender?.sendLyrics) {
                        await window.lyricsHelperSender.sendLyrics(
                            { uri: info.uri, title: info.title, artist: info.artist },
                            [],
                            true
                        );
                    }

                    return { lyrics: [], provider: null, error: lyricsResult.error };
                }

                // 2. 가사 선택 (synced, karaoke, unsynced 순)
                let lyrics = lyricsResult.karaoke || lyricsResult.synced || lyricsResult.unsynced || [];
                const provider = lyricsResult.provider;

                if (lyrics.length === 0) {
                    if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                        await window.OverlaySender.sendLyrics(
                            { uri: info.uri, title: info.title, artist: info.artist },
                            [],
                            true
                        );
                    }
                    if (window.lyricsHelperSender?.sendLyrics) {
                        await window.lyricsHelperSender.sendLyrics(
                            { uri: info.uri, title: info.title, artist: info.artist },
                            [],
                            true
                        );
                    }
                    return { lyrics: [], provider, error: "No lyrics" };
                }

                // 3. endTime 계산 (없으면 다음 라인의 startTime 사용)
                lyrics = lyrics.map((line, idx, arr) => {
                    if (!line.endTime && idx < arr.length - 1) {
                        return { ...line, endTime: arr[idx + 1].startTime };
                    }
                    return line;
                });

                // 4. 언어 감지 및 displayMode 결정
                let mode1 = displayMode1;
                let mode2 = displayMode2;

                // 언어 감지 (Extension 내 Utils 사용)
                const detectedLanguage = Utils.detectLanguage(lyrics);
                let friendlyLanguage = null;

                if (detectedLanguage) {
                    try {
                        friendlyLanguage = new Intl.DisplayNames(["en"], { type: "language" })
                            .of(detectedLanguage.split("-")[0])
                            ?.toLowerCase();
                    } catch (e) {
                        // ignore
                    }
                }

                // 설정을 LocalStorage에서 직접 읽기
                const translationProvider = Spicetify.LocalStorage.get("ivLyrics:visual:translate:translated-lyrics-source") || "auto";
                const modeKey = friendlyLanguage || "gemini";

                // 설정 키: translation-mode:japanese, translation-mode-2:japanese 등
                if (mode1 === null) {
                    mode1 = Spicetify.LocalStorage.get(`ivLyrics:visual:translation-mode:${modeKey}`) || "none";
                }
                if (mode2 === null) {
                    mode2 = Spicetify.LocalStorage.get(`ivLyrics:visual:translation-mode-2:${modeKey}`) || "none";
                }

                serviceDebug('[LyricsService] 언어 감지:', { detectedLanguage, friendlyLanguage, modeKey, mode1, mode2 });

                // 5. 발음/번역 요청 (설정에 따라)
                const needsTranslation = mode1 !== "none" || mode2 !== "none";

                // 번역을 기다리는 동안 오버레이가 비어 있지 않도록 원문 가사를 먼저 전송
                if (needsTranslation) {
                    try {
                        const originalLyricsSends = [];
                        if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                            originalLyricsSends.push(window.OverlaySender.sendLyrics(
                                { uri: info.uri, title: info.title, artist: info.artist },
                                lyrics
                            ));
                        }
                        if (window.lyricsHelperSender?.sendLyrics) {
                            originalLyricsSends.push(window.lyricsHelperSender.sendLyrics(
                                { uri: info.uri, title: info.title, artist: info.artist },
                                lyrics
                            ));
                        }
                        void Promise.allSettled(originalLyricsSends);
                    } catch (e) {
                        // 원문 선전송 실패는 무시하고 번역 진행
                    }
                }

                if (needsTranslation && window.Translator?.callGemini) {
                    serviceDebug('[LyricsService] 발음/번역 요청:', { mode1, mode2 });

                    try {
                        // Gemini API를 통한 발음/번역 요청
                        // multi-vocal 라인은 각 파트를 별도 요청 줄로 펼친 뒤 다시 파트별로 매핑한다.
                        const translationRequests = lyrics.flatMap((line, lineIndex) => {
                            const vocalParts = getDisplayedVocalParts(line);
                            if (vocalParts) {
                                return vocalParts.map((part) => ({
                                    lineIndex,
                                    vocalPart: part,
                                    text: part.text
                                }));
                            }

                            return [{
                                lineIndex,
                                vocalPart: null,
                                text: getTranslationRequestLineText(line)
                            }];
                        });
                        const lyricsText = translationRequests.map(request => request.text || '').join('\n');

                        // 발음 요청 (mode1 = gemini_romaji)
                        let pronResult = null;
                        if (mode1 && mode1 !== 'none' && String(mode1).startsWith('gemini')) {
                            const wantPhonetic = mode1 === 'gemini_romaji';
                            const response = await window.Translator.callGemini({
                                trackId: Utils.extractTrackId(info.uri),
                                artist: info.artist,
                                title: info.title,
                                text: lyricsText,
                                wantSmartPhonetic: wantPhonetic,
                                provider: provider
                            });
                            pronResult = wantPhonetic ? response.phonetic : response.translation;
                        }

                        // 번역 요청 (mode2 = gemini_ko 등)
                        let transResult = null;
                        if (mode2 && mode2 !== 'none' && String(mode2).startsWith('gemini')) {
                            const wantPhonetic = mode2 === 'gemini_romaji';
                            const response = await window.Translator.callGemini({
                                trackId: Utils.extractTrackId(info.uri),
                                artist: info.artist,
                                title: info.title,
                                text: lyricsText,
                                wantSmartPhonetic: wantPhonetic,
                                provider: provider
                            });
                            transResult = wantPhonetic ? response.phonetic : response.translation;
                        }

                        // 결과 병합
                        if (pronResult || transResult) {
                            const pronLines = Array.isArray(pronResult) ? pronResult : (pronResult ? pronResult.split('\n') : []);
                            const transLines = Array.isArray(transResult) ? transResult : (transResult ? transResult.split('\n') : []);

                            const requestResultsByLine = new Map();
                            translationRequests.forEach((request, requestIndex) => {
                                const entry = {
                                    ...request,
                                    pronText: pronLines[requestIndex]?.trim() || null,
                                    transText: transLines[requestIndex]?.trim() || null
                                };
                                const entries = requestResultsByLine.get(request.lineIndex) || [];
                                entries.push(entry);
                                requestResultsByLine.set(request.lineIndex, entries);
                            });

                            lyrics = lyrics.map((line, idx) => {
                                const isKaraokeLine = Array.isArray(line.syllables)
                                    || Array.isArray(line.vocals?.lead?.syllables);
                                const originalText = isKaraokeLine && line.originalText
                                    ? line.originalText
                                    : (line.text || line.originalText || '');
                                const requestEntries = requestResultsByLine.get(idx) || [];
                                const pronText = requestEntries.map(entry => entry.pronText).filter(Boolean).join(' / ') || null;
                                const transText = requestEntries.map(entry => entry.transText).filter(Boolean).join(' / ') || null;

                                // Determine the final original text.
                                // If pronText exists, the current 'text' is the original.
                                // If pronText doesn't exist, but line.originalText exists, use that.
                                // Otherwise, the current 'text' is the original.
                                const finalOriginal = pronText ? originalText : (line.originalText || originalText);
                                const vocalPartEntries = requestEntries.filter(entry => entry.vocalPart);
                                let vocals = line.vocals;
                                if (vocalPartEntries.length > 0 && line.vocals?.lead) {
                                    const nextVocals = {
                                        ...line.vocals,
                                        lead: { ...line.vocals.lead },
                                        background: Array.isArray(line.vocals.background)
                                            ? line.vocals.background.map(part => ({ ...part }))
                                            : line.vocals.background
                                    };

                                    vocalPartEntries.forEach((entry) => {
                                        const target = entry.vocalPart.role === 'lead'
                                            ? nextVocals.lead
                                            : nextVocals.background?.[entry.vocalPart.index];
                                        if (!target) return;
                                        if (entry.pronText) {
                                            target.phonetic = entry.pronText;
                                        }
                                        if (entry.transText) {
                                            target.translation = entry.transText;
                                        }
                                    });

                                    vocals = nextVocals;
                                }

                                return {
                                    ...line,
                                    vocals,
                                    originalText: finalOriginal, // The original text before any phonetic/translation
                                    text: isKaraokeLine ? finalOriginal : (pronText || originalText), // Keep karaoke timing text original.
                                    phoneticText: pronText || line.phoneticText || null,
                                    text2: transText, // The secondary displayed text (translation)
                                    translation: transText, // For compatibility
                                    translationText: transText // For compatibility
                                };
                            });

                            serviceDebug('[LyricsService] 발음/번역 완료');
                        }
                    } catch (translationError) {
                        console.warn('[LyricsService] 발음/번역 실패:', translationError);
                        // 발음/번역 실패해도 원본 가사는 반환
                    }
                }

                // 6. 오버레이 전송
                const finalLyricsSends = [];
                if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                    finalLyricsSends.push(window.OverlaySender.sendLyrics(
                        { uri: info.uri, title: info.title, artist: info.artist },
                        lyrics,
                        true
                    ));
                }
                // 헬퍼 전송
                if (window.lyricsHelperSender?.sendLyrics) {
                    finalLyricsSends.push(window.lyricsHelperSender.sendLyrics(
                        { uri: info.uri, title: info.title, artist: info.artist },
                        lyrics,
                        true
                    ));
                }
                await Promise.allSettled(finalLyricsSends);

                // 6. 이벤트 발생
                this.emit('lyrics-loaded', {
                    trackInfo: info,
                    lyrics,
                    provider,
                    contributors: lyricsResult.contributors || [],
                    hasTranslation: mode1 !== 'none' || mode2 !== 'none'
                });

                return { lyrics, provider, contributors: lyricsResult.contributors || [], error: null };
            } catch (e) {
                console.error('[LyricsService] getFullLyrics 실패:', e);
                return { lyrics: [], provider: null, error: e.message };
            }
        },

        /**
         * 커뮤니티 싱크 데이터 가져오기 (ivLyrics Sync)
         * @param {string} trackId - Spotify 트랙 ID
         * @param {string} provider - 가사 제공자 (예: spotify-abc, lrclib)
         * @returns {Promise<Object|null>}
         */
        async getIvLyricsSyncData(trackId, provider, metadata = {}) {
            if (!trackId || !provider) return null;

            const isrc = window.SyncDataService?.normalizeSyncDataIsrc?.(metadata?.isrc)
                || await window.SyncDataService?.resolveTrackIsrc?.(trackId, metadata)
                || window.SyncDataService?.getTrackIsrc?.(trackId, metadata)
                || '';
            if (!isrc) {
                console.warn(`[LyricsService] ISRC를 확인할 수 없어 sync data 요청을 건너뜁니다 (${provider})`);
                return null;
            }

            try {
                if (window.SyncDataService?.getSyncData) {
                    return await window.SyncDataService.getSyncData(trackId, provider, { ...metadata, isrc, trackId });
                }

                const url = new URL('https://lyrics.api.ivl.is/lyrics/sync-data');
                url.searchParams.set('isrc', isrc);
                url.searchParams.set('request-version', '20260701');
                url.searchParams.set('trackId', trackId);
                url.searchParams.set('provider', provider);
                if (metadata?.title || metadata?.trackName || metadata?.name) {
                    url.searchParams.set('title', metadata.title || metadata.trackName || metadata.name);
                }
                if (metadata?.artist || metadata?.artists) {
                    const artistText = Array.isArray(metadata.artists) ? metadata.artists.join(', ') : (metadata.artist || metadata.artists);
                    if (artistText) url.searchParams.set('artist', artistText);
                }
                if (metadata?.album || metadata?.albumName) {
                    url.searchParams.set('album', metadata.album || metadata.albumName);
                }
                let requestUrl = url.toString();
                if (isrc && window.SyncDataService?.shouldBypassServerCache?.(isrc)) {
                    requestUrl += '&bypassCache=1';
                }

                const response = await fetch(requestUrl, {
                    cache: 'no-store'
                });
                if (response.ok) {
                    const result = await response.json();
                    const data = result?.data || result;
                    if (data && (data.provider === provider || (provider.startsWith('spotify-') && data.provider === 'spotify'))) {
                        return {
                            isrc: window.SyncDataService?.normalizeSyncDataIsrc?.(data.isrc) || isrc,
                            trackId: data.trackId || trackId,
                            storedTrackId: data.storedTrackId || data.trackId || null,
                            ...data
                        };
                    }
                }
            } catch (e) {
                console.warn(`[LyricsService] Failed to fetch sync data for ${isrc} (${provider}):`, e);
            }
            return null;
        },


        /**
         * 가사 결과에 ivLyrics Sync 데이터 적용
         * @param {Object} result - 가사 결과 객체 (uri, provider, synced, unsynced 등 포함)
         * @returns {Promise<Object>} - Sync 데이터가 적용된 결과
         */
        async applyIvLyricsSyncData(result) {
            if (!result || !result.uri || !result.provider || !window.SyncDataService) {
                return result;
            }

            const trackId = Utils.extractTrackId(result.uri);
            const spotifyData = window.SpotifyDataHelper?.extractSpotifyData?.(result.uri);
            let trackIsrc = window.SyncDataService?.normalizeSyncDataIsrc?.(
                result.isrc ||
                result.external_ids?.isrc ||
                result.externalIds?.isrc ||
                result.track?.external_ids?.isrc ||
                spotifyData?.isrc
            );
            if (!trackIsrc) {
                trackIsrc = await window.SyncDataService?.resolveTrackIsrc?.(trackId, {
                    ...result,
                    trackId,
                    title: result.name || result.title || spotifyData?.name || '',
                    artist: result.artist || result.artists || spotifyData?.artists || '',
                    album: result.album || result.albumName || spotifyData?.album || spotifyData?.albumName || ''
                }) || '';
            }
            if (!trackIsrc) {
                return result;
            }
            const syncData = await this.getIvLyricsSyncData(trackId, result.provider, {
                isrc: trackIsrc,
                trackId,
                title: result.name || result.title || spotifyData?.name || '',
                artist: result.artist || result.artists || spotifyData?.artists || '',
                album: result.album || result.albumName || spotifyData?.album || spotifyData?.albumName || ''
            });

            const isProviderMatch = syncData?.provider === result.provider
                || (typeof result.provider === 'string' && result.provider.startsWith('spotify-') && syncData?.provider === 'spotify');

            if (syncData && isProviderMatch) {
                const baseLyrics = result.synced || result.unsynced;
                const karaoke = window.SyncDataService.applySyncDataToLyrics(baseLyrics, syncData, {
                    durationMs: result.durationMs || result.duration_ms || result.duration,
                    result
                });

                if (karaoke) {
                    result.karaoke = karaoke;
                    result.syncDataApplied = true;
                    result.syncDataProvider = result.provider;

                    // sync-data가 있으면 synced도 오버라이드
                    const syncedFromSyncData = window.SyncDataService.convertKaraokeToSynced(karaoke);
                    if (syncedFromSyncData) {
                        result.synced = syncedFromSyncData;
                    }

                    // 기여자 정보 추가
                    if (syncData.contributors || syncData.syncData?.contributors) {
                        result.contributors = syncData.contributors || syncData.syncData.contributors;
                    }
                }
            }

            return result;
        },

        /**
         * TMI(Trivia) 가져오기
         * @param {Object} info - 트랙 정보 { trackId, title, artist, lang, ignoreCache }
         * @returns {Promise<Object|null>}
         */
        async getTMI(info) {
            const { trackId, title, artist, lang, ignoreCache } = info;
            if (!trackId) return null;

            const userLang = lang || Spicetify.Locale?.getLocale()?.split('-')[0] || 'en';

            try {
                // 1. 로컬 캐시 확인 (ignoreCache가 true면 스킵)
                if (!ignoreCache) {
                    const cached = await LyricsCache.getTMI(trackId, userLang);
                    if (cached) {
                        serviceDebug(`[LyricsService] getTMI: Using cached data for ${trackId}`);
                        return cached;
                    }
                }

                // 2. Addon_AI 요청
                if (window.AIAddonManager) {
                    serviceDebug(`[LyricsService] getTMI: Requesting from AIAddonManager${ignoreCache ? ' (ignoring cache)' : ''}`);
                    const result = await window.AIAddonManager.generateTMI({
                        trackId,
                        title,
                        artist,
                        lang: userLang
                    });

                    if (result) {
                        // 캐시 저장
                        await LyricsCache.setTMI(trackId, userLang, result);
                        return result;
                    }
                }
            } catch (e) {
                console.warn('[LyricsService] getTMI failed:', e);
            }
            return null;
        }
    };

    // 전역에 등록
    window.LyricsService = LyricsService;

    // ============================================
    // Translator Class - 번역 및 발음 변환
    // ============================================

    // 외부 라이브러리 경로
    const kuroshiroPath = "https://cdn.jsdelivr.net/npm/kuroshiro@1.2.0/dist/kuroshiro.min.js";
    const kuromojiPath = "https://cdn.jsdelivr.net/npm/kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js";
    const aromanize = "https://cdn.jsdelivr.net/npm/aromanize@0.1.5/aromanize.min.js";
    const openCCPath = "https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.min.js";
    const pinyinProPath = "https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.7/dist/index.min.js";
    const tinyPinyinPath = "https://cdn.jsdelivr.net/npm/tiny-pinyin/dist/tiny-pinyin.min.js";
    const dictPath = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict";

    const resolveSpotifyImageUrl = (imageUrl) => {
        if (!imageUrl || imageUrl.indexOf("localfile") !== -1) {
            return null;
        }
        if (imageUrl.startsWith("spotify:image:")) {
            return `https://i.scdn.co/image/${imageUrl.substring(imageUrl.lastIndexOf(":") + 1)}`;
        }
        if (imageUrl.startsWith("http")) {
            return imageUrl;
        }
        return null;
    };

    // 전역 요청 상태 관리 (중복 요청 방지)
    const _translatorInflightRequests = new Map();
    const _translatorPendingRetries = new Map();

    // 진행 중인 요청 키 생성
    function getTranslatorRequestKey(trackId, wantSmartPhonetic, lang, provider = null, sourceHash = null) {
        const providerKey = provider || '';
        const sourceKey = sourceHash || '';
        return `${trackId}:${wantSmartPhonetic ? 'phonetic' : 'translation'}:${lang}:${providerKey}:${sourceKey}`;
    }

    // I18n이 로드되기 전에 기본 에러 메시지 반환
    function getTranslatorErrorMessage(key, fallback) {
        if (window.I18n && typeof window.I18n.t === 'function') {
            return window.I18n.t(key) || fallback;
        }
        return fallback;
    }

    // StorageManager가 없을 경우 대체
    function getStorageItem(key) {
        if (window.StorageManager && typeof window.StorageManager.getItem === 'function') {
            return window.StorageManager.getItem(key);
        }
        const spicetifyValue = Spicetify.LocalStorage.get(key);
        if (spicetifyValue !== null && spicetifyValue !== undefined) {
            return spicetifyValue;
        }
        return localStorage.getItem(key);
    }

    function shouldHideOverlayForIvLyricsFullscreen() {
        const configuredValue = window.CONFIG?.visual?.["fullscreen-hide-overlay"];
        const enabled = configuredValue !== undefined
            ? configuredValue !== false && configuredValue !== "false"
            : getStorageItem('ivLyrics:visual:fullscreen-hide-overlay') !== 'false';
        if (!enabled) return false;

        const fullscreenContainer = document.getElementById('lyrics-fullscreen-container');
        return !!(
            fullscreenContainer &&
            document.body.contains(fullscreenContainer) &&
            fullscreenContainer.querySelector('.lyrics-lyricsContainer-LyricsContainer.fullscreen-active')
        );
    }

    function getOverlayProgressIsPlaying() {
        const isPlaying = Spicetify.Player.isPlaying() || false;
        return isPlaying && !shouldHideOverlayForIvLyricsFullscreen();
    }

    // Utils가 없을 경우 대체
    function getUserHash() {
        return LyricsService.getUserHash();
    }

    // 현재 언어 가져오기
    function getCurrentLanguage() {
        if (window.I18n && typeof window.I18n.getCurrentLanguage === 'function') {
            return window.I18n.getCurrentLanguage();
        }
        return Spicetify.Locale?.getLocale()?.split('-')[0] || 'en';
    }

    // get the target language for translation (if auto, use the interface language)
    function getTranslationTargetLanguage() {
        // window.CONFIG가 초기화되지 않았을 수 있으므로 localStorage도 확인
        const targetLang = window.CONFIG?.visual?.["translate:target-language"] ||
            localStorage.getItem("ivLyrics:visual:translate:target-language");
        if (targetLang && targetLang !== "auto") {
            return targetLang;
        }
        return getCurrentLanguage();
    }

    class Translator {
        // 메타데이터 번역 캐시 (메모리)
        static _metadataCache = new Map();
        static _metadataInflightRequests = new Map();

        // 특정 trackId에 대한 진행 중인 요청 정리 (곡 변경 시 호출)
        static clearInflightRequests(trackId) {
            if (!trackId) return;

            for (const key of _translatorInflightRequests.keys()) {
                if (key.startsWith(`${trackId}:`)) {
                    _translatorInflightRequests.delete(key);
                }
            }

            for (const key of _translatorPendingRetries.keys()) {
                if (key.startsWith(`${trackId}:`)) {
                    _translatorPendingRetries.delete(key);
                }
            }
        }

        // 모든 진행 중인 요청 정리
        static clearAllInflightRequests() {
            _translatorInflightRequests.clear();
            _translatorPendingRetries.clear();
        }

        // 메모리 캐시 초기화 (특정 trackId)
        static clearMemoryCache(trackId) {
            if (!trackId) return;
            for (const key of this._metadataCache.keys()) {
                if (key.startsWith(`${trackId}:`)) {
                    this._metadataCache.delete(key);
                }
            }
        }

        // 모든 메모리 캐시 초기화
        static clearAllMemoryCache() {
            this._metadataCache.clear();
        }

        /**
         * 메타데이터 번역 (제목/아티스트)
         */
        static async translateMetadata({ trackId, title, artist, ignoreCache = false }) {
            if (!title || !artist) {
                return null;
            }

            let finalTrackId = trackId;
            if (!finalTrackId) {
                finalTrackId = Utils.extractTrackId(Spicetify.Player.data?.item?.uri);
            }
            if (!finalTrackId) {
                return null;
            }

            const userLang = getTranslationTargetLanguage();
            const cacheKey = `${finalTrackId}:${userLang}`;

            // 메모리 캐시 확인
            if (!ignoreCache && this._metadataCache.has(cacheKey)) {
                return this._metadataCache.get(cacheKey);
            }

            // 로컬 캐시 확인
            if (!ignoreCache) {
                try {
                    const localCached = await LyricsCache.getMetadata(finalTrackId, userLang);
                    if (localCached) {
                        this._metadataCache.set(cacheKey, localCached);
                        return localCached;
                    }
                } catch (e) {
                    console.warn('[Translator] Local metadata cache check failed:', e);
                }
            }

            // AIAddonManager를 통한 번역 시도
            if (window.AIAddonManager) {
                serviceDebug(`[Translator] Using AIAddonManager for metadata`);

                if (this._metadataInflightRequests.has(cacheKey)) {
                    return this._metadataInflightRequests.get(cacheKey);
                }

                const addonPromise = (async () => {
                    try {
                        const result = await window.AIAddonManager.translateMetadata({
                            trackId: finalTrackId,
                            title,
                            artist,
                            lang: userLang
                        });

                        if (result) {
                            this._metadataCache.set(cacheKey, result);
                            LyricsCache.setMetadata(finalTrackId, userLang, result).catch(() => { });
                            return result;
                        }
                    } catch (e) {
                        console.warn('[Translator] AIAddonManager metadata translation failed:', e);
                    }
                    return null;
                })().finally(() => {
                    this._metadataInflightRequests.delete(cacheKey);
                });

                this._metadataInflightRequests.set(cacheKey, addonPromise);
                return addonPromise;
            }

            // AI 제공자가 설정되지 않았으면 null 반환
            serviceDebug('[Translator] No AI provider configured for metadata translation');
            return null;
        }

        static getMetadataFromCache(trackId) {
            const userLang = getTranslationTargetLanguage();
            const cacheKey = `${trackId}:${userLang}`;
            return this._metadataCache.get(cacheKey) || null;
        }

        static clearMetadataCache() {
            this._metadataCache.clear();
            this._metadataInflightRequests.clear();
        }

        constructor(lang, isUsingNetease = false) {
            this.finished = {
                ja: false, ko: false, zh: false, ru: false, vi: false,
                de: false, en: false, es: false, fr: false, it: false,
                pt: false, nl: false, pl: false, tr: false, ar: false,
                hi: false, th: false, id: false, ms: false,
            };
            this.isUsingNetease = isUsingNetease;
            this.initializationPromise = null;
            this.kuroshiro = null;
            this.Aromanize = null;
            this.OpenCC = null;

            this.applyKuromojiFix();
            this.initializationPromise = this.initializeAsync(lang);
        }

        async initializeAsync(lang) {
            try {
                await this.injectExternals(lang);
                await this.createTranslator(lang);
            } catch (error) {
                throw error;
            }
        }

        static async callGemini({
            trackId,
            artist,
            title,
            text,
            wantSmartPhonetic = false,
            provider = null,
            ignoreCache = false,
            onLine = null,
        }) {
            if (!text?.trim()) throw new Error("No text provided for translation");
            const sourceHash = getLyricsTextCacheHash(text);

            let finalTrackId = trackId;
            if (!finalTrackId) {
                finalTrackId = Utils.extractTrackId(Spicetify.Player.data?.item?.uri);
            }
            if (!finalTrackId) {
                throw new Error("No track ID available");
            }

            const userLang = getTranslationTargetLanguage();

            // 로컬 캐시 확인
            if (!ignoreCache) {
                try {
                    const localCached = await LyricsCache.getTranslation(finalTrackId, userLang, wantSmartPhonetic, provider, sourceHash);
                    if (localCached) {
                        if (window.ApiTracker) {
                            window.ApiTracker.logCacheHit(
                                wantSmartPhonetic ? 'phonetic' : 'translation',
                                `${finalTrackId}:${userLang}:${sourceHash}`,
                                { lineCount: localCached.phonetic?.length || localCached.translation?.length || 0 }
                            );
                        }
                        return localCached;
                    }
                } catch (e) {
                    console.warn('[Translator] Local cache check failed:', e);
                }
            }

            // AIAddonManager를 통한 번역 시도
            if (window.AIAddonManager) {
                serviceDebug(`[Translator] Using AIAddonManager for lyrics`);

                const requestKey = getTranslatorRequestKey(finalTrackId, wantSmartPhonetic, userLang, provider, sourceHash);
                if (!ignoreCache && _translatorInflightRequests.has(requestKey)) {
                    return _translatorInflightRequests.get(requestKey);
                }

                const addonPromise = (async () => {
                    try {
                        const result = await window.AIAddonManager.translateLyrics({
                            trackId: finalTrackId,
                            artist,
                            title,
                            text,
                            lang: userLang,
                            wantSmartPhonetic,
                            provider,
                            onLine
                        });

                        if (result) {
                            LyricsCache.setTranslation(finalTrackId, userLang, wantSmartPhonetic, result, provider, sourceHash).catch(() => { });
                            return result;
                        }
                    } catch (e) {
                        console.warn('[Translator] AIAddonManager lyrics translation failed:', e);
                        throw e;
                    }
                    return null;
                })().finally(() => {
                    _translatorInflightRequests.delete(requestKey);
                });

                _translatorInflightRequests.set(requestKey, addonPromise);
                return addonPromise;
            }

            // AI 제공자가 설정되지 않았으면 에러
            serviceDebug('[Translator] No AI provider configured for lyrics translation');
            throw new Error(getTranslatorErrorMessage("translator.noProviderConfigured", "AI 제공자가 설정되지 않았습니다. 설정에서 AI 제공자를 선택해주세요."));
        }

        includeExternal(url) {
            return new Promise((resolve, reject) => {
                const existingScript = document.querySelector(`script[src="${url}"]`);
                if (existingScript) {
                    if (existingScript.dataset) existingScript.dataset.loaded = existingScript.dataset.loaded || "true";
                    return resolve();
                }

                const script = document.createElement("script");
                script.setAttribute("type", "text/javascript");
                script.setAttribute("src", url);

                script.addEventListener("load", () => {
                    script.dataset.loaded = "true";
                    resolve();
                });

                script.addEventListener("error", () => {
                    reject(new Error(`Failed to load script: ${url}`));
                });

                document.head.appendChild(script);
            });
        }

        async injectExternals(lang) {
            const langCode = lang?.slice(0, 2);
            try {
                switch (langCode) {
                    case "ja":
                        await Promise.all([
                            this.includeExternal(kuromojiPath),
                            this.includeExternal(kuroshiroPath),
                        ]);
                        break;
                    case "ko":
                        await this.includeExternal(aromanize);
                        break;
                    case "zh":
                        await this.includeExternal(openCCPath);
                        this.includeExternal(pinyinProPath).catch(() => { });
                        this.includeExternal(tinyPinyinPath).catch(() => { });
                        break;
                    case "ru":
                    case "vi":
                    case "de":
                    case "en":
                    case "es":
                    case "fr":
                    case "it":
                    case "pt":
                    case "nl":
                    case "pl":
                    case "tr":
                    case "ar":
                    case "hi":
                    case "th":
                    case "id":
                    case "ms":
                        this.finished[langCode] = true;
                        break;
                }
            } catch (error) {
                throw error;
            }
        }

        async awaitFinished(language) {
            const langCode = language?.slice(0, 2);
            if (this.initializationPromise) {
                await this.initializationPromise;
            }
            if (langCode && !this.finished[langCode]) {
                await this.injectExternals(language);
                await this.createTranslator(language);
            }
        }

        applyKuromojiFix() {
            if (typeof XMLHttpRequest.prototype.realOpen !== "undefined") return;
            XMLHttpRequest.prototype.realOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url, bool) {
                if (url.indexOf(dictPath.replace("https://", "https:/")) === 0) {
                    this.realOpen(method, url.replace("https:/", "https://"), bool);
                } else {
                    this.realOpen(method, url, bool);
                }
            };
        }

        async createTranslator(lang) {
            const langCode = lang.slice(0, 2);

            switch (langCode) {
                case "ja":
                    if (this.kuroshiro) return;
                    await this.waitForGlobals(["Kuroshiro", "KuromojiAnalyzer"], 10000);
                    this.kuroshiro = new Kuroshiro.default();
                    await this.kuroshiro.init(new KuromojiAnalyzer({ dictPath }));
                    this.finished.ja = true;
                    break;

                case "ko":
                    if (this.Aromanize) return;
                    await this.waitForGlobals(["Aromanize"], 5000);
                    this.Aromanize = Aromanize;
                    this.finished.ko = true;
                    break;

                case "zh":
                    if (this.OpenCC) return;
                    await this.waitForGlobals(["OpenCC"], 5000);
                    this.OpenCC = OpenCC;
                    this.finished.zh = true;
                    break;

                case "ru":
                case "vi":
                case "de":
                case "en":
                case "es":
                case "fr":
                case "it":
                case "pt":
                case "nl":
                case "pl":
                case "tr":
                case "ar":
                case "hi":
                case "th":
                case "id":
                case "ms":
                    this.finished[langCode] = true;
                    break;
            }
        }

        async waitForGlobals(globalNames, timeoutMs = 5000) {
            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const checkGlobals = () => {
                    const allAvailable = globalNames.every((name) => typeof window[name] !== "undefined");

                    if (allAvailable) {
                        resolve();
                        return;
                    }

                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error(`Timeout waiting for globals: ${globalNames.join(", ")}`));
                        return;
                    }

                    setTimeout(checkGlobals, 50);
                };

                checkGlobals();
            });
        }

        static _romajiMap = { 'ō': 'ou', 'ū': 'uu', 'ā': 'aa', 'ī': 'ii', 'ē': 'ee' };
        static _romajiPattern = /[ōūāīē]/g;

        static normalizeRomajiString(s) {
            if (typeof s !== "string") return "";
            return s
                .replace(this._romajiPattern, match => this._romajiMap[match])
                .replace(/\s{2,}/g, " ")
                .trim();
        }

        async romajifyText(text, target = "romaji", mode = "spaced") {
            await this.awaitFinished("ja");
            const out = await this.kuroshiro.convert(text, {
                to: target,
                mode: mode,
                romajiSystem: "hepburn",
            });
            return window.Translator.normalizeRomajiString(out);
        }

        async convertToRomaja(text, target) {
            await this.awaitFinished("ko");
            if (target === "hangul") return text;
            if (!this.Aromanize || typeof this.Aromanize.hangulToLatin !== "function") {
                throw new Error("Korean converter not initialized");
            }
            return this.Aromanize.hangulToLatin(text, "rr-translit");
        }

        async convertChinese(text, from, target) {
            await this.awaitFinished("zh");
            const converter = this.OpenCC.Converter({
                from: from,
                to: target,
            });
            return converter(text);
        }

        async loadPinyinPro() {
            if (typeof pinyinPro !== "undefined") return true;
            const urls = [
                pinyinProPath,
                "https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.7/dist/index.js",
                "https://unpkg.com/pinyin-pro@3.19.7/dist/index.min.js",
            ];
            for (const url of urls) {
                try {
                    await this.includeExternal(url);
                    await this.waitForGlobals(["pinyinPro"], 8000);
                    return true;
                } catch { }
            }
            return false;
        }

        async loadTinyPinyin() {
            if (typeof TinyPinyin !== "undefined") return true;
            const urls = [
                tinyPinyinPath,
                "https://unpkg.com/tiny-pinyin/dist/tiny-pinyin.min.js",
            ];
            for (const url of urls) {
                try {
                    await this.includeExternal(url);
                    await this.waitForGlobals(["TinyPinyin"], 8000);
                    return true;
                } catch { }
            }
            return false;
        }

        async convertToPinyin(text, options = {}) {
            try {
                if (await this.loadTinyPinyin()) {
                    return TinyPinyin.convertToPinyin(text || "");
                }
                if (await this.loadPinyinPro()) {
                    const toneType = options.toneType || "mark";
                    const type = options.type || "string";
                    const nonZh = options.nonZh || "consecutive";
                    return pinyinPro.pinyin(text || "", { toneType, type, nonZh });
                }
                return text || "";
            } catch {
                return text || "";
            }
        }
    }

    // 전역에 Translator 등록
    window.Translator = Translator;

    // ============================================
    // OverlaySender - 오버레이 앱에 데이터 전송
    // Extension으로 이동하여 어떤 페이지에서든 작동
    // ============================================

    let senderBootstrapTimer = null;
    let senderBootstrapScheduledChain = null;
    let senderBootstrapInFlightChain = null;
    let senderBootstrapRerunRequested = null;
    let senderBootstrapNextChainId = 0;
    let senderBootstrapPageGraceUri = null;
    let senderBootstrapPageGraceUntil = 0;
    const SENDER_BOOTSTRAP_METADATA_WAIT_MS = 4000;

    // Spotify 시작/헬퍼 재연결 시 songchange보다 리스너 등록이 늦으면 현재 곡을
    // 영원히 놓칠 수 있다. 두 sender가 공유하는 단일 부트스트랩으로 중복 조회 없이
    // 현재 곡을 한 번 보충하고, 이후 전송은 각 sender의 enabled 상태에 맡긴다.
    const scheduleSenderBootstrap = (delay = 1200, previousUri = null, existingChain = null) => {
        let bootstrapChain = existingChain;
        if (bootstrapChain) {
            if (bootstrapChain.id !== senderBootstrapScheduledChain?.id
                && bootstrapChain.id !== senderBootstrapRerunRequested?.id) {
                return;
            }
        } else if (senderBootstrapTimer && senderBootstrapScheduledChain
            && (!previousUri || !senderBootstrapScheduledChain.previousUri
                || previousUri === senderBootstrapScheduledChain.previousUri)) {
            // 같은 대기 체인에 겹쳐 들어온 예약은 마감 시각까지 포함해 그대로 재사용한다.
            bootstrapChain = senderBootstrapScheduledChain;
            if (!bootstrapChain.previousUri && previousUri) {
                bootstrapChain.previousUri = previousUri;
            }
        } else {
            bootstrapChain = {
                id: ++senderBootstrapNextChainId,
                previousUri: previousUri || null,
                metadataDeadline: Date.now() + SENDER_BOOTSTRAP_METADATA_WAIT_MS
            };
        }

        if (senderBootstrapTimer) {
            clearTimeout(senderBootstrapTimer.handle);
        }

        const timerHandle = setTimeout(async () => {
            if (senderBootstrapTimer?.handle === timerHandle) {
                senderBootstrapTimer = null;
            }
            if (senderBootstrapScheduledChain?.id !== bootstrapChain.id) return;
            if (senderBootstrapInFlightChain) {
                if (!senderBootstrapRerunRequested
                    || bootstrapChain.id > senderBootstrapRerunRequested.id) {
                    senderBootstrapRerunRequested = bootstrapChain;
                }
                return;
            }

            const finishChain = () => {
                if (senderBootstrapScheduledChain?.id === bootstrapChain.id) {
                    senderBootstrapScheduledChain = null;
                }
                if (senderBootstrapRerunRequested?.id === bootstrapChain.id) {
                    senderBootstrapRerunRequested = null;
                }
            };

            const overlaySender = window.OverlaySender;
            const helperSender = window.lyricsHelperSender;
            const overlayEnabled = !!overlaySender?.enabled;
            const helperEnabled = !!helperSender?.enabled;
            if (!overlayEnabled && !helperEnabled) {
                finishChain();
                return;
            }

            const item = Spicetify.Player.data?.item;
            const uri = item?.uri;
            const title = item?.metadata?.title || item?.name || '';
            const artist = item?.metadata?.artist_name
                || item?.artists?.map(artistItem => artistItem.name).filter(Boolean).join(', ')
                || '';
            if (!uri || !title) {
                if (Date.now() < bootstrapChain.metadataDeadline) {
                    scheduleSenderBootstrap(150, null, bootstrapChain);
                } else {
                    finishChain();
                }
                return;
            }

            // songchange 이벤트 직후에는 Player.data가 잠시 이전 URI를 유지한다.
            if (bootstrapChain.previousUri && uri === bootstrapChain.previousUri
                && Date.now() < bootstrapChain.metadataDeadline) {
                scheduleSenderBootstrap(150, null, bootstrapChain);
                return;
            }

            const overlayHasCurrentTrack = !overlayEnabled || overlaySender?.lastDeliveredUri === uri;
            const helperHasCurrentTrack = !helperEnabled || helperSender?.lastDeliveredUri === uri;
            if (overlayHasCurrentTrack && helperHasCurrentTrack) {
                finishChain();
                return;
            }

            // /ivLyrics 페이지에서는 페이지가 직접 가사를 조회해 lyrics-ready로
            // 전달하므로 중복 Gemini 호출을 피하려고 잠시 기다린다. 다만 페이지가
            // 렌더링에 실패하면 아무도 조회하지 않게 되므로, 유예 시간이 지나도
            // 현재 곡이 전달되지 않으면 부트스트랩이 직접 조회한다.
            const pathname = Spicetify.Platform?.History?.location?.pathname || "";
            if (pathname.includes("/ivLyrics")) {
                if (senderBootstrapPageGraceUri !== uri) {
                    senderBootstrapPageGraceUri = uri;
                    senderBootstrapPageGraceUntil = Date.now() + 8000;
                }
                if (Date.now() < senderBootstrapPageGraceUntil) {
                    helperDebug('[LyricsService] ivLyrics 페이지 가사 전달 대기 중:', { uri });
                    scheduleSenderBootstrap(1000, null, bootstrapChain);
                    return;
                }
                helperDebug('[LyricsService] ivLyrics 페이지가 가사를 전달하지 않아 직접 조회:', { uri });
            }

            senderBootstrapInFlightChain = bootstrapChain;
            try {
                helperDebug('[LyricsService] 현재 곡 가사 초기 동기화:', { uri, title });
                await LyricsService.getFullLyrics(
                    {
                        uri,
                        title,
                        artist,
                        duration: Spicetify.Player.getDuration() || 0
                    },
                    { sendToOverlay: true }
                );
            } catch (e) {
                console.error('[LyricsService] 현재 곡 가사 초기 동기화 실패:', e);
            } finally {
                if (senderBootstrapInFlightChain?.id === bootstrapChain.id) {
                    senderBootstrapInFlightChain = null;
                }
                const rerunChain = senderBootstrapRerunRequested;
                if (rerunChain
                    && senderBootstrapScheduledChain?.id === rerunChain.id
                    && rerunChain.id > bootstrapChain.id) {
                    senderBootstrapRerunRequested = null;
                    scheduleSenderBootstrap(150, null, rerunChain);
                } else {
                    if (rerunChain
                        && rerunChain.id < (senderBootstrapScheduledChain?.id || bootstrapChain.id)) {
                        senderBootstrapRerunRequested = null;
                    }
                    finishChain();
                }
            }
        }, delay);
        senderBootstrapScheduledChain = bootstrapChain;
        senderBootstrapTimer = { handle: timerHandle, chainId: bootstrapChain.id };
    };

    // Rust helper/overlay의 입력 형식은 정수 밀리초와 문자열만 허용한다.
    // pseudo-karaoke의 소수 타임스탬프나 객체형 보조 가사가 들어오면 422가 나므로
    // 두 sender가 같은 경계 정규화를 사용한다.
    const mapLyricsForSender = (lyrics, offset) => {
        const safeOffset = Number(offset);
        const normalizedOffset = Number.isFinite(safeOffset) ? safeOffset : 0;

        return lyrics.map(line => {
            const originalCandidate = line?.originalText ?? line?.text ?? '';
            const originalText = typeof originalCandidate === 'string'
                ? originalCandidate
                : String(originalCandidate ?? '');
            const pronCandidate = typeof line?.text === 'string' ? line.text : null;
            const pronText = pronCandidate
                && pronCandidate !== line?.originalText
                && pronCandidate !== originalText
                ? pronCandidate
                : null;
            const transText = [line?.text2, line?.translation, line?.translationText]
                .find(value => typeof value === 'string' && value.trim() && value !== originalText)
                || null;

            const rawStartTime = Number(line?.startTime);
            const rawEndTime = line?.endTime == null ? null : Number(line.endTime);
            const startTime = Math.round((Number.isFinite(rawStartTime) ? rawStartTime : 0) + normalizedOffset);
            const endTime = rawEndTime !== null && Number.isFinite(rawEndTime)
                ? Math.round(rawEndTime + normalizedOffset)
                : null;

            return { startTime, endTime, text: originalText, pronText, transText };
        });
    };

    const LYRICS_SEND_RETRY_DELAYS = [250, 750];

    const OverlaySender = {
        DEFAULT_PORT: 15000,
        progressInterval: null,
        lastSentUri: null,
        lastSentLyrics: null,
        lastSentOffset: null,
        _lastSentDedupeToken: null,
        lastDeliveredUri: null,
        _deliveryGeneration: 0,
        _deliveryKey: null,
        _terminalDeliveryFailure: null,
        _lastTrackInfo: null,
        _lastLyrics: null,
        lastConfigDelay: undefined,
        _offsetCache: {},

        // 연결 상태
        _isConnected: false,
        _connectionCheckInterval: null,
        _lastConnectionAttempt: 0,
        _isSettingsOpen: false,
        _settingsTimer: null,
        _worker: null,
        _isSendingProgress: false,
        _reqId: 0,
        _lastReqId: 0,
        _pendingLyricsSend: null,
        _lyricsSendActive: false,

        // 포트 설정 (localStorage에 저장)
        get port() {
            const savedPort = window.ivLyricsStoragePersistence
                ? window.ivLyricsStoragePersistence.getItem('ivLyrics:overlay-port')
                : Spicetify.LocalStorage.get('ivLyrics:overlay-port');
            return savedPort ? parseInt(savedPort, 10) : this.DEFAULT_PORT;
        },
        set port(value) {
            const portNum = parseInt(value, 10);
            if (portNum >= 1024 && portNum <= 65535) {
                if (window.ivLyricsStoragePersistence) {
                    window.ivLyricsStoragePersistence.setItem('ivLyrics:overlay-port', portNum.toString());
                } else {
                    Spicetify.LocalStorage.set('ivLyrics:overlay-port', portNum.toString());
                }
                this.isConnected = false;
                this.checkConnection();
            }
        },

        // 설정 (localStorage에 저장)
        get enabled() {
            const stored = window.ivLyricsStoragePersistence
                ? window.ivLyricsStoragePersistence.getItem('ivLyrics:overlay-enabled')
                : Spicetify.LocalStorage.get('ivLyrics:overlay-enabled');
            return stored !== 'false';
        },
        set enabled(value) {
            if (window.ivLyricsStoragePersistence) {
                window.ivLyricsStoragePersistence.setItem('ivLyrics:overlay-enabled', value ? 'true' : 'false');
            } else {
                Spicetify.LocalStorage.set('ivLyrics:overlay-enabled', value ? 'true' : 'false');
            }
            this.syncRuntimeState();
        },

        setSettingsOpen(isOpen) {
            this._isSettingsOpen = isOpen;
            clearSettingsPolling(this);

            if (isOpen) {
                helperDebug('[OverlaySender] 설정창 열림 - 연결 확인 폴링 시작');
                this.checkConnection();
                this._settingsTimer = setInterval(() => {
                    if (!this.isConnected) {
                        this.checkConnection();
                    }
                }, 2000);
            } else {
                helperDebug('[OverlaySender] 설정창 닫힘 - 연결 확인 폴링 종료');
            }
        },

        get isConnected() {
            return this._isConnected;
        },
        set isConnected(value) {
            const wasConnected = this._isConnected;
            this._isConnected = value;

            window.dispatchEvent(new CustomEvent('ivLyrics:overlay-connection', {
                detail: { connected: value }
            }));

            if (value && !wasConnected) {
                helperDebug('[OverlaySender] 오버레이 연결됨 ✓');
                this.handleConnectionRecovery();
            }
            else if (!value && wasConnected) {
                helperDebug('[OverlaySender] 오버레이 연결 끊김');
            }
        },

        handleConnectionRecovery() {
            // 가사 요청 자체가 연결을 복구한 경우 현재 큐가 성공 상태를 기록하므로
            // 여기서 같은 payload를 다시 예약하지 않는다.
            if (this._lyricsSendActive) return;

            const failure = this._terminalDeliveryFailure;
            if (failure
                && failure.generation === this._deliveryGeneration
                && failure.key === this._deliveryKey) {
                if (failure.reconnectUsed) return;
                failure.reconnectUsed = true;
                const { generation, key } = failure;
                setTimeout(() => {
                    const currentFailure = this._terminalDeliveryFailure;
                    if (!this.enabled || !currentFailure
                        || currentFailure.generation !== generation
                        || currentFailure.key !== key
                        || this._deliveryGeneration !== generation
                        || this._deliveryKey !== key) {
                        return;
                    }
                    this.resendWithNewOffset('reconnect');
                }, 100);
                return;
            }

            setTimeout(() => this.resendWithNewOffset('reconnect'), 100);
            scheduleSenderBootstrap(150);
        },

        async checkConnection() {
            if (!this.enabled) return false;

            try {
                const response = await fetch(`http://localhost:${this.port}/progress`, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ position: 0, isPlaying: false }),
                    signal: AbortSignal.timeout(1000)
                });
                this.isConnected = response.ok;
                return this.isConnected;
            } catch (e) {
                this.isConnected = false;
                return false;
            }
        },

        openOverlayApp() {
            try {
                window.open('ivLyrics://overlay', '_blank');
                setTimeout(() => this.checkConnection(), 2000);
            } catch (e) {
                console.error('[OverlaySender] 앱 열기 실패:', e);
            }
        },

        getDownloadUrl() {
            return 'https://ivlis.kr/ivLyrics/extensions/#overlay';
        },

        async sendToEndpoint(endpoint, data) {
            if (!this.enabled) return;

            const isProgressEndpoint = endpoint === '/progress' || endpoint === '/lyrics/progress';

            try {
                const response = await fetch(`http://localhost:${this.port}${endpoint}`, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    signal: AbortSignal.timeout(2000)
                });

                if (!response.ok) {
                    let responseDetail = '';
                    try {
                        responseDetail = await response.text();
                    } catch (e) { }
                    if (this._isConnected) {
                        this.isConnected = false;
                    }
                    if (!isProgressEndpoint) {
                        console.error('[LyricsService] 가사 전송 실패:', {
                            endpoint,
                            port: this.port,
                            status: response.status,
                            detail: responseDetail || null
                        });
                    }
                    return false;
                }

                if (!this._isConnected && response.ok) {
                    this.isConnected = true;
                }
                return true;
            } catch (e) {
                if (this._isConnected) {
                    this.isConnected = false;
                }
                if (!isProgressEndpoint) {
                    console.error('[LyricsService] 가사 전송 중 오류:', {
                        endpoint,
                        port: this.port,
                        error: e
                    });
                }
                return false;
            }
        },

        // 싱크 오프셋 가져오기
        async getSyncOffset(uri) {
            let offset = 0;

            // 1. 전역 딜레이 설정 (CONFIG가 로드되면)
            if (typeof window.CONFIG !== 'undefined' && window.CONFIG.visual && typeof window.CONFIG.visual.delay === 'number') {
                offset += window.CONFIG.visual.delay;
            }

            const globalSyncOffset = Number(
                window.Utils?.getGlobalSyncOffset?.()
                ?? window.CONFIG?.visual?.["global-sync-offset"]
                ?? 0
            );
            if (Number.isFinite(globalSyncOffset)) {
                offset += globalSyncOffset;
            }

            // 2. TrackSyncDB에서 트랙별 오프셋
            if (this._offsetCache && this._offsetCache[uri] !== undefined) {
                offset += this._offsetCache[uri];
            } else {
                try {
                    if (typeof window.TrackSyncDB !== 'undefined' && window.TrackSyncDB.getOffset) {
                        const dbOffset = await window.TrackSyncDB.getOffset(uri);
                        if (dbOffset) {
                            offset += dbOffset;
                            this._offsetCache[uri] = dbOffset;
                        }
                    }
                } catch (e) { }
            }

            // 3. localStorage 개별 트랙 딜레이
            try {
                const delayKey = `lyrics-delay:${uri}`;
                const delay = Spicetify.LocalStorage.get(delayKey);
                if (delay) offset += Number(delay);
            } catch (e) { }

            return -offset;
        },

        // 현재 재생 중인 곡과 다른(이전) 곡의 가사 전송인지 확인
        isStaleTrackSend(trackInfo) {
            try {
                const currentUri = Spicetify.Player.data?.item?.uri;
                return !!(currentUri && trackInfo?.uri && trackInfo.uri !== currentUri);
            } catch (e) {
                return false;
            }
        },

        // 가사 전송 직렬화 (최신 페이로드 우선) - HTTP 응답 순서 뒤집힘으로
        // 이전 가사가 최신 가사를 덮어쓰는 문제 방지
        async queueLyricsSend(endpoint, uri, payload, deliveryContext = null) {
            if (!deliveryContext) {
                const key = JSON.stringify([uri, this.lastSentLyrics, this.lastSentOffset]);
                deliveryContext = {
                    key,
                    generation: ++this._deliveryGeneration,
                    isReconnectCycle: false
                };
                this._deliveryKey = key;
                this._terminalDeliveryFailure = null;
            }
            const dedupeToken = this.lastSentUri === uri ? {} : null;
            if (dedupeToken) {
                this._lastSentDedupeToken = dedupeToken;
            }
            this._pendingLyricsSend = {
                endpoint,
                uri,
                payload,
                retryCount: 0,
                deliveryKey: deliveryContext.key,
                generation: deliveryContext.generation,
                isReconnectCycle: !!deliveryContext.isReconnectCycle,
                dedupeSnapshot: {
                    uri: this.lastSentUri,
                    lyrics: this.lastSentLyrics,
                    offset: this.lastSentOffset,
                    token: dedupeToken
                }
            };
            if (this._lyricsSendActive) return;
            this._lyricsSendActive = true;
            const clearDedupeIfCurrent = (queued) => {
                const snapshot = queued.dedupeSnapshot;
                if (queued.generation !== this._deliveryGeneration
                    || !snapshot || snapshot.uri !== queued.uri
                    || this._lastSentDedupeToken !== snapshot.token
                    || this.lastSentUri !== snapshot.uri
                    || this.lastSentLyrics !== snapshot.lyrics
                    || !Object.is(this.lastSentOffset, snapshot.offset)) {
                    return;
                }
                this.lastSentUri = null;
                this.lastSentLyrics = null;
                this.lastSentOffset = null;
                this._lastSentDedupeToken = null;
            };
            const markTerminalFailure = (queued) => {
                if (queued.generation !== this._deliveryGeneration
                    || queued.deliveryKey !== this._deliveryKey) {
                    return;
                }
                const previousFailure = this._terminalDeliveryFailure;
                this._terminalDeliveryFailure = {
                    key: queued.deliveryKey,
                    generation: queued.generation,
                    reconnectUsed: queued.isReconnectCycle
                        || !!(previousFailure
                            && previousFailure.key === queued.deliveryKey
                            && previousFailure.generation === queued.generation
                            && previousFailure.reconnectUsed)
                };
                clearDedupeIfCurrent(queued);
            };
            try {
                while (this._pendingLyricsSend) {
                    const next = this._pendingLyricsSend;
                    this._pendingLyricsSend = null;
                    if (next.generation !== this._deliveryGeneration) continue;
                    if (!this.enabled || (next.uri && this.isStaleTrackSend({ uri: next.uri }))) {
                        clearDedupeIfCurrent(next);
                        continue;
                    }
                    const sent = await this.sendToEndpoint(next.endpoint, next.payload);
                    const deliveryIsCurrent = this.enabled
                        && next.generation === this._deliveryGeneration
                        && (!next.uri || !this.isStaleTrackSend({ uri: next.uri }));
                    if (sent === true) {
                        if (deliveryIsCurrent) {
                            this.lastDeliveredUri = next.uri || null;
                            this._terminalDeliveryFailure = null;
                        }
                        continue;
                    }

                    if (!deliveryIsCurrent) continue;

                    if (this.lastDeliveredUri === next.uri) {
                        this.lastDeliveredUri = null;
                    }
                    this.scheduleConnectionCheck?.();

                    const retryDelay = LYRICS_SEND_RETRY_DELAYS[next.retryCount];
                    if (retryDelay === undefined) {
                        markTerminalFailure(next);
                        continue;
                    }

                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    // 대기 중 들어온 최신 페이로드가 실패한 요청의 재시도를 대체한다.
                    if (this._pendingLyricsSend) {
                        continue;
                    }
                    if (!this.enabled || next.generation !== this._deliveryGeneration
                        || (next.uri && this.isStaleTrackSend({ uri: next.uri }))) {
                        clearDedupeIfCurrent(next);
                        continue;
                    }
                    this._pendingLyricsSend = { ...next, retryCount: next.retryCount + 1 };
                }
            } finally {
                this._lyricsSendActive = false;
            }
        },

        async sendLyrics(trackInfo, lyrics, forceResend = false, sendReason = 'normal') {
            if (!trackInfo || !lyrics || !Array.isArray(lyrics)) return;
            if (!this.enabled) return;
            if (this.isStaleTrackSend(trackInfo)) {
                helperDebug('[OverlaySender] 이전 곡 가사 전송 차단:', trackInfo.uri);
                return;
            }

            const currentReqId = ++this._reqId;

            this._lastTrackInfo = trackInfo;
            this._lastLyrics = lyrics;

            const offset = await this.getSyncOffset(trackInfo.uri);

            if (currentReqId < this._lastReqId) {
                helperDebug(`[OverlaySender] 오래된 요청 무시됨 (#${currentReqId} < #${this._lastReqId})`);
                return;
            }
            this._lastReqId = currentReqId;

            if (!this.enabled || this.isStaleTrackSend(trackInfo)) {
                helperDebug('[OverlaySender] 이전 곡 가사 전송 차단 (오프셋 계산 후):', trackInfo.uri);
                return;
            }

            const lyricsHash = JSON.stringify(lyrics);

            if (!forceResend &&
                this.lastSentUri === trackInfo.uri &&
                this.lastSentLyrics === lyricsHash &&
                this.lastSentOffset === offset) {
                return;
            }

            const deliveryKey = JSON.stringify([trackInfo.uri, lyricsHash, offset]);
            const isReconnectCycle = sendReason === 'reconnect';
            let deliveryGeneration = this._deliveryGeneration;
            if (!isReconnectCycle || this._deliveryKey !== deliveryKey) {
                deliveryGeneration = ++this._deliveryGeneration;
                this._deliveryKey = deliveryKey;
                this._terminalDeliveryFailure = null;
            }

            this.lastSentUri = trackInfo.uri;
            this.lastSentLyrics = lyricsHash;
            this.lastSentOffset = offset;

            // 앨범 이미지 URL 처리 개선
            let albumArt = null;
            try {
                const imageUrl = Spicetify.Player.data?.item?.metadata?.image_xlarge_url
                    || Spicetify.Player.data?.item?.metadata?.image_url
                    || Spicetify.Player.data?.item?.metadata?.image_large_url;
                albumArt = resolveSpotifyImageUrl(imageUrl);
            } catch (e) { }

            const mappedLines = mapLyricsForSender(lyrics, offset);

            // 현재 트랙 정보 가져오기 (Spicetify.Player.data에서 최신 정보 사용)
            const originalTitle = trackInfo.title || Spicetify.Player.data?.item?.metadata?.title || '';
            const originalArtist = trackInfo.artist || Spicetify.Player.data?.item?.metadata?.artist_name || '';
            const currentAlbum = Spicetify.Player.data?.item?.metadata?.album_title || '';

            // 번역된 메타데이터가 있으면 대체
            const translatedMetadata = trackInfo.translatedMetadata || null;
            const currentTitle = translatedMetadata?.translated?.title || originalTitle;
            const currentArtist = translatedMetadata?.translated?.artist || originalArtist;

            helperDebug('[OverlaySender] 가사 전송:', {
                lines: mappedLines.length,
                offset,
                title: currentTitle,
                artist: currentArtist,
                translated: !!translatedMetadata
            });

            await this.queueLyricsSend('/lyrics', trackInfo.uri, {
                track: {
                    title: currentTitle,
                    artist: currentArtist,
                    album: currentAlbum,
                    albumArt: albumArt,
                    duration: Spicetify.Player.getDuration() || 0
                },
                lyrics: mappedLines,
                isSynced: lyrics.some(l => l.startTime !== undefined && l.startTime !== null)
            }, {
                key: deliveryKey,
                generation: deliveryGeneration,
                isReconnectCycle
            });
        },

        async resendWithNewOffset(sendReason = 'explicit') {
            // 오프셋 캐시 초기화
            this._offsetCache = {};
            if (this._lastTrackInfo && this._lastLyrics) {
                helperDebug('[OverlaySender] 가사 재전송 (싱크 반영)');
                await this.sendLyrics(this._lastTrackInfo, this._lastLyrics, true, sendReason);
            }
        },

        async sendTranslatedMetadata(translatedMetadata) {
            if (!this.enabled || !translatedMetadata) return;
            if (!this._lastTrackInfo || !this._lastLyrics) return;

            // 번역된 메타데이터를 포함하여 가사 재전송
            this._lastTrackInfo.translatedMetadata = translatedMetadata;
            helperDebug('[OverlaySender] 번역된 메타데이터로 재전송');
            await this.sendLyrics(this._lastTrackInfo, this._lastLyrics, true);
        },

        startProgressSync() {
            if (this._worker) return;
            if (!this.enabled) return;

            const blob = new Blob([`
              let interval = null;
              self.onmessage = function(e) {
                if (e.data === 'start') {
                  if (interval) clearInterval(interval);
                  interval = setInterval(() => {
                    self.postMessage('tick');
                  }, 250);
                } else if (e.data === 'stop') {
                  if (interval) clearInterval(interval);
                  interval = null;
                }
              };
            `], { type: 'application/javascript' });

            this._worker = new Worker(URL.createObjectURL(blob));

            this._worker.onmessage = async () => {
                if (!this.enabled) return;
                if (this._isSendingProgress) return;
                if (!this.isConnected && !this._isSettingsOpen) return;

                // 전역 딜레이 변경 체크
                if (typeof window.CONFIG !== 'undefined' && window.CONFIG.visual) {
                    if (this.lastConfigDelay === undefined) {
                        this.lastConfigDelay = window.CONFIG.visual.delay;
                    }
                    if (this.lastConfigDelay !== window.CONFIG.visual.delay) {
                        this.lastConfigDelay = window.CONFIG.visual.delay;
                        this.resendWithNewOffset();
                    }
                }

                this._isSendingProgress = true;
                try {
                    const position = Utils.getSafePlayerProgress() || 0;
                    const duration = Spicetify.Player.getDuration() || 0;
                    const remaining = (duration - position) / 1000;

                    // 현재 트랙 정보 (트랙 변경 감지용)
                    let currentTrack = null;
                    const currentUri = Spicetify.Player.data?.item?.uri;
                    if (currentUri && this._lastProgressUri !== currentUri) {
                        this._lastProgressUri = currentUri;
                        try {
                            const imageUrl = Spicetify.Player.data?.item?.metadata?.image_xlarge_url
                                || Spicetify.Player.data?.item?.metadata?.image_url
                                || Spicetify.Player.data?.item?.metadata?.image_large_url;
                            let albumArt = null;
                            albumArt = resolveSpotifyImageUrl(imageUrl);
                            currentTrack = {
                                title: Spicetify.Player.data?.item?.metadata?.title || '',
                                artist: Spicetify.Player.data?.item?.metadata?.artist_name || '',
                                album: Spicetify.Player.data?.item?.metadata?.album_title || '',
                                albumArt: albumArt
                            };
                        } catch (e) { }
                    }

                    let nextTrack = null;
                    try {
                        const queue = Spicetify.Queue;
                        if (queue?.nextTracks?.length > 0) {
                            const next = queue.nextTracks[0];
                            if (next?.contextTrack?.metadata) {
                                const imageUrl = next.contextTrack.metadata.image_url || next.contextTrack.metadata.image_xlarge_url;
                                const albumArt = resolveSpotifyImageUrl(imageUrl);
                                nextTrack = {
                                    title: next.contextTrack.metadata.title || '',
                                    artist: next.contextTrack.metadata.artist_name || '',
                                    albumArt: albumArt
                                };
                            }
                        }
                    } catch (e) { }

                    await this.sendToEndpoint('/progress', {
                        position: position,
                        isPlaying: getOverlayProgressIsPlaying(),
                        duration: duration,
                        remaining: remaining,
                        currentTrack: currentTrack,
                        nextTrack: nextTrack
                    });
                } finally {
                    this._isSendingProgress = false;
                }
            };

            this._worker.postMessage('start');
        },

        stopProgressSync() {
            if (!this._worker) return;
            cleanupWorker(this._worker);
            this._worker = null;
            this._isSendingProgress = false;
            this._lastProgressUri = null;
        },

        setupOffsetListener() {
            // 중복 호출 방지
            if (this._offsetListenerSetup) return;
            this._offsetListenerSetup = true;

            // localStorage 변경 감지
            this._storageListener = (e) => {
                if (e.key && e.key.startsWith('lyrics-delay:')) {
                    this.resendWithNewOffset();
                }
            };

            // 커스텀 이벤트 리스너
            this._delayChangedListener = () => {
                this.resendWithNewOffset();
            };

            this._offsetChangedListener = () => {
                this.resendWithNewOffset();
            };

            // ivLyrics 페이지에서 가사가 준비되면 오버레이로 전송
            this._lyricsReadyListener = (e) => {
                if (!this.enabled) return;
                const { trackInfo, lyrics } = e.detail || {};
                if (trackInfo) {
                    helperDebug('[OverlaySender] 가사 준비 이벤트 수신:', {
                        uri: trackInfo.uri,
                        title: trackInfo.title,
                        lines: lyrics?.length || 0
                    });
                    this.sendLyrics(trackInfo, lyrics || []);
                }
            };

            // 페이지 가시성 변경 감지
            this._visibilityChangeListener = () => {
                if (document.visibilityState === 'visible' && this.enabled) {
                    helperDebug('[OverlaySender] 페이지 활성화 - 가사 재전송');
                    setTimeout(() => this.resendWithNewOffset(), 200);
                }
            };

            // 창 포커스 시
            this._focusListener = () => {
                if (this.enabled && this._lastTrackInfo) {
                    helperDebug('[OverlaySender] 창 포커스 - 가사 재전송');
                    setTimeout(() => this.resendWithNewOffset(), 300);
                }
            };

            // 트랙 변경 감지
            this._songChangeListener = () => {
                const previousUri = this._lastTrackInfo?.uri || this.lastSentUri || null;
                // 캐시 초기화
                this.lastSentUri = null;
                this.lastSentLyrics = null;
                this.lastSentOffset = null;
                this._lastSentDedupeToken = null;
                this.lastDeliveredUri = null;
                this._deliveryGeneration += 1;
                this._deliveryKey = null;
                this._terminalDeliveryFailure = null;
                this._pendingLyricsSend = null;
                this._offsetCache = {};
                this._lastProgressUri = null;
                this._lastTrackInfo = null;
                this._lastLyrics = null;

                // 오버레이 활성화 상태가 아니면 스킵
                if (!this.enabled) return;
                // songchange 시점에는 Player.data가 아직 이전 곡일 수 있다.
                // 두 sender가 공유하는 지연 부트스트랩이 최신 메타데이터를 읽고 한 번만 조회한다.
                helperDebug('[OverlaySender] 곡 변경 - 현재 곡 가사 동기화 예약');
                scheduleSenderBootstrap(150, previousUri);
            };

            window.addEventListener('storage', this._storageListener);
            window.addEventListener('ivLyrics:delay-changed', this._delayChangedListener);
            window.addEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
            window.addEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
            window.addEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
            document.addEventListener('visibilitychange', this._visibilityChangeListener);
            window.addEventListener('focus', this._focusListener);
            Spicetify.Player.addEventListener('songchange', this._songChangeListener);
        },

        teardownOffsetListener() {
            if (!this._offsetListenerSetup) return;
            this._offsetListenerSetup = false;

            if (this._storageListener) {
                window.removeEventListener('storage', this._storageListener);
                this._storageListener = null;
            }
            if (this._delayChangedListener) {
                window.removeEventListener('ivLyrics:delay-changed', this._delayChangedListener);
                this._delayChangedListener = null;
            }
            if (this._offsetChangedListener) {
                window.removeEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
                window.removeEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
                this._offsetChangedListener = null;
            }
            if (this._lyricsReadyListener) {
                window.removeEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
                this._lyricsReadyListener = null;
            }
            if (this._visibilityChangeListener) {
                document.removeEventListener('visibilitychange', this._visibilityChangeListener);
                this._visibilityChangeListener = null;
            }
            if (this._focusListener) {
                window.removeEventListener('focus', this._focusListener);
                this._focusListener = null;
            }
            if (this._songChangeListener && typeof Spicetify.Player?.removeEventListener === 'function') {
                try {
                    Spicetify.Player.removeEventListener('songchange', this._songChangeListener);
                } catch (e) { }
                this._songChangeListener = null;
            }
        },

        scheduleConnectionCheck() {
            if (this._connectionCheckTimer) {
                clearTimeout(this._connectionCheckTimer);
            }

            if (!this.enabled) {
                this._connectionCheckTimer = null;
                return;
            }

            this._connectionCheckTimer = setTimeout(() => {
                this._connectionCheckTimer = null;
                this.checkConnection();
            }, 1000);
        },

        syncRuntimeState() {
            const enabled = !!this.enabled;
            if (this._runtimeEnabledState === enabled) {
                return;
            }

            this._runtimeEnabledState = enabled;
            if (enabled) {
                this.startProgressSync();
                this.setupOffsetListener();
                this.scheduleConnectionCheck();
                scheduleSenderBootstrap();
            } else {
                this.stopProgressSync();
                this.teardownOffsetListener();
                clearSettingsPolling(this);
                this.lastSentUri = null;
                this.lastSentLyrics = null;
                this.lastSentOffset = null;
                this._lastSentDedupeToken = null;
                this.lastDeliveredUri = null;
                this._deliveryGeneration += 1;
                this._deliveryKey = null;
                this._terminalDeliveryFailure = null;
                this._pendingLyricsSend = null;
                this._lastTrackInfo = null;
                this._lastLyrics = null;
                this._offsetCache = {};
                this.isConnected = false;
            }
        },

        setupRuntimeListener() {
            if (this._runtimeListenerSetup) return;
            this._runtimeListenerSetup = true;

            this._runtimeStorageListener = () => {
                this.syncRuntimeState();
            };
            this._runtimeEventListener = () => {
                this.syncRuntimeState();
            };

            window.addEventListener('storage', this._runtimeStorageListener);
            window.addEventListener('ivLyrics', this._runtimeEventListener);
        },

        teardownRuntimeListener() {
            if (!this._runtimeListenerSetup) return;
            this._runtimeListenerSetup = false;

            if (this._runtimeStorageListener) {
                window.removeEventListener('storage', this._runtimeStorageListener);
                this._runtimeStorageListener = null;
            }
            if (this._runtimeEventListener) {
                window.removeEventListener('ivLyrics', this._runtimeEventListener);
                this._runtimeEventListener = null;
            }
            if (this._connectionCheckTimer) {
                clearTimeout(this._connectionCheckTimer);
                this._connectionCheckTimer = null;
            }
        },

        init() {
            if (this._initialized) return;
            this._initialized = true;
            this.setupRuntimeListener();
            this.syncRuntimeState();
            helperDebug('[OverlaySender] Initialized in Extension');
        },

        destroy() {
            this.stopProgressSync();
            this.teardownOffsetListener();
            this.teardownRuntimeListener();
            clearSettingsPolling(this);
        }
    };

    const lyricsHelperSender = Object.create(OverlaySender, {
        DEFAULT_PORT: {
            value: 15123  // Helper 서버 포트 (video_server와 lyrics_server 통합)
        },
        // ⚠️ 상태 분리: Object.create로 만든 객체는 자기 소유 속성이 없으면
        // 프로토타입(OverlaySender)의 가변 상태를 그대로 읽고, 상속된 메서드가
        // OverlaySender의 워커를 죽이거나 window 리스너를 떼어내는 사고가 발생한다.
        // (오버레이에 가사가 안 들어오던 원인) 반드시 전부 own property로 초기화한다.
        progressInterval: { value: null, writable: true },
        lastSentUri: { value: null, writable: true },
        lastSentLyrics: { value: null, writable: true },
        lastSentOffset: { value: null, writable: true },
        _lastSentDedupeToken: { value: null, writable: true },
        lastDeliveredUri: { value: null, writable: true },
        _deliveryGeneration: { value: 0, writable: true },
        _deliveryKey: { value: null, writable: true },
        _terminalDeliveryFailure: { value: null, writable: true },
        _lastTrackInfo: { value: null, writable: true },
        _lastLyrics: { value: null, writable: true },
        lastConfigDelay: { value: undefined, writable: true },
        _offsetCache: { value: {}, writable: true },
        _isConnected: { value: false, writable: true },
        _connectionCheckInterval: { value: null, writable: true },
        _connectionCheckTimer: { value: null, writable: true },
        _lastConnectionAttempt: { value: 0, writable: true },
        _isSettingsOpen: { value: false, writable: true },
        _settingsTimer: { value: null, writable: true },
        _worker: { value: null, writable: true },
        _isSendingProgress: { value: false, writable: true },
        _lastProgressUri: { value: null, writable: true },
        _reqId: { value: 0, writable: true },
        _lastReqId: { value: 0, writable: true },
        _pendingLyricsSend: { value: null, writable: true },
        _lyricsSendActive: { value: false, writable: true },
        _initialized: { value: false, writable: true },
        _offsetListenerSetup: { value: false, writable: true },
        _runtimeListenerSetup: { value: false, writable: true },
        _runtimeEnabledState: { value: undefined, writable: true },
        _storageListener: { value: null, writable: true },
        _delayChangedListener: { value: null, writable: true },
        _offsetChangedListener: { value: null, writable: true },
        _lyricsReadyListener: { value: null, writable: true },
        _visibilityChangeListener: { value: null, writable: true },
        _focusListener: { value: null, writable: true },
        _songChangeListener: { value: null, writable: true },
        _runtimeStorageListener: { value: null, writable: true },
        _runtimeEventListener: { value: null, writable: true },
        port: {
            get() {
                return this.DEFAULT_PORT;
            }
        },
        enabled: {
            get() {
                const stored = window.ivLyricsStoragePersistence
                    ? window.ivLyricsStoragePersistence.getItem('ivLyrics:visual:lyrics-helper-enabled')
                    : Spicetify.LocalStorage.get('ivLyrics:visual:lyrics-helper-enabled');
                return stored !== 'false';
            },
            set(value) {
                if (window.ivLyricsStoragePersistence) {
                    window.ivLyricsStoragePersistence.setItem('ivLyrics:visual:lyrics-helper-enabled', value ? 'true' : 'false');
                } else {
                    Spicetify.LocalStorage.set('ivLyrics:visual:lyrics-helper-enabled', value ? 'true' : 'false');
                }
                this.syncRuntimeState();
            }
        },
        setSettingsOpen: {
            value: function (isOpen) {
                this._isSettingsOpen = isOpen;
                clearSettingsPolling(this);

                if (isOpen) {
                    helperDebug('[lyricsHelperSender] 설정창 열림 - 연결 확인 폴링 시작');
                    this.checkConnection();
                    this._settingsTimer = setInterval(() => {
                        if (!this.isConnected) {
                            this.checkConnection();
                        }
                    }, 2000);
                } else {
                    helperDebug('[lyricsHelperSender] 설정창 닫힘 - 연결 확인 폴링 종료');
                }
            }
        },
        isConnected: {
            get() {
                return this._isConnected;
            },
            set(value) {
                const wasConnected = this._isConnected;
                this._isConnected = value;

                window.dispatchEvent(new CustomEvent('ivLyrics:lyrics-helper-connection', {
                    detail: { connected: value }
                }));

                if (value && !wasConnected) {
                    helperDebug('[lyricsHelperSender] 헬퍼 연결됨 ✓');
                    this.handleConnectionRecovery();
                }
                else if (!value && wasConnected) {
                    helperDebug('[lyricsHelperSender] 헬퍼 연결 끊김');
                }
            }
        },
        sendLyrics: {
            value: async function (trackInfo, lyrics, forceResend = false, sendReason = 'normal') {
                if (!trackInfo || !lyrics || !Array.isArray(lyrics)) return;
                if (!this.enabled) return;
                if (this.isStaleTrackSend(trackInfo)) {
                    helperDebug('[lyricsHelperSender] 이전 곡 가사 전송 차단:', trackInfo.uri);
                    return;
                }

                const currentReqId = ++this._reqId;

                this._lastTrackInfo = trackInfo;
                this._lastLyrics = lyrics;

                const offset = await this.getSyncOffset(trackInfo.uri);

                if (currentReqId < this._lastReqId) {
                    helperDebug(`[lyricsHelperSender] 오래된 요청 무시됨 (#${currentReqId} < #${this._lastReqId})`);
                    return;
                }
                this._lastReqId = currentReqId;

                if (!this.enabled || this.isStaleTrackSend(trackInfo)) {
                    helperDebug('[lyricsHelperSender] 이전 곡 가사 전송 차단 (오프셋 계산 후):', trackInfo.uri);
                    return;
                }

                const lyricsHash = JSON.stringify(lyrics);

                if (!forceResend &&
                    this.lastSentUri === trackInfo.uri &&
                    this.lastSentLyrics === lyricsHash &&
                    this.lastSentOffset === offset) {
                    return;
                }

                const deliveryKey = JSON.stringify([trackInfo.uri, lyricsHash, offset]);
                const isReconnectCycle = sendReason === 'reconnect';
                let deliveryGeneration = this._deliveryGeneration;
                if (!isReconnectCycle || this._deliveryKey !== deliveryKey) {
                    deliveryGeneration = ++this._deliveryGeneration;
                    this._deliveryKey = deliveryKey;
                    this._terminalDeliveryFailure = null;
                }

                this.lastSentUri = trackInfo.uri;
                this.lastSentLyrics = lyricsHash;
                this.lastSentOffset = offset;

                // 앨범 이미지 URL 처리 개선
                let albumArt = null;
                try {
                    const imageUrl = Spicetify.Player.data?.item?.metadata?.image_xlarge_url
                        || Spicetify.Player.data?.item?.metadata?.image_url
                        || Spicetify.Player.data?.item?.metadata?.image_large_url;
                    albumArt = resolveSpotifyImageUrl(imageUrl);
                } catch (e) { }

                const mappedLines = mapLyricsForSender(lyrics, offset);

                // 현재 트랙 정보 가져오기 (Spicetify.Player.data에서 최신 정보 사용)
                const currentTitle = trackInfo.title || Spicetify.Player.data?.item?.metadata?.title || '';
                const currentArtist = trackInfo.artist || Spicetify.Player.data?.item?.metadata?.artist_name || '';
                const currentAlbum = Spicetify.Player.data?.item?.metadata?.album_title || '';

                helperDebug('[lyricsHelperSender] 가사 전송:', {
                    lines: mappedLines.length,
                    offset,
                    title: currentTitle,
                    artist: currentArtist
                });

                // 새로운 엔드포인트 사용: /lyrics/sender
                await this.queueLyricsSend('/lyrics/sender', trackInfo.uri, {
                    track: {
                        title: currentTitle,
                        artist: currentArtist,
                        album: currentAlbum,
                        albumArt: albumArt,
                        duration: Spicetify.Player.getDuration() || 0
                    },
                    lyrics: mappedLines,
                    isSynced: lyrics.some(l => l.startTime !== undefined && l.startTime !== null)
                }, {
                    key: deliveryKey,
                    generation: deliveryGeneration,
                    isReconnectCycle
                });
            }
        },
        resendWithNewOffset: {
            value: async function (sendReason = 'explicit') {
                this._offsetCache = {};
                if (this._lastTrackInfo && this._lastLyrics) {
                    helperDebug('[lyricsHelperSender] 가사 재전송 (싱크 반영)');
                    await this.sendLyrics(this._lastTrackInfo, this._lastLyrics, true, sendReason);
                }
            }
        },
        // progress 전송용 엔드포인트 오버라이드
        sendProgressToEndpoint: {
            value: async function (data) {
                if (!this.enabled) return;
                try {
                    const response = await fetch(`http://localhost:${this.port}/lyrics/progress`, {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                        signal: AbortSignal.timeout(2000)
                    });
                    if (!this._isConnected && response.ok) {
                        this.isConnected = true;
                    }
                } catch (e) {
                    if (this._isConnected) {
                        this.isConnected = false;
                    }
                }
            }
        },
        setupOffsetListener: {
            value: function () {
                // 중복 호출 방지
                if (this._offsetListenerSetup) return;
                this._offsetListenerSetup = true;

                this._storageListener = (e) => {
                    if (e.key && e.key.startsWith('lyrics-delay:')) {
                        this.resendWithNewOffset();
                    }
                };

                this._delayChangedListener = () => {
                    this.resendWithNewOffset();
                };

                this._offsetChangedListener = () => {
                    this.resendWithNewOffset();
                };

                this._lyricsReadyListener = (e) => {
                    if (!this.enabled) return;
                    const { trackInfo, lyrics } = e.detail || {};
                    if (trackInfo) {
                        helperDebug('[lyricsHelperSender] 가사 준비 이벤트 수신:', {
                            uri: trackInfo.uri,
                            title: trackInfo.title,
                            lines: lyrics?.length || 0
                        });
                        this.sendLyrics(trackInfo, lyrics || []);
                    }
                };

                this._visibilityChangeListener = () => {
                    if (document.visibilityState === 'visible' && this.enabled) {
                        helperDebug('[lyricsHelperSender] 페이지 활성화 - 가사 재전송');
                        setTimeout(() => this.resendWithNewOffset(), 200);
                    }
                };

                this._focusListener = () => {
                    if (this.enabled && this._lastTrackInfo) {
                        helperDebug('[lyricsHelperSender] 창 포커스 - 가사 재전송');
                        setTimeout(() => this.resendWithNewOffset(), 300);
                    }
                };

                this._songChangeListener = () => {
                    const previousUri = this._lastTrackInfo?.uri || this.lastSentUri || null;
                    // 캐시 초기화
                    this.lastSentUri = null;
                    this.lastSentLyrics = null;
                    this.lastSentOffset = null;
                    this._lastSentDedupeToken = null;
                    this.lastDeliveredUri = null;
                    this._deliveryGeneration += 1;
                    this._deliveryKey = null;
                    this._terminalDeliveryFailure = null;
                    this._pendingLyricsSend = null;
                    this._offsetCache = {};
                    this._lastProgressUri = null;
                    this._lastTrackInfo = null;
                    this._lastLyrics = null;

                    // 오버레이 활성화 상태가 아니면 스킵
                    if (!this.enabled) return;
                    // OverlaySender와 동일한 공용 타이머를 사용해 중복 조회하지 않는다.
                    helperDebug('[lyricsHelperSender] 곡 변경 - 현재 곡 가사 동기화 예약');
                    scheduleSenderBootstrap(150, previousUri);
                };

                window.addEventListener('storage', this._storageListener);
                window.addEventListener('ivLyrics:delay-changed', this._delayChangedListener);
                window.addEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
                window.addEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
                window.addEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
                document.addEventListener('visibilitychange', this._visibilityChangeListener);
                window.addEventListener('focus', this._focusListener);
                Spicetify.Player.addEventListener('songchange', this._songChangeListener);
            }
        },
        teardownOffsetListener: {
            value: function () {
                if (!this._offsetListenerSetup) return;
                this._offsetListenerSetup = false;

                if (this._storageListener) {
                    window.removeEventListener('storage', this._storageListener);
                    this._storageListener = null;
                }
                if (this._delayChangedListener) {
                    window.removeEventListener('ivLyrics:delay-changed', this._delayChangedListener);
                    this._delayChangedListener = null;
                }
                if (this._offsetChangedListener) {
                    window.removeEventListener('ivLyrics:offset-changed', this._offsetChangedListener);
                    window.removeEventListener('ivLyrics:global-offset-changed', this._offsetChangedListener);
                    this._offsetChangedListener = null;
                }
                if (this._lyricsReadyListener) {
                    window.removeEventListener('ivLyrics:lyrics-ready', this._lyricsReadyListener);
                    this._lyricsReadyListener = null;
                }
                if (this._visibilityChangeListener) {
                    document.removeEventListener('visibilitychange', this._visibilityChangeListener);
                    this._visibilityChangeListener = null;
                }
                if (this._focusListener) {
                    window.removeEventListener('focus', this._focusListener);
                    this._focusListener = null;
                }
                if (this._songChangeListener && typeof Spicetify.Player?.removeEventListener === 'function') {
                    try {
                        Spicetify.Player.removeEventListener('songchange', this._songChangeListener);
                    } catch (e) { }
                    this._songChangeListener = null;
                }
            }
        },
        startProgressSync: {
            value: function () {
                if (this._worker) return;
                if (!this.enabled) return;

                const blob = new Blob([`
                  let interval = null;
                  self.onmessage = function(e) {
                    if (e.data === 'start') {
                      if (interval) clearInterval(interval);
                      interval = setInterval(() => {
                        self.postMessage('tick');
                      }, 250);
                    } else if (e.data === 'stop') {
                      if (interval) clearInterval(interval);
                      interval = null;
                    }
                  };
                `], { type: 'application/javascript' });

                const workerUrl = URL.createObjectURL(blob);
                this._worker = new Worker(workerUrl);
                URL.revokeObjectURL(workerUrl);

                this._worker.onmessage = async () => {
                    if (!this.enabled) return;
                    if (this._isSendingProgress) return;
                    if (!this.isConnected && !this._isSettingsOpen) return;

                    // 전역 딜레이 변경 체크
                    if (typeof window.CONFIG !== 'undefined' && window.CONFIG.visual) {
                        if (this.lastConfigDelay === undefined) {
                            this.lastConfigDelay = window.CONFIG.visual.delay;
                        }
                        if (this.lastConfigDelay !== window.CONFIG.visual.delay) {
                            this.lastConfigDelay = window.CONFIG.visual.delay;
                            this.resendWithNewOffset();
                        }
                    }

                    this._isSendingProgress = true;
                    try {
                        const position = Utils.getSafePlayerProgress() || 0;
                        const duration = Spicetify.Player.getDuration() || 0;
                        const remaining = (duration - position) / 1000;

                        let currentTrack = null;
                        const currentUri = Spicetify.Player.data?.item?.uri;
                        if (currentUri && this._lastProgressUri !== currentUri) {
                            this._lastProgressUri = currentUri;
                            try {
                                const imageUrl = Spicetify.Player.data?.item?.metadata?.image_xlarge_url
                                    || Spicetify.Player.data?.item?.metadata?.image_url
                                    || Spicetify.Player.data?.item?.metadata?.image_large_url;
                                let albumArt = null;
                                albumArt = resolveSpotifyImageUrl(imageUrl);
                                currentTrack = {
                                    title: Spicetify.Player.data?.item?.metadata?.title || '',
                                    artist: Spicetify.Player.data?.item?.metadata?.artist_name || '',
                                    album: Spicetify.Player.data?.item?.metadata?.album_title || '',
                                    albumArt: albumArt
                                };
                            } catch (e) { }
                        }

                        let nextTrack = null;
                        try {
                            const queue = Spicetify.Queue;
                            if (queue?.nextTracks?.length > 0) {
                                const next = queue.nextTracks[0];
                                if (next?.contextTrack?.metadata) {
                                    const imageUrl = next.contextTrack.metadata.image_url || next.contextTrack.metadata.image_xlarge_url;
                                    const albumArt = resolveSpotifyImageUrl(imageUrl);
                                    nextTrack = {
                                        title: next.contextTrack.metadata.title || '',
                                        artist: next.contextTrack.metadata.artist_name || '',
                                        albumArt: albumArt
                                    };
                                }
                            }
                        } catch (e) { }

                        // 새로운 엔드포인트 사용: /lyrics/progress
                        await this.sendToEndpoint('/lyrics/progress', {
                            position: position,
                            isPlaying: getOverlayProgressIsPlaying(),
                            duration: duration,
                            remaining: remaining,
                            currentTrack: currentTrack,
                            nextTrack: nextTrack
                        });
                    } finally {
                        this._isSendingProgress = false;
                    }
                };

                this._worker.postMessage('start');
            }
        },
        stopProgressSync: {
            value: function () {
                if (!this._worker) return;
                cleanupWorker(this._worker);
                this._worker = null;
                this._isSendingProgress = false;
                this._lastProgressUri = null;
            }
        },
        scheduleConnectionCheck: {
            value: function () {
                if (this._connectionCheckTimer) {
                    clearTimeout(this._connectionCheckTimer);
                }

                if (!this.enabled) {
                    this._connectionCheckTimer = null;
                    return;
                }

                this._connectionCheckTimer = setTimeout(() => {
                    this._connectionCheckTimer = null;
                    this.checkConnection();
                }, 1000);
            }
        },
        syncRuntimeState: {
            value: function () {
                const enabled = !!this.enabled;
                if (this._runtimeEnabledState === enabled) {
                    return;
                }

                this._runtimeEnabledState = enabled;
                if (enabled) {
                    this.startProgressSync();
                    this.setupOffsetListener();
                    this.scheduleConnectionCheck();
                    scheduleSenderBootstrap();
                } else {
                    this.stopProgressSync();
                    this.teardownOffsetListener();
                    clearSettingsPolling(this);
                    this.lastSentUri = null;
                    this.lastSentLyrics = null;
                    this.lastSentOffset = null;
                    this._lastSentDedupeToken = null;
                    this.lastDeliveredUri = null;
                    this._deliveryGeneration += 1;
                    this._deliveryKey = null;
                    this._terminalDeliveryFailure = null;
                    this._pendingLyricsSend = null;
                    this._lastTrackInfo = null;
                    this._lastLyrics = null;
                    this._offsetCache = {};
                    this.isConnected = false;
                }
            }
        },
        setupRuntimeListener: {
            value: function () {
                if (this._runtimeListenerSetup) return;
                this._runtimeListenerSetup = true;

                this._runtimeStorageListener = () => {
                    this.syncRuntimeState();
                };
                this._runtimeEventListener = () => {
                    this.syncRuntimeState();
                };

                window.addEventListener('storage', this._runtimeStorageListener);
                window.addEventListener('ivLyrics', this._runtimeEventListener);
            }
        },
        teardownRuntimeListener: {
            value: function () {
                if (!this._runtimeListenerSetup) return;
                this._runtimeListenerSetup = false;

                if (this._runtimeStorageListener) {
                    window.removeEventListener('storage', this._runtimeStorageListener);
                    this._runtimeStorageListener = null;
                }
                if (this._runtimeEventListener) {
                    window.removeEventListener('ivLyrics', this._runtimeEventListener);
                    this._runtimeEventListener = null;
                }
                if (this._connectionCheckTimer) {
                    clearTimeout(this._connectionCheckTimer);
                    this._connectionCheckTimer = null;
                }
            }
        },
        checkConnection: {
            value: async function () {
                if (!this.enabled) return false;

                try {
                    // /lyrics/progress 엔드포인트로 연결 확인
                    const response = await fetch(`http://localhost:${this.port}/lyrics/progress`, {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ position: 0, isPlaying: false }),
                        signal: AbortSignal.timeout(1000)
                    });
                    this.isConnected = response.ok;
                    return this.isConnected;
                } catch (e) {
                    this.isConnected = false;
                    return false;
                }
            }
        },
        init: {
            value: function () {
                if (this._initialized) return;
                this._initialized = true;
                this.setupRuntimeListener();
                this.syncRuntimeState();
                helperDebug('[lyricsHelperSender] Initialized in Extension');
            }
        },
        destroy: {
            value: function () {
                this.stopProgressSync();
                this.teardownOffsetListener();
                this.teardownRuntimeListener();
                clearSettingsPolling(this);
            }
        }
    });


    window.LyricsService = LyricsService;

    // OverlaySender 초기화 및 전역 등록
    OverlaySender.init();
    window.OverlaySender = OverlaySender;

    lyricsHelperSender.init();
    window.lyricsHelperSender = lyricsHelperSender;

    serviceDebug("[LyricsService] LyricsService Extension initialized successfully!");
    serviceDebug("[LyricsService] Available APIs: window.LyricsService, window.LyricsCache, window.ApiTracker, window.Translator, window.OverlaySender, window.lyricsHelperSender");
})();
