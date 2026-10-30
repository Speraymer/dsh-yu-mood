// 插件自查更新 —— 查的是**这个插件自己的仓库**，只查不装。
//
// 原则（这几条是被人问过才定下来的）：
//   · 仓库地址从包里自己的 package.json 读（repository / homepage），代码里不写死；
//   · 只查，不下载、不替换 —— 更新命令交给用户自己复制去跑，插件不去动自己的文件；
//   · **查不到就如实说"查不到"**，绝不能显示成"已是最新" —— 这两件事差别很大；
//   · 结果缓存 6 小时；点「检查更新」（refresh=1）时绕过缓存。
//
// ⚠️ 这个文件会在几个插件里各放一份（一份实现，多处复制）。改的时候记得同步，
//    别让同名的东西在几个插件里长出不同的脾气。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 查到的结果存多久。 */
const 缓存时长 = 6 * 3600 * 1000

/** 单次抓取最多等多久 —— GitHub 有时候会挂在半路。 */
const 超时 = 8000

/**
 * 把 "1.2.3" / "v1.2.3" / "1.2.3-beta.1" 拆成可比的东西。
 * 预发布那一段单独留着：正式版永远比同号的预发布新。
 */
function 拆版本(文本) {
  const s = String(文本 || '').trim().replace(/^v/i, '')
  const 断点 = s.indexOf('-')
  const 主体 = 断点 >= 0 ? s.slice(0, 断点) : s
  const 预发布 = 断点 >= 0 ? s.slice(断点 + 1) : ''
  const 数 = 主体.split('.').map((x) => Number(x) || 0)
  return { 三段: [数[0] || 0, 数[1] || 0, 数[2] || 0], 预发布 }
}

/**
 * 版本比较：a 比 b 新返回 1，旧返回 -1，一样返回 0。
 * 只比三段数字 + 预发布（够用了，别为了这个引一个依赖）。
 */
export function 比版本(a, b) {
  const x = 拆版本(a)
  const y = 拆版本(b)
  for (let i = 0; i < 3; i++) {
    if (x.三段[i] !== y.三段[i]) return x.三段[i] > y.三段[i] ? 1 : -1
  }
  if (x.预发布 === y.预发布) return 0
  if (!x.预发布) return 1   // 正式版比预发布新
  if (!y.预发布) return -1
  return x.预发布 > y.预发布 ? 1 : -1
}

// 老名字留着：外面要是有人按 cmpVer 引用，不至于说找不到
export const cmpVer = 比版本

/**
 * 从仓库地址推出两个"能读到 package.json"的地址。
 * 备用那条走 jsDelivr —— 它也能读 GitHub，但**有缓存**，可能滞后，所以消息里会标出来。
 */
function 取地址(仓库) {
  const s = String(仓库 || '').trim()
  const m = /github\.com[/:]([^/]+)\/([^/#?]+)/i.exec(s)
  if (!m) return []
  const 主人 = m[1]
  const 名字 = m[2].replace(/\.git$/i, '')
  return [
    `https://raw.githubusercontent.com/${主人}/${名字}/HEAD/package.json`,
    `https://cdn.jsdelivr.net/gh/${主人}/${名字}@main/package.json`,
  ]
}

/**
 * 造一个自查更新器。
 * @param packageRoot 包根（读 package.json 用）
 * @param diag        日志函数
 * @returns { current, repo, repoUrl, check, register }
 */
export function createSelfUpdate({ packageRoot, diag }) {
  const 记 = typeof diag === 'function' ? diag : () => {}

  let 包信息 = {}
  try {
    包信息 = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  } catch (e) {
    记('读自己的 package.json 失败：' + (e && e.message))
  }

  const 当前版本 = String(包信息.version || '')
  const 仓库 = String(
    (包信息.repository && (包信息.repository.url || 包信息.repository)) || 包信息.homepage || ''
  )
  // 展示给人看的地址：去掉 git+ / git: 前缀和 .git 后缀，别让人复制一段 git 协议
  const 仓库地址 = 仓库
    .replace(/^git\+/, '')
    .replace(/^git:/, 'https:')
    .replace(/\.git$/, '')
    .replace(/#readme$/i, '')

  let 上次结果 = null

  /** 去仓库那边读 package.json 的版本。两个地址轮着试，全挂才认输。 */
  async function 问仓库() {
    const 地址们 = 取地址(仓库)
    if (!地址们.length) return { 版本: null, 错: '包里没写 GitHub 仓库地址，没法查' }
    let 最后的错 = ''
    for (const 地址 of 地址们) {
      try {
        const 回应 = await fetch(地址, {
          signal: AbortSignal.timeout(超时),
          headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-selfupdate' },
        })
        if (!回应.ok) {
          最后的错 = 'HTTP ' + 回应.status
          continue
        }
        const 包 = await 回应.json()
        if (!包 || !包.version) {
          最后的错 = '仓库里的 package.json 没有 version'
          continue
        }
        return {
          版本: String(包.version),
          来源: 地址.includes('jsdelivr') ? 'jsDelivr（有缓存，可能滞后）' : 'GitHub',
        }
      } catch (e) {
        最后的错 = String((e && e.message) || e)
      }
    }
    return { 版本: null, 错: 最后的错 || '查询失败' }
  }

  /** 查一次（可能命中缓存）。 */
  async function 查(强制 = false) {
    if (!强制 && 上次结果 && Date.now() - 上次结果.checkedAt < 缓存时长) {
      return { ...上次结果, cached: true }
    }
    const 结果 = await 问仓库()
    const 有新版 = Boolean(结果.版本 && 当前版本 && 比版本(结果.版本, 当前版本) > 0)
    上次结果 = {
      ok: Boolean(结果.版本),
      current: 当前版本,
      latest: 结果.版本 || null,
      hasUpdate: 有新版,
      // 本机比仓库还新：自己改过还没推，正常现象，别当成"查不到"
      ahead: Boolean(结果.版本 && 当前版本 && 比版本(结果.版本, 当前版本) < 0),
      error: 结果.错 || null,
      from: 结果.来源 || null,
      repoUrl: 仓库地址 || null,
      checkedAt: Date.now(),
    }
    记('查更新：当前 ' + 当前版本 + ' / 最新 ' + (结果.版本 || '查不到')
      + (结果.错 ? '（' + 结果.错 + '）' : ''))
    return 上次结果
  }

  /** 把 /update 挂到路由前缀下（前缀由宿主给，通常是 /dsh-xxx）。 */
  function register(ctx, 前缀) {
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: 前缀 + '/update',
        handler: async (req, res) => {
          const 回 = (码, 对象) => {
            res.writeHead(码, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify(对象))
          }
          try {
            const url = new URL(req.url, 'http://127.0.0.1')
            const 强制 = url.searchParams.get('refresh') === '1'
            回(200, { ok: true, ...(await 查(强制)) })
          } catch (e) {
            记('查更新路由失败：' + (e && e.message))
            回(200, { ok: false, current: 当前版本, latest: null, error: String((e && e.message) || e) })
          }
        },
      }))
    } catch (e) {
      记('查更新路由注册失败：' + (e && e.message))
    }
  }

  return { current: 当前版本, repo: 仓库, repoUrl: 仓库地址, check: 查, register }
}
