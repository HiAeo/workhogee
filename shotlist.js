/* ============================================================================
 * HogeeShotList · 收车拍摄清单（可复用 / 多端，纯逻辑、无 DOM）
 * ----------------------------------------------------------------------------
 * 阿图 P0：拍摄引导 + 收车质检。对照标准收车 shot list，帮车商把车况
 *   拍全、拍清楚、可信呈现，而不是把图修成广告。
 *
 * 分层（遵循「一次开发，多端复用」）：
 *   - SHOT_LIST：按场景(scene)组织的标准清单（必拍/建议拍、分组、拍摄引导）
 *   - classifyAsk / normalizeShot：细分视角识别（走通用 /vision-json）
 *   - computeCoverage：纯函数，输入已识别图，输出覆盖度与每项状态
 * UI 层（workbench）只负责渲染与交互，本模块不碰 window/document。
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------- 标准清单（数据驱动，可扩展其他场景） ---------------- */
  const SHOT_LIST = {
    usedcar: {
      label: '二手车收车',
      groups: [
        { id: 'exterior', name: '外观' },
        { id: 'interior', name: '内饰' },
        { id: 'space', name: '空间' },
        { id: 'detail', name: '细节' },
      ],
      shots: [
        { id: 'ext_front_45', group: 'exterior', required: true, name: '前45°整车',
          see: '斜前方看整车，同时看到前脸(格栅/大灯)和一侧车身、一侧前后车轮',
          guide: '站在车辆前侧方约45°、距离3–4米，把前脸和整车侧面都收进画面，轮胎完整、不切保险杠。' },
        { id: 'ext_rear_45', group: 'exterior', required: true, name: '后45°整车',
          see: '斜后方看整车，同时看到车尾(尾灯/后保险杠)和一侧车身、一侧车轮',
          guide: '站在车辆后侧方45°，完整呈现车尾、尾灯和侧面，后保险杠不切边。' },
        { id: 'ext_front', group: 'exterior', required: true, name: '正前方',
          see: '正对车头、前脸居中对称，主要是格栅/两大灯/前保险杠，几乎看不到车身侧面',
          guide: '正对车头居中拍摄，拍全前脸、两侧大灯和前保险杠，画面端正不歪斜。' },
        { id: 'ext_rear', group: 'exterior', required: true, name: '正后方',
          see: '正对车尾、车尾居中对称，主要是后风挡/两尾灯/后备箱牌照位/后保险杠，几乎看不到侧面',
          guide: '正对车尾，拍全尾灯、后备箱和后保险杠；车牌可后期打码。' },
        { id: 'ext_side', group: 'exterior', required: true, name: '正侧面',
          see: '车身侧面占满画面、车长水平，可见前后车门、两个车轮和侧面腰线，车头朝左或右',
          guide: '站在车辆正侧方、与车身平行，拍全从头到尾的侧面线条和两个车轮。' },
        { id: 'int_cockpit', group: 'interior', required: true, name: '驾驶舱全景',
          see: '驾驶位视角的前排全景，画面里有方向盘、方向盘后仪表盘、中控台、挡把',
          guide: '坐进驾驶座或站在打开的车门外，斜向拍全方向盘、仪表盘、中控台和挡把。' },
        { id: 'int_rear', group: 'interior', required: true, name: '后排座椅',
          see: '主体是后排座椅和后排乘坐空间，可见后座靠背/坐垫/后排地板(是座椅，不是空储物舱)',
          guide: '从后排门口或前排往后拍，呈现后排座椅成色、乘坐空间和地板。' },
        { id: 'space_trunk', group: 'space', required: true, name: '后备箱',
          see: '打开的后备箱内部，主体是空的储物舱/内衬盖板/两侧轮拱(看不到座椅)',
          guide: '打开后备箱，拍清空后的储物空间、两侧和盖板，体现真实容积。' },
        { id: 'detail_cluster', group: 'detail', required: true, name: '仪表盘（里程）',
          see: '方向盘后方仪表盘特写，可见速度/转速表盘、里程数字、挡位指示灯',
          guide: '凑近方向盘后方，清晰拍下里程数、挡位和故障灯，避免玻璃反光。' },
        { id: 'int_cabin', group: 'interior', required: false, name: '副驾/前排广角',
          see: '从副驾侧拍前排整体，可见副驾座椅、仪表台和中控台侧面',
          guide: '从副驾门外拍前排整体，补充副驾座椅和中控的成色。' },
        { id: 'space_engine', group: 'space', required: false, name: '发动机舱',
          see: '打开发动机盖俯拍，主体是发动机本体、管线和机舱',
          guide: '打开发动机盖俯拍发动机整体，体现舱内整洁度，不漏拍关键部件。' },
        { id: 'detail_screen', group: 'detail', required: false, name: '中控屏',
          see: '中控台中央的中控屏特写，屏幕点亮显示多媒体/功能界面(不是方向盘后表盘)',
          guide: '开机状态下正对中控屏拍清界面功能，避开反光。' },
        { id: 'detail_key', group: 'detail', required: false, name: '关键卖点特写',
          see: '车标、大灯、轮毂、天窗、空调出风口、座椅纹理等局部卖点的清晰近拍',
          guide: '对轮毂、大灯、车标、天窗、座椅通风等卖点各拍一张清晰特写。' },
        { id: 'detail_flaw', group: 'detail', required: false, name: '瑕疵如实拍',
          see: '划痕、磕碰、磨损、污渍等缺陷部位的局部近拍',
          guide: '对划痕、磕碰、磨损处如实近拍，诚信展示、避免后续纠纷。' },
      ],
    },
  };

  // 影响"可不可用"的硬性问题
  const HARD_ISSUES = ['blur', 'cut_off', 'occluded'];
  const ALL_ISSUES = ['blur', 'over_expose', 'under_expose', 'backlight', 'occluded',
    'cut_off', 'too_far', 'tilt', 'reflection', 'messy_bg'];
  const ISSUE_LABEL = {
    blur: '画面模糊', over_expose: '过曝', under_expose: '欠曝', backlight: '逆光发暗',
    occluded: '主体被遮挡', cut_off: '车辆被切边', too_far: '主体太小、请靠近',
    tilt: '画面歪斜', reflection: '反光看不清', messy_bg: '背景杂乱',
  };

  function sceneOf(scene) { return SHOT_LIST[scene] || SHOT_LIST.usedcar; }

  /* ---------------- 细分视角识别（走通用 /vision-json） ---------------- */
  function classifyAsk(scene) {
    const sc = sceneOf(scene);
    const enumLines = sc.shots.map(s => '"' + s.id + '"=' + s.name + '（' + s.see + '）').join('；');
    return '你是资深二手车检测师。判断这张车商收车实拍属于哪个拍摄视角，只输出 JSON：{"shot":"","issues":[]}，不要输出任何其他文字。'
      + '先看拍摄角度和画面主体，shot 必须从下列枚举里选一个最匹配的：' + enumLines + '。'
      + '关键区分：①后排座椅画面是座椅靠背坐垫，后备箱是空的储物舱内衬；②仪表盘在方向盘后方(表盘/里程)，中控屏在中控台中央(点亮的多媒体屏)；③车标/大灯/轮毂/出风口等局部近拍算关键卖点特写，划痕磕碰磨损算瑕疵如实拍。'
      + '只要画面主体与某一项描述相符就选该项，内饰和局部特写也一样，不要因为拍得不标准就选 other；只有画面主体完全不是这辆车的上述任何视角时才输出 "other"。'
      + 'issues 列出画面影响卖车的问题（没有则空数组），从这些里选：'
      + '"blur"模糊、"over_expose"过曝、"under_expose"欠曝、"backlight"逆光、'
      + '"occluded"主体被遮挡、"cut_off"车辆被切边、"too_far"主体太小、"tilt"画面歪斜、'
      + '"reflection"反光、"messy_bg"背景杂乱。';
  }
  function contactAsk(scene, n) {
    const sc = sceneOf(scene);
    const enumLines = sc.shots.map(s => '"' + s.id + '"=' + s.name + '（' + s.see + '）').join('\n');
    return '你是资深二手车检测师。这是一张由 ' + n + ' 张收车照片缩略图拼成的网格，每格左上角有数字编号（从0开始，从左到右、从上到下）。\n'
      + '请逐格判断每张照片属于哪个标准拍摄视角，只输出 JSON：{"items":[{"index":0,"shot":"视角id","issues":[]}]}\n'
      + '视角id枚举（每格必选一个）：\n' + enumLines + '\n"other"=以上都不是\n'
      + '关键区分：①后排座椅画面是座椅靠背坐垫，后备箱是空的储物舱内衬；②仪表盘在方向盘后方(表盘/里程)，中控屏在中控台中央(点亮的多媒体屏)；③车标/大灯/轮毂/出风口等局部近拍算关键卖点特写，划痕磕碰磨损算瑕疵如实拍。\n'
      + '只要画面主体与某一项描述相符就选对应项，内饰和局部特写也一样，不要因为拍得不标准选 other。\n'
      + 'items 必须包含全部 ' + n + ' 格，index 与编号一一对应，不要遗漏。\n'
      + 'issues 列出每格影响卖车的问题（没有则空数组），从这些里选："blur"模糊、"over_expose"过曝、"under_expose"欠曝、"backlight"逆光、"occluded"主体被遮挡、"cut_off"车辆被切边、"too_far"主体太小、"tilt"画面歪斜、"reflection"反光、"messy_bg"背景杂乱。';
  }
  function normalizeShot(scene, shot) {
    const ids = sceneOf(scene).shots.map(s => s.id);
    return ids.indexOf(shot) >= 0 ? shot : 'other';
  }
  function normalizeIssues(arr) {
    return Array.isArray(arr) ? arr.filter(x => ALL_ISSUES.indexOf(x) >= 0) : [];
  }

  /* ---------------- 单张是否达标（综合本地质检 + 视觉问题） ---------------- */
  function isWeakItem(it) {
    if (!it) return true;
    const q = it.qc || {};
    if (q.sharp === 'bad' || q.exp === 'bad') return true;
    const iss = it.issues || [];
    if (HARD_ISSUES.some(k => iss.indexOf(k) >= 0)) return true;
    return false;
  }

  /* ---------------- 覆盖度纯函数 ----------------
   * 输入 scene, items:[{shot, qc:{sharp,exp}, issues:[]}]
   * 输出 {label, groups:[{name, shots:[{id,name,required,state,guide,count}]}],
   *       requiredDone, requiredTotal, coverage, missingRequired:[{...}],
   *       recognized, extraCount, totalItems}
   * state: 'done' 有合格图 / 'weak' 有图但不达标 / 'missing' 无图
   */
  function computeCoverage(scene, items) {
    const sc = sceneOf(scene);
    const byShot = {};
    (items || []).forEach(it => {
      const k = it.shot || 'other';
      (byShot[k] = byShot[k] || []).push(it);
    });
    const groups = sc.groups.map(g => {
      const gShots = sc.shots.filter(s => s.group === g.id);
      const shots = gShots.map(s => {
        const its = byShot[s.id] || [];
        let state = 'missing';
        if (its.length) {
          const good = its.find(it => !isWeakItem(it));
          state = good ? 'done' : 'weak';
        }
        return { id: s.id, name: s.name, required: s.required, state: state,
          guide: s.guide, count: its.length };
      });
      const requiredTotal = shots.filter(s => s.required).length;
      const requiredDone = shots.filter(s => s.required && s.state === 'done').length;
      return { id: g.id, name: g.name, shots: shots,
        requiredDone: requiredDone, requiredTotal: requiredTotal };
    });
    let requiredDone = 0;
    const missingRequired = [];
    sc.shots.filter(s => s.required).forEach(s => {
      const g = groups.find(gg => gg.id === s.group);
      const st = g.shots.find(ss => ss.id === s.id);
      if (st.state === 'done') requiredDone++;
      else missingRequired.push({ id: s.id, name: s.name, state: st.state, guide: s.guide });
    });
    const recognized = (items || []).filter(it => it.shot && it.shot !== 'other').length;
    return {
      scene: scene, label: sc.label, groups: groups,
      requiredDone: requiredDone,
      requiredTotal: sc.shots.filter(s => s.required).length,
      coverage: sc.shots.some(s => s.required)
        ? requiredDone / sc.shots.filter(s => s.required).length : 0,
      missingRequired: missingRequired,
      recognized: recognized,
      extraCount: (items || []).length - recognized,
      totalItems: (items || []).length,
    };
  }

  /* ---------------- P1：按视角归类（纯函数，供"标准看车相册"渲染） ----------------
   * 输入 scene, items，输出按 外观→内饰→空间→细节 排好的分组，每个视角 slot 给出
   * 对应的图片下标；未识别(other)统一进 others。UI 据此把图按看车顺序组织，而非上传顺序。
   */
  function organizeItems(scene, items) {
    const sc = sceneOf(scene);
    const byShot = {};
    (items || []).forEach((it, i) => {
      const k = (it.shot && it.shot !== 'other') ? it.shot : '_other';
      (byShot[k] = byShot[k] || []).push(i);
    });
    const groups = sc.groups.map(g => {
      const slots = sc.shots.filter(s => s.group === g.id)
        .map(s => ({ id: s.id, name: s.name, indices: byShot[s.id] || [] }));
      return { id: g.id, name: g.name, slots: slots };
    });
    return { groups: groups, others: byShot['_other'] || [] };
  }

  /* ---------------- P1：轻校正参数（纯函数，只做"不改车况"的曝光/白平衡） ----------------
   * 只输出保守的 gamma/对比度/灰度世界白平衡参数，由 UI 适配层用 canvas 应用；
   * 不扶正(无可靠角度，歪斜引导重拍)、不锐化、不重画、不改形状与颜色事实。
   */
  function gentleParams(it) {
    const q = (it && it.qc) || {}, iss = (it && it.issues) || [];
    let gamma = 1, contrast = 1;
    if (iss.indexOf('over_expose') >= 0) { gamma = 1.22; contrast = 1.04; }
    else if (iss.indexOf('under_expose') >= 0 || iss.indexOf('backlight') >= 0) { gamma = 0.72; contrast = 1.05; }
    else if (q.exp === 'bad') { gamma = 0.74; }
    else if (q.exp === 'warn') { gamma = 0.86; }
    return { gamma: gamma, contrast: contrast, wb: true, wbStrength: 0.5 };
  }
  function needsGentle(it) {
    const p = gentleParams(it);
    return p.gamma !== 1 || p.contrast !== 1;
  }

  global.HogeeShotList = {
    SHOT_LIST: SHOT_LIST,
    ISSUE_LABEL: ISSUE_LABEL,
    classifyAsk: classifyAsk,
    contactAsk: contactAsk,
    normalizeShot: normalizeShot,
    normalizeIssues: normalizeIssues,
    isWeakItem: isWeakItem,
    computeCoverage: computeCoverage,
    organizeItems: organizeItems,
    gentleParams: gentleParams,
    needsGentle: needsGentle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
