/* ==========================================================================
   避雷吧 · 高分餐厅避雷地图
   所有餐厅名称、地址、评分与记录均为虚构示例，不对应任何真实商户。
   ========================================================================== */

var CUISINES = {
  hotpot:   { label: '火锅',   short: '火锅' },
  bbq:      { label: '烧肉',   short: '烧肉' },
  japanese: { label: '日料',   short: '日料' },
  local:    { label: '本帮',   short: '本帮' },
  fusion:   { label: '创意菜', short: '创意' },
  cafe:     { label: '咖啡甜品', short: '咖啡' },
  snack:    { label: '小吃',   short: '小吃' }
};

var FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'hotpot', label: '火锅' },
  { id: 'bbq', label: '烧肉' },
  { id: 'japanese', label: '日料' },
  { id: 'local', label: '本帮' },
  { id: 'fusion', label: '创意菜' },
  { id: 'cafe', label: '咖啡甜品' },
  { id: 'snack', label: '小吃' }
];

/* 商圈中心，用于新店落点 */
var AREAS = {
  '静安寺':   { lat: 31.2235, lng: 121.4450, x: 175, y: 320 },
  '愚园路':   { lat: 31.2210, lng: 121.4370, x: 158, y: 326 },
  '南京西路': { lat: 31.2290, lng: 121.4540, x: 190, y: 306 },
  '淮海路':   { lat: 31.2200, lng: 121.4620, x: 200, y: 322 },
  '新天地':   { lat: 31.2190, lng: 121.4750, x: 228, y: 328 },
  '武康路':   { lat: 31.2080, lng: 121.4370, x: 158, y: 352 },
  '徐家汇':   { lat: 31.1950, lng: 121.4370, x: 158, y: 382 },
  '外滩':     { lat: 31.2380, lng: 121.4870, x: 236, y: 284 },
  '陆家嘴':   { lat: 31.2400, lng: 121.5050, x: 268, y: 280 },
  '五角场':   { lat: 31.3000, lng: 121.5150, x: 276, y: 108 },
  '中山公园': { lat: 31.2200, lng: 121.4200, x: 108, y: 322 },
  '老西门':   { lat: 31.2220, lng: 121.4840, x: 244, y: 318 }
};

var CITIES = [
  { id: 'shanghai', name: '上海', ready: true },
  { id: 'beijing', name: '北京', ready: false },
  { id: 'hangzhou', name: '杭州', ready: false },
  { id: 'chengdu', name: '成都', ready: false }
];

var VERDICTS = {
  avoid:   { label: '建议避雷', cls: 'high', char: '雷' },
  caution: { label: '谨慎前往', cls: 'mid',  char: '慎' },
  ok:      { label: '值得一试', cls: 'low',  char: '荐' }
};

var QUEUES = ['没排队', '20 分钟内', '半小时左右', '1 小时以上', '2 小时以上'];

var PLACES = [
  {
    id: 'r01', name: '炭与盐·和牛烧肉', cuisine: 'bbq', area: '静安寺',
    address: '静安区愚园路 68 号 2 层', lat: 31.2235, lng: 121.4405, dist: 0.4,
    rating: 4.8, reviews: 12480, price: 268, queue: 90, heat: 88, verdict: 'avoid',
    tags: [{ t: '排队久', n: 41 }, { t: '价格虚高', n: 33 }, { t: '分量少', n: 27 }, { t: '疑似刷分', n: 19 }],
    summary: '招牌和牛油脂感重，两个人点三份肉才勉强吃饱，人均 268 主要买了个氛围。',
    good: ['厚切牛舌', '泡菜拼盘'], bad: ['和牛拼盘', '松露拌饭'],
    tip: '如果一定要去：工作日下午 5 点前到，只点牛舌和冷面，人均能压到 150。',
    records: [
      { date: '2026-10-26', rating: 2, tags: ['排队久', '分量少'], price: 286, text: '周四晚上排队 95 分钟，肉量比照片少一半，炭火还要另收 20。' },
      { date: '2026-09-30', rating: 2, tags: ['价格虚高', '疑似刷分'], price: 310, text: '评分 4.8 不知道怎么来的，隔壁桌也在吐槽。' },
      { date: '2026-08-12', rating: 1, tags: ['排队久', '服务差'], price: 240, text: '等了两个小时，上错单还不肯改。' }
    ]
  },
  {
    id: 'r02', name: '山雾·云贵川 Bistro', cuisine: 'fusion', area: '新天地',
    address: '黄浦区马当路 245 号 1 层', lat: 31.2190, lng: 121.4750, dist: 2.4,
    rating: 4.7, reviews: 8630, price: 198, queue: 70, heat: 81, verdict: 'avoid',
    tags: [{ t: '口味一般', n: 36 }, { t: '环境吵', n: 29 }, { t: '预制菜', n: 22 }, { t: '分量少', n: 15 }],
    summary: '摆盘和灯光值 4.7，味道像加热过的料理包，两个人点了六个菜没一个记住。',
    good: ['酸汤鱼', '烤乳扇'], bad: ['黑松露菌菇', '苗家酸肉'],
    tip: '如果一定要去：把它当酒吧，点酸汤鱼和一杯酒，别点套餐。',
    records: [
      { date: '2026-10-19', rating: 2, tags: ['口味一般', '预制菜'], price: 210, text: '牛肝菌一股水煮味，酱汁是现成的那种甜。' },
      { date: '2026-09-08', rating: 2, tags: ['环境吵', '分量少'], price: 186, text: '音乐大到听不见对面说话，菜量少得像是试吃。' }
    ]
  },
  {
    id: 'r03', name: '阿婆手作葱油拌面', cuisine: 'snack', area: '武康路',
    address: '徐汇区武康路 188 弄 3 号', lat: 31.2080, lng: 121.4370, dist: 3.2,
    rating: 4.6, reviews: 3120, price: 32, queue: 15, heat: 34, verdict: 'ok',
    tags: [{ t: '座位少', n: 14 }, { t: '服务冷淡', n: 9 }, { t: '环境简陋', n: 7 }],
    summary: '开了二十年的小面馆，葱油香得很实在，环境就别指望了。',
    good: ['葱油拌面', '辣肉浇头'], bad: ['大排面'],
    tip: '值得去：早上 10 点前不用等位，加一份辣肉浇头刚好。',
    records: [
      { date: '2026-10-02', rating: 4, tags: ['座位少'], price: 34, text: '面是好面，就六个座位，站着吃完的。' },
      { date: '2026-08-21', rating: 4, tags: ['环境简陋'], price: 30, text: '桌子有点黏，但 12 块的葱油拌面没什么可挑的。' }
    ]
  },
  {
    id: 'r04', name: '十九味老火锅', cuisine: 'hotpot', area: '淮海路',
    address: '黄浦区淮海中路 333 号 4 层', lat: 31.2200, lng: 121.4620, dist: 1.6,
    rating: 4.8, reviews: 20940, price: 156, queue: 100, heat: 84, verdict: 'avoid',
    tags: [{ t: '排队久', n: 52 }, { t: '锅底一般', n: 31 }, { t: '服务跟不上', n: 24 }, { t: '价格虚高', n: 18 }],
    summary: '锅底越煮越咸，排队两小时；隔壁三家火锅评分 4.5，但不用等。',
    good: ['鲜毛肚', '手工虾滑'], bad: ['招牌九宫格', '现切黄牛肉'],
    tip: '如果一定要去：下午 4 点取号，点鸳鸯锅而不是九宫格。',
    records: [
      { date: '2026-10-28', rating: 2, tags: ['排队久', '锅底一般'], price: 168, text: '取号 187 桌，等了 110 分钟。锅底发苦。' },
      { date: '2026-09-16', rating: 3, tags: ['服务跟不上'], price: 142, text: '加汤叫了三次，最后自己去拿的壶。' },
      { date: '2026-07-30', rating: 2, tags: ['价格虚高'], price: 190, text: '两个人吃了 380，菜量对不起这个价。' }
    ]
  },
  {
    id: 'r05', name: '白鸟·Omakase', cuisine: 'japanese', area: '南京西路',
    address: '静安区南京西路 1266 号 3 层', lat: 31.2290, lng: 121.4540, dist: 1.1,
    rating: 4.9, reviews: 2140, price: 688, queue: 0, heat: 76, verdict: 'avoid',
    tags: [{ t: '价格虚高', n: 44 }, { t: '分量少', n: 38 }, { t: '主厨态度', n: 12 }, { t: '食材一般', n: 9 }],
    summary: '12 贯寿司 688，食材新鲜度对不上价格，主厨全程在催翻台。',
    good: ['金枪鱼大腹', '玉子烧'], bad: ['海胆军舰', '招牌套餐'],
    tip: '如果一定要去：午市套餐 388 比晚市划算，别加酒。',
    records: [
      { date: '2026-10-12', rating: 2, tags: ['价格虚高', '分量少'], price: 720, text: '12 贯里三贯是腌萝卜和姜，吃完又去吃了碗面。' },
      { date: '2026-08-29', rating: 3, tags: ['主厨态度'], price: 688, text: '1 小时 10 分钟吃完一套，主厨一直在看表。' }
    ]
  },
  {
    id: 'r06', name: '奶油岛屿·舒芙蕾', cuisine: 'cafe', area: '武康路',
    address: '徐汇区安福路 322 号', lat: 31.2100, lng: 121.4400, dist: 3.0,
    rating: 4.7, reviews: 15600, price: 68, queue: 40, heat: 72, verdict: 'caution',
    tags: [{ t: '排队久', n: 30 }, { t: '过甜', n: 26 }, { t: '拍照溢价', n: 21 }],
    summary: '适合拍照，舒芙蕾甜到齁，排队 40 分钟吃完 8 分钟。',
    good: ['原味舒芙蕾', '冰美式'], bad: ['季节限定草莓塔'],
    tip: '谨慎：两个人点一份分着吃，配冰美式解腻，不用点套餐。',
    records: [
      { date: '2026-10-08', rating: 2, tags: ['过甜', '拍照溢价'], price: 76, text: '一份 68，甜得发苦，主要是来拍照的人。' },
      { date: '2026-09-01', rating: 3, tags: ['排队久'], price: 62, text: '等了四十分钟，出餐很快，说明是提前做好的。' }
    ]
  },
  {
    id: 'r07', name: '巷口咖啡 Roastery', cuisine: 'cafe', area: '愚园路',
    address: '静安区愚园路 1088 号', lat: 31.2210, lng: 121.4370, dist: 0.9,
    rating: 4.5, reviews: 1890, price: 38, queue: 0, heat: 21, verdict: 'ok',
    tags: [{ t: '座位少', n: 11 }, { t: '无插座', n: 6 }],
    summary: '豆子选得认真，手冲稳定，就是只有六个座位。',
    good: ['耶加雪菲手冲', 'flat white'], bad: ['抹茶拿铁'],
    tip: '值得去：工作日上午最安静，自带杯子减 3 元。',
    records: [
      { date: '2026-09-22', rating: 5, tags: [], price: 42, text: '手冲很干净，老板会问口味，难得。' }
    ]
  },
  {
    id: 'r08', name: '浦江宴·本帮菜', cuisine: 'local', area: '外滩',
    address: '黄浦区中山东一路 18 号 6 层', lat: 31.2380, lng: 121.4870, dist: 2.8,
    rating: 4.6, reviews: 9870, price: 220, queue: 30, heat: 58, verdict: 'caution',
    tags: [{ t: '服务跟不上', n: 33 }, { t: '口味一般', n: 27 }, { t: '价格虚高', n: 19 }],
    summary: '靠窗位看江景确实好，红烧肉偏甜，服务跟不上这个价位。',
    good: ['油爆虾', '腌笃鲜'], bad: ['红烧肉', '蟹粉豆腐'],
    tip: '谨慎：只为江景去，提前订靠窗位，点四个菜足够。',
    records: [
      { date: '2026-10-04', rating: 3, tags: ['服务跟不上', '口味一般'], price: 246, text: '风景满分，菜一般，服务员三个人管一层。' },
      { date: '2026-08-14', rating: 3, tags: ['价格虚高'], price: 260, text: '一份红烧肉 98，甜得像蜜饯。' }
    ]
  },
  {
    id: 'r09', name: '一夜町·居酒屋', cuisine: 'japanese', area: '中山公园',
    address: '长宁区长宁路 1018 号 B1', lat: 31.2200, lng: 121.4200, dist: 2.2,
    rating: 4.7, reviews: 6200, price: 168, queue: 45, heat: 63, verdict: 'caution',
    tags: [{ t: '分量少', n: 29 }, { t: '上菜慢', n: 22 }, { t: '烟味重', n: 17 }],
    summary: '烤串是好吃的，但五串起点、每串 18，吃到饱要人均 300。',
    good: ['鸡皮', '明太子土豆'], bad: ['和牛串', '刺身拼盘'],
    tip: '谨慎：坐吧台看烤制，点鸡皮和蔬菜串，避开刺身。',
    records: [
      { date: '2026-10-15', rating: 3, tags: ['分量少', '上菜慢'], price: 188, text: '第一串等了 25 分钟，五串起点太多了。' },
      { date: '2026-09-05', rating: 3, tags: ['烟味重'], price: 160, text: '排风不行，出来一身味。' }
    ]
  },
  {
    id: 'r10', name: '火焰山·新疆菜', cuisine: 'local', area: '五角场',
    address: '杨浦区淞沪路 8 号 2 层', lat: 31.3000, lng: 121.5150, dist: 7.4,
    rating: 4.5, reviews: 4300, price: 98, queue: 20, heat: 29, verdict: 'ok',
    tags: [{ t: '环境吵', n: 16 }, { t: '油大', n: 12 }],
    summary: '大盘鸡分量实在，馕坑肉香，学生党友好。',
    good: ['大盘鸡', '馕坑肉'], bad: ['酸奶粽子'],
    tip: '值得去：三个人点中份大盘鸡加两个串就够了。',
    records: [
      { date: '2026-09-19', rating: 4, tags: ['环境吵'], price: 92, text: '分量真的大，就是说话基本靠喊。' }
    ]
  },
  {
    id: 'r11', name: '拾光·法式小馆', cuisine: 'fusion', area: '徐家汇',
    address: '徐汇区衡山路 890 弄 12 号', lat: 31.1950, lng: 121.4370, dist: 3.7,
    rating: 4.8, reviews: 5400, price: 420, queue: 60, heat: 79, verdict: 'avoid',
    tags: [{ t: '分量少', n: 41 }, { t: '价格虚高', n: 35 }, { t: '服务差', n: 18 }, { t: '上菜慢', n: 12 }],
    summary: '三道式 420，鸭胸煎过头，服务员比客人还少。',
    good: ['洋葱汤', '焦糖布丁'], bad: ['招牌鸭胸', '和牛塔塔'],
    tip: '如果一定要去：单点洋葱汤和布丁，别点套餐。',
    records: [
      { date: '2026-10-22', rating: 2, tags: ['分量少', '价格虚高'], price: 452, text: '三道菜加起来没吃饱，鸭胸像橡皮。' },
      { date: '2026-09-11', rating: 2, tags: ['服务差', '上菜慢'], price: 430, text: '等主菜等了 40 分钟，服务员说厨房忙。' }
    ]
  },
  {
    id: 'r12', name: '吴记生煎（老店）', cuisine: 'snack', area: '老西门',
    address: '黄浦区中华路 1500 号', lat: 31.2220, lng: 121.4840, dist: 2.6,
    rating: 4.6, reviews: 11200, price: 22, queue: 10, heat: 18, verdict: 'ok',
    tags: [{ t: '座位少', n: 14 }, { t: '只收现金', n: 7 }],
    summary: '底脆汤足，四只 12 块，排队十分钟值得。',
    good: ['鲜肉生煎', '咖喱牛肉汤'], bad: ['虾仁生煎'],
    tip: '值得去：早上 7 点半第一锅，配一碗咖喱牛肉汤。',
    records: [
      { date: '2026-10-01', rating: 5, tags: [], price: 24, text: '底很脆，汤汁不腥，这个价格没得说。' }
    ]
  },
  {
    id: 'r13', name: '辣么·湘菜小炒', cuisine: 'local', area: '静安寺',
    address: '静安区愚园路 288 号 1 层', lat: 31.2250, lng: 121.4470, dist: 0.5,
    rating: 4.7, reviews: 7600, price: 88, queue: 35, heat: 66, verdict: 'caution',
    tags: [{ t: '预制菜', n: 31 }, { t: '口味一般', n: 24 }, { t: '卫生', n: 15 }],
    summary: '小炒黄牛肉没有锅气，米饭倒是好吃。',
    good: ['米饭', '擂辣椒皮蛋'], bad: ['小炒黄牛肉', '剁椒鱼头'],
    tip: '谨慎：点现炒的素菜，别点标着「招牌」的荤菜。',
    records: [
      { date: '2026-10-17', rating: 3, tags: ['预制菜', '口味一般'], price: 92, text: '牛肉是温的，没有锅气，像是微波炉热的。' },
      { date: '2026-09-03', rating: 2, tags: ['卫生'], price: 84, text: '碗边有油渍，筷子筒里也是。' }
    ]
  },
  {
    id: 'r14', name: '云顶·高空景观餐厅', cuisine: 'fusion', area: '陆家嘴',
    address: '浦东新区世纪大道 100 号 58 层', lat: 31.2400, lng: 121.5050, dist: 5.2,
    rating: 4.9, reviews: 15300, price: 520, queue: 90, heat: 91, verdict: 'avoid',
    tags: [{ t: '价格虚高', n: 58 }, { t: '口味一般', n: 44 }, { t: '排队久', n: 31 }, { t: '疑似刷分', n: 26 }],
    summary: '买单 1,040，两个人吃了两份冷掉的牛排和一片夜景。',
    good: ['餐前面包', '夜景'], bad: ['战斧牛排', '双人套餐'],
    tip: '如果一定要去：只点一杯酒看夜景，别在这里吃饭。',
    records: [
      { date: '2026-10-30', rating: 1, tags: ['价格虚高', '口味一般'], price: 560, text: '牛排要了五分熟，上来全熟还凉了，换了一份还是凉的。' },
      { date: '2026-10-03', rating: 2, tags: ['排队久'], price: 500, text: '预订了还要等 40 分钟，说在收拾桌子。' },
      { date: '2026-08-18', rating: 2, tags: ['疑似刷分'], price: 540, text: '4.9 分，评论里一水儿的九宫格照片，你懂的。' }
    ]
  }
];

var GUIDE = [
  {
    id: 'how', title: '避雷指数怎么算',
    items: [
      '评分落差：平台评分越高、真实记录的平均打分越低，权重越大。',
      '雷点密度：同一家店被反复提到的具体问题（排队、分量、预制菜等）越多，指数越高。',
      '时间衰减：三个月前的吐槽权重逐步下降，最近 30 天的记录权重最高。',
      '样本修正：记录少于 5 条的店会被标记为「样本不足」，不进入榜单前列。'
    ]
  },
  {
    id: 'read', title: '怎么读这张榜单',
    items: [
      '「建议避雷」≠ 违法或不能吃，而是「高分与体验落差大，性价比低」。',
      '先看雷点结构：如果是「排队久」，可能只是时间成本；如果是「预制菜」「卫生」，要谨慎。',
      '再看你自己的容忍度：能接受排队的人，和不能接受的人，结论完全不同。',
      '每家店都有「如果一定要去」的建议，而不是只劝退。'
    ]
  },
  {
    id: 'rule', title: '我们不收录什么',
    items: [
      '没有具体描述的纯情绪差评（「难吃」「垃圾」）。',
      '涉及人身攻击、员工隐私、未经证实的安全指控。',
      '同一个账号对同一家店的重复提交。',
      '商家之间的恶意竞争内容。'
    ]
  }
];
