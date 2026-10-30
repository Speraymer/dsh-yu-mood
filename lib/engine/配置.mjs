// 配置 —— 字段名、默认值，以及"设置页改一格，宿主那边立刻跳数"的那点机制。
//
// ⚠️ 字段名是契约，一个都不能改：设置页按这些名字读写，老配置、别人写好的脚本也按这些名字读。
//    要加字段可以；改名等于把所有装过这插件的人的设置清空。
//
// 两条容易忽略的规矩：
//   · 读的时候一律兜底 + 夹紧 —— 手改 JSON 写进去 0 / 空串 / 字符串数字都不该把账算崩；
//   · 改的时候**原地改同一个对象**（合并补丁 里 for 写回）：挂载函数和定时器闭包里
//     抓的就是这个对象，换一个新对象它们看不到，设置页就得重启才生效。

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { 夹紧 } from './量表.mjs'
import { 全部会话 } from './状态.mjs'

/** 默认值（唯一一份真源）。 */
export const 默认配置 = {
  // 盯哪个会话。默认**不盯任何会话** —— 以前这里写死过某个人的开发会话 id，
  // 别人装上等于盯一个不存在的房间：不报错、也不生效，只会以为插件坏了。
  targetSession: '',
  // 有心情的那一位叫什么。默认中性，别人家不叫大肥鱼。
  selfName: '伙伴',
  // 对方叫什么。默认"对方"，装完不填也不会串成别人的名字。
  ownerName: '对方',
  // TA 平时怎么叫你（逗号分隔）：判断时这些词是"在叫你"，不是名词的一部分。
  selfAliases: '',
  // 判断用哪个模型；留空 = 跟着当前会话走。
  judgeProvider: '',
  judgeModel: '',
  // 心情的基线与下限。0~100 分，没有底线时真发生大事可以一直掉到 0，靠时间慢慢回稳。
  moodBase: 70,
  moodFloor: 0,
  // 自己平复的快慢（小时，半衰期）。12 小时 = 隔一夜还留着余温。
  decayHalfHours: 12,
  // 怎么把心情告诉她：off 不说 / label 只说心情 / event 说这会儿的底子 + 是什么事。
  injectMode: 'event',
  // 可信度门槛（0-100）：低于它只记账、不进她的嘴。
  injectConfidence: 60,
  // 什么才算"显著变化"（够不着就只记账、不告诉她）。
  // 判定给的原始涨跌平时就 1~3，心情又只吃三分之一 ⇒ 常动 1 格；
  // 所以这里比的是**判定原始值**，不是心情实际涨跌。实测 3 / 5 才有百分之十几的回合能过。
  sigMood: 3,
  sigDim: 5,
  // 每个房间每天最多说几次（先到先得）。门槛调低之后靠它防"变背景音"。
  injectPerDay: 6,
  autoJudge: true,
}

/** 认的注入口径。'off' 之外还有两种说话的写法。 */
export const 注入方式 = ['off', 'label', 'event']

/**
 * 目标会话归一：空 → 不盯；'all' / '*' → 所有会话；其余原样。
 * （'all' 是给人手写配置用的，大小写都认。）
 */
export function 归一目标(值) {
  const s = String(值 == null ? '' : 值).trim()
  if (!s) return 默认配置.targetSession
  if (s === 全部会话 || s.toLowerCase() === 'all') return 全部会话
  return s
}

/** 读了但没给值（undefined / null）才用兜底 —— 跟 `??` 一个意思。 */
function 缺省(原始, 键, 兜底) {
  const v = 原始 ? 原始[键] : undefined
  return v == null ? 兜底 : v
}

/** `Math.round(Number(v) || 0)` 再夹进 [低, 高]：字符串数字也认，脏值落 0。 */
function 数格(值, 低, 高) {
  return 夹紧(Math.round(Number(值) || 0), 低, 高)
}

/**
 * 读配置。文件不存在、JSON 坏了、字段乱写 —— 一律退回默认值，绝不让插件起不来。
 * @param 路径   config.json 的绝对路径
 */
export function 读配置({ 路径 }) {
  let 原始
  try {
    原始 = JSON.parse(readFileSync(路径, 'utf8'))
  } catch (e) {
    return { ...默认配置 }
  }
  if (!原始 || typeof 原始 !== 'object') return { ...默认配置 }

  const 口径 = String(原始.injectMode || '')
  return {
    targetSession: 归一目标(原始.targetSession),
    selfName: String(原始.selfName || 默认配置.selfName).trim().slice(0, 16) || 默认配置.selfName,
    ownerName: String(原始.ownerName || 默认配置.ownerName).trim().slice(0, 16) || 默认配置.ownerName,
    selfAliases: String(原始.selfAliases || '').trim().slice(0, 60),
    judgeProvider: String(原始.judgeProvider || '').trim().slice(0, 60),
    judgeModel: String(原始.judgeModel || '').trim().slice(0, 80),
    moodBase: 数格(Number(原始.moodBase) || 默认配置.moodBase, 30, 100),
    moodFloor: 数格(Number(原始.moodFloor) || 0, 0, 100),
    // 老配置里只有 injectMood（布尔）：false = 关；true 的当成 event（比以前更省、更不像被人安排）
    injectMode: 注入方式.includes(口径)
      ? 口径
      : (原始.injectMood === false ? 'off' : 默认配置.injectMode),
    injectConfidence: 数格(缺省(原始, 'injectConfidence', 默认配置.injectConfidence), 0, 100),
    decayHalfHours: 数格(缺省(原始, 'decayHalfHours', 默认配置.decayHalfHours), 1, 168),
    sigMood: 数格(缺省(原始, 'sigMood', 默认配置.sigMood), 1, 30),
    sigDim: 数格(缺省(原始, 'sigDim', 默认配置.sigDim), 1, 100),
    injectPerDay: 数格(缺省(原始, 'injectPerDay', 默认配置.injectPerDay), 0, 50),
    autoJudge: 原始.autoJudge !== false,
  }
}

/** 写配置：临时文件 + rename，半路断电不会留下半个 JSON。 */
export function 存配置(路径, 下一份, 诊断 = () => {}) {
  try {
    mkdirSync(dirname(路径), { recursive: true })
    const 临 = 路径 + '.tmp'
    writeFileSync(临, JSON.stringify(下一份, null, 2), 'utf8')
    renameSync(临, 路径)
  } catch (e) {
    诊断('保存配置失败：' + (e && e.message))
  }
}

/**
 * 把设置页传来的补丁合并进当前配置。
 * ⚠️ 原地改 设置（不换对象），否则闭包里读到的还是老值 —— 设置页改完要重启才生效。
 *
 * @returns 同一个 设置 对象
 */
export function 合并补丁({ 设置, 补丁, 路径, 诊断 = () => {} }) {
  const p = 补丁 && typeof 补丁 === 'object' ? 补丁 : {}
  const 下一份 = { ...设置 }

  if (typeof p.targetSession === 'string') 下一份.targetSession = 归一目标(p.targetSession)
  if (typeof p.selfName === 'string' && p.selfName.trim()) 下一份.selfName = p.selfName.trim().slice(0, 16)
  if (typeof p.ownerName === 'string' && p.ownerName.trim()) 下一份.ownerName = p.ownerName.trim().slice(0, 16)
  if (typeof p.selfAliases === 'string') 下一份.selfAliases = p.selfAliases.trim().slice(0, 60)
  if (typeof p.judgeProvider === 'string') 下一份.judgeProvider = p.judgeProvider.trim().slice(0, 60)
  if (typeof p.judgeModel === 'string') 下一份.judgeModel = p.judgeModel.trim().slice(0, 80)
  if (p.moodBase != null) 下一份.moodBase = 数格(Number(p.moodBase) || 默认配置.moodBase, 30, 100)
  if (p.moodFloor != null) 下一份.moodFloor = 数格(Number(p.moodFloor) || 0, 0, 100)
  if (typeof p.injectMode === 'string' && 注入方式.includes(p.injectMode)) 下一份.injectMode = p.injectMode
  if (p.injectConfidence != null) 下一份.injectConfidence = 数格(p.injectConfidence, 0, 100)
  if (p.decayHalfHours != null) 下一份.decayHalfHours = 数格(p.decayHalfHours, 1, 168)
  if (p.sigMood != null) 下一份.sigMood = 数格(p.sigMood, 1, 30)
  if (p.sigDim != null) 下一份.sigDim = 数格(p.sigDim, 1, 100)
  if (p.injectPerDay != null) 下一份.injectPerDay = 数格(p.injectPerDay, 0, 50)
  if (typeof p.autoJudge === 'boolean') 下一份.autoJudge = p.autoJudge

  for (const 键 of Object.keys(下一份)) 设置[键] = 下一份[键]
  存配置(路径, 下一份, 诊断)
  return 设置
}
