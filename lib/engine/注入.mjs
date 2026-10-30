// 注入 —— 什么时候该跟这个房间说一句心情，说的是哪一句。
//
// 说这件事有个毛病：**说多了就成了背景音**。每轮都带一句"你现在心情不错"，
// 几轮之后她的口气就被这句话定死了（外面说"性格变单一、呆板"正是这个机理）。
// 所以这里的规矩是：
//   · 一次变化只说一次 —— 说出去的话留在对话历史里，下一轮照样看得见，不用再说；
//   · 先过三道闸：这次够不够显眼（小波动只记账）、判得有没有底（可信度门槛）、今天还有没有额度；
//   · 说的内容分两种：只说状态（label）/ 说"这会儿的底子 + 是什么事"（event）。
//   · 说事用的是判定现写的口语，每轮都不一样 —— 不容易呆板；而状态那一行给的是"现在的底子"。
//
// 还有一条不能丢：这段话是**背景**，不是命令。所以每句末尾都留一句
// "这是这会儿的底子，不是非这样不可" —— 以前写成"用这个心情定你这一轮的口气"，
// 那是指令，长期每轮被定调就会僵。

import { 最高几根, 心情标签, 心情基调, 时间词, 一天零时 } from './量表.mjs'
import { 挑事件, 共用房间 } from './状态.mjs'

/**
 * 拼出要说给这个房间的那一句。
 * @param s       账本（读数值）
 * @param 事件    这个房间该读的那条记录
 * @param 口径    'event' 说事 / 'label' 只说状态
 * @param 对方    对方的称呼（⭐ 别写死"她"：用这插件的可能是男的）
 * @returns 空串 = 这句不说（没有具体的事就别拿空标签凑数）
 */
export function 说一句(s, 事件, 口径, 对方 = '', 现在 = Date.now()) {
  const 称呼 = String(对方 || '').trim() || '对方'
  const 理由 = String((事件 && 事件.lastReason) || '').trim()

  if (口径 === 'event') {
    // 没有具体的"那件事"就什么都不说 —— 空标签凑数比不说更糟
    if (!理由) return ''

    const 顶 = 最高几根(s, 1)[0]
    const 状态 = '（这会儿）' + 心情基调(s.mood) + (顶 ? '，还' + 顶.短语 : '')
    // 自己平复的那条本身写的就是"时间过去了一阵"，再冠一个（刚才）就自相矛盾了
    const 来历 = (事件 && 事件.kind) === 'decay'
      ? 理由
      : `（${时间词(事件 && 事件.updatedAt, 现在)}）${理由}`

    // 三行：这会儿的底子 / 是什么事 / 允许变化。
    // 第一行是"现在"（判断跑完才注入，读到的是刚更新过的数值），第二行只是来历。
    return `${状态}
${来历}

这是这会儿的底子，不是非这样不可——${称呼}说别的，你按自己的判断接；也别把这段念出来。`
  }

  // label：只说状态，不下命令。语气词那儿用"白话"（心里挺高兴），比标签生动一点。
  const 几根 = 最高几根(s, 2).map((x) => x.白话)
  return `（此刻你）心情${心情标签(s.mood)}`
    + (几根.length ? '，' + 几根.join('、') : '')
    + `。这是背景，不是这一轮必须有的情绪；${称呼}说别的事，你就按自己的判断来，别把这句话念出来。`
}

/** 今天已经跟这个房间说过几次（过了零点重新算）。 */
export function 今天说过几次(事件, 现在 = Date.now()) {
  const 零点 = 一天零时(现在)
  return ((事件 && 事件.saidAt) || []).filter((t) => Number(t) >= 零点).length
}

/** 面板上的「这条会不会被说出来」。跟 试说 的三道闸一一对应，但**不**改账本。 */
export function 这条能不能说({ 设置, 事件 }) {
  return 设置.injectMode !== 'off'
    && Boolean(事件)
    && 事件.injectedFor !== 事件.updatedAt
    && !事件.minor
    && Number(事件.lastConfidence) >= 设置.injectConfidence
}

/**
 * 试着跟这个房间说一句。会**原地改**账本里的那条事件记录（记号：说过了 / 处理过了），
 * 但**自己不存盘** —— 由调用方决定（返回值里的 要存）。
 *
 * 三道闸的顺序就是以前的顺序：口径 → 说过没有 → 小波动 → 可信度 → 日额度。
 * 没过闸的两种（可信度、额度）会把 injectedFor 标成"处理过"，
 * 免得每轮都重复记一条同样的日志。
 *
 * @returns { 话: string, 要存: boolean }
 */
export function 试说({ 状态: s, 设置, 房间键 = '', 现在 = Date.now(), 诊断 = () => {} }) {
  const 口径 = 设置.injectMode
  if (!口径 || 口径 === 'off') return { 话: '', 要存: false }

  const 事件 = 挑事件(s, 房间键)
  if (!事件) return { 话: '', 要存: false }
  if (事件.injectedFor === 事件.updatedAt) return { 话: '', 要存: false }  // 这次变化说过了
  if (事件.minor) return { 话: '', 要存: false }                            // 小波动只记账

  const 尾 = String(房间键 || 共用房间).slice(-6)

  // 判得没底 → 只记账，不进她的嘴
  if (Number(事件.lastConfidence) < 设置.injectConfidence) {
    诊断('房间 ' + 尾 + ' 可信度 ' + 事件.lastConfidence + ' 低于门槛 ' + 设置.injectConfidence + '，这次不告诉她')
    事件.injectedFor = 事件.updatedAt
    return { 话: '', 要存: true }
  }

  // 日上限：按房间算 —— 一个房间的额度不该被另一个房间吃掉
  const 已说 = 今天说过几次(事件, 现在)
  const 上限 = Math.max(0, Number(设置.injectPerDay == null ? 6 : 设置.injectPerDay))
  if (已说 >= 上限) {
    诊断('房间 ' + 尾 + ' 今天的额度用完了（' + 已说 + '/' + 上限 + '），这次只记账、不告诉她')
    事件.injectedFor = 事件.updatedAt
    return { 话: '', 要存: true }
  }

  const 话 = 说一句(s, 事件, 口径, 设置.ownerName, 现在)
  if (!话) return { 话: '', 要存: false }

  事件.injectedFor = 事件.updatedAt
  事件.lastInjectedText = 话      // 存原文：设置页照这个显示，不重新拼
  事件.lastInjectedAt = 现在
  事件.saidAt = [...(事件.saidAt || []), 现在].slice(-200) // 记账：今天又多了一次
  诊断('告诉她心情（' + 口径 + '，房间 ' + 尾 + '）：' + 话.replace(/\n/g, ' ').slice(0, 100))
  return { 话, 要存: true }
}

/**
 * 设置页那一段「它听到的那句话」。
 *   off     = 不告诉她
 *   pending = 下一次开口会说这句
 *   minor   = 这次只是小波动，够不上门槛
 *   said    = 已经说过了（照原文显示；老记录没存原文就按当时的记录还原一句，别骗人说"还没说过"）
 */
export function 面板预览({ 状态: s, 设置, 事件, 对方 = '', 现在 = Date.now() }) {
  if (设置.injectMode === 'off') return { state: 'off', text: '' }
  if (!事件) return { state: 'pending', text: '' }
  if (事件.minor && 事件.injectedFor !== 事件.updatedAt) return { state: 'minor', text: '' }

  const 还没说 = 事件.injectedFor !== 事件.updatedAt
    && Number(事件.lastConfidence) >= 设置.injectConfidence
  if (还没说) return { state: 'pending', text: 说一句(s, 事件, 设置.injectMode, 对方, 现在) }

  const 原文 = 事件.lastInjectedText
  return {
    state: 'said',
    text: 原文 || 说一句(s, 事件, 设置.injectMode, 对方, 现在),
    replay: !原文,
  }
}
