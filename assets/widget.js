// DSH 心情（dsh-yu-mood）· 右下角挂饰（浏览器端，纯 DOM，没有依赖）
//
// 整张形象图就是按钮：点一下展开当前心情，按住可以拖到别处（拖不出屏幕）。
//
// 面板跟设置页是同一套观感（2026-10-31 重做，跟上游那种圆角灰卡不是一路）：
//   · 不画圆角卡：靠左侧 3px 竖线分区，标题是小号稀疏字距；
//   · 分数当主角，脸只做一个 46px 圆形头像贴在左边；
//   · 七根情绪用 4px 细条 + 各自的色相，右侧挂数字；
//   · 记录页是一张紧凑表格（等宽时间 / 带色的涨跌 / 理由）。
//
// 只读一个接口：GET /dsh-feiyu-mood/state
// 只用到这些字段：ok / mood / lastReason / dims[{key,label,value}] / timeline[{at,mood,delta,reason,dimsDelta}]
// ⚠️ 这几个字段是跟宿主约好的，改面板可以，别改它们。
;(function () {
  'use strict'

  if (window.__yuMoodWidget) return
  window.__yuMoodWidget = true

  var 前缀 = '/dsh-feiyu-mood'

  // 五档表情：跟宿主 量表.mjs 的分档一致（80 / 62 / 42 / 25）
  var 表情 = [
    { 线: 80, 图: 前缀 + '/face-great.png', 名: '欢喜' },
    { 线: 62, 图: 前缀 + '/face-good.png', 名: '开心' },
    { 线: 42, 图: 前缀 + '/face-ok.png', 名: '一般' },
    { 线: 25, 图: 前缀 + '/face-worry.png', 名: '心疼' },
    { 线: -Infinity, 图: 前缀 + '/face-sad.png', 名: '难过' }
  ]

  // 七根情绪的颜色：**跟 client.js 里那套是同一份**，改这里记得同步那边。
  var 情绪色 = {
    happy: '#d8a03c', calm: '#3f9c94', sweet: '#d4739f', heartache: '#d97b3f',
    worry: '#4f7fc1', sad: '#6b7a94', jealous: '#8f6bc1'
  }
  var 情绪名 = {
    happy: '开心', calm: '踏实', sweet: '甜蜜', heartache: '心疼',
    worry: '担心', sad: '难过', jealous: '吃醋'
  }
  var 情绪序 = ['happy', 'calm', 'sweet', 'heartache', 'worry', 'sad', 'jealous']

  function 这一档(分) {
    var v = Number(分)
    if (!isFinite(v)) v = 50
    for (var i = 0; i < 表情.length; i++) if (v >= 表情[i].线) return 表情[i]
    return 表情[表情.length - 1]
  }

  var 样式 = document.createElement('style')
  样式.textContent = [
    '.ym-widget{position:fixed;right:18px;bottom:18px;z-index:99990;width:180px;height:180px;',
    'cursor:grab;user-select:none;background:transparent;border:0;padding:0;-webkit-user-drag:none;',
    'transition:filter .15s}',
    '.ym-widget:hover{filter:brightness(1.04)}',
    '.ym-widget:active{cursor:grabbing}',
    '.ym-widget>img{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;',
    'filter:drop-shadow(0 10px 18px rgba(0,0,0,.35))}',
    // 面板：深色薄描边、零圆角、没有大圆角灰底
    '.ym-panel{--ym-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
    'position:absolute;left:0;bottom:calc(100% + 12px);width:304px;max-height:64vh;overflow:auto;',
    'background:#101216;color:#e9eaec;border:1px solid rgba(255,255,255,.16);border-radius:2px;',
    'box-shadow:0 18px 40px rgba(0,0,0,.55);padding:16px 16px 14px;display:none;',
    'font-size:13px;line-height:1.6;cursor:auto;',
    'font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}',
    '.ym-panel img{pointer-events:none;-webkit-user-drag:none}',
    // 头部：圆形头像 + 大分数
    '.ym-p-head{display:flex;align-items:center;gap:14px;padding-left:12px;border-left:3px solid #7d93b2}',
    '.ym-avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;object-position:center 34%;',
    'border:1px solid rgba(255,255,255,.18);flex:none;background:rgba(255,255,255,.05)}',
    '.ym-score{font-size:34px;line-height:.95;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}',
    '.ym-label{font-size:10px;letter-spacing:.28em;color:rgba(233,234,236,.6);margin-top:4px}',
    '.ym-reason{color:rgba(233,234,236,.62);font-size:12px;line-height:1.7;margin:12px 0 14px;',
    'padding-left:12px;border-left:3px solid rgba(255,255,255,.10);overflow-wrap:anywhere}',
    // 分区头：编号 + 稀疏字距小标题 + 细分割线
    '.ym-sec{display:flex;align-items:baseline;gap:10px;margin:16px 0 9px;padding-bottom:6px;',
    'border-bottom:1px solid rgba(255,255,255,.13)}',
    '.ym-sec-no{font-family:var(--ym-mono);font-size:10px;color:rgba(233,234,236,.35)}',
    '.ym-sec-title{font-size:10px;letter-spacing:.2em;color:rgba(233,234,236,.6)}',
    // 七根细条
    '.ym-dims{display:flex;flex-direction:column;gap:8px;padding-left:12px;border-left:3px solid rgba(255,255,255,.10)}',
    '.ym-dim{display:grid;grid-template-columns:44px 1fr 26px;align-items:center;gap:9px}',
    '.ym-dimname{font-size:10px;letter-spacing:.12em;color:rgba(233,234,236,.55)}',
    '.ym-track{height:4px;background:rgba(255,255,255,.10);overflow:hidden}',
    '.ym-track>i{display:block;height:100%}',
    '.ym-value{font-family:var(--ym-mono);font-size:10px;text-align:right;color:rgba(233,234,236,.6)}',
    // 按钮：直角、细描边、稀疏字距
    '.ym-btn{margin-top:16px;display:block;width:100%;padding:8px 0;border:1px solid rgba(255,255,255,.18);',
    'border-radius:0;background:transparent;color:inherit;cursor:pointer;font-size:11px;letter-spacing:.16em;',
    'text-align:center;font-family:inherit}',
    '.ym-btn:hover{border-color:#7d93b2;color:#a9bdd9}',
    '.ym-back{color:#9fb6d6;cursor:pointer;font-size:11px;letter-spacing:.1em;display:inline-block;margin-bottom:6px}',
    '.ym-back:hover{text-decoration:underline}',
    // 记录：紧凑网格行（时间 / 涨跌 / 理由）
    '.ym-day{display:flex;align-items:baseline;gap:10px;margin:14px 0 6px;padding-bottom:5px;',
    'border-bottom:1px solid rgba(255,255,255,.13)}',
    '.ym-day-date{font-size:10px;letter-spacing:.16em;color:rgba(233,234,236,.6)}',
    '.ym-day-count{font-family:var(--ym-mono);font-size:10px;color:rgba(233,234,236,.35)}',
    '.ym-logrow{display:grid;grid-template-columns:46px 64px 1fr;gap:8px;padding:6px 0;',
    'border-bottom:1px solid rgba(255,255,255,.07);font-size:12px;align-items:baseline}',
    '.ym-time{font-family:var(--ym-mono);font-size:10px;color:rgba(233,234,236,.45)}',
    '.ym-d{white-space:nowrap}',
    '.ym-delta{font-family:var(--ym-mono);font-size:11px}',
    '.ym-mood{font-family:var(--ym-mono);font-size:10px;color:rgba(233,234,236,.4);margin-left:6px}',
    '.ym-up{color:#5fbf8a}',
    '.ym-down{color:#e08076}',
    '.ym-flat{color:rgba(233,234,236,.45)}',
    '.ym-say{overflow-wrap:anywhere;word-break:break-word}',
    '.ym-dims-line{font-family:var(--ym-mono);font-size:10px;color:rgba(233,234,236,.42);',
    'padding:0 0 6px 54px}',
    '.ym-empty{font-size:12px;color:rgba(233,234,236,.5)}'
  ].join('')
  document.head.appendChild(样式)

  // --------------------------------------------------------------------
  // 小工具
  // --------------------------------------------------------------------
  function 节点(标签, 类名, 文字) {
    var n = document.createElement(标签)
    if (类名) n.className = 类名
    if (文字 != null) n.textContent = 文字
    return n
  }
  function 图片(地址, 类名, 说明) {
    var n = document.createElement('img')
    n.src = 地址
    n.className = 类名
    n.alt = 说明 || ''
    n.draggable = false
    return n
  }
  function 补零(n) { return String(n).padStart(2, '0') }
  function 两点(毫秒) {
    var d = new Date(毫秒)
    return 补零(d.getHours()) + ':' + 补零(d.getMinutes())
  }
  function 日期(毫秒) {
    var d = new Date(毫秒)
    return d.getFullYear() + '-' + 补零(d.getMonth() + 1) + '-' + 补零(d.getDate())
  }
  /** 涨跌文字：带符号的数字（0 就写 0）。 */
  function 涨跌文(值) {
    var n = Number(值) || 0
    if (n > 0) return '+' + n
    return String(n)
  }
  /** 涨跌颜色：正绿负红，零落灰。 */
  function 涨跌色(值) {
    var n = Number(值) || 0
    if (n > 0) return 'ym-up'
    if (n < 0) return 'ym-down'
    return 'ym-flat'
  }

  // --------------------------------------------------------------------
  // 骨架：挂饰 + 面板
  // --------------------------------------------------------------------
  var 挂饰 = 节点('div', 'ym-widget')
  挂饰.title = '心情（点开看，按住拖动换位置）'
  var 形象 = 图片(前缀 + '/feiyu.png', '', '形象')
  挂饰.appendChild(形象)

  var 面板 = 节点('div', 'ym-panel')
  挂饰.appendChild(面板)

  var 页面 = '主'   // '主' | '记录'
  var 打开 = false
  var 数据 = null

  /**
   * 面板按屏幕边摆：横向居中于挂饰再夹进视口；上面放得下就朝上，放不下就翻到下面。
   * 每次都重新量（面板高度会随内容变）—— 用固定值会把第二种页面摆歪。
   */
  function 摆面板() {
    var 我 = 挂饰.getBoundingClientRect()
    var 宽 = 面板.offsetWidth || 304
    var 高 = 面板.offsetHeight || 340
    var 边 = 8

    var 左 = (我.width - 宽) / 2
    if (我.left + 左 < 边) 左 += 边 - (我.left + 左)
    if (我.left + 左 + 宽 > window.innerWidth - 边) 左 -= (我.left + 左 + 宽) - (window.innerWidth - 边)
    面板.style.left = 左 + 'px'
    面板.style.right = 'auto'

    if (我.top >= 高 + 20) {
      面板.style.top = 'auto'
      面板.style.bottom = (我.height + 12) + 'px'
    } else {
      面板.style.bottom = 'auto'
      面板.style.top = (我.height + 12) + 'px'
    }
  }

  /** 分区头：编号 + 小号稀疏标题（跟设置页同一套）。 */
  function 分区头(编号, 标题) {
    var 头 = 节点('div', 'ym-sec')
    头.appendChild(节点('span', 'ym-sec-no', 编号))
    头.appendChild(节点('span', 'ym-sec-title', 标题))
    return 头
  }

  /** 主面板：圆形头像 + 大分数 + 最近那件事 + 七根色条 + 入口按钮。 */
  function 画主面板(d) {
    var 档 = 这一档(d.mood)
    面板.innerHTML = ''

    var 头 = 节点('div', 'ym-p-head')
    头.appendChild(图片(档.图, 'ym-avatar', 档.名))
    var 说明 = 节点('div')
    说明.appendChild(节点('div', 'ym-score', String(d.mood != null ? d.mood : '--')))
    说明.appendChild(节点('div', 'ym-label', 档.名))
    头.appendChild(说明)
    面板.appendChild(头)

    面板.appendChild(节点('div', 'ym-reason', d.lastReason || '这会儿平静地待着，等你来。'))
    面板.appendChild(分区头('01', '情绪'))

    var 条区 = 节点('div', 'ym-dims')
    var 条子 = d.dims || []
    for (var i = 0; i < 条子.length; i++) {
      var 一根 = 条子[i]
      var 行 = 节点('div', 'ym-dim')
      if (一根.key) 行.setAttribute && 行.setAttribute('data-ym-dim', 一根.key)
      行.appendChild(节点('span', 'ym-dimname', 一根.label || 情绪名[一根.key] || ''))
      var 槽 = 节点('div', 'ym-track')
      var 填充 = 节点('i')
      填充.style.width = Math.max(0, Math.min(100, Number(一根.value) || 0)) + '%'
      填充.style.background = 情绪色[一根.key] || 'rgba(255,255,255,.35)'
      槽.appendChild(填充)
      行.appendChild(槽)
      行.appendChild(节点('span', 'ym-value', String(一根.value || 0)))
      条区.appendChild(行)
    }
    面板.appendChild(条区)

    var 去记录 = 节点('button', 'ym-btn', '看完整记录')
    去记录.addEventListener('click', function (ev) {
      ev.stopPropagation()
      页面 = '记录'
      画记录(d)
    })
    面板.appendChild(去记录)
    摆面板()
  }

  /** 记录页：按天分组，每行「等宽时间 / 带色涨跌 / 理由」，下面一行七维变化。 */
  function 画记录(d) {
    面板.innerHTML = ''

    var 返回 = 节点('span', 'ym-back', '‹ 返回当前心情')
    返回.addEventListener('click', function (ev) {
      ev.stopPropagation()
      页面 = '主'
      画主面板(d)
    })
    面板.appendChild(返回)
    面板.appendChild(分区头('02', '完整记录'))

    var 全部 = (d.timeline || []).slice().reverse()   // 新的在上
    if (!全部.length) {
      面板.appendChild(节点('div', 'ym-empty', '还没有记录 —— 聊起来就有了。'))
      摆面板()
      return
    }

    // 先把每一天各有几条数出来，写分组头时直接用
    var 每天几条 = {}
    for (var i = 0; i < 全部.length; i++) {
      var 天 = 日期(全部[i].at)
      每天几条[天] = (每天几条[天] || 0) + 1
    }

    var 上一组 = ''
    for (var j = 0; j < 全部.length; j++) {
      var 条 = 全部[j]
      var 这一组 = 日期(条.at)
      if (这一组 !== 上一组) {
        上一组 = 这一组
        var 天头 = 节点('div', 'ym-day')
        天头.appendChild(节点('span', 'ym-day-date', 这一组))
        天头.appendChild(节点('span', 'ym-day-count', 每天几条[这一组] + ' 条'))
        面板.appendChild(天头)
      }

      var 行 = 节点('div', 'ym-logrow')
      行.appendChild(节点('span', 'ym-time', 两点(条.at)))
      var 涨跌格 = 节点('span', 'ym-d')
      涨跌格.appendChild(节点('span', 'ym-delta ' + 涨跌色(条.delta), 涨跌文(条.delta)))
      涨跌格.appendChild(节点('span', 'ym-mood', String(条.mood)))
      行.appendChild(涨跌格)
      行.appendChild(节点('span', 'ym-say', 条.reason || '—'))
      面板.appendChild(行)

      var 变化 = 条.dimsDelta
      if (变化) {
        var 段 = []
        for (var k = 0; k < 情绪序.length; k++) {
          var 键 = 情绪序[k]
          var 值 = Number(变化[键]) || 0
          if (值 !== 0) 段.push((情绪名[键] || 键) + (值 > 0 ? '+' : '') + 值)
        }
        if (段.length) 面板.appendChild(节点('div', 'ym-dims-line', 段.join('  ')))
      }
    }
    摆面板()
  }

  function 画(d) {
    if (页面 === '记录') 画记录(d)
    else 画主面板(d)
  }

  function 拉数据() {
    fetch(前缀 + '/state', { cache: 'no-store' })
      .then(function (回应) { return 回应.json() })
      .then(function (d) {
        if (!d || !d.ok) return
        数据 = d
        画(d)
      })
      .catch(function () { /* 拉不到就保持原样，下一轮再说 */ })
  }

  function 开关面板() {
    打开 = !打开
    面板.style.display = 打开 ? 'block' : 'none'
    页面 = '主'
    if (!打开) return
    if (数据) 画(数据)
    拉数据()
    摆面板()
  }

  // --------------------------------------------------------------------
  // 拖动：动了算拖，没动算点
  // --------------------------------------------------------------------
  var 起X = 0
  var 起Y = 0
  var 原左 = 0
  var 原上 = 0
  var 拖动过 = false

  挂饰.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return
    if (ev.target !== 形象 && ev.target !== 挂饰) return

    起X = ev.clientX
    起Y = ev.clientY
    var 框 = 挂饰.getBoundingClientRect()
    原左 = 框.left
    原上 = 框.top
    var 动过 = false

    function 移动时(e2) {
      var 横 = e2.clientX - 起X
      var 竖 = e2.clientY - 起Y
      if (!动过 && (Math.abs(横) > 4 || Math.abs(竖) > 4)) 动过 = true
      if (!动过) return
      拖动过 = true
      var 最多左 = window.innerWidth - 挂饰.offsetWidth
      var 最多上 = window.innerHeight - 挂饰.offsetHeight
      挂饰.style.left = Math.min(最多左, Math.max(0, 原左 + 横)) + 'px'
      挂饰.style.top = Math.min(最多上, Math.max(0, 原上 + 竖)) + 'px'
      挂饰.style.right = 'auto'
      挂饰.style.bottom = 'auto'
    }

    function 抬起() {
      document.removeEventListener('pointermove', 移动时)
      document.removeEventListener('pointerup', 抬起)
      if (!动过) 开关面板()
      else if (打开) 摆面板()
    }

    document.addEventListener('pointermove', 移动时)
    document.addEventListener('pointerup', 抬起)
    ev.preventDefault()
  })

  // 右键也算开关（拖歪了的人会本能地点右键试试）
  挂饰.addEventListener('contextmenu', function (ev) {
    if (ev.target !== 形象 && ev.target !== 挂饰) return
    ev.preventDefault()
    ev.stopPropagation()
    开关面板()
  })

  // 窗口变小了，把挂饰拉回屏幕里（没拖过的靠 right/bottom 自己跟随，不用管）
  window.addEventListener('resize', function () {
    if (!拖动过) return
    var 框 = 挂饰.getBoundingClientRect()
    var 最多左 = window.innerWidth - 挂饰.offsetWidth
    var 最多上 = window.innerHeight - 挂饰.offsetHeight
    var 左 = Math.min(最多左 < 0 ? 0 : 最多左, Math.max(0, 框.left))
    var 上 = Math.min(最多上 < 0 ? 0 : 最多上, Math.max(0, 框.top))
    挂饰.style.left = 左 + 'px'
    挂饰.style.top = 上 + 'px'
    挂饰.style.right = 'auto'
    挂饰.style.bottom = 'auto'
    if (打开) 摆面板()
  })

  document.body.appendChild(挂饰)
  拉数据()
})()
