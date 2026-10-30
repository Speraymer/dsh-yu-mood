// 轮次 —— 这一轮到底是谁在说话。
//
// 判断"心情变没变"之前，得先知道**该看谁**。会话事件流里混着好几类消息：
//   · 宿主每轮自动塞进来的上下文（runtime-context / time-context…）—— 不是人说的
//   · 别的插件发来的消息（dsh-* 的各种 source.kind）—— 也不是
//   · 定时任务（到点了去干活）、她自己主动搭话 —— 是"这一轮由头"，口径跟聊天不一样
//   · 真人打过来的字 —— 正常聊
// 2026-10-19 真踩过：把 runtime-context 当成"对方这轮说的话"，
// 结果每一轮都判成"被叫起来干活"，真人说的反而被跳过。
//
// ⚠️ 这里只管"从会话里把这一轮捞出来"，不判断心情；判断的规则在 判定.mjs。

/** 宿主注入的上下文。这些**不是人说的话**，判断时必须跳过。 */
const 注入上下文 = new Set(['runtime-context', 'time-context', 'system-reminder', 'system', 'time-sampled'])

/** 这个来源是不是宿主塞进来的上下文（收件箱那条路也要用）。 */
export function 是不是注入上下文(来源) {
  return 注入上下文.has(String(来源 || ''))
}

/**
 * source.kind → 判断口径。
 *   'work' 定时任务叫她去干活 → 判她这轮在忙什么
 *   'talk' 她自己主动来找你   → 判她自己那股劲儿（不是干活！）
 *   ''     正常聊天
 * 加新插件要接进来，只改这一张表。
 */
const 口径表 = {
  'bili-duty-scan': 'work',
  'speak-up': 'talk',
}

/** 这个来源属于哪种口径。 */
export function 判口径(来源) {
  return 口径表[String(来源 || '')] || ''
}

/** 口径给人看的名字（日志里用）。 */
export function 口径名(口径) {
  if (口径 === 'work') return '定时任务'
  if (口径 === 'talk') return '自己搭话'
  return ''
}

/** 会话对象上取编号：不同宿主版本字段名不一样，挨个试。 */
export function 会话编号(session) {
  if (!session) return ''
  for (const 键 of ['id', 'sessionId', 'key', 'sessionKey', 'sid']) {
    try {
      const v = session[键]
      if (typeof v === 'string' && v) return v
    } catch (e) {
      /* 取不到的字段就当没有 */
    }
  }
  return ''
}

/** 把一条消息里的文字抓出来（字符串、text、content 数组都认）。 */
export function 消息文本(p) {
  if (!p) return ''
  if (typeof p === 'string') return p.slice(0, 2000)
  if (typeof p.text === 'string') return p.text.slice(0, 2000)
  if (typeof p.content === 'string') return p.content.slice(0, 2000)
  if (Array.isArray(p.content)) {
    const 段 = []
    for (const 块 of p.content) {
      if (typeof 块 === 'string') 段.push(块)
      else if (块 && typeof 块.text === 'string') 段.push(块.text)
    }
    if (段.length) return 段.join(' ').slice(0, 2000)
  }
  return ''
}

/** 会话是不是还在、能不能读事件流。 */
function 能读(session) {
  try {
    return Boolean(session) && typeof session.snapshotEvents === 'function'
  } catch (e) {
    return false
  }
}

function 事件体(e) {
  return e.payload !== undefined ? e.payload : e.data
}

/**
 * 从后往前找**第一条真人/真触发**的消息。
 * @returns { text, sourceKind } | null
 */
export function 最后一轮(session) {
  if (!能读(session)) return null
  try {
    const 事件 = session.snapshotEvents() || []
    for (let i = 事件.length - 1; i >= 0; i--) {
      const e = 事件[i]
      if (!e || ((e.type || e.kind) !== 'user/message')) continue
      const 体 = 事件体(e)
      const 字 = 消息文本(体)
      if (!字) continue
      const 来源 = 体 && 体.source && 体.source.kind ? String(体.source.kind) : ''
      if (是不是注入上下文(来源)) continue      // 宿主塞的上下文：跳过
      if (口径表[来源]) return { text: 字, sourceKind: 来源 } // 定时任务 / 自己搭话
      if (来源 && 来源 !== 'user') continue     // 其它插件的消息：也不是人在说
      return { text: 字, sourceKind: 'user' }
    }
  } catch (e) {
    /* 读事件流出问题就当这轮没有 —— 下一轮再说 */
  }
  return null
}

/** 她这一轮自己说的最后一段话。判断时它同样是证据，往往比对方的话更直接。 */
export function 最后一句话(session) {
  if (!能读(session)) return ''
  try {
    const 事件 = session.snapshotEvents() || []
    for (let i = 事件.length - 1; i >= 0; i--) {
      const e = 事件[i]
      if (!e || ((e.type || e.kind) !== 'assistant/message')) continue
      const 字 = 消息文本(事件体(e))
      if (字) return 字
    }
  } catch (e) {
    /* 同上 */
  }
  return ''
}

/** 这一轮用的是哪个模型：设置里指了就用指的，没指就跟着当前会话走。 */
export function 取模型(agent) {
  try {
    const 头 = agent && agent.session && agent.session.requestHeader ? agent.session.requestHeader() : null
    const 配置 = 头 && 头.config
    if (配置 && 配置.provider && 配置.model) return { provider: 配置.provider, model: 配置.model }
  } catch (e) {
    /* 有的宿主版本没有 requestHeader，往下退 */
  }
  try {
    const 选项 = agent && agent.options
    if (选项 && 选项.provider && 选项.model) return { provider: 选项.provider, model: 选项.model }
  } catch (e) {
    /* ignore */
  }
  return null
}

/** 判断要用的目标模型：设置优先，其次当前会话。 */
export function 判模型的去处(称呼 = {}, agent) {
  const 指定 = 称呼.judgeProvider && 称呼.judgeModel
    ? { provider: 称呼.judgeProvider, model: 称呼.judgeModel }
    : null
  return 指定 || 取模型(agent)
}
