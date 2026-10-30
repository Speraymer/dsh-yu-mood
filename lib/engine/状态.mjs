// 状态 —— 心情账本：state.json 长什么样、老版本怎么搬过来、一条记录怎么落账。
//
// 账本分两层：
//   · **数值**（mood + 七根情绪）全局一份 —— 有心情的只有那一位，换个房间聊也是同一颗心；
//   · **理由**（lastReason / 时间线 / 今天说过几次）按房间分开 ——
//     理由里写着那轮的原话，跨房间共用就等于把 A 房间的聊天摘要漏到 B 房间去。
// 自然平复是个例外：它只说"时间过去了"，不带谁的原话，所以记在 `__shared__` 这个假房间里。
//
// ⚠️ 形状是契约：version / mood / dims / lastNotedMood / updatedAt / lastDecayAt / rooms
//    一个都不能少、七维键名不能改，旧版本（只有一条记录的 v1）也得能读进来。

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { 七维键, 夹紧 } from './量表.mjs'

/** 自然平复记在哪。不是真会话 —— 撞不上 `session-` 开头的 id。 */
export const 共用房间 = '__shared__'

/** 目标会话填这个 = 所有对话都挂。 */
export const 全部会话 = '*'

/** 一个房间最多留多少条时间线。再往前翻价值不大，只是把 state.json 撑大。 */
const 时间线最多 = 300

/** 一个房间的记录长什么样（数值不在这里，见文件头）。 */
export function 空房间() {
  return {
    lastReason: '',
    lastConfidence: 0,    // 上次判断的可信度 0~100
    injectedFor: 0,       // 已经跟这个房间说过的那个 updatedAt（同一次变化只说一次）
    lastInjectedText: '', // 真正说出去的那句原文（设置页要照原样显示，不能重新拼）
    lastInjectedAt: 0,
    saidAt: [],           // 每次"告诉她"的时间戳；只留最近 200 个够算日上限
    minor: false,         // 这次是不是小波动（小波动只记账、不进她的嘴）
    kind: '',             // '' = 判断出来的 / 'decay' = 自己平复的
    updatedAt: 0,
    timeline: [],         // [{ at, mood, delta, reason, conf, dims, dimsDelta, room }]
  }
}

/** 一份全新的账本。 */
export function 空状态() {
  const 现在 = Date.now()
  return {
    version: 2,
    mood: 70,
    dims: { happy: 0, calm: 0, sweet: 0, heartache: 0, worry: 0, sad: 0, jealous: 0 },
    lastNotedMood: 70, // 上次"记过一条"时的心情 —— 判断自然平复走够了没有
    updatedAt: 现在,
    lastDecayAt: 现在,
    rooms: {},
  }
}

/** 拿到某个房间的记录，没有就现建一条。 */
export function 房间(s, 键) {
  if (!s.rooms || typeof s.rooms !== 'object') s.rooms = {}
  const k = String(键 || 共用房间)
  if (!s.rooms[k]) s.rooms[k] = 空房间()
  return s.rooms[k]
}

/**
 * 把理由里的人称统一成「称呼」。
 * ⚠️ 兜底必须是中性的「对方」：这串字会被写进账本存下来，
 *    拿某个具体名字当兜底，等于把他人的称呼塞进别人的记忆里。
 */
export function 归一理由(文本, 对方 = '对方') {
  return String(文本 || '')
    .replace(/她说/g, 对方)
    .replace(/他说/g, 对方)
    .replace(/她/g, 对方)
}

/** 读进来的房间记录，缺什么补什么、脏值夹回范围。 */
export function 归一房间(原始, 对方 = '对方') {
  const 记录 = 空房间()
  if (!原始 || typeof 原始 !== 'object') return 记录
  记录.lastReason = 归一理由(原始.lastReason, 对方).slice(0, 200)
  记录.lastConfidence = 夹紧(Math.round(Number(原始.lastConfidence) || 0), 0, 100)
  记录.injectedFor = Number(原始.injectedFor) || 0
  记录.lastInjectedText = String(原始.lastInjectedText || '').slice(0, 400)
  记录.lastInjectedAt = Number(原始.lastInjectedAt) || 0
  记录.saidAt = Array.isArray(原始.saidAt)
    ? 原始.saidAt.map(Number).filter((x) => x > 0).slice(-200)
    : []
  记录.minor = 原始.minor === true
  记录.kind = String(原始.kind || '')
  记录.updatedAt = Number(原始.updatedAt) || 0
  记录.timeline = Array.isArray(原始.timeline)
    ? 原始.timeline.map((条) => ({ ...条, reason: 归一理由(条.reason, 对方) })).slice(-时间线最多)
    : []
  return 记录
}

/**
 * 读进来的账本，补齐 + 迁移。
 * @param 原始 磁盘上那份 JSON
 * @param 老账落哪 v1 时代那条唯一的记录该搬进哪个房间
 */
export function 归一状态(原始, { 老账落哪 = 共用房间, 对方 = '对方' } = {}) {
  const 账 = 空状态()
  if (!原始 || typeof 原始 !== 'object') return 账

  账.mood = 夹紧(Math.round(Number(原始.mood) || 70), 0, 100)
  账.lastNotedMood = Number.isFinite(Number(原始.lastNotedMood))
    ? 夹紧(Math.round(Number(原始.lastNotedMood)), 0, 100)
    : 账.mood
  账.updatedAt = Number(原始.updatedAt) || Date.now()
  账.lastDecayAt = Number(原始.lastDecayAt) || 账.updatedAt

  if (原始.dims && typeof 原始.dims === 'object') {
    for (const 键 of 七维键) 账.dims[键] = 夹紧(Math.round(Number(原始.dims[键]) || 0), 0, 100)
  }

  if (原始.rooms && typeof 原始.rooms === 'object') {
    for (const [编号, 一条] of Object.entries(原始.rooms)) 账.rooms[编号] = 归一房间(一条, 对方)
  } else {
    // v1：整份账本只有一条记录 → 搬进它当年那个房间，别让它掉进"所有房间共用"
    账.rooms[老账落哪] = 归一房间(原始, 对方)
  }
  return 账
}

/** 从磁盘读账本；读不出来就是一份新的（第一次装、文件被删、JSON 坏了）。 */
export function 读状态(路径, { 老账落哪 = 共用房间 } = {}) {
  try {
    return 归一状态(JSON.parse(readFileSync(路径, 'utf8')), { 老账落哪 })
  } catch (e) {
    return 空状态()
  }
}

/** 写账本：先写临时文件再 rename —— 半路断电也不会留下半个 JSON。 */
export function 存状态(路径, s) {
  try {
    mkdirSync(dirname(路径), { recursive: true })
    const 临 = 路径 + '.tmp'
    writeFileSync(临, JSON.stringify(s, null, 2), 'utf8')
    renameSync(临, 路径)
  } catch (e) {
    /* 存不下也不该把对话拖垮：这一轮的心情就只留在内存里 */
  }
}

/**
 * v1 那条记录该搬进哪个房间。
 * 优先看升级时手写进去的 legacy-sid.txt（那是最准的），没有才按配置推断：
 * 没选会话 / 选了"所有会话"时它本来就不属于某个房间 → 归共用房间。
 */
export function 老账归宿({ 标记文件, 配置路径 }) {
  try {
    const 手写 = readFileSync(标记文件, 'utf8').trim()
    if (手写) return 手写
  } catch (e) {
    /* 没有这个文件是正常的 */
  }
  try {
    const 原始 = JSON.parse(readFileSync(配置路径, 'utf8'))
    const 目标 = String((原始 && 原始.targetSession) || '').trim()
    if (!目标 || 目标 === 全部会话 || 目标.toLowerCase() === 'all') return 共用房间
    return 目标
  } catch (e) {
    return 共用房间
  }
}

/**
 * 落一条记录进房间：改房间的头（理由/可信度/时间），再往时间线里追一条。
 * 判定出来的变化和自然平复走同一个口子 —— 面板上的时间线才有统一的样子。
 */
export function 记一条(记录, { at, mood, delta = 0, reason = '', conf = 0, kind = '', 小波动 = false, dims, dimsDelta, 房间键 = '' }) {
  const 时间 = Number(at) || Date.now()
  记录.lastReason = String(reason == null ? '' : reason)
  记录.lastConfidence = 夹紧(Math.round(Number(conf) || 0), 0, 100)
  记录.minor = 小波动 === true
  记录.kind = String(kind || '')
  记录.updatedAt = 时间

  const 条 = {
    at: 时间,
    mood: 夹紧(Math.round(Number(mood) || 0), 0, 100),
    delta: Number(delta) || 0,
    reason: 记录.lastReason,
    conf: 记录.lastConfidence,
  }
  if (记录.kind) 条.kind = 记录.kind
  条.dims = { ...(dims || {}) }
  条.dimsDelta = { ...(dimsDelta || {}) }
  条.room = String(房间键 || 共用房间)

  if (!Array.isArray(记录.timeline)) 记录.timeline = []
  记录.timeline.push(条)
  if (记录.timeline.length > 时间线最多) 记录.timeline = 记录.timeline.slice(-时间线最多)
}

/**
 * 轮到这个房间说话时，它该读哪一条：
 * 自己房间那条 vs 共用的自然平复，取更新的那个；都没有就什么都不说。
 */
export function 挑事件(s, 键) {
  const 自己 = (s.rooms || {})[String(键 || '')]
  const 共用 = (s.rooms || {})[共用房间]
  const 候选 = [自己, 共用].filter((r) => r && r.updatedAt > 0)
  if (!候选.length) return null
  return 候选.sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

/** 面板用：所有房间里最新的那一条（自己的面板，看得见全貌才正常）。 */
export function 最新事件(s) {
  const 候选 = Object.values(s.rooms || {}).filter((r) => r && r.updatedAt > 0)
  if (!候选.length) return null
  return 候选.sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

/**
 * 面板用：把各房间的时间线合起来（带上 room 字段，旧记录没有也能显示）。
 * 顺序是旧 → 新，界面那边自己倒过来。
 */
export function 合并时间线(s, 上限 = 40) {
  const 行 = []
  for (const [编号, 记录] of Object.entries(s.rooms || {})) {
    for (const 条 of 记录.timeline || []) 行.push(条.room ? 条 : { ...条, room: 编号 })
  }
  行.sort((a, b) => Number(a.at) - Number(b.at))
  return 行.slice(-上限)
}
