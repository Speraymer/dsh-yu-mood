// DSH 心情（dsh-yu-mood）· 宿主半边 —— 只接线，不思考。
//
// 「怎么想」都在 lib/engine/ 里：
//   量表.mjs   七根情绪、分档阈值、把数字念成中文
//   状态.mjs   state.json 的形状、v1 迁移、一条记录怎么落账、时间线怎么合
//   衰减.mjs   没人说话的钟头里，她自己往回落
//   判定.mjs   每轮结束时问她"刚才心里动了多少"（提示词、解析、落账都在那儿）
//   注入.mjs   什么时候该跟这个房间说一句、说的是哪一句、今天还有没有额度
//   轮次.mjs   这一轮到底是谁在说话（真人 / 定时任务 / 她自己搭话）
//   配置.mjs   字段名、默认值、设置页那道补丁怎么合进来
//
// 这个文件只剩四件事：
//   1. 把心情挂到目标会话上（每轮结束判一次，一次变化最多说一次）
//   2. 每 3 秒扫一遍还活着的会话，新开的挂上、没了的摘掉
//   3. 开路由：面板 / 设置页 / 挂饰 / 形象图 / 查更新
//   4. 往页面里推挂饰脚本，并记 diag.log（出问题能回头看）
//
// 设计上的几条定死的：
//   · 心情**全局一份**（.dsh/feiyu-mood/state.json），属于"有心情的那一位"，跨会话同一个心；
//   · 数值全局共用，**理由按房间分开** —— 理由里带那轮的原话，跨房间注入就是泄漏；
//   · 自然平复记进共用房间（它说的是时间，不是哪个房间发生过什么）；
//   · 日上限也按房间算：一个房间的额度不该被另一个房间吃掉；
//   · 注入走 systemPrompt.context：它是"每轮追加的上下文"，不碰系统提示主体，
//     DeepSeek 的前缀缓存不会被打断。
//
// ⚠️ 为什么不用 @deepseek-ai/dsh-llm 的 createUserMessage / schemastery：
//   本插件用 link: 装（source 在别处），DSH 会从真实路径 import，
//   而 @deepseek-ai/* 只挂在 app.asar 里、这边解析不到（会 ERR_MODULE_NOT_FOUND）。
//   所以消息自己用 node:crypto 造，配置走本地 json 文件，不碰那些内置包。

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSelfUpdate } from './selfupdate.mjs'
import { trustedRequestOrigin } from './http.mjs'
import { 读配置, 合并补丁 } from './engine/配置.mjs'
import { 情绪, 心情标签, 心情表情 } from './engine/量表.mjs'
import {
  空状态, 存状态, 老账归宿, 最新事件, 合并时间线, 共用房间, 全部会话,
} from './engine/状态.mjs'
import { 取最新 } from './engine/衰减.mjs'
import { 判一轮, 落账, 够显眼, 有波动 } from './engine/判定.mjs'
import { 试说, 面板预览, 今天说过几次, 这条能不能说 } from './engine/注入.mjs'
import { 会话编号, 消息文本, 最后一轮, 最后一句话, 判口径, 口径名, 是不是注入上下文 } from './engine/轮次.mjs'

/** 插件对外名字（也是日志前缀、source.kind 的一部分）。 */
export const name = 'feiyu-mood'

/** 需要的宿主服务。缺哪个，装的时候就会直接报错 —— 早炸比半残强。 */
export const inject = ['systemPrompt', 'agents', 'webServer', 'llm', 'timer']

// --------------------------------------------------------------------------
// 位置
// --------------------------------------------------------------------------

const 数据目录 = process.env.DSH_HOME || join(homedir(), '.dsh')
const 插件目录 = join(数据目录, 'feiyu-mood')
const 状态路径 = join(插件目录, 'state.json')
const 配置路径 = join(插件目录, 'config.json')
const 日志路径 = join(插件目录, 'diag.log')
// 升级前可以手写一个 legacy-sid.txt，把 v1 那条记录指到某个会话
const 老会话标记 = join(插件目录, 'legacy-sid.txt')

// 包根（link 装时是源码目录，真目录装时是 node_modules/dsh-yu-mood）
const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 路由前缀。挂饰、设置页、面板都按这个前缀取值。 */
const 路由 = '/dsh-feiyu-mood'

/** 挂饰的注入行（桌面端唯一的通道：webserver/index-inject 推的结构化 script 行）。 */
const 挂饰行 = '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;'
  + 'var s=document.createElement("script");s.src="' + 路由 + '/widget.js";'
  + 's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

/** 挂饰与设置页要用的图。名字就是路由名，顺序无关。 */
const 图片 = ['feiyu.png', 'face-great.png', 'face-good.png', 'face-ok.png', 'face-worry.png', 'face-sad.png']

// --------------------------------------------------------------------------
// 日志
// --------------------------------------------------------------------------

/** 记一行诊断。写不进去就算了 —— 记日志失败绝不能拖垮对话。 */
function diag(文本) {
  try {
    mkdirSync(插件目录, { recursive: true })
    writeFileSync(日志路径, new Date().toISOString() + '  ' + 文本 + '\n', { flag: 'a' })
  } catch (e) {
    /* 诊断失败不影响主流程 */
  }
}

// --------------------------------------------------------------------------
// 主入口
// --------------------------------------------------------------------------

export function apply(ctx) {
  // 配置**读一次，之后原地改**：挂载函数和定时器闭包里抓的就是这个对象，
  // 设置页改完立刻生效，不用重启（见 engine/配置.mjs 的 合并补丁）。
  const 设置 = 读配置({ 路径: 配置路径 })
  // v1 那条记录该搬进哪个房间（有手写的 legacy-sid.txt 就听它的）
  const 老账 = 老账归宿({ 标记文件: 老会话标记, 配置路径 })

  // 设置页里那个「检查更新」：查的是这个插件自己的仓库（地址从 package.json 读，不写死）
  const 查更新 = createSelfUpdate({ packageRoot: 包根, diag })
  查更新.register(ctx, 路由)

  const 已挂 = new Map() // 房间编号 → { off }
  let 判定队列 = Promise.resolve() // 判断串行：几轮同时结束时不互相覆盖

  /** 读最新的账本（先走一步时间）。落不落盘由调用方说。 */
  function 账本({ 落盘 = false } = {}) {
    return 取最新({
      状态路径,
      基线: 设置.moodBase,
      半衰小时: 设置.decayHalfHours,
      存: 落盘,
      老账落哪: 老账,
      诊断: diag,
    })
  }

  // ------------------------------------------------------------------------
  // 挂到某个房间上
  // ------------------------------------------------------------------------
  function 挂一个(agent, sid) {
    const 摘钩 = []
    let 最近一句 = '' // 收件箱缓存：会话事件读不到时的退路
    let 最近来源 = ''
    const 收 = (摘) => { if (typeof 摘 === 'function') 摘钩.push(摘) }

    // 1) 先记下这一轮对方说了什么（宿主自己塞的上下文不算）
    try {
      收(agent.ctx.on('agent/inbox/inserted', (载荷) => {
        const 消息 = 载荷 && 载荷.message ? 载荷.message : 载荷
        const 字 = 消息文本(消息)
        const 来源 = 消息 && 消息.source && 消息.source.kind ? String(消息.source.kind) : ''
        if (!字 || 是不是注入上下文(来源)) return
        最近一句 = 字
        最近来源 = 来源
      }))
    } catch (e) {
      diag('监听 inbox 失败：' + (e && e.message))
    }

    // 2) 这一轮说完 → 判一次心情（异步，不挡对话）
    try {
      收(agent.ctx.on('agent/turn-stopping', () => {
        if (!设置.autoJudge) return

        // 以会话事件为准（带 source.kind），拿不到才退回收件箱缓存
        const 这轮 = 最后一轮(agent.session) || (最近一句 ? { text: 最近一句, sourceKind: 最近来源 } : null)
        if (!这轮 || !这轮.text) return
        const 回复 = 最后一句话(agent.session)
        const 口径 = 判口径(这轮.sourceKind)
        const 标注 = 口径 ? '（' + 口径名(口径) + '）' : ''
        const 称呼 = {
          self: 设置.selfName,
          owner: 设置.ownerName,
          aliases: 设置.selfAliases,
          judgeProvider: 设置.judgeProvider,
          judgeModel: 设置.judgeModel,
        }

        判定队列 = 判定队列.then(async () => {
          const 增量 = await 判一轮({
            大模型: ctx.llm,
            agent,
            对方话: 这轮.text,
            己方话: 回复,
            口径,
            称呼,
            诊断: diag,
          })
          if (!增量) return

          const s = 账本()
          // 一点都没动过的回合不记账：完整记录里只该留下真有过心情波动的
          if (!有波动(增量)) {
            diag('这轮判定无变化，不记入时间线' + 标注)
            return
          }
          // ⭐ 什么才算"显著"：心情涨跌够数，或者某一根情绪涨跌够数 —— 见 判定.够显眼
          const 显眼 = 够显眼(增量, 设置)
          落账(s, 增量, { 下限: 设置.moodFloor, 小波动: !显眼, 房间键: sid })
          存状态(状态路径, s)
          diag((显眼 ? '心情更新' : '小波动（只记账，不告诉她）')
            + '：mood=' + s.mood + '，' + (增量.reason || '（无理由）') + 标注)
        }).catch((e) => { diag('判断失败：' + (e && e.message)) })
      }))
    } catch (e) {
      diag('监听 turn-stopping 失败：' + (e && e.message))
    }

    // 3) 把心情告诉这个房间
    //    ⭐ 永远注册，每轮现查设置 —— 改完立刻生效。
    //    ⭐ 一次变化只说一次：这句话进了对话就留在历史里，下一轮照样看得见，
    //       重复一遍只会变成背景音，把她的口气定死（以前每轮都带，就是这个毛病）。
    try {
      收(agent.ctx.systemPrompt.context({
        name: 'feiyu-mood',
        order: 900,
        text: () => {
          try {
            const s = 账本()
            const 结果 = 试说({ 状态: s, 设置, 房间键: sid, 诊断: diag })
            if (结果.要存) 存状态(状态路径, s)
            return 结果.话
          } catch (e) {
            diag('注入失败：' + (e && e.message))
            return ''
          }
        },
      }))
    } catch (e) {
      diag('挂注入失败：' + (e && e.message))
    }

    return function 摘掉() {
      for (const 摘 of 摘钩) {
        try {
          if (typeof 摘 === 'function') 摘()
        } catch (e) {
          /* ignore */
        }
      }
    }
  }

  // ------------------------------------------------------------------------
  // 定期扫一遍活着的会话
  // ------------------------------------------------------------------------
  function 扫一遍() {
    try {
      const 活着 = ctx.agents.list() || []
      const 目标 = 设置.targetSession
      const 全部 = 目标 === 全部会话 // '*' = 所有对话来源都挂（桌面 / 微信 / QQ / 群聊）
      for (const agent of 活着) {
        const sid = 会话编号(agent.session)
        if (!sid) continue
        if (!全部 && sid !== 目标) continue
        if (已挂.has(sid)) continue
        try {
          已挂.set(sid, { off: 挂一个(agent, sid) })
          diag('已挂心情到 ' + sid)
        } catch (e) {
          diag('挂 ' + sid + ' 失败：' + (e && e.message))
        }
      }
      // 会话没了、或者目标被改成别的会话了 → 摘掉
      for (const [sid, 项] of 已挂) {
        const 没了 = !活着.some((a) => 会话编号(a.session) === sid)
        if (没了 || (!全部 && sid !== 目标)) {
          try { 项.off() } catch (e) { /* ignore */ }
          已挂.delete(sid)
        }
      }
    } catch (e) {
      /* 扫失败下一轮再说 */
    }
  }

  扫一遍()
  try {
    ctx.effect(() => ctx.interval(扫一遍, 3000))
  } catch (e) {
    console.error('[心情] 定时器不可用（不影响对话）：' + (e && e.message))
  }

  ctx.effect(() => () => {
    for (const 项 of 已挂.values()) {
      try { 项.off() } catch (e) { /* ignore */ }
    }
    已挂.clear()
  })

  // ------------------------------------------------------------------------
  // 路由
  // ------------------------------------------------------------------------
  const 读请求体 = (req) => new Promise((resolve) => {
    let 原文 = ''
    req.on('data', (块) => {
      原文 += 块
      if (原文.length > 65536) 原文 = 原文.slice(0, 65536)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(原文 || '{}')) } catch (e) { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })

  const 回JSON = (res, 码, 对象) => {
    res.writeHead(码, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(对象))
  }

  /** 注册一条 exact 路由。注册失败只记日志 —— 别的路由还能用。 */
  function 注册(路径, 处理) {
    try {
      ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: 路径, handler: 处理 }))
    } catch (e) {
      diag('路由注册失败（' + 路径 + '）：' + (e && e.message))
    }
  }

  /** 发一个文件（图片/脚本），找不到就 404。 */
  function 发文件(相对路径, 类型) {
    return async (req, res) => {
      try {
        const 内容 = readFileSync(join(包根, 相对路径))
        res.writeHead(200, { 'content-type': 类型, 'cache-control': 'no-store' })
        res.end(内容)
      } catch (e) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      }
    }
  }

  /** 面板那一坨：数值 + 七根 + 该读的那条 + 各房间 + 时间线。 */
  function 面板视图(s) {
    const 事件 = 最新事件(s) // 面板看的是所有房间里最新那条（注入只读各自房间，见 挑事件）
    return {
      ok: true,
      name: 设置.selfName,
      ownerName: 设置.ownerName,
      mood: s.mood,
      moodLabel: 心情标签(s.mood),
      emoji: 心情表情(s.mood),
      dims: 情绪.map((x) => ({ key: x.键, label: x.名, value: s.dims[x.键] })),
      lastReason: 事件 ? 事件.lastReason : '',
      lastConfidence: 事件 ? 事件.lastConfidence : 0,
      updatedAt: 事件 ? 事件.updatedAt : 0,
      injectMode: 设置.injectMode,
      injectConfidence: 设置.injectConfidence,
      injectPerDay: 设置.injectPerDay,
      saidToday: 事件 ? 今天说过几次(事件) : 0,
      decayHalfHours: 设置.decayHalfHours,
      sigMood: 设置.sigMood,
      sigDim: 设置.sigDim,
      minor: Boolean(事件 && 事件.minor),
      kind: String((事件 && 事件.kind) || ''),
      // 面板上直接看得到"这一条会不会被说出来"
      injectable: 这条能不能说({ 设置, 事件 }),
      lastInjectedText: 事件 ? 事件.lastInjectedText : '',
      lastInjectedAt: 事件 ? 事件.lastInjectedAt : 0,
      // ⭐ 设置页要能原样看到"她会听到的那句话"
      injectPreview: 面板预览({ 状态: s, 设置, 事件, 对方: 设置.ownerName }),
      // 各房间自己那条（能看出这句话是在哪个房间说的）
      rooms: Object.entries(s.rooms || {})
        .filter(([, r]) => r && r.updatedAt > 0)
        .map(([id, r]) => ({ id, shared: id === 共用房间, reason: r.lastReason, at: r.updatedAt }))
        .sort((a, b) => b.at - a.at),
      timeline: 合并时间线(s, 40),
      timelineTotal: Object.values(s.rooms || {}).reduce((n, r) => n + ((r && r.timeline && r.timeline.length) || 0), 0),
    }
  }

  // 4.0) 心情快照：面板和挂饰都在读
  注册(路由 + '/state', async (req, res) => {
    try {
      const s = 账本({ 落盘: true })
      回JSON(res, 200, 面板视图(s))
    } catch (e) {
      回JSON(res, 500, { ok: false, error: String(e && e.message) })
    }
  })

  // 4.1) 设置页：读 / 改配置
  注册(路由 + '/config', async (req, res) => {
    try {
      if (req.method === 'POST') {
        if (!trustedRequestOrigin(req)) return 回JSON(res, 403, { ok: false, error: '请求来源不匹配' })
        const 补丁 = await 读请求体(req)
        合并补丁({ 设置, 补丁, 路径: 配置路径, 诊断: diag })
        diag('设置已改：' + JSON.stringify(补丁).slice(0, 200))
      }
      return 回JSON(res, 200, { ok: true, config: { ...设置 } })
    } catch (e) {
      return 回JSON(res, 500, { ok: false, error: String(e && e.message) })
    }
  })

  // 4.2) 判断模型可选项（设置页的下拉用）
  注册(路由 + '/models', async (req, res) => {
    const 厂商们 = []
    try {
      for (const 厂商 of (ctx.llm && ctx.llm.listProviders ? ctx.llm.listProviders() : []) || []) {
        const 项 = { id: 厂商.id, name: 厂商.name || 厂商.id, models: [] }
        try {
          const 型号们 = (ctx.llm.listModels && await ctx.llm.listModels(厂商.id)) || []
          for (const m of 型号们) 项.models.push({ id: m.id, name: m.name || m.id })
        } catch (e) {
          /* 某个厂商拉不出来就算了，别整单失败 */
        }
        厂商们.push(项)
      }
    } catch (e) {
      diag('列模型失败：' + (e && e.message))
    }
    return 回JSON(res, 200, { ok: true, providers: 厂商们 })
  })

  // 4.3) 重置心情到基线
  注册(路由 + '/reset', async (req, res) => {
    try {
      if (req.method !== 'POST') return 回JSON(res, 405, { ok: false, error: '只接受 POST' })
      if (!trustedRequestOrigin(req)) return 回JSON(res, 403, { ok: false, error: '请求来源不匹配' })
      const s = 空状态()
      s.mood = 设置.moodBase
      s.lastNotedMood = 设置.moodBase
      存状态(状态路径, s)
      diag('心情已重置到基线 ' + 设置.moodBase)
      return 回JSON(res, 200, { ok: true, mood: s.mood })
    } catch (e) {
      return 回JSON(res, 500, { ok: false, error: String(e && e.message) })
    }
  })

  // 4.4) 会话清单（设置页的下拉用）
  注册(路由 + '/sessions', async (req, res) => {
    const 清单 = []
    try {
      const 家 = dirname(插件目录)
      const 会话根 = join(家, 'sessions')
      const 缓存根 = join(家, 'storages', 'session_projcache', 'sessions')
      const 归档 = new Set()
      try {
        const 工作区 = JSON.parse(readFileSync(join(家, 'storages', 'workspace.json'), 'utf8'))
        for (const id of (工作区 && 工作区.global && 工作区.global.archivedSessionIds) || []) 归档.add(String(id))
      } catch (e) {
        /* 没有归档名单就算了 */
      }
      const 子目录 = (p) => {
        try {
          return readdirSync(p, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name)
        } catch (e) {
          return []
        }
      }
      const 行 = []
      for (const 工作区 of 子目录(会话根)) {
        for (const sid of 子目录(join(会话根, 工作区))) {
          if (!sid.startsWith('session-')) continue
          if (!existsSync(join(会话根, 工作区, sid, 'session.v4.jsonl.zstd'))) continue
          if (归档.has(sid)) continue
          let 标题 = ''
          let 时间 = 0
          let 空的 = false
          try {
            const 缓存 = JSON.parse(readFileSync(join(缓存根, sid + '.json'), 'utf8'))
            const 行们 = (缓存 && 缓存.record && 缓存.record.rows) || {}
            标题 = String((行们.title && 行们.title.val) || '')
            const 元 = (行们.sessionListMetadata && 行们.sessionListMetadata.val) || {}
            时间 = Number(元.lastPromptAt || 0)
            空的 = Boolean(元.blank)
          } catch (e) {
            /* 缓存读不到就用 id 当标题 */
          }
          if (空的) continue
          行.push({ id: sid, title: 标题 || sid, at: 时间 })
        }
      }
      行.sort((a, b) => b.at - a.at)
      for (const r of 行) 清单.push({ id: r.id, title: r.title })
    } catch (e) {
      diag('列会话失败：' + (e && e.message))
    }
    return 回JSON(res, 200, { ok: true, sessions: 清单, current: 设置.targetSession })
  })

  // 5) 右下角挂饰：脚本 + 图片
  注册(路由 + '/widget.js', 发文件('assets/widget.js', 'text/javascript; charset=utf-8'))
  for (const 名 of 图片) 注册(路由 + '/' + 名, 发文件('assets/' + 名, 'image/png'))

  // 6) 往页面里推挂饰脚本（桌面端唯一的通道）
  try {
    ctx.on('webserver/index-inject', (表) => {
      if (!Array.isArray(表)) return
      // 已经推过就别再推一条（同一个页面被注入两次会挂两个挂饰）
      for (const 行 of 表) {
        if (行 && ((行.kind === 'script-src' && 行.src === 路由 + '/widget.js')
          || (行.kind === 'script' && typeof 行.text === 'string' && 行.text.indexOf(路由 + '/widget.js') >= 0))) return
      }
      表.push({ kind: 'script', placement: 'body', text: 挂饰行 })
    })
  } catch (e) {
    diag('挂饰注入失败：' + (e && e.message))
  }
}
