// ============================================
// LyricsService Extension for ivLyrics
// 가사, 번역, 발음을 불러오는 시스템을 Extension 형태로 분리
// Spotify의 모든 페이지에서 작동 가능
// ============================================

(function LyricsServiceExtension() {
    "use strict";

    // Spicetify가 준비될 때까지 대기
    if (!window.Spicetify || !Spicetify.LocalStorage) {
        setTimeout(LyricsServiceExtension, 300);
        return;
    }

    console.log("[LyricsService] Initializing LyricsService Extension...");

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
    const Utils = {
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

            const rawLyrics = lyrics.map(extractTextSafely).join(" ");
            if (!rawLyrics || rawLyrics.length === 0) {
                return null;
            }

            const cacheKey = rawLyrics.substring(0, 200);
            if (this._langDetectCache.has(cacheKey)) {
                return this._langDetectCache.get(cacheKey);
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
            const germanCharsRegex = /[äöüßÄÖÜ]/gu;
            const spanishRegex = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/gu;
            const frenchRegex = /[àâæçéèêëïîôùûüÿœÀÂÆÇÉÈÊËÏÎÔÙÛÜŸŒ]/gu;
            const frenchUniqueRegex = /[æœçëïÿÆŒÇËÏŸ]/gu;
            const portugueseRegex = /[ãõáàâéêíóôõúüçÃÕÁÀÂÉÊÍÓÔÕÚÜÇ]/gu;
            const turkishRegex = /[çğıöşüÇĞİÖŞÜ]/gu;
            const polishRegex = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gu;
            const arabicRegex = /[\u0600-\u06FF]/gu;
            const thaiRegex = /[\u0E00-\u0E7F]/gu;
            const devanagariRegex = /[\u0900-\u097F]/gu;
            const latinExtendedRegex = /[a-zA-ZÀ-ÿ]/gu;

            const cjkMatch = rawLyrics.match(
                new RegExp(`${kanaRegex.source}|${hanziRegex.source}|${hangulRegex.source}`, "gu")
            );

            const cyrillicMatch = rawLyrics.match(cyrillicRegex);
            const vietnameseMatch = rawLyrics.match(vietnameseRegex);
            const vietnameseUniqueMatch = rawLyrics.match(vietnameseUniqueRegex);
            const germanMatch = rawLyrics.match(germanCharsRegex);
            const spanishMatch = rawLyrics.match(spanishRegex);
            const frenchMatch = rawLyrics.match(frenchRegex);
            const frenchUniqueMatch = rawLyrics.match(frenchUniqueRegex);
            const portugueseMatch = rawLyrics.match(portugueseRegex);
            const turkishMatch = rawLyrics.match(turkishRegex);
            const polishMatch = rawLyrics.match(polishRegex);
            const arabicMatch = rawLyrics.match(arabicRegex);
            const thaiMatch = rawLyrics.match(thaiRegex);
            const hindiMatch = rawLyrics.match(devanagariRegex);
            const latinMatch = rawLyrics.match(latinExtendedRegex);

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
            if (turkishMatch && turkishMatch.length > 3) {
                this._cacheLanguageResult(cacheKey, "tr");
                return "tr";
            }
            // Polish
            if (polishMatch && polishMatch.length > 3) {
                this._cacheLanguageResult(cacheKey, "pl");
                return "pl";
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
            const entry = this._logs.find(l => l.id === logId);
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

        _getTranslationKey(trackId, lang, isPhonetic, provider) {
            const providerSuffix = provider ? `:${provider}` : '';
            return `${trackId}:${lang}:${isPhonetic ? 'phonetic' : 'translation'}${providerSuffix}`;
        },

        async getTranslation(trackId, lang, isPhonetic = false, provider = null) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('translations', 'readonly');
                const store = tx.objectStore('translations');
                const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider);

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

        async setTranslation(trackId, lang, isPhonetic, data, provider = null) {
            try {
                const db = await this._openDB();
                const tx = db.transaction('translations', 'readwrite');
                const store = tx.objectStore('translations');
                const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider);

                store.put({
                    cacheKey,
                    trackId,
                    lang,
                    isPhonetic,
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

                console.log('[LyricsCache] Cleanup completed');
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
                const stores = ['lyrics', 'translations', 'youtube', 'metadata', 'tmi'];

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
                const stores = ['lyrics', 'translations', 'youtube', 'metadata', 'tmi'];
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
    // ProviderLRCLIB - LRCLIB API 제공자
    // ============================================
    const ProviderLRCLIB = (() => {
        // LRC 파싱 유틸리티 (Utils.parseLocalLyrics 대체)
        function parseLRC(lrc) {
            const lines = lrc.split('\n');
            const synced = [];
            const unsynced = [];

            for (const line of lines) {
                const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                if (match) {
                    const minutes = parseInt(match[1], 10);
                    const seconds = parseInt(match[2], 10);
                    const milliseconds = match[3].length === 2
                        ? parseInt(match[3], 10) * 10
                        : parseInt(match[3], 10);
                    const startTime = (minutes * 60 + seconds) * 1000 + milliseconds;
                    const text = match[4].trim();

                    synced.push({ startTime, text });
                    unsynced.push({ text });
                } else if (line.trim() && !line.startsWith('[')) {
                    unsynced.push({ text: line.trim() });
                }
            }

            return { synced: synced.length > 0 ? synced : null, unsynced };
        }

        async function findLyrics(info) {
            const baseURL = "https://lrclib.net/api/get";
            const durr = info.duration / 1000;
            const params = {
                track_name: info.title,
                artist_name: info.artist,
                album_name: info.album,
                duration: durr,
            };

            const finalURL = `${baseURL}?${Object.keys(params)
                .map((key) => `${key}=${encodeURIComponent(params[key])}`)
                .join("&")}`;

            const body = await fetch(finalURL, {
                headers: {
                    "x-user-agent": `spicetify v${Spicetify.Config.version} (https://github.com/spicetify/cli)`,
                },
            });

            if (body.status !== 200) {
                return {
                    error: "Request error: Track wasn't found",
                    uri: info.uri,
                };
            }

            return await body.json();
        }

        function getUnsynced(body) {
            const unsyncedLyrics = body?.plainLyrics;
            const isInstrumental = body.instrumental;
            if (isInstrumental) return [{ text: "♪ Instrumental ♪" }];

            if (!unsyncedLyrics) return null;

            return parseLRC(unsyncedLyrics).unsynced;
        }

        function getSynced(body) {
            const syncedLyrics = body?.syncedLyrics;
            const isInstrumental = body.instrumental;
            if (isInstrumental) return [{ text: "♪ Instrumental ♪" }];

            if (!syncedLyrics) return null;

            return parseLRC(syncedLyrics).synced;
        }

        return { findLyrics, getSynced, getUnsynced };
    })();

    window.ProviderLRCLIB = ProviderLRCLIB;

    // ============================================
    // ProviderIvLyrics - ivLyrics API 제공자
    // ============================================
    const ProviderIvLyrics = (() => {
        // LRC 파싱 유틸리티 (Utils.parseLocalLyrics 대체)
        function parseLRC(lrc) {
            const lines = lrc.split('\n');
            const synced = [];
            const unsynced = [];

            for (const line of lines) {
                const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                if (match) {
                    const minutes = parseInt(match[1], 10);
                    const seconds = parseInt(match[2], 10);
                    const milliseconds = match[3].length === 2
                        ? parseInt(match[3], 10) * 10
                        : parseInt(match[3], 10);
                    const startTime = (minutes * 60 + seconds) * 1000 + milliseconds;
                    const text = match[4].trim();

                    synced.push({ startTime, text });
                    unsynced.push({ text });
                } else if (line.trim() && !line.startsWith('[')) {
                    unsynced.push({ text: line.trim() });
                }
            }

            return { synced: synced.length > 0 ? synced : null, unsynced };
        }

        // getUserHash 유틸리티
        function getUserHash() {
            let userHash = Spicetify.LocalStorage.get("ivLyrics:userHash");
            if (!userHash) {
                // 간단한 해시 생성
                userHash = 'user_' + Math.random().toString(36).substring(2, 15);
                Spicetify.LocalStorage.set("ivLyrics:userHash", userHash);
            }
            return userHash;
        }

        async function findLyrics(info) {
            const trackId = info.uri.split(":")[2];

            // ApiTracker에 현재 트랙 설정
            if (window.ApiTracker) {
                window.ApiTracker.setCurrentTrack(trackId);
            }

            // 1. 로컬 캐시 먼저 확인
            try {
                const cached = await LyricsCache.getLyrics(trackId, 'ivlyrics');
                if (cached) {
                    if (window.ApiTracker) {
                        window.ApiTracker.logCacheHit('lyrics', `lyrics:${trackId}`, {
                            provider: cached.provider,
                            lyrics_type: cached.lyrics_type,
                            lineCount: cached.synced?.length || cached.unsynced?.length || 0
                        });
                    }
                    return cached;
                }
            } catch (e) {
                console.warn('[ProviderIvLyrics] Cache check failed:', e);
            }

            // 2. API 호출
            const userHash = getUserHash();
            const baseURL = `https://lyrics.api.ivl.is/lyrics?trackId=${trackId}&userHash=${userHash}`;

            let logId = null;
            if (window.ApiTracker) {
                logId = window.ApiTracker.logRequest('lyrics', baseURL, { trackId, userHash });
            }

            try {
                const body = await fetch(baseURL, {
                    headers: {
                        "User-Agent": `spicetify v${Spicetify.Config.version} (https://github.com/spicetify/cli)`,
                    },
                    cache: "no-cache",
                });

                if (body.status !== 200) {
                    const errorResult = {
                        error: "Request error: Track wasn't found",
                        uri: info.uri,
                    };
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, { status: body.status }, 'error', `HTTP ${body.status}`);
                    }
                    return errorResult;
                }

                const response = await body.json();

                if (response.error) {
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, response, 'error', response.error);
                    }
                    return {
                        error: response.error,
                        uri: info.uri,
                    };
                }

                if (window.ApiTracker && logId) {
                    window.ApiTracker.logResponse(logId, {
                        provider: response.provider,
                        lyrics_type: response.lyrics_type,
                        source: response.source,
                        lineCount: response.synced?.length || response.unsynced?.length || 0
                    }, 'success');
                }

                // 3. 로컬 캐시에 저장
                LyricsCache.setLyrics(trackId, 'ivlyrics', response).catch(() => { });

                return response;
            } catch (e) {
                if (window.ApiTracker && logId) {
                    window.ApiTracker.logResponse(logId, null, 'error', e.message);
                }
                throw e;
            }
        }

        function getUnsynced(body) {
            if (body.error) return null;

            if (body.lyrics_type === "synced") {
                const parsed = parseLRC(body.lyrics);
                return parsed.unsynced;
            } else if (body.lyrics_type === "unsynced") {
                return parseLRC(body.lyrics).unsynced;
            } else if (body.lyrics_type === "word_by_word") {
                const lyrics = JSON.parse(body.lyrics);
                return lyrics.map(line => ({
                    text: line.x
                }));
            }

            return null;
        }

        function getSynced(body) {
            if (body.error) return null;

            if (body.lyrics_type === "synced") {
                const parsed = parseLRC(body.lyrics);
                return parsed.synced;
            } else if (body.lyrics_type === "word_by_word") {
                const lyrics = JSON.parse(body.lyrics);
                return lyrics.map(line => ({
                    startTime: Math.round(line.ts * 1000),
                    text: line.x
                }));
            }

            return null;
        }

        function getKaraoke(body) {
            if (body.error) return null;

            if (body.lyrics_type === "word_by_word") {
                const lyrics = JSON.parse(body.lyrics);
                const result = lyrics.map(line => {
                    const lineStartTime = Math.round(line.ts * 1000);
                    const lineEndTime = Math.round(line.te * 1000);

                    if (!line.l || line.l.length === 0) {
                        return {
                            startTime: lineStartTime,
                            endTime: lineEndTime,
                            text: line.x,
                            syllables: [{
                                text: line.x,
                                startTime: lineStartTime,
                                endTime: lineEndTime
                            }]
                        };
                    }

                    const vocalGroups = [];
                    let currentGroup = [];
                    let lastEndTime = 0;

                    line.l.forEach((syllable, index) => {
                        const syllableStartTime = Math.round((line.ts + syllable.o) * 1000);
                        const nextSyllable = line.l[index + 1];
                        const syllableEndTime = nextSyllable
                            ? Math.round((line.ts + nextSyllable.o) * 1000)
                            : lineEndTime;

                        const gap = syllableStartTime - lastEndTime;
                        const isNewVocalGroup = gap > 500 && currentGroup.length > 0;

                        if (isNewVocalGroup) {
                            vocalGroups.push([...currentGroup]);
                            currentGroup = [];
                        }

                        currentGroup.push({
                            text: syllable.c,
                            startTime: syllableStartTime,
                            endTime: syllableEndTime
                        });

                        lastEndTime = syllableEndTime;
                    });

                    if (currentGroup.length > 0) {
                        vocalGroups.push(currentGroup);
                    }

                    if (vocalGroups.length > 1) {
                        return {
                            startTime: lineStartTime,
                            endTime: lineEndTime,
                            text: line.x,
                            vocals: {
                                lead: {
                                    startTime: vocalGroups[0][0].startTime,
                                    endTime: vocalGroups[0][vocalGroups[0].length - 1].endTime,
                                    syllables: vocalGroups[0]
                                },
                                background: vocalGroups.slice(1).map(group => ({
                                    startTime: group[0].startTime,
                                    endTime: group[group.length - 1].endTime,
                                    syllables: group
                                }))
                            }
                        };
                    } else {
                        return {
                            startTime: lineStartTime,
                            endTime: lineEndTime,
                            text: line.x,
                            syllables: vocalGroups[0] || [{
                                text: line.x,
                                startTime: lineStartTime,
                                endTime: lineEndTime
                            }]
                        };
                    }
                });

                return result;
            }

            return null;
        }

        return { findLyrics, getSynced, getUnsynced, getKaraoke };
    })();

    window.ProviderIvLyrics = ProviderIvLyrics;

    // ============================================
    // Providers - 가사 제공자 통합
    // ============================================
    const Providers = {
        spotify: async (info) => {
            const result = {
                uri: info.uri,
                karaoke: null,
                synced: null,
                unsynced: null,
                provider: "Spotify",
                copyright: null,
            };

            const baseURL = "https://spclient.wg.spotify.com/color-lyrics/v2/track/";
            const id = info.uri.split(":")[2];
            let body;
            try {
                body = await Spicetify.CosmosAsync.get(
                    `${baseURL + id}?format=json&vocalRemoval=false&market=from_token`
                );
            } catch {
                return { error: "Request error", uri: info.uri };
            }

            const lyrics = body.lyrics;
            if (!lyrics) {
                return { error: "No lyrics", uri: info.uri };
            }

            const lines = lyrics.lines;
            if (lyrics.syncType === "LINE_SYNCED") {
                result.synced = lines.map((line) => ({
                    startTime: parseInt(line.startTimeMs, 10) || 0,
                    text: line.words,
                }));
                result.unsynced = result.synced;
            } else {
                result.unsynced = lines.map((line) => ({
                    text: line.words,
                }));
            }

            return result;
        },

        lrclib: async (info) => {
            const result = {
                uri: info.uri,
                karaoke: null,
                synced: null,
                unsynced: null,
                provider: "lrclib",
                copyright: null,
            };

            let list;
            try {
                list = await ProviderLRCLIB.findLyrics(info);
            } catch {
                result.error = "No lyrics";
                return result;
            }

            const synced = ProviderLRCLIB.getSynced(list);
            if (synced) {
                result.synced = synced;
            }

            const unsynced = synced || ProviderLRCLIB.getUnsynced(list);

            if (unsynced) {
                result.unsynced = unsynced;
            }

            return result;
        },

        ivlyrics: async (info) => {
            const result = {
                uri: info.uri,
                karaoke: null,
                synced: null,
                unsynced: null,
                provider: "ivLyrics",
                copyright: null,
            };

            let body;
            try {
                body = await ProviderIvLyrics.findLyrics(info);
                if (body.error) {
                    throw "";
                }
            } catch {
                result.error = "No lyrics";
                return result;
            }

            const synced = ProviderIvLyrics.getSynced(body);
            if (synced) {
                result.synced = synced;
            }

            const unsynced = synced || ProviderIvLyrics.getUnsynced(body);
            if (unsynced) {
                result.unsynced = unsynced;
            }

            const karaoke = ProviderIvLyrics.getKaraoke(body);
            if (karaoke) {
                result.karaoke = karaoke;
            }

            return result;
        },

        local: (info) => {
            let result = {
                uri: info.uri,
                karaoke: null,
                synced: null,
                unsynced: null,
                provider: "local",
            };

            try {
                const savedLyrics = JSON.parse(
                    Spicetify.LocalStorage.get("ivLyrics:local-lyrics") || "{}"
                );
                const lyrics = savedLyrics[info.uri];
                if (!lyrics) {
                    throw "";
                }

                result = {
                    ...result,
                    ...lyrics,
                };
            } catch {
                result.error = "No lyrics";
            }

            return result;
        },
    };

    window.Providers = Providers;

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

        // 제공자 접근
        providers: Providers,

        // 언어 감지 (Extension 내 Utils에서 직접 참조)
        detectLanguage(lyrics) {
            return Utils.detectLanguage(lyrics);
        },

        /**
         * 가사 가져오기
         * @param {Object} info - 트랙 정보 (uri, title, artist, album, duration)
         * @param {string} providerName - 제공자 이름 (spotify, lrclib, ivlyrics, local)
         * @returns {Promise<Object>} - 가사 결과
         */
        async getLyrics(info, providerName = 'ivlyrics') {
            if (!Providers[providerName]) {
                throw new Error(`Unknown provider: ${providerName}`);
            }
            return await Providers[providerName](info);
        },

        /**
         * 여러 제공자에서 순차적으로 가사 가져오기
         * @param {Object} info - 트랙 정보
         * @param {string[]} providerOrder - 제공자 순서 배열
         * @param {number} mode - 가사 모드 (0: karaoke, 1: synced, 2: unsynced)
         * @returns {Promise<Object>} - 가사 결과
         */
        async getLyricsFromProviders(info, providerOrder = ['ivlyrics', 'spotify', 'lrclib', 'local'], mode = 1) {
            for (const providerName of providerOrder) {
                if (!Providers[providerName]) continue;

                try {
                    const result = await Providers[providerName](info);

                    if (result.error) continue;

                    // 모드에 따라 적절한 가사가 있는지 확인
                    if (mode === 0 && result.karaoke) return result;
                    if (mode === 1 && result.synced) return result;
                    if (mode === 2 && result.unsynced) return result;

                    // 대체 가사가 있으면 반환
                    if (result.synced || result.unsynced || result.karaoke) return result;
                } catch (e) {
                    console.warn(`[LyricsService] Provider ${providerName} failed:`, e);
                    continue;
                }
            }

            return { error: "No lyrics found", uri: info.uri };
        },

        /**
         * 캐시된 가사 가져오기
         * @param {string} trackId - 트랙 ID
         * @param {string} provider - 제공자 이름
         * @returns {Promise<Object|null>} - 캐시된 가사 또는 null
         */
        async getCachedLyrics(trackId, provider = 'ivlyrics') {
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
        async getTranslation(trackId, lang, isPhonetic = false, provider = null) {
            return await LyricsCache.getTranslation(trackId, lang, isPhonetic, provider);
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
        async cacheTranslation(trackId, lang, isPhonetic, data, provider = null) {
            return await LyricsCache.setTranslation(trackId, lang, isPhonetic, data, provider);
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
                trackId: item.uri?.split(':')[2]
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
                sendToOverlay = true,
                providerOrder = ['ivlyrics', 'spotify', 'lrclib', 'local']
            } = options;

            try {
                // 1. 가사 가져오기
                const lyricsResult = await this.getLyricsFromProviders(info, providerOrder, 1);

                if (lyricsResult.error) {
                    // 가사 없음 - 오버레이에 트랙 정보만 전송
                    if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                        await window.OverlaySender.sendLyrics(
                            { uri: info.uri, title: info.title, artist: info.artist },
                            [],
                            true
                        );
                    }
                    return { lyrics: [], provider: null, error: lyricsResult.error };
                }

                // 2. 가사 선택 (synced, karaoke, unsynced 순)
                let lyrics = lyricsResult.synced || lyricsResult.karaoke || lyricsResult.unsynced || [];
                const provider = lyricsResult.provider;

                if (lyrics.length === 0) {
                    if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                        await window.OverlaySender.sendLyrics(
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
                const translationProvider = Spicetify.LocalStorage.get("ivLyrics:visual:translate:translated-lyrics-source") || "geminiKo";
                const modeKey = translationProvider === "geminiKo" && !friendlyLanguage ? "gemini" : friendlyLanguage;

                // 설정 키: translation-mode:japanese, translation-mode-2:japanese 등
                if (mode1 === null) {
                    mode1 = Spicetify.LocalStorage.get(`ivLyrics:visual:translation-mode:${modeKey}`) || "none";
                }
                if (mode2 === null) {
                    mode2 = Spicetify.LocalStorage.get(`ivLyrics:visual:translation-mode-2:${modeKey}`) || "none";
                }

                console.log('[LyricsService] 언어 감지:', { detectedLanguage, friendlyLanguage, modeKey, mode1, mode2 });

                // 5. 발음/번역 요청 (설정에 따라)
                const needsTranslation = mode1 !== "none" || mode2 !== "none";

                if (needsTranslation && window.Translator?.callGemini) {
                    console.log('[LyricsService] 발음/번역 요청:', { mode1, mode2 });

                    try {
                        // Gemini API를 통한 발음/번역 요청
                        const lyricsText = lyrics.map(l => l.text || '').join('\n');

                        // 발음 요청 (mode1 = gemini_romaji)
                        let pronResult = null;
                        if (mode1 && mode1 !== 'none' && String(mode1).startsWith('gemini')) {
                            const wantPhonetic = mode1 === 'gemini_romaji';
                            const response = await window.Translator.callGemini({
                                trackId: info.uri?.split(':')[2],
                                artist: info.artist,
                                title: info.title,
                                text: lyricsText,
                                wantSmartPhonetic: wantPhonetic,
                                provider: provider
                            });
                            pronResult = wantPhonetic ? response.phonetic : response.vi;
                        }

                        // 번역 요청 (mode2 = gemini_ko 등)
                        let transResult = null;
                        if (mode2 && mode2 !== 'none' && String(mode2).startsWith('gemini')) {
                            const wantPhonetic = mode2 === 'gemini_romaji';
                            const response = await window.Translator.callGemini({
                                trackId: info.uri?.split(':')[2],
                                artist: info.artist,
                                title: info.title,
                                text: lyricsText,
                                wantSmartPhonetic: wantPhonetic,
                                provider: provider
                            });
                            transResult = wantPhonetic ? response.phonetic : response.vi;
                        }

                        // 결과 병합
                        if (pronResult || transResult) {
                            const pronLines = Array.isArray(pronResult) ? pronResult : (pronResult ? pronResult.split('\n') : []);
                            const transLines = Array.isArray(transResult) ? transResult : (transResult ? transResult.split('\n') : []);

                            lyrics = lyrics.map((line, idx) => {
                                const originalText = line.text || '';
                                const pronText = pronLines[idx]?.trim() || null;
                                const transText = transLines[idx]?.trim() || null;

                                return {
                                    ...line,
                                    originalText: pronText ? originalText : (line.originalText || originalText),
                                    text: pronText || originalText,
                                    text2: transText,
                                    translation: transText,
                                    translationText: transText
                                };
                            });

                            console.log('[LyricsService] 발음/번역 완료');
                        }
                    } catch (translationError) {
                        console.warn('[LyricsService] 발음/번역 실패:', translationError);
                        // 발음/번역 실패해도 원본 가사는 반환
                    }
                }

                // 6. 오버레이 전송
                if (sendToOverlay && window.OverlaySender?.sendLyrics) {
                    await window.OverlaySender.sendLyrics(
                        { uri: info.uri, title: info.title, artist: info.artist },
                        lyrics,
                        true
                    );
                }

                // 6. 이벤트 발생
                this.emit('lyrics-loaded', {
                    trackInfo: info,
                    lyrics,
                    provider,
                    hasTranslation: mode1 !== 'none' || mode2 !== 'none'
                });

                return { lyrics, provider, error: null };
            } catch (e) {
                console.error('[LyricsService] getFullLyrics 실패:', e);
                return { lyrics: [], provider: null, error: e.message };
            }
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

    // 전역 요청 상태 관리 (중복 요청 방지)
    const _translatorInflightRequests = new Map();
    const _translatorPendingRetries = new Map();

    // 진행 중인 요청 키 생성
    function getTranslatorRequestKey(trackId, wantSmartPhonetic, lang) {
        return `${trackId}:${wantSmartPhonetic ? 'phonetic' : 'translation'}:${lang}`;
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
        return Spicetify.LocalStorage.get(key);
    }

    // Utils가 없을 경우 대체
    function getUserHash() {
        if (window.Utils && typeof window.Utils.getUserHash === 'function') {
            return window.Utils.getUserHash();
        }
        let userHash = Spicetify.LocalStorage.get("ivLyrics:userHash");
        if (!userHash) {
            userHash = 'user_' + Math.random().toString(36).substring(2, 15);
            Spicetify.LocalStorage.set("ivLyrics:userHash", userHash);
        }
        return userHash;
    }

    // 현재 언어 가져오기
    function getCurrentLanguage() {
        if (window.I18n && typeof window.I18n.getCurrentLanguage === 'function') {
            return window.I18n.getCurrentLanguage();
        }
        return Spicetify.Locale?.getLocale()?.split('-')[0] || 'en';
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
                finalTrackId = Spicetify.Player.data?.item?.uri?.split(':')[2];
            }
            if (!finalTrackId) {
                return null;
            }

            const apiKeyRaw = getStorageItem("ivLyrics:visual:gemini-api-key");
            if (!apiKeyRaw || apiKeyRaw.trim() === "") {
                return null;
            }

            let apiKeys = [];
            try {
                const trimmed = apiKeyRaw.trim();
                if (trimmed.startsWith('[')) {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        apiKeys = parsed;
                    } else {
                        apiKeys = [trimmed];
                    }
                } else {
                    apiKeys = [trimmed];
                }
            } catch (e) {
                console.warn("[Translator] Failed to parse API keys:", e);
                apiKeys = [apiKeyRaw];
            }

            apiKeys = apiKeys.filter(k => k && k.trim().length > 0);

            if (apiKeys.length === 0) {
                return null;
            }

            const userLang = getCurrentLanguage();
            const cacheKey = `${finalTrackId}:${userLang}`;

            if (!ignoreCache && this._metadataCache.has(cacheKey)) {
                return this._metadataCache.get(cacheKey);
            }

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

            if (this._metadataInflightRequests.has(cacheKey)) {
                return this._metadataInflightRequests.get(cacheKey);
            }

            const executeWithKey = async (apiKey, keyIndex) => {
                const url = "https://lyrics.api.ivl.is/lyrics/translate/metadata";

                let logId = null;
                if (window.ApiTracker) {
                    logId = window.ApiTracker.logRequest('metadata', url, {
                        trackId: finalTrackId,
                        title,
                        artist,
                        lang: userLang,
                        keyIndex: keyIndex + 1,
                        totalKeys: apiKeys.length
                    });
                }

                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify({
                        trackId: finalTrackId,
                        title,
                        artist,
                        lang: userLang,
                        apiKey,
                        ignore_cache: ignoreCache,
                    }),
                });

                if (response.status === 429 || response.status === 403) {
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, { status: response.status }, 'error', `HTTP ${response.status}`);
                    }
                    throw new Error(`${response.status} ${response.status === 429 ? 'Rate Limit' : 'Forbidden'}`);
                }

                if (!response.ok) {
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, { status: response.status }, 'error', `HTTP ${response.status}`);
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.error) {
                    const errorStr = typeof data.error === 'string' ? data.error : (data.message || JSON.stringify(data.error));
                    const isRateLimitError = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('quota');
                    const isForbiddenError = errorStr.includes('403') || errorStr.includes('Forbidden');

                    if (isRateLimitError || isForbiddenError) {
                        if (window.ApiTracker && logId) {
                            window.ApiTracker.logResponse(logId, data, 'error', errorStr);
                        }
                        throw new Error(errorStr);
                    }

                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, data, 'error', data.message || "Translation failed");
                    }
                    throw new Error(data.message || "Translation failed");
                }

                if (data.success && data.data) {
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, data.data, 'success');
                    }
                    return data.data;
                }

                if (window.ApiTracker && logId) {
                    window.ApiTracker.logResponse(logId, data, 'error', "No data returned");
                }
                return null;
            };

            const runWithRotation = async () => {
                let lastError = null;

                for (let i = 0; i < apiKeys.length; i++) {
                    const key = apiKeys[i];
                    try {
                        const result = await executeWithKey(key, i);
                        if (result) {
                            this._metadataCache.set(cacheKey, result);
                            LyricsCache.setMetadata(finalTrackId, userLang, result).catch(() => { });
                            return result;
                        }
                    } catch (error) {
                        lastError = error;
                        const isRateLimit = error.message.includes("429") || error.message.includes("Rate Limit");
                        const isForbidden = error.message.includes("403") || error.message.includes("Forbidden");

                        if (isRateLimit || isForbidden) {
                            console.warn(`[Translator] Metadata API Key ${key.substring(0, 8)}... failed. Rotating...`);
                            if (i === apiKeys.length - 1) break;
                            continue;
                        }

                        console.warn(`[Translator] Metadata translation failed:`, error.message);
                        return null;
                    }
                }

                console.warn(`[Translator] All API keys exhausted:`, lastError?.message);
                return null;
            };

            const requestPromise = runWithRotation().finally(() => {
                this._metadataInflightRequests.delete(cacheKey);
            });

            this._metadataInflightRequests.set(cacheKey, requestPromise);
            return requestPromise;
        }

        static getMetadataFromCache(trackId) {
            const userLang = getCurrentLanguage();
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
                hi: false, th: false, id: false,
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
        }) {
            if (!text?.trim()) throw new Error("No text provided for translation");

            const apiKeyRaw = getStorageItem("ivLyrics:visual:gemini-api-key");
            let apiKeys = [];

            try {
                if (apiKeyRaw) {
                    const trimmed = apiKeyRaw.trim();
                    if (trimmed.startsWith('[')) {
                        const parsed = JSON.parse(trimmed);
                        if (Array.isArray(parsed)) {
                            apiKeys = parsed;
                        } else {
                            apiKeys = [trimmed];
                        }
                    } else {
                        apiKeys = [trimmed];
                    }
                }
            } catch (e) {
                console.warn("Failed to parse API keys:", e);
                apiKeys = [apiKeyRaw];
            }

            apiKeys = apiKeys.filter(k => k && k.trim().length > 0);

            if (apiKeys.length === 0) {
                throw new Error(getTranslatorErrorMessage("translator.missingApiKey", "API key is required"));
            }

            let finalTrackId = trackId;
            if (!finalTrackId) {
                finalTrackId = Spicetify.Player.data?.item?.uri?.split(':')[2];
            }
            if (!finalTrackId) {
                throw new Error("No track ID available");
            }

            const userLang = getCurrentLanguage();

            if (!ignoreCache) {
                try {
                    const localCached = await LyricsCache.getTranslation(finalTrackId, userLang, wantSmartPhonetic, provider);
                    if (localCached) {
                        if (window.ApiTracker) {
                            window.ApiTracker.logCacheHit(
                                wantSmartPhonetic ? 'phonetic' : 'translation',
                                `${finalTrackId}:${userLang}`,
                                { lineCount: localCached.phonetic?.length || localCached.translation?.length || 0 }
                            );
                        }
                        return localCached;
                    }
                } catch (e) {
                    console.warn('[Translator] Local cache check failed:', e);
                }
            }

            const requestKey = getTranslatorRequestKey(finalTrackId, wantSmartPhonetic, userLang);

            if (!ignoreCache && _translatorInflightRequests.has(requestKey)) {
                return _translatorInflightRequests.get(requestKey);
            }

            const executeRequest = async (currentApiKey) => {
                const endpoints = ["https://lyrics.api.ivl.is/lyrics/translate"];
                const userHash = getUserHash();

                const body = {
                    trackId: finalTrackId,
                    artist,
                    title,
                    text,
                    wantSmartPhonetic,
                    provider,
                    apiKey: currentApiKey,
                    ignore_cache: ignoreCache,
                    lang: userLang,
                    userHash,
                };

                const category = wantSmartPhonetic ? 'phonetic' : 'translation';
                let logId = null;
                if (window.ApiTracker) {
                    logId = window.ApiTracker.logRequest(category, endpoints[0], {
                        trackId: finalTrackId,
                        artist,
                        title,
                        lang: userLang,
                        wantSmartPhonetic,
                        textLength: text?.length || 0
                    });
                }

                const tryFetch = async (url) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 800000);

                    try {
                        const res = await fetch(url, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Accept: "application/json",
                            },
                            body: JSON.stringify(body),
                            signal: controller.signal,
                            mode: "cors",
                        });

                        clearTimeout(timeoutId);
                        return res;
                    } catch (error) {
                        clearTimeout(timeoutId);
                        throw error;
                    }
                };

                try {
                    let res;
                    let lastError;

                    for (const url of endpoints) {
                        try {
                            res = await tryFetch(url);
                            if (res.ok) break;
                        } catch (error) {
                            lastError = error;
                            continue;
                        }
                    }

                    if (!res || !res.ok) {
                        if (res) {
                            const errorData = await res.json().catch(() => ({ message: "Unknown error" }));

                            if (res.status === 202 && errorData.status === "translation_in_progress") {
                                if (_translatorPendingRetries.has(requestKey)) {
                                    return _translatorPendingRetries.get(requestKey);
                                }

                                const retryPromise = new Promise((resolve, reject) => {
                                    const retryDelay = Math.min((errorData.retry_after || 5) * 1000, 30000);
                                    const maxRetries = 20;
                                    let retryCount = 0;

                                    const pollStatus = async () => {
                                        retryCount++;

                                        try {
                                            const statusUrl = `https://lyrics.api.ivl.is/lyrics/translate?action=status&trackId=${finalTrackId}&lang=${userLang}&isPhonetic=${wantSmartPhonetic}`;
                                            const statusRes = await fetch(statusUrl);
                                            const statusData = await statusRes.json();

                                            if (statusData.status === "completed") {
                                                _translatorPendingRetries.delete(requestKey);
                                                const result = await window.Translator.callGemini({
                                                    trackId: finalTrackId,
                                                    artist,
                                                    title,
                                                    text,
                                                    wantSmartPhonetic,
                                                    provider,
                                                    ignoreCache: false,
                                                });
                                                resolve(result);
                                                return;
                                            } else if (statusData.status === "failed" || statusData.status === "not_found") {
                                                _translatorPendingRetries.delete(requestKey);
                                                reject(new Error(statusData.message || "Translation failed"));
                                                return;
                                            }

                                            if (retryCount < maxRetries) {
                                                setTimeout(pollStatus, retryDelay);
                                            } else {
                                                _translatorPendingRetries.delete(requestKey);
                                                reject(new Error("Translation timeout"));
                                            }
                                        } catch (pollError) {
                                            if (retryCount < maxRetries) {
                                                setTimeout(pollStatus, retryDelay);
                                            } else {
                                                _translatorPendingRetries.delete(requestKey);
                                                reject(pollError);
                                            }
                                        }
                                    };

                                    setTimeout(pollStatus, retryDelay);
                                });

                                _translatorPendingRetries.set(requestKey, retryPromise);
                                return retryPromise;
                            }

                            if (res.status === 429) throw new Error("429 Rate Limit Exceeded");
                            if (res.status === 403) throw new Error("403 Forbidden");
                            if (errorData.error && errorData.message) throw new Error(errorData.message);
                            throw new Error(`HTTP ${res.status}`);
                        }

                        throw lastError || new Error("All endpoints failed");
                    }

                    const data = await res.json();

                    if (data.error) {
                        const errorStr = typeof data.error === 'string' ? data.error : (data.message || JSON.stringify(data.error));
                        const isRateLimitError = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED');
                        const isForbiddenError = errorStr.includes('403') || errorStr.includes('Forbidden');

                        if (isRateLimitError) throw new Error(`429 Rate Limit: ${errorStr}`);
                        if (isForbiddenError) throw new Error(`403 Forbidden: ${errorStr}`);
                        throw new Error(data.message || "Translation failed");
                    }

                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, {
                            lineCount: data.phonetic?.length || data.translation?.length || 0,
                            cached: false
                        }, 'success');
                    }

                    LyricsCache.setTranslation(finalTrackId, userLang, wantSmartPhonetic, data, provider).catch(() => { });

                    return data;
                } catch (error) {
                    if (window.ApiTracker && logId) {
                        window.ApiTracker.logResponse(logId, null, 'error', error.message);
                    }
                    throw error;
                }
            };

            const runWithRotation = async () => {
                let lastError;
                for (let i = 0; i < apiKeys.length; i++) {
                    const key = apiKeys[i];
                    try {
                        return await executeRequest(key);
                    } catch (error) {
                        lastError = error;
                        const isRateLimit = error.message.includes("429") || error.message.includes("Rate Limit");
                        const isForbidden = error.message.includes("403") || error.message.includes("Forbidden");

                        if (isRateLimit || isForbidden) {
                            console.warn(`[Translator] API Key ${key.substring(0, 8)}... failed. Rotating...`);
                            if (i === apiKeys.length - 1) break;
                            continue;
                        }

                        throw error;
                    }
                }
                throw new Error(`Translation failed: ${lastError ? lastError.message : "All keys failed"}`);
            };

            const requestPromise = runWithRotation().finally(() => {
                _translatorInflightRequests.delete(requestKey);
            });

            if (!ignoreCache) {
                _translatorInflightRequests.set(requestKey, requestPromise);
            }

            return requestPromise;
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

    const OverlaySender = {
        DEFAULT_PORT: 15000,
        progressInterval: null,
        lastSentUri: null,
        lastSentLyrics: null,
        lastSentOffset: null,
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

        // 포트 설정 (localStorage에 저장)
        get port() {
            const savedPort = Spicetify.LocalStorage.get('ivLyrics:overlay-port');
            return savedPort ? parseInt(savedPort, 10) : this.DEFAULT_PORT;
        },
        set port(value) {
            const portNum = parseInt(value, 10);
            if (portNum >= 1024 && portNum <= 65535) {
                Spicetify.LocalStorage.set('ivLyrics:overlay-port', portNum.toString());
                this.isConnected = false;
                this.checkConnection();
            }
        },

        // 설정 (localStorage에 저장)
        get enabled() {
            return Spicetify.LocalStorage.get('ivLyrics:overlay-enabled') !== 'false';
        },
        set enabled(value) {
            Spicetify.LocalStorage.set('ivLyrics:overlay-enabled', value ? 'true' : 'false');
            if (value) {
                this.startProgressSync();
                this.checkConnection();
            } else {
                this.stopProgressSync();
            }
        },

        setSettingsOpen(isOpen) {
            this._isSettingsOpen = isOpen;
            if (this._settingsTimer) {
                clearInterval(this._settingsTimer);
                this._settingsTimer = null;
            }

            if (isOpen) {
                console.log('[OverlaySender] 설정창 열림 - 연결 확인 폴링 시작');
                this.checkConnection();
                this._settingsTimer = setInterval(() => {
                    if (!this.isConnected) {
                        this.checkConnection();
                    }
                }, 2000);
            } else {
                console.log('[OverlaySender] 설정창 닫힘 - 연결 확인 폴링 종료');
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
                console.log('[OverlaySender] 오버레이 연결됨 ✓');
                setTimeout(() => this.resendWithNewOffset(), 100);
            }
            else if (!value && wasConnected) {
                console.log('[OverlaySender] 오버레이 연결 끊김');
            }
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

            try {
                const response = await fetch(`http://localhost:${this.port}${endpoint}`, {
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
        },

        // 싱크 오프셋 가져오기
        async getSyncOffset(uri) {
            let offset = 0;

            // 1. 전역 딜레이 설정 (CONFIG가 로드되면)
            if (typeof window.CONFIG !== 'undefined' && window.CONFIG.visual && typeof window.CONFIG.visual.delay === 'number') {
                offset += window.CONFIG.visual.delay;
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

        async sendLyrics(trackInfo, lyrics, forceResend = false) {
            if (!trackInfo || !lyrics || !Array.isArray(lyrics)) return;
            if (!this.enabled) return;

            const currentReqId = ++this._reqId;

            this._lastTrackInfo = trackInfo;
            this._lastLyrics = lyrics;

            const offset = await this.getSyncOffset(trackInfo.uri);

            if (currentReqId < this._lastReqId) {
                console.log(`[OverlaySender] 오래된 요청 무시됨 (#${currentReqId} < #${this._lastReqId})`);
                return;
            }
            this._lastReqId = currentReqId;

            const lyricsHash = JSON.stringify(lyrics);

            if (!forceResend &&
                this.lastSentUri === trackInfo.uri &&
                this.lastSentLyrics === lyricsHash &&
                this.lastSentOffset === offset) {
                return;
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
                if (imageUrl && imageUrl.indexOf('localfile') === -1) {
                    if (imageUrl.startsWith('spotify:image:')) {
                        albumArt = `https://i.scdn.co/image/${imageUrl.substring(imageUrl.lastIndexOf(':') + 1)}`;
                    } else if (imageUrl.startsWith('http')) {
                        albumArt = imageUrl;
                    }
                }
            } catch (e) { }

            const mappedLines = lyrics.map(l => {
                const originalText = l.originalText || l.text || '';
                const pronText = (l.text && l.text !== l.originalText && l.text !== originalText) ? l.text : null;
                let transText = l.text2 || l.translation || l.translationText || null;
                if (transText && typeof transText === 'string' && transText.trim() === '') {
                    transText = null;
                }
                if (transText && transText === originalText) {
                    transText = null;
                }

                // startTime과 endTime을 숫자로 안전하게 변환
                const startTimeNum = typeof l.startTime === 'number' ? l.startTime : (parseInt(l.startTime, 10) || 0);
                const endTimeNum = l.endTime != null ? (typeof l.endTime === 'number' ? l.endTime : (parseInt(l.endTime, 10) || null)) : null;

                return {
                    startTime: startTimeNum + offset,
                    endTime: endTimeNum !== null ? endTimeNum + offset : null,
                    text: originalText,
                    pronText: pronText,
                    transText: transText
                };
            });

            // 현재 트랙 정보 가져오기 (Spicetify.Player.data에서 최신 정보 사용)
            const currentTitle = trackInfo.title || Spicetify.Player.data?.item?.metadata?.title || '';
            const currentArtist = trackInfo.artist || Spicetify.Player.data?.item?.metadata?.artist_name || '';
            const currentAlbum = Spicetify.Player.data?.item?.metadata?.album_title || '';

            console.log('[OverlaySender] 가사 전송:', {
                lines: mappedLines.length,
                offset,
                title: currentTitle,
                artist: currentArtist
            });

            await this.sendToEndpoint('/lyrics', {
                track: {
                    title: currentTitle,
                    artist: currentArtist,
                    album: currentAlbum,
                    albumArt: albumArt,
                    duration: Spicetify.Player.getDuration() || 0
                },
                lyrics: mappedLines,
                isSynced: lyrics.some(l => l.startTime !== undefined && l.startTime !== null)
            });
        },

        async resendWithNewOffset() {
            // 오프셋 캐시 초기화
            this._offsetCache = {};
            if (this._lastTrackInfo && this._lastLyrics) {
                console.log('[OverlaySender] 가사 재전송 (싱크 반영)');
                await this.sendLyrics(this._lastTrackInfo, this._lastLyrics, true);
            }
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
                    const position = Spicetify.Player.getProgress() || 0;
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
                            if (imageUrl && imageUrl.indexOf('localfile') === -1) {
                                if (imageUrl.startsWith('spotify:image:')) {
                                    albumArt = `https://i.scdn.co/image/${imageUrl.substring(imageUrl.lastIndexOf(':') + 1)}`;
                                } else if (imageUrl.startsWith('http')) {
                                    albumArt = imageUrl;
                                }
                            }
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
                                let albumArt = null;
                                if (imageUrl && imageUrl.indexOf('localfile') === -1) {
                                    if (imageUrl.startsWith('spotify:image:')) {
                                        albumArt = `https://i.scdn.co/image/${imageUrl.substring(imageUrl.lastIndexOf(':') + 1)}`;
                                    } else if (imageUrl.startsWith('http')) {
                                        albumArt = imageUrl;
                                    }
                                }
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
                        isPlaying: Spicetify.Player.isPlaying() || false,
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
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
            }
        },

        setupOffsetListener() {
            // localStorage 변경 감지
            window.addEventListener('storage', (e) => {
                if (e.key && e.key.startsWith('lyrics-delay:')) {
                    this.resendWithNewOffset();
                }
            });

            // 커스텀 이벤트 리스너
            window.addEventListener('ivLyrics:delay-changed', () => {
                this.resendWithNewOffset();
            });

            window.addEventListener('ivLyrics:offset-changed', () => {
                this.resendWithNewOffset();
            });

            // ivLyrics 페이지에서 가사가 준비되면 오버레이로 전송
            window.addEventListener('ivLyrics:lyrics-ready', (e) => {
                if (!this.enabled) return;
                const { trackInfo, lyrics } = e.detail || {};
                if (trackInfo) {
                    console.log('[OverlaySender] 가사 준비 이벤트 수신:', {
                        uri: trackInfo.uri,
                        title: trackInfo.title,
                        lines: lyrics?.length || 0
                    });
                    this.sendLyrics(trackInfo, lyrics || []);
                }
            });

            // 페이지 가시성 변경 감지
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.enabled) {
                    console.log('[OverlaySender] 페이지 활성화 - 가사 재전송');
                    setTimeout(() => this.resendWithNewOffset(), 200);
                }
            });

            // 창 포커스 시
            window.addEventListener('focus', () => {
                if (this.enabled && this._lastTrackInfo) {
                    console.log('[OverlaySender] 창 포커스 - 가사 재전송');
                    setTimeout(() => this.resendWithNewOffset(), 300);
                }
            });

            // 트랙 변경 감지
            Spicetify.Player.addEventListener('songchange', async () => {
                // 캐시 초기화
                this.lastSentUri = null;
                this.lastSentLyrics = null;
                this.lastSentOffset = null;
                this._offsetCache = {};
                this._lastProgressUri = null;

                // 오버레이 활성화 상태가 아니면 스킵
                if (!this.enabled) return;

                // ivLyrics 페이지에 있으면 index.js가 처리하므로 스킵
                // (lyrics-ready 이벤트를 통해 가사가 전송됨)
                const pathname = Spicetify.Platform?.History?.location?.pathname || "";
                if (pathname.includes("/ivLyrics")) {
                    console.log('[OverlaySender] ivLyrics 페이지 - index.js가 처리');
                    return;
                }

                // 다른 페이지에서 곡 변경됨 - 직접 가사 가져와서 전송
                console.log('[OverlaySender] 다른 페이지에서 곡 변경 감지');

                // 트랙 정보가 완전히 로드될 때까지 대기
                const waitForTrackData = () => {
                    return new Promise((resolve) => {
                        const check = () => {
                            const data = Spicetify.Player.data;
                            if (data?.item?.uri && data?.item?.metadata?.title) {
                                resolve(data);
                            } else {
                                setTimeout(check, 100);
                            }
                        };
                        check();
                        // 3초 타임아웃
                        setTimeout(() => resolve(null), 3000);
                    });
                };

                try {
                    const playerData = await waitForTrackData();
                    if (!playerData?.item) {
                        console.log('[OverlaySender] 트랙 데이터 로드 실패');
                        return;
                    }

                    const uri = playerData.item.uri;
                    const title = playerData.item.metadata?.title || '';
                    const artist = playerData.item.metadata?.artist_name || '';
                    const duration = Spicetify.Player.getDuration() || 0;

                    console.log('[OverlaySender] 트랙 정보:', { title, artist });

                    // 사용자 설정의 provider 순서 사용 (활성화된 것만 필터)
                    const defaultOrder = ['ivlyrics', 'spotify', 'lrclib', 'local'];
                    const configOrder = window.CONFIG?.providersOrder;
                    const providers = window.CONFIG?.providers || {};
                    const providerOrder = Array.isArray(configOrder) && configOrder.length > 0
                        ? configOrder.filter(id => providers[id]?.on !== false)
                        : defaultOrder;

                    // LyricsService.getFullLyrics 통합 API 사용
                    // (가사 로드 + endTime 계산 + 발음/번역 + 오버레이 전송까지 한 번에 처리)
                    await LyricsService.getFullLyrics(
                        { uri, title, artist, duration },
                        { sendToOverlay: true, providerOrder }
                    );
                } catch (e) {
                    console.error('[OverlaySender] 가사 가져오기 실패:', e);
                }
            });
        },

        init() {
            if (this.enabled) {
                this.startProgressSync();
                this.setupOffsetListener();
                setTimeout(() => this.checkConnection(), 1000);
            }
            console.log('[OverlaySender] Initialized in Extension');
        }
    };

    // OverlaySender 초기화 및 전역 등록
    OverlaySender.init();
    window.OverlaySender = OverlaySender;

    console.log("[LyricsService] LyricsService Extension initialized successfully!");
    console.log("[LyricsService] Available APIs: window.LyricsService, window.LyricsCache, window.ApiTracker, window.Providers, window.Translator, window.OverlaySender");
})();

