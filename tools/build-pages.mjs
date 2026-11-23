#!/usr/bin/env node
/**
 * 生成 GitHub Pages 演示站：
 *   _site/index.html         ← 原前端 + 注入内嵌示例数据桩（演示宿主）
 *   _site/<原文件名>.html    ← 同上，供 Service Worker 离线回退用
 *   _site/manifest.json, sw.js, icon.svg
 *
 * 源文件 frontend/ 不做任何修改；桩代码只注入到 _site 的副本里。
 * 示例数据由 data/cards.csv 派生，日期按打开当天动态计算，因此演示站不会过期。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "frontend");
const OUT = join(ROOT, "_site");
const HTML_NAME = "零基础英语学习工作台.html";

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") {
      cur += ch;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

const csv = readFileSync(join(ROOT, "data", "cards.csv"), "utf8").replace(/^\uFEFF/, "");
const rows = parseCSV(csv);
rows.shift(); // 表头

const cards = rows
  .filter((r) => r.length >= 11 && String(r[0] || "").trim())
  .map((r, i) => {
    let level = Number(r[7] || 0) || 0;
    if (i % 6 === 0) level = 4 + ((i / 6) % 3); // 让统计里有几张已掌握
    return {
      content: String(r[0] || "").trim(),
      meaning: String(r[1] || "").trim(),
      type: String(r[2] || "").trim(),
      stage: String(r[3] || "").trim(),
      ipa: String(r[4] || "").trim(),
      example: String(r[5] || "").trim(),
      exampleCn: String(r[6] || "").trim(),
      level: level,
      lapses: Number(r[10] || 0) || 0,
      // 相对打开当天的偏移：约 1/3 到期，1/3 今天到期，其余未来
      dueOffset: i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 2 + (i % 2),
      addedOffset: -(1 + (i % 20)),
    };
  });

const logs = [];
for (let i = 13; i >= 0; i--) {
  if (i === 3 || i === 9) continue; // 模拟漏打卡
  logs.push({
    dayOffset: -i,
    minutes: 15 + ((i * 7) % 16),
    newCards: i % 4 === 0 ? 2 : 1,
    reviews: 4 + ((i * 5) % 9),
    quizRate: 68 + ((i * 7) % 26),
    dialogues: 1 + (i % 2),
    shadows: 3 + ((i * 3) % 6),
    done: i % 5 === 2 ? "部分完成" : "全部完成",
    note: i === 0 ? "演示数据：今天已完成打卡" : "",
  });
}

const demoData = JSON.stringify({ cards, logs }).replace(/</g, "\\u003c");

const stub = `<script data-demo-pages="1">
(function(){
  "use strict";
  var DEMO = ${demoData};
  var INTERVALS = [0,1,2,4,7,15,30], MASTER = 4, LEECH = 2, DAILY_CAP = 8;
  var TODAY = (function(){
    var d = new Date();
    var m = String(d.getMonth()+1).padStart(2,"0");
    var dd = String(d.getDate()).padStart(2,"0");
    return d.getFullYear()+"-"+m+"-"+dd;
  })();
  function addDays(key, n){
    var d = new Date(key + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0,10);
  }
  function diffDays(a, b){
    return Math.round((new Date(b+"T00:00:00Z") - new Date(a+"T00:00:00Z")) / 86400000);
  }
  function clamp(n, min, max){
    var v = Number(n || 0);
    if(!isFinite(v)) return min;
    return Math.max(min, Math.min(max, Math.round(v)));
  }
  function copy(o){
    var r = {};
    for(var k in o){ if(Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; }
    return r;
  }
  var CARDS = DEMO.cards.map(function(c, i){
    var o = copy(c);
    o.id = "demo-" + (i + 1);
    o.due = addDays(TODAY, o.dueOffset);
    o.added = addDays(TODAY, o.addedOffset);
    return o;
  });
  var LOGS = DEMO.logs.map(function(l, i){
    var o = copy(l);
    o.id = "demo-log-" + (i + 1);
    o.date = addDays(TODAY, o.dayOffset);
    return o;
  });

  function dashboard(day){
    day = day || TODAY;
    var due = CARDS.filter(function(c){ return !c.due || c.due <= day; });
    var mastered = CARDS.filter(function(c){ return c.level >= MASTER; }).length;
    var leech = CARDS.filter(function(c){ return c.lapses >= LEECH && c.level < MASTER; }).length;
    var levelDist = [0,0,0,0,0,0,0];
    CARDS.forEach(function(c){
      var idx = Math.max(0, Math.min(6, Math.round(c.level)));
      levelDist[idx] += 1;
    });
    var byType = {};
    CARDS.forEach(function(c){
      var key = c.type || "未分类";
      byType[key] = (byType[key] || 0) + 1;
    });
    var logDates = LOGS.map(function(l){ return l.date; }).sort();
    var start = logDates[0] || "";
    var dayIndex = start ? Math.max(1, diffDays(start, day) + 1) : 1;
    var last14 = [];
    for(var i = 13; i >= 0; i--){
      var key = addDays(day, -i);
      var hit = null;
      for(var j = 0; j < LOGS.length; j++){ if(LOGS[j].date === key){ hit = LOGS[j]; break; } }
      last14.push({
        date: key,
        minutes: hit ? hit.minutes : 0,
        done: hit ? hit.done : "",
        quizRate: hit ? hit.quizRate : 0
      });
    }
    var todayLog = null;
    for(var t = 0; t < LOGS.length; t++){ if(LOGS[t].date === day){ todayLog = LOGS[t]; break; } }
    var recent = LOGS.slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; }).slice(0, 8);
    var streakSet = {};
    LOGS.forEach(function(l){ streakSet[l.date] = 1; });
    var cursor = streakSet[day] ? day : addDays(day, -1);
    var streak = 0;
    while(streakSet[cursor]){ streak += 1; cursor = addDays(cursor, -1); }
    return {
      date: day,
      dayIndex: dayIndex,
      finishedDays: LOGS.length,
      stats: {
        total: CARDS.length,
        mastered: mastered,
        due: due.length,
        streak: streak,
        totalMinutes: LOGS.reduce(function(s, l){ return s + l.minutes; }, 0),
        totalReviews: LOGS.reduce(function(s, l){ return s + l.reviews; }, 0),
        leech: leech,
        todayAdded: CARDS.filter(function(c){ return c.added === day; }).length,
        dailyCap: DAILY_CAP,
        newSevenDays: LOGS.filter(function(l){ var d = diffDays(l.date, day); return d >= 0 && d <= 6; })
          .reduce(function(s, l){ return s + l.newCards; }, 0)
      },
      levelDist: levelDist,
      byType: byType,
      last14: last14,
      todayLog: todayLog,
      recentLogs: recent
    };
  }

  function listCards(p){
    p = p || {};
    var day = p.date || TODAY;
    var show = CARDS.slice();
    var type = (p.type || "").trim();
    var stage = (p.stage || "").trim();
    var kw = (p.keyword || "").trim().toLowerCase();
    if(type) show = show.filter(function(c){ return c.type === type; });
    if(stage) show = show.filter(function(c){ return c.stage === stage; });
    if(kw) show = show.filter(function(c){
      return (c.content + " " + c.meaning + " " + c.example + " " + c.ipa).toLowerCase().indexOf(kw) >= 0;
    });
    if(p.onlyDue) show = show.filter(function(c){ return !c.due || c.due <= day; });
    if(p.leechOnly){
      show = show.filter(function(c){ return c.lapses >= LEECH && c.level < MASTER; });
      show.sort(function(a, b){
        return b.lapses === a.lapses ? a.level - b.level : b.lapses - a.lapses;
      });
    } else {
      show.sort(function(a, b){
        return a.due === b.due ? a.level - b.level : (a.due < b.due ? -1 : 1);
      });
    }
    var offset = Number(p.offset || 0);
    var limit = Math.min(Math.max(Number(p.limit || 20), 1), 100);
    return { total: show.length, offset: offset, cards: show.slice(offset, offset + limit) };
  }

  function reviewQueue(p){
    p = p || {};
    var day = p.date || TODAY;
    var due = CARDS.filter(function(c){ return !c.due || c.due <= day; }).sort(function(a, b){
      var la = a.lapses >= LEECH ? 1 : 0;
      var lb = b.lapses >= LEECH ? 1 : 0;
      if(la !== lb) return la - lb;
      return a.level === b.level ? (a.due < b.due ? -1 : 1) : a.level - b.level;
    });
    var limit = Math.min(Math.max(Number(p.limit || 20), 1), 60);
    return { total: due.length, cards: due.slice(0, limit) };
  }

  function findCard(id){
    for(var i = 0; i < CARDS.length; i++){ if(CARDS[i].id === id) return CARDS[i]; }
    return null;
  }

  function addCard(p){
    p = p || {};
    var content = (p.content || "").trim();
    if(!content) return { ok:false, message:"卡片内容不能为空" };
    var day = p.date || TODAY;
    var addedToday = CARDS.filter(function(c){ return c.added === day; }).length;
    if(!p.force && addedToday >= DAILY_CAP){
      return { ok:false, capped:true, todayAdded:addedToday, cap:DAILY_CAP,
               message:"今天已经加了 " + addedToday + " 张新卡，够今天学的了" };
    }
    var card = {
      id: "demo-new-" + (CARDS.length + 1),
      content: content,
      meaning: (p.meaning || "").trim(),
      type: p.type || "单词",
      stage: p.stage || "W2 高频词",
      ipa: (p.ipa || "").trim(),
      example: (p.example || "").trim(),
      exampleCn: (p.exampleCn || "").trim(),
      level: 0,
      lapses: 0,
      due: day,
      added: day
    };
    CARDS.push(card);
    return { ok:true, id:card.id, cap:DAILY_CAP };
  }

  function updateCard(p){
    p = p || {};
    var card = findCard((p.recordId || "").trim());
    if(!card) return { ok:false, message:"缺少卡片标识" };
    var keys = ["content","meaning","type","stage","ipa","example","exampleCn","level","lapses","due"];
    var updated = 0;
    keys.forEach(function(k){
      if(p[k] !== undefined && p[k] !== null && p[k] !== ""){
        if(k === "level" || k === "lapses") card[k] = clamp(p[k], 0, 99);
        else card[k] = String(p[k]).trim();
        updated += 1;
      }
    });
    if(!updated) return { ok:false, message:"没有需要更新的内容" };
    return { ok:true, updated:updated };
  }

  function deleteCard(p){
    p = p || {};
    var id = (p.recordId || "").trim();
    for(var i = 0; i < CARDS.length; i++){
      if(CARDS[i].id === id){ CARDS.splice(i, 1); return { ok:true }; }
    }
    return { ok:false, message:"缺少卡片标识" };
  }

  function reviewCard(p){
    p = p || {};
    var card = findCard((p.recordId || "").trim());
    if(!card) return { ok:false, message:"缺少卡片标识" };
    if(p.grade !== "again" && p.grade !== "hard" && p.grade !== "good"){
      return { ok:false, message:"评分无效" };
    }
    var day = p.date || TODAY;
    var cur = Math.max(0, Math.min(6, Math.round(Number(p.level || 0))));
    var lapses = clamp(p.lapses, 0, 99);
    var level = cur, interval = 0;
    if(p.grade === "again"){ level = 0; interval = 0; }
    else if(p.grade === "hard"){ level = Math.max(1, cur); interval = Math.max(1, Math.round(INTERVALS[Math.max(1, level)] * 0.6)); }
    else { level = Math.min(6, cur + 1); interval = INTERVALS[level]; }
    var next = lapses;
    if(p.grade === "again") next = Math.min(99, lapses + 1);
    else if(p.grade === "good") next = Math.max(0, lapses - 1);
    var due = addDays(day, interval);
    card.level = level;
    card.due = due;
    card.lapses = next;
    return { ok:true, level:level, due:due, interval:interval, lapses:next,
             leech: next >= LEECH && level < MASTER };
  }

  function resetCard(p){
    p = p || {};
    var card = findCard((p.recordId || "").trim());
    if(!card) return { ok:false, message:"缺少卡片标识" };
    var day = p.date || TODAY;
    card.level = 0;
    card.due = day;
    card.lapses = 0;
    return { ok:true, due:day };
  }

  function saveLog(p){
    p = p || {};
    var day = p.date || TODAY;
    var rec = {
      id: "demo-log-" + day,
      date: day,
      minutes: Math.max(0, Math.round(Number(p.minutes || 0) || 0)),
      newCards: Math.max(0, Math.round(Number(p.newCards || 0) || 0)),
      reviews: Math.max(0, Math.round(Number(p.reviews || 0) || 0)),
      quizRate: typeof p.quizRate === "number" ? clamp(p.quizRate, 0, 100) : 0,
      dialogues: typeof p.dialogues === "number" ? clamp(p.dialogues, 0, 99) : 0,
      shadows: typeof p.shadows === "number" ? clamp(p.shadows, 0, 999) : 0,
      done: p.done === "部分完成" ? "部分完成" : "全部完成",
      note: (p.note || "").trim()
    };
    var mode = "created";
    for(var i = 0; i < LOGS.length; i++){
      if(LOGS[i].date === day){ LOGS[i] = rec; mode = "updated"; break; }
    }
    if(mode === "created") LOGS.push(rec);
    return { ok:true, mode:mode, id:rec.id };
  }

  var HANDLERS = {
    get_dashboard: function(p){ return dashboard((p || {}).date); },
    list_cards: listCards,
    get_review_queue: reviewQueue,
    add_card: addCard,
    update_card: updateCard,
    delete_card: deleteCard,
    review_card: reviewCard,
    reset_card: resetCard,
    save_daily_log: saveLog
  };

  function callTool(name, payload){
    var fn = HANDLERS[name];
    if(!fn){
      return Promise.resolve({ isError:true, structuredContent:{ ok:false, message:"演示模式不支持该工具：" + name } });
    }
    try{
      var out = fn(payload || {});
      return Promise.resolve({ isError:false, structuredContent: JSON.parse(JSON.stringify(out)) });
    }catch(err){
      return Promise.resolve({ isError:true, structuredContent:{ ok:false, message:String((err && err.message) || err) } });
    }
  }

  window.__SMART_PAGE__ = { workbench: { callTool: callTool } };

  // 角落提示：这是演示版
  document.addEventListener("DOMContentLoaded", function(){
    var tip = document.createElement("div");
    tip.textContent = "演示版 · 示例数据，不写入资料库";
    tip.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9999;"
      + "font:12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
      + "color:#4b5563;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:999px;"
      + "padding:4px 10px;opacity:.92;pointer-events:none";
    if(document.body) document.body.appendChild(tip);
  });
})();
</script>`;

const htmlSrc = readFileSync(join(SRC, HTML_NAME), "utf8");
if(!htmlSrc.includes("</head>")) throw new Error("未找到 </head>，无法注入演示桩");
const htmlOut = htmlSrc.replace("</head>", stub + "\n</head>");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), htmlOut, "utf8");
// 同名副本：sw.js 的离线回退按原文件名匹配
writeFileSync(join(OUT, HTML_NAME), htmlOut, "utf8");
for(const f of ["manifest.json", "sw.js", "icon.svg"]) {
  copyFileSync(join(SRC, f), join(OUT, f));
}

console.log(`Pages 演示站已生成：_site/（${cards.length} 张示例卡片，${logs.length} 条示例打卡）`);
