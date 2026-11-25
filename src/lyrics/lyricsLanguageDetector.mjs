import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";
import { LanguageRefiner } from "./lyricsLanguageRules.mjs";

export function createLyricsLanguageDetector({ languageModel, readSetting }) {
    return {
        _langDetectCache: new Map(),
        _maxLangCacheSize: 500,

        _cacheLanguageResult(cacheKey, result) {
            if (this._langDetectCache.size >= this._maxLangCacheSize) {
                const firstKey = this._langDetectCache.keys().next().value;
                this._langDetectCache.delete(firstKey);
            }
            this._langDetectCache.set(cacheKey, result);
        },

        detectLanguage(lyrics) {
            if (!lyrics || !Array.isArray(lyrics) || lyrics.length === 0) {
                return null;
            }
            const lines = lyrics
                .map((line) => {
                    if (!line) return "";
                    if (typeof line === "string") return line;
                    if (typeof line === "object" && !line.$$typeof) return String(line.originalText || line.text || "");
                    return typeof line === "object" ? "" : String(line);
                })
                .flatMap((line) => line.split(/\r\n?|\n/u))
                .map((line) => line.trim().normalize("NFC"))
                .filter((line) => line && !LanguageRefiner.isCreditLine(line));
            if (lines.length === 0) {
                return null;
            }

            // The model loads in the background on first use; answers given
            // before it arrives are cached apart so they are revisited later.
            const model = languageModel.get();
            if (!model) languageModel.load();
            const cacheKey = `lang:${getTranslationSourceCacheHash(lines.join("\n"))}:${model ? "model" : "rules"}`;
            if (this._langDetectCache.has(cacheKey)) {
                return this._langDetectCache.get(cacheKey);
            }
            const result = LanguageRefiner.detect(lines, {
                model,
                scoreByRules: () => this.detectLanguageByRules(lines),
            }) || null;
            this._cacheLanguageResult(cacheKey, result);
            return result;
        },

        // The original rule-based detector: script line votes, kana/hangul and
        // simplified/traditional analysis for CJK, and stopword scoring for 14
        // Latin-script languages. LanguageRefiner builds on it.
        detectLanguageByRules(lyrics) {
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

            // extractTextSafely can hand back a non-string when a line carries
            // an unexpected shape, so coerce before anything iterates it.
            const extractLineText = (line) => String(extractTextSafely(line) ?? "");

            const textLines = lyrics.map(extractLineText);
            const rawLyrics = textLines.join(" ");
            if (!rawLyrics.trim()) {
                return null;
            }

            // Keyed on the whole lyric rather than on its opening 200
            // characters. Two songs that share an opening -- a repeated intro,
            // a long instrumental tag, the same sampled hook -- were served
            // each other's cached verdict.
            // Line boundaries participate because script ownership is voted
            // line by line; identical flattened text can have another verdict.
            const cacheKey = `rules:${getTranslationSourceCacheHash(textLines.join("\n"))}`;
            if (this._langDetectCache.has(cacheKey)) {
                return this._langDetectCache.get(cacheKey);
            }

            // Language detection regex patterns
            // Character-level so the CJK counts are comparable: the previous
            // Hangul pattern matched whole words while every other matcher
            // matched single characters, and the Kana pattern included CJK
            // punctuation, which inflated the kana-to-han ratio that separates
            // Japanese from Chinese.
            const kanaRegex = /[\u3040-\u30FF\uFF66-\uFF9F]/gu;
            const hangulRegex = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/gu;
            const simpRegex = /[万与丑专业丛东丝丢两严丧个丬丰临为丽举么义乌乐乔习乡书买乱争于亏云亘亚产亩亲亵亸亿仅从仑仓仪们价众优伙会伛伞伟传伤伥伦伧伪伫体余佣佥侠侣侥侦侧侨侩侪侬俣俦俨俩俪俭债倾偬偻偾偿傥傧储傩儿兑兖党兰关兴兹养兽冁内冈册写军农冢冯冲决况冻净凄凉凌减凑凛几凤凫凭凯击凼凿刍划刘则刚创删别刬刭刽刿剀剂剐剑剥剧劝办务劢动励劲劳势勋勐勚匀匦匮区医华协单卖卢卤卧卫却卺厂厅历厉压厌厍厕厢厣厦厨厩厮县参叆叇双发变叙叠叶号叹叽吁后吓吕吗吣吨听启吴呒呓呕呖呗员呙呛呜咏咔咙咛咝咤咴咸哌响哑哒哓哔哕哗哙哜哝哟唛唝唠唡唢唣唤唿啧啬啭啮啰啴啸喷喽喾嗫呵嗳嘘嘤嘱噜噼嚣嚯团园囱围囵国图圆圣圹场坂坏块坚坛坜坝坞坟坠垄垅垆垒垦垧垩垫垭垯垱垲垴埘埙埚埝埯堑堕塆墙壮声壳壶壸处备复够头夸夹夺奁奂奋奖奥妆妇妈妩妪妫姗姜娄娅娆娇娈娱娲娴婳婴婵婶媪嫒嫔嫱嬷孙学孪宁宝实宠审宪宫宽宾寝对寻导寿将尔尘尧尴尸尽层屃屉届属屡屦屿岁岂岖岗岘岙岚岛岭岳岽岿峃峄峡峣峤峥峦崂崃崄崭嵘嵚嵛嵝嵴巅巩巯币帅师帏帐帘帜带帧帮帱帻帼幂幞干并广庄庆庐庑库应庙庞废庼廪开异弃张弥弪弯弹强归当录彟彦彻径徕御忆忏忧忾怀态怂怃怄怅怆怜总怼怿恋恳恶恸恹恺恻恼恽悦悫悬悭悯惊惧惨惩惫惬惭惮惯愍愠愤愦愿慑慭憷懑懒懔戆戋戏戗战戬户扎扑扦执扩扪扫扬扰抚抛抟抠抡抢护报担拟拢拣拥拦拧拨择挂挚挛挜挝挞挟挠挡挢挣挤挥挦捞损捡换捣据捻掳掴掷掸掺掼揸揽揿搀搁搂搅携摄摅摆摇摈摊撄撑撵撷撸撺擞攒敌敛数斋斓斗斩断无旧时旷旸昙昼昽显晋晒晓晔晕晖暂暧札术朴机杀杂权条来杨杩杰极构枞枢枣枥枧枨枪枫枭柜柠柽栀栅标栈栉栊栋栌栎栏树栖样栾桊桠桡桢档桤桥桦桧桨桩梦梼梾检棂椁椟椠椤椭楼榄榇榈榉槚槛槟槠横樯樱橥橱橹橼檐檩欢欤欧歼殁殇残殒殓殚殡殴毁毂毕毙毡毵氇气氢氩氲汇汉污汤汹沓沟没沣沤沥沦沧沨沩沪沵泞泪泶泷泸泺泻泼泽泾洁洒洼浃浅浆浇浈浉浊测浍济浏浐浑浒浓浔浕涂涌涛涝涞涟涠涡涢涣涤润涧涨涩淀渊渌渍渎渐渑渔渖渗温游湾湿溃溅溆溇滗滚滞滟滠满滢滤滥滦滨滩滪漤潆潇潋潍潜潴澜濑濒灏灭灯灵灾灿炀炉炖炜炝点炼炽烁烂烃烛烟烦烧烨烩烫烬热焕焖焘煅煳熘爱爷牍牦牵牺犊犟状犷犸犹狈狍狝狞独狭狮狯狰狱狲猃猎猕猡猪猫猬献獭玑玙玚玛玮环现玱玺珉珏珐珑珰珲琎琏琐琼瑶瑷璇璎瓒瓮瓯电画畅畲畴疖疗疟疠疡疬疮疯疱疴痈痉痒痖痨痪痫痴瘅瘆瘗瘘瘪瘫瘾瘿癞癣癫癯皑皱皲盏盐监盖盗盘眍眦眬着睁睐睑瞒瞩矫矶矾矿砀码砖砗砚砜砺砻砾础硁硅硕硖硗硙硚确硷碍碛碜碱碹磙礼祎祢祯祷祸禀禄禅离秃秆种积称秽秾稆税稣稳穑穷窃窍窑窜窝窥窦窭竖竞笃笋笔笕笺笼笾筑筚筛筜筝筹签简箓箦箧箨箩箪箫篑篓篮篱簖籁籴类籼粜粝粤粪粮糁糇紧絷纟纠纡红纣纤纥约级纨纩纪纫纬纭纮纯纰纱纲纳纴纵纶纷纸纹纺纻纼纽纾线绀绁绂练组绅细织终绉绊绋绌绍绎经绐绑绒结绔绕绖绗绘给绚绛络绝绞统绠绡绢绣绤绥绦继绨绩绪绫绬续绮绯绰绱绲绳维绵绶绷绸绹绺绻综绽绾绿缀缁缂缃缄缅缆缇缈缉缊缋缌缍缎缏缐缑缒缓缔缕编缗缘缙缚缛缜缝缞缟缠缡缢缣缤缥缦缧缨缩缪缫缬缭缮缯缰缱缲缳缴缵罂网罗罚罢罴羁羟羡翘翙翚耢耧耸耻聂聋职聍联聵聽聰肅腸膚膁腎腫脹脅膽勝朧腖臚脛膠脈膾髒臍腦膿臠腳脫腡臉臘醃膕齶膩靦膃騰臏臢輿艤艦艙艫艱豔艸藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇檾蘋莖蘢蔦塋煢繭荊薦薘莢蕘蓽蕎薈薺蕩榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞蓧萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蕆蕢蔣蔞藍薊蘺蕷鎣驀薔蘞藺藹蘄蘊藪槁蘚虜慮虛蟲虯虮雖蝦蠆蝕蟻螞蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑螿蟎蠨釁銜補襯袞襖嫋褘襪襲襏裝襠褌褳襝褲襇褸襤繈襴見觀覎規覓視覘覽覺覬覡覿覥覦覯覲覷觴觸觶讋譽謄訁計訂訃認譏訐訌討讓訕訖訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖穀豶貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗讚贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋踴躊蹤躓躑躡蹣躕躥躪躦軀車軋軌軑軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞輬輟輜輳輻輯轀輸轡轅轄輾轆轍轔辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郤郟鄶鄭鄆酈鄖鄲醞醱醬釅釃釀釋裏钜鑒鑾鏨釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鈍鈔鍾鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈹鐸鉶銬銠鉺銪鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺錯錨錡錁錕錩錫錮鑼錘錐錦鍁錈錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鏌鎮鎛鎘鑷鐫鎳鎿鎦鎬鎊鎰鎔鏢鏜鏍鏰鏞鏡鏑鏃鏇鏐鐔钁鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑲長門閂閃閆閈閉問闖閏闈閑閎間閔閌悶閘鬧閨聞闼閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸雋難雛讎靂霧霽黴靄靚靜靨韃鞽韉韝韋韌韍韓韙韞韜韻页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞飨餍饤饥饦饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓魇魉鱼鱽鱾鱿鲀鲁鲂鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳛鳜鳝鳞鳟鳠鳡鳢鳣鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹖鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹯鹰鹱鹲鹳鹴鹾麦麸黄黉黡黩黪黾鼋鼌鼍鼗鼹齄齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟志制咨只里系范松没尝尝闹面准钟别闲干尽脏拼]/gu;
            const tradRegex = /[萬與醜專業叢東絲丟兩嚴喪個爿豐臨為麗舉麼義烏樂喬習鄉書買亂爭於虧雲亙亞產畝親褻嚲億僅從侖倉儀們價眾優夥會傴傘偉傳傷倀倫傖偽佇體餘傭僉俠侶僥偵側僑儈儕儂俁儔儼倆儷儉債傾傯僂僨償儻儐儲儺兒兌兗黨蘭關興茲養獸囅內岡冊寫軍農塚馮衝決況凍淨淒涼淩減湊凜幾鳳鳧憑凱擊氹鑿芻劃劉則剛創刪別剗剄劊劌剴劑剮劍剝劇勸辦務勱動勵勁勞勣勳猛勩勻匭匱區醫華協單賣盧鹵臥衛卻巹廠廳曆厲壓厭厙廁廂厴廈廚廄廝縣參靉靆雙發變敘疊葉號歎嘰籲後嚇呂嗎唚噸聽啟吳嘸囈嘔嚦唄員咼嗆嗚詠哢嚨嚀噝吒噅鹹呱響啞噠嘵嗶噦嘩噲嚌噥喲嘜嗊嘮啢嗩唕喚呼嘖嗇囀齧囉嘽嘯噴嘍嚳囁嗬噯噓嚶囑嚕劈囂謔團園囪圍圇國圖圓聖壙場阪壞塊堅壇壢壩塢墳墜壟壟壚壘墾坰堊墊埡墶壋塏堖塒塤堝墊垵塹墮壪牆壯聲殼壺壼處備複夠頭誇夾奪奩奐奮獎奧妝婦媽嫵嫗媯姍薑婁婭嬈嬌孌娛媧嫻嫿嬰嬋嬸媼嬡嬪嬙嬤孫學孿寧寶實寵審憲宮寬賓寢對尋導壽將爾塵堯尷屍盡層屭屜屆屬屢屨嶼歲豈嶇崗峴嶴嵐島嶺嶽崠巋嶨嶧峽嶢嶠崢巒嶗崍嶮嶄嶸嶔崳嶁脊巔鞏巰幣帥師幃帳簾幟帶幀幫幬幘幗冪襆幹並廣莊慶廬廡庫應廟龐廢廎廩開異棄張彌弳彎彈強歸當錄彠彥徹徑徠禦憶懺憂愾懷態慫憮慪悵愴憐總懟懌戀懇惡慟懨愷惻惱惲悅愨懸慳憫驚懼慘懲憊愜慚憚慣湣慍憤憒願懾憖怵懣懶懍戇戔戲戧戰戬戶紮撲扡執擴捫掃揚擾撫拋摶摳掄搶護報擔擬攏揀擁攔擰撥擇掛摯攣掗撾撻挾撓擋撟掙擠揮撏撈損撿換搗據撚擄摑擲撣摻摜摣攬撳攙擱摟攪攜攝攄擺搖擯攤攖撐攆擷擼攛擻攢敵斂數齋斕鬥斬斷無舊時曠暘曇晝曨顯晉曬曉曄暈暉暫曖劄術樸機殺雜權條來楊榪傑極構樅樞棗櫪梘棖槍楓梟櫃檸檉梔柵標棧櫛櫳棟櫨櫟欄樹棲樣欒棬椏橈楨檔榿橋樺檜槳樁夢檮棶檢欞槨櫝槧欏橢樓欖櫬櫚櫸檟檻檳櫧橫檣櫻櫫櫥櫓櫞簷檁歡歟歐殲歿殤殘殞殮殫殯毆毀轂畢斃氈毿氌氣氫氬氲彙漢汙湯洶遝溝沒灃漚瀝淪滄渢溈滬濔濘淚澩瀧瀘濼瀉潑澤涇潔灑窪浹淺漿澆湞溮濁測澮濟瀏滻渾滸濃潯濜塗湧濤澇淶漣潿渦溳渙滌潤澗漲澀澱淵淥漬瀆漸澠漁瀋滲溫遊灣濕潰濺漵漊潷滾滯灩灄滿瀅濾濫灤濱灘澦濫瀠瀟瀲濰潛瀦瀾瀨瀕灝滅燈靈災燦煬爐燉煒熗點煉熾爍爛烴燭煙煩燒燁燴燙燼熱煥燜燾煆糊溜愛爺牘犛牽犧犢強狀獷獁猶狽麅獮獰獨狹獅獪猙獄猻獫獵獼玀豬貓蝟獻獺璣璵瑒瑪瑋環現瑲璽瑉玨琺瓏璫琿璡璉瑣瓊瑤璦璿瓔瓚甕甌電畫暢佘疇癤療瘧癘瘍鬁瘡瘋皰屙癰痙癢瘂癆瘓癇癡癉瘮瘞瘺癟癱癮癭癩癬癲臒皚皺皸盞鹽監蓋盜盤瞘眥矓著睜睞瞼瞞矚矯磯礬礦碭碼磚硨硯碸礪礱礫礎硜矽碩硤磽磑礄確鹼礙磧磣堿镟滾禮禕禰禎禱禍稟祿禪離禿稈種積稱穢穠穭稅穌穩穡窮竊竅窯竄窩窺竇窶豎競篤筍筆筧箋籠籩築篳篩簹箏籌簽簡籙簀篋籜籮簞簫簣簍籃籬籪籟糴類秈糶糲粵糞糧糝餱緊縶糸糾紆紅紂纖紇約級紈纊紀紉緯紜紘純紕紗綱納紝縱綸紛紙紋紡紵紖紐紓線紺絏紱練組紳細織終縐絆紼絀紹繹經紿綁絨結絝繞絰絎繪給絢絳絡絕絞統綆綃絹繡綌綏絛繼綈績緒綾緓續綺緋綽緔緄繩維綿綬繃綢綯綹綣綜綻綰綠綴緇緙緗緘緬纜緹緲緝縕繢緦綞緞緶線緱縋緩締縷編緡緣縉縛縟縝縫縗縞纏縭縊縑繽縹縵縲纓縮繆繅纈繚繕繒韁繾繰繯繳纘罌網羅罰罷羆羈羥羨翹翽翬耮耬聳恥聶聾職聹聯聵聽聰肅腸膚膁腎腫脹脅膽勝朧腖臚脛膠脈膾髒臍腦膿臠腳脫腡臉臘醃膕齶膩靦膃騰臏臢輿艤艦艙艫艱豔艸藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇檾蘋莖蘢蔦塋煢繭荊薦薘莢蕘蓽蕎薈薺蕩榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞蓧萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蕆蕢蔣蔞藍薊蘺蕷鎣驀薔蘞藺藹蘄蘊藪槁蘚虜慮虛蟲虯虮雖蝦蠆蝕蟻螞蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑螿蟎蠨釁銜補襯袞襖嫋褘襪襲襏裝襠褌褳襝褲襇褸襤繈襴見觀覎規覓視覘覽覺覬覡覿覥覦覯覲覷觴觸觶讋譽謄訁計訂訃認譏訐訌討讓訕訖訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖穀豶貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗讚贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋踴躊蹤躓躑躡蹣躕躥躪躦軀車軋軌軑軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞輬輟輜輳輻輯轀輸轡轅轄輾轆轍轔辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郤郟鄶鄭鄆酈鄖鄲醞醱醬釅釃釀釋裏钜鑒鑾鏨釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鈍鈔鍾鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈹鐸鉶銬銠鉺銪鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺錯錨錡錁錕錩錫錮鑼錘錐錦鍁錈錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鏌鎮鎛鎘鑷鐫鎳鎿鎦鎬鎊鎰鎔鏢鏜鏍鏰鏞鏡鏑鏃鏇鏐鐔钁鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑲長門閂閃閆閈閉問闖閏闈閑閎間閔閌悶閘鬧閨聞闼閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸雋難雛讎靂霧霽黴靄靚靜靨韃鞽韉韝韋韌韍韓韙韞韜韻页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞飨餍饤饥饦饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓魇魉鱼鱽鱾鱿鲀鲁鲂鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳛鳜鳝鳞鳟鳠鳡鳢鳣鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹖鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹯鹰鹱鹲鹳鹴鹾麦麸黄黉黡黩黪黾鼋鼌鼍鼗鼹齄齐齑齿龀龁龂龃龄龅龆龇龈龉龊龋龌龙龚龛龟志制咨只里系范松没尝尝闹面准钟别闲干尽脏拼]/gu;
            const hanziRegex = /\p{Script=Han}/gu;
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
            const czechRegex = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/gu;
            const czechUniqueRegex = /[ěĚřŘůŮ]/gu;
            const arabicRegex = /[\u0600-\u06FF]/gu;
            // Persian shares the Arabic block, so it is only separable by the
            // letters Arabic does not use: peh, tcheh, jeh, gaf, keheh, farsi yeh.
            const persianUniqueRegex = /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/gu;
            const latinExtendedRegex = /\p{Script=Latin}/gu;
            const latinWordRegex = /\p{Script=Latin}+(?:['’]\p{Script=Latin}+)?/gu;

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
            const czechMatch = rawLyrics.match(czechRegex);
            const czechUniqueMatch = rawLyrics.match(czechUniqueRegex);
            const arabicMatch = rawLyrics.match(arabicRegex);
            const persianUniqueMatch = rawLyrics.match(persianUniqueRegex);
            const latinMatch = rawLyrics.match(latinExtendedRegex);
            const normalizedLatinLyrics = rawLyrics.toLowerCase().normalize("NFC");
            const latinWords = normalizedLatinLyrics.match(latinWordRegex) || [];

            const detectLatinLanguageByScore = () => {
                if (latinWords.length < 4) {
                    if (/\b(aku cinta kamu|aku sayang kamu|cinta kamu)\b/u.test(normalizedLatinLyrics)) return "id";
                    if (/\b(aku sayang awak|saya sayang awak|cinta awak)\b/u.test(normalizedLatinLyrics)) return "ms";
                    // Fragments still get scored below on a lower bar. Bailing
                    // out here sent every short line to the English catch-all.
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
                    cs: {
                        strong: ["já", "ty", "jsme", "jste", "není", "nejsem", "jsem", "jsi", "můj", "moje", "tvůj", "tvoje", "láska", "srdce", "noc", "tebe", "tobě", "chci", "mám"],
                        weak: ["a", "ale", "nebo", "že", "se", "si", "do", "na", "pro", "s", "z", "když", "jen", "už", "jak"]
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
                    },
                    vi: {
                        strong: ["anh", "em", "tôi", "không", "của", "yêu", "đêm", "một", "những", "người", "biết", "quên", "được", "thương", "nhớ", "lòng", "đời", "mãi"],
                        weak: ["và", "cho", "với", "này", "khi", "rồi", "vẫn", "chỉ", "đã", "sẽ", "lại", "thêm"]
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
                scores.cs += charBonus(/[ěřů]/gu, 5) + charBonus(/[čďňšťž]/gu, 2);
                scores.sv += charBonus(/[å]/gu, 5) + charBonus(/[äö]/gu, 1);
                // ê, è, ù and û are shared with Vietnamese, which uses them far
                // more densely. Only credit French for them when no Vietnamese-
                // only letter is present, otherwise Vietnamese lyrics collect a
                // large French bonus with nothing to offset it.
                const vietnameseSignal = vietnameseUniqueMatch ? vietnameseUniqueMatch.length : 0;
                scores.vi += vietnameseSignal * 3;
                // ç, œ, æ, ë, ï and ÿ are distinctively French. ê, è, ù and û
                // are shared with Italian and Portuguese, which use them just
                // as densely -- Italian "è" is the copula and appears in almost
                // every line -- so crediting them to French at full weight
                // handed French any Romance lyric with enough accents, even
                // when the correct language led the word scoring outright.
                scores.fr += charBonus(/[æœçëïÿ]/gu, 3) + (vietnameseSignal ? 0 : charBonus(/[êèùû]/gu, 1));
                scores.es += charBonus(/[ñ¿¡]/gu, 5) + charBonus(/[áéíóú]/gu, 1);
                scores.pt += charBonus(/[ãõ]/gu, 5) + charBonus(/[ç]/gu, 1);
                scores.pl += charBonus(/[ąćęłńśźż]/gu, 5);

                if (/\b(ich bin|du bist|ich hab|ich habe|du hast|wir sind|es ist|nicht mehr|für dich|mit dir)\b/u.test(normalizedLatinLyrics)) {
                    scores.de += 4;
                }
                if (/\b(i am|you are|don't|can't|with you|for you|my heart)\b/u.test(normalizedLatinLyrics)) {
                    scores.en += 4;
                }

                // English is the only candidate written in plain ASCII, so every
                // accented letter is evidence against it. Function words overlap
                // heavily between languages ("no" scores for English and Spanish
                // alike), which let a short English hook outscore the language
                // the rest of the song is actually written in. Capped so that a
                // stray loanword in a genuinely English lyric cannot sink it.
                const accentedLetterCount = (normalizedLatinLyrics.match(/\P{ASCII}/gu) || []).length;
                scores.en -= Math.min(accentedLetterCount, 8);
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

                // Languages whose orthography effectively always carries
                // diacritics should not win on text that has none. Lyric
                // providers serve a lot of romanized transcriptions (romaji,
                // romanized Hindi), and without this they get claimed by
                // whichever European language their vowel pattern happens to
                // fit -- so the UI then offers an unrelated conversion. Halved
                // rather than vetoed so that strong word evidence still wins.
                // English, Indonesian, Malay and Dutch are excluded: those are
                // legitimately written without diacritics.
                const diacriticBearing = {
                    es: /[áéíóúüñ¿¡]/u,
                    cs: /[áčďéěíňóřšťúůýž]/u,
                    fr: /[àâæçéèêëïîôùûüÿœ]/u,
                    it: /[àèéìòù]/u,
                    pl: /[ąćęłńóśźż]/u,
                    pt: /[ãõáàâéêíóôúüç]/u,
                    tr: /[çğıöşü]/u,
                    de: /[äöüß]/u,
                    sv: /[åäö]/u,
                    vi: /[đươăạảấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/u
                };
                // Applied only where the word evidence is thin. Genuine lyrics
                // hit their own function words densely even when an accent
                // never appears, while a romanized transcription only collects
                // scattered accidental matches; across the sampled songs the
                // two populations do not overlap (genuine text bottoms out
                // around 0.22 hits per word, romanized text peaks near 0.17).
                // Gating on that keeps the adjustment from overturning a real
                // majority: four French lines against one German line must stay
                // French, whatever accents the French happens to carry.
                const leadingScore = Math.max(...Object.values(scores));
                const evidenceDensity = leadingScore / (latinWords.length || 1);
                if (latinWords.length >= 8 && evidenceDensity < 0.2) {
                    Object.entries(diacriticBearing).forEach(([lang, pattern]) => {
                        if (scores[lang] > 0 && !pattern.test(normalizedLatinLyrics)) {
                            scores[lang] = Math.floor(scores[lang] / 2);
                        }
                    });
                }

                const sorted = Object.entries(scores).sort((left, right) => right[1] - left[1]);
                const [bestLang, bestScore] = sorted[0];
                const nextScore = sorted[1]?.[1] || 0;
                // A fragment cannot clear the bar set for running text, so it is
                // judged on whether it contains a distinctive word at all.
                const minScore = latinWords.length < 4 ? 2 : (latinWords.length < 8 ? 4 : 5);

                if (bestScore >= minScore && bestScore - nextScore >= 2) {
                    return bestLang;
                }

                // Close relatives such as Indonesian and Malay share most of
                // their vocabulary and routinely tie. Returning null here used
                // to fall through to the English catch-all, answering with a
                // language that never scored at all -- the leader is a better
                // answer than English whenever anything scored meaningfully.
                if (bestScore >= minScore) {
                    return bestLang;
                }
                return null;
            };

            // ---- Weigh the evidence -----------------------------------------
            // Each candidate is scored on how much of the lyric text it accounts
            // for, and the strongest wins. This replaces an ordered chain of
            // early returns in which whichever check ran first won outright: a
            // single foreign glyph in a hook could relabel an entire song, and
            // the raw-count thresholds did not scale with lyric length.

            const hangulCount = (rawLyrics.match(hangulRegex) || []).length;
            const kanaCount = (rawLyrics.match(kanaRegex) || []).length;
            const hanChars = rawLyrics.match(hanziRegex) || [];
            const cjkCharCount = hangulCount + kanaCount + hanChars.length;


            // A song's actual language covers a meaningful share of the text.
            // A borrowed hook, a loanword or a stray glyph does not.
            const NON_LATIN_LINE_SHARE = 0.15;
            const NON_LATIN_MIN_LINES = 3;

            const resolveCjkLanguage = () => {
                // Korean is the only CJK language that uses Hangul at all.
                if (hangulCount / cjkCharCount >= 0.2) {
                    return "ko";
                }

                const jaThreshold = Number(readSetting("ivLyrics:visual:ja-detect-threshold")) || 40;
                const kanaPercentage = kanaCount / cjkCharCount;
                const hanziPercentage = hanChars.length / cjkCharCount;
                if (((kanaPercentage - hanziPercentage + 1) / 2) * 100 >= jaThreshold) {
                    return "ja";
                }

                // `.test()` on a /g/ regex advances lastIndex between calls, so
                // the shared simplified/traditional matchers need non-global
                // copies to classify one character at a time.
                const simpTestRegex = new RegExp(simpRegex.source, "u");
                const tradTestRegex = new RegExp(tradRegex.source, "u");

                // The two character classes are not disjoint: more than half of
                // each also appears in the other. Counting a glyph that matches
                // both as evidence for both made shared characters look like
                // distinguishing evidence, which is enough to hold common
                // traditional text at exactly the simplified threshold. Only
                // glyphs exclusive to one class carry information here.
                let simpCount = 0;
                let tradCount = 0;
                hanChars.forEach((glyph) => {
                    const isSimp = simpTestRegex.test(glyph);
                    const isTrad = tradTestRegex.test(glyph);
                    if (isSimp && !isTrad) simpCount++;
                    else if (isTrad && !isSimp) tradCount++;
                });

                const distinguishing = simpCount + tradCount;
                const hansThreshold = Number(readSetting("ivLyrics:visual:hans-detect-threshold")) || 40;
                if (distinguishing === 0) {
                    return "zh-hans";
                }
                const simpPercentage = simpCount / distinguishing;
                const tradPercentage = tradCount / distinguishing;
                return ((simpPercentage - tradPercentage + 1) / 2) * 100 >= hansThreshold ? "zh-hans" : "zh-hant";
            };

            // Which script owns the lyric is decided by counting lines, not
            // characters. Character counts are not comparable across scripts:
            // a Han or Hangul glyph carries roughly a syllable where a Latin
            // character carries a letter, so a song can hold fewer CJK
            // characters than its English hook and still be a Korean song.
            // Counting lines also means one ordinary line in another language
            // cannot outvote the rest of the lyric, which a share of total
            // characters could -- Latin was not among the candidates at all,
            // so any non-Latin script clearing the bar won outright.
            // Non-global copies: .test() on a /g/ regex advances lastIndex
            // between calls and would misclassify every other character.
            const hanziTestRegex = new RegExp(hanziRegex.source, "u");
            const latinTestRegex = new RegExp(latinExtendedRegex.source, "u");

            const scriptOfLine = (text) => {
                const counts = { latin: 0, cjk: 0, ru: 0, ar: 0, th: 0, hi: 0, bn: 0 };
                for (const character of text) {
                    const code = character.codePointAt(0);
                    if (code >= 0x0980 && code <= 0x09FF) counts.bn++;
                    else if (code >= 0x0900 && code <= 0x097F) counts.hi++;
                    else if (code >= 0x0E00 && code <= 0x0E7F) counts.th++;
                    else if (code >= 0x0600 && code <= 0x06FF) counts.ar++;
                    else if (code >= 0x0400 && code <= 0x04FF) counts.ru++;
                    else if (
                        (code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F) ||
                        (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x3040 && code <= 0x30FF) ||
                        (code >= 0xFF66 && code <= 0xFF9F) || hanziTestRegex.test(character)
                    ) counts.cjk++;
                    else if (latinTestRegex.test(character)) counts.latin++;
                }
                const ranked = Object.entries(counts).sort((left, right) => right[1] - left[1]);
                return ranked[0][1] > 0 ? ranked[0][0] : null;
            };

            const lineVotes = new Map();
            for (const line of lyrics) {
                const script = scriptOfLine(extractLineText(line));
                if (script) lineVotes.set(script, (lineVotes.get(script) || 0) + 1);
            }

            // A borrowed hook is one or two lines out of many, whereas a song
            // that genuinely mixes languages carries its own script throughout.
            // A non-Latin script therefore claims the lyric on holding a large
            // enough share of the lines, not on holding the most: Korean pop
            // routinely has more English lines than Korean ones and is still
            // Korean.
            const scriptCandidates = [...lineVotes.entries()].sort((left, right) => right[1] - left[1]);
            const totalLineVotes = [...lineVotes.values()].reduce((sum, n) => sum + n, 0) || 1;
            const nonLatinCandidates = scriptCandidates.filter(([script]) => script !== "latin");
            const [dominantScript, dominantVotes] = nonLatinCandidates.length ? nonLatinCandidates[0] : [null, 0];

            // The line floor only makes sense once there are enough lines for
            // something to be a hook: a one-line fragment in another script is
            // simply that language, not a borrowed hook in a longer lyric.
            const hookFloorApplies = totalLineVotes >= 4;

            if (
                dominantScript &&
                (!hookFloorApplies || dominantVotes >= NON_LATIN_MIN_LINES) &&
                (dominantVotes / totalLineVotes) >= NON_LATIN_LINE_SHARE
            ) {
                let resolved = dominantScript;

                if (dominantScript === "cjk") {
                    resolved = resolveCjkLanguage();
                } else if (dominantScript === "ar") {
                    // Persian is written in the Arabic block and is separable
                    // only by the letters Arabic itself does not use. Measured
                    // as a share of the Arabic-block text rather than as a raw
                    // count: Arabic lyrics occasionally carry a stray Persian
                    // letter form, while genuine Persian is dense with them.
                    // Across 121 sampled songs the populations separate cleanly
                    // -- Arabic peaks at 0.055, Persian starts at 0.087.
                    const persianCount = persianUniqueMatch ? persianUniqueMatch.length : 0;
                    const arabicCount = arabicMatch ? arabicMatch.length : 0;
                    resolved = arabicCount > 0 && (persianCount / arabicCount) >= 0.07 ? "fa" : "ar";
                }

                this._cacheLanguageResult(cacheKey, resolved);
                return resolved;
            }

            // ---- Latin scripts ----------------------------------------------
            const latinScoreLanguage = detectLatinLanguageByScore();
            if (latinScoreLanguage) {
                this._cacheLanguageResult(cacheKey, latinScoreLanguage);
                return latinScoreLanguage;
            }

            // Stopword scoring needs running text. When it cannot decide, fall
            // back to diacritics, weighting letters only one language uses far
            // above letters several languages share.
            const countOf = (match) => (match ? match.length : 0);

            const computeDiacriticFallbackCandidates = () => [
                ["vi", countOf(vietnameseUniqueMatch) * 3 + countOf(vietnameseMatch)],
                ["cs", countOf(czechUniqueMatch) * 3 + countOf(czechMatch)],
                ["tr", countOf(turkishUniqueMatch) * 3 + countOf(turkishMatch)],
                ["sv", countOf(swedishUniqueMatch) * 3 + countOf(swedishMatch)],
                ["de", countOf(germanUniqueMatch) * 3 + countOf(germanMatch)],
                ["fr", countOf(frenchUniqueMatch) * 3 + countOf(frenchMatch)],
                ["pl", countOf(polishMatch) * 2],
                ["pt", countOf(portugueseMatch)],
                ["es", countOf(spanishMatch)]
            ].sort((left, right) => right[1] - left[1]);

            const diacriticCandidates = computeDiacriticFallbackCandidates();
            const [diacriticLanguage, diacriticScore] = diacriticCandidates[0];
            if (diacriticScore >= 4) {
                this._cacheLanguageResult(cacheKey, diacriticLanguage);
                return diacriticLanguage;
            }

            // Latin text carrying no distinguishing signal is more often English
            // than anything else, but only answer at all when there is enough
            // text to have been judged.
            if (latinMatch && latinMatch.length > 2) {
                this._cacheLanguageResult(cacheKey, "en");
                return "en";
            }

            this._cacheLanguageResult(cacheKey, null);
            return null;
        }
    };
}
