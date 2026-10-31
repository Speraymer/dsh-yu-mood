/**
 * dsh-yu-mood · 浏览器半边：设置页里的「心情」这一页。
 * ============================================================================
 * 自注册（跟 dsh-bili-scroll 一样的约定）：
 *
 *     window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => ({ inject, apply }) })
 *
 * 这一页的观感（2026-10-31 整份重做，跟上游那种「圆角灰卡一张张往下排」不是一路）：
 *   · 不画卡片：分区靠左侧一条 3px 竖线 + 编号 + 细分割线，内容直接排在下面；
 *   · 分数当主角：40–56px 的大数字，标签是小号稀疏字距压在旁边，脸只做一个 64px 圆形头像；
 *   · 情绪用颜色说话：七根 4px 细条各给一个色相，右边挂数字；
 *   · 桌面端两列自适应网格，窄屏自动落成一列；
 *   · 完整记录是一张紧凑表格（等宽时间 / 带色的涨跌 / 理由）。
 *
 * 逻辑一律没动：取 /config /state /sessions /update，改配置、查更新、重置，
 * 20 秒轮询，注入预览的四种状态 —— 全部照旧。
 *
 * ⚠️ 不 import 宿主的内置包：这一页只认 require('react') 和 fetch，
 *    其余全是普通 DOM 和一段 CSS。
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-yu-mood',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const B = '/dsh-feiyu-mood'

    /** 五档表情图（assets/face-*.png）。分档跟宿主的 量表.mjs 一致：80 / 62 / 42 / 25。 */
    const 脸 = (分) => {
      const v = Number(分)
      if (!Number.isFinite(v)) return B + '/face-ok.png'
      if (v >= 80) return B + '/face-great.png'
      if (v >= 62) return B + '/face-good.png'
      if (v >= 42) return B + '/face-ok.png'
      if (v >= 25) return B + '/face-worry.png'
      return B + '/face-sad.png'
    }

    const 取 = async (地址) => {
      const 回应 = await fetch(地址, { headers: { accept: 'application/json' } })
      if (!回应.ok) throw new Error('HTTP ' + 回应.status)
      return 回应.json()
    }

    const 送 = async (地址, 内容) => {
      const 回应 = await fetch(地址, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(内容 || {}),
      })
      if (!回应.ok) throw new Error('HTTP ' + 回应.status)
      return 回应.json()
    }

    const 时刻 = (毫秒) => {
      if (!毫秒) return ''
      try { return new Date(毫秒).toLocaleString() } catch (e) { return '' }
    }

    /** 表格里用的短时刻：MM-DD HH:mm，等宽对齐才像表格。 */
    const 短时刻 = (毫秒) => {
      if (!毫秒) return ''
      const d = new Date(毫秒)
      const 补 = (n) => String(n).padStart(2, '0')
      return 补(d.getMonth() + 1) + '-' + 补(d.getDate()) + ' ' + 补(d.getHours()) + ':' + 补(d.getMinutes())
    }

    /** 从仓库地址推一条更新命令；推不出来就给个占位，别瞎编地址。 */
    const 更新命令 = (仓库地址) => {
      const m = /github\.com\/([^/]+)\/([^/#?]+)/i.exec(String(仓库地址 || ''))
      if (!m) return 'dsh plugin --profile desktop add <这个插件的仓库地址>'
      return 'dsh plugin --profile desktop add github:' + m[1] + '/' + m[2].replace(/\.git$/i, '')
    }

    /**
     * 七根情绪的颜色。**跟 assets/widget.js 里那套是同一份**，改这里记得同步那边。
     * 选色理由：暖→冷走一圈，相邻两根别撞色；开心暖黄、踏实青、甜粉、心疼橘、担心蓝、难过灰蓝、吃醋紫。
     */
    const 情绪色 = {
      happy: '#d8a03c',
      calm: '#3f9c94',
      sweet: '#d4739f',
      heartache: '#d97b3f',
      worry: '#4f7fc1',
      sad: '#6b7a94',
      jealous: '#8f6bc1',
    }

    const CSS = `
[data-ym-root]{
  --ym-mark:#7d93b2;
  --ym-rule:rgba(128,128,128,.26);
  --ym-rule-soft:rgba(128,128,128,.13);
  --ym-faint:rgba(128,128,128,.92);
  --ym-dimmer:rgba(128,128,128,.62);
  --ym-up:#3f9161;
  --ym-down:#c25d52;
  --ym-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  display:flex;flex-direction:column;gap:36px;padding:6px 0 32px;font-size:13px;line-height:1.6;color:inherit;
}
[data-ym-root] .ym-sec{padding:0 0 0 16px;border-left:3px solid var(--ym-mark);min-width:0;}
[data-ym-root] .ym-sec-head{display:flex;align-items:baseline;gap:12px;margin:0 0 14px;padding:0 0 7px;border-bottom:1px solid var(--ym-rule);}
[data-ym-root] .ym-sec-no{font-family:var(--ym-mono);font-size:10px;letter-spacing:.06em;color:var(--ym-dimmer);}
[data-ym-root] .ym-sec-title{font-size:11px;font-weight:600;letter-spacing:.2em;color:var(--ym-faint);text-transform:uppercase;}
[data-ym-root] .ym-note{margin-top:6px;font-size:11px;line-height:1.65;color:var(--ym-dimmer);max-width:58ch;}

[data-ym-root] .ym-hero{display:flex;align-items:flex-start;gap:22px;padding:0 0 0 16px;border-left:3px solid var(--ym-mark);}
[data-ym-root] .ym-avatar{width:64px;height:64px;border-radius:50%;object-fit:cover;object-position:center 34%;flex:none;border:1px solid var(--ym-rule);background:rgba(128,128,128,.08);}
[data-ym-root] .ym-hero-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
[data-ym-root] .ym-score-row{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;}
[data-ym-root] .ym-score{font-size:clamp(40px,5vw,56px);line-height:.9;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums;}
[data-ym-root] .ym-score-label{font-size:11px;letter-spacing:.3em;color:var(--ym-faint);padding-bottom:9px;}
[data-ym-root] .ym-hero-meta{font-size:12px;line-height:1.75;color:var(--ym-faint);overflow-wrap:anywhere;max-width:60ch;}
[data-ym-root] .ym-hero-util{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;padding-top:9px;border-top:1px solid var(--ym-rule-soft);font-size:11px;color:var(--ym-dimmer);}
[data-ym-root] .ym-ver{font-family:var(--ym-mono);letter-spacing:.02em;margin-right:2px;}

[data-ym-root] .ym-dims{display:grid;grid-template-columns:1fr;gap:10px 32px;}
@media (min-width:760px){[data-ym-root] .ym-dims{grid-template-columns:1fr 1fr;}}
[data-ym-root] .ym-dim{display:grid;grid-template-columns:52px 1fr 30px;align-items:center;gap:10px;}
[data-ym-root] .ym-dim-name{font-size:11px;letter-spacing:.08em;color:var(--ym-faint);}
[data-ym-root] .ym-track{height:4px;background:rgba(128,128,128,.17);position:relative;overflow:hidden;}
[data-ym-root] .ym-fill{display:block;height:100%;width:0;}
[data-ym-root] .ym-dim-val{font-family:var(--ym-mono);font-size:11px;text-align:right;color:var(--ym-faint);font-variant-numeric:tabular-nums;}

[data-ym-root] .ym-grid{display:grid;grid-template-columns:1fr;gap:36px 42px;align-items:start;}
@media (min-width:760px){[data-ym-root] .ym-grid{grid-template-columns:1fr 1fr;}}
[data-ym-root] .ym-item{padding:11px 0;border-bottom:1px solid var(--ym-rule-soft);}
[data-ym-root] .ym-item:first-child{padding-top:0;}
[data-ym-root] .ym-item:last-child{border-bottom:0;padding-bottom:0;}
[data-ym-root] .ym-item-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
[data-ym-root] .ym-label{font-size:12px;letter-spacing:.02em;}

[data-ym-root] .ym-field{appearance:none;-webkit-appearance:none;background:transparent;border:0;border-bottom:1px solid var(--ym-rule);border-radius:0;padding:5px 1px;color:inherit;font:inherit;font-size:13px;min-width:150px;max-width:100%;}
[data-ym-root] .ym-field:focus{outline:none;border-bottom-color:var(--ym-mark);}
[data-ym-root] select.ym-field{cursor:pointer;}
[data-ym-root] .ym-field:disabled{opacity:.45;}
[data-ym-root] input[type=checkbox]{accent-color:var(--ym-mark);width:15px;height:15px;cursor:pointer;}

[data-ym-root] .ym-btn{appearance:none;background:transparent;border:1px solid var(--ym-rule);border-radius:0;padding:6px 13px;color:inherit;font:inherit;font-size:11px;letter-spacing:.14em;cursor:pointer;}
[data-ym-root] .ym-btn:hover{border-color:var(--ym-mark);color:var(--ym-mark);}
[data-ym-root] .ym-btn:disabled{opacity:.45;cursor:default;}
[data-ym-root] a.ym-btn{text-decoration:none;display:inline-block;}

[data-ym-root] .ym-quote{margin:8px 0 0;padding:2px 0 2px 14px;border-left:2px solid var(--ym-mark);white-space:pre-wrap;font-size:13px;line-height:1.75;overflow-wrap:anywhere;}
[data-ym-root] .ym-quote[data-faint]{color:var(--ym-dimmer);}

[data-ym-root] .ym-logwrap{max-height:340px;overflow:auto;}
[data-ym-root] .ym-table{width:100%;border-collapse:collapse;font-size:12px;}
[data-ym-root] .ym-table th{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ym-dimmer);text-align:left;padding:0 12px 7px 0;border-bottom:1px solid var(--ym-rule);white-space:nowrap;}
[data-ym-root] .ym-table td{padding:8px 12px 8px 0;border-bottom:1px solid var(--ym-rule-soft);vertical-align:top;}
[data-ym-root] .ym-table tr:last-child td{border-bottom:0;}
[data-ym-root] .ym-t{width:1%;white-space:nowrap;font-family:var(--ym-mono);font-size:11px;color:var(--ym-dimmer);}
[data-ym-root] .ym-d{width:1%;white-space:nowrap;text-align:right;font-family:var(--ym-mono);font-size:11px;}
[data-ym-root] .ym-up{color:var(--ym-up);}
[data-ym-root] .ym-down{color:var(--ym-down);}
[data-ym-root] .ym-flat{color:var(--ym-dimmer);}
[data-ym-root] .ym-mood-mini{margin-left:8px;color:var(--ym-dimmer);}
[data-ym-root] .ym-say{overflow-wrap:anywhere;}
[data-ym-root] .ym-tag{margin-left:7px;font-size:11px;color:var(--ym-dimmer);}

[data-ym-root] .ym-flash{min-height:16px;font-size:11px;letter-spacing:.04em;color:var(--ym-faint);}
`

    // ------------------------------------------------------------------
    // 观感零件（纯函数，谁用谁调）
    // ------------------------------------------------------------------

    /** 一个分区：左竖线 + 编号 + 稀疏字距的小标题 + 内容（末尾可挂一句说明）。 */
    const 区 = (编号, 标题, 内容, 说明, 键) => h('section', { className: 'ym-sec', 'data-ym-sec': 键 || 标题 },
      h('div', { className: 'ym-sec-head' },
        h('span', { className: 'ym-sec-no' }, 编号),
        h('span', { className: 'ym-sec-title' }, 标题)),
      内容,
      说明 ? h('div', { className: 'ym-note' }, 说明) : null)

    /** 一行设置：左边标签、右边控件，说明压在下面一行。 */
    const 项 = (标签, 控件, 说明) => h('div', { className: 'ym-item' },
      h('div', { className: 'ym-item-head' },
        h('span', { className: 'ym-label' }, 标签),
        控件),
      说明 ? h('div', { className: 'ym-note' }, 说明) : null)

    /** 原文块：一条竖线带出来的等宽块，不画框。 */
    const 原文 = (文本, 淡一点) => h('pre', { className: 'ym-quote', 'data-faint': 淡一点 ? '' : undefined }, 文本)

    // ------------------------------------------------------------------
    // 面板
    // ------------------------------------------------------------------

    function 面板() {
      const [设置, set设置] = React.useState(null)
      const [状态, set状态] = React.useState(null)
      const [会话们, set会话们] = React.useState([])
      const [版本, set版本] = React.useState(null)
      const [忙, set忙] = React.useState('')
      const [提示, set提示] = React.useState('')

      const 说一句 = (文字) => {
        set提示(文字)
        setTimeout(() => set提示(''), 2500)
      }

      /** 时间线里这条是在哪个对话里发生的（共用那条是"自己平复的"，单独标）。 */
      const 房间标签 = (房间) => {
        if (!房间) return ''
        if (房间 === '__shared__') return '共用·平复'
        const 找到 = (会话们 || []).find((x) => x.id === 房间)
        return String((找到 && 找到.title) || 房间).slice(0, 12)
      }

      const 拉一次 = React.useCallback(async () => {
        try {
          const 回应 = await Promise.all([取(B + '/config'), 取(B + '/state')])
          const 配置回应 = 回应[0]
          const 状态回应 = 回应[1]
          if (配置回应 && 配置回应.config) set设置(配置回应.config)
          if (状态回应 && 状态回应.ok) set状态(状态回应)
        } catch (e) {
          set提示('读取失败：' + (e && e.message))
        }
      }, [])

      React.useEffect(() => {
        拉一次()
        取(B + '/sessions').then((r) => set会话们((r && r.sessions) || [])).catch(() => {})
        取(B + '/update').then((r) => set版本(r)).catch(() => {})
        const 计时 = setInterval(() => {
          取(B + '/state').then((s) => { if (s && s.ok) set状态(s) }).catch(() => {})
        }, 20000)
        return () => clearInterval(计时)
      }, [拉一次])

      /** 改一项：先把界面改掉（别等网络），再存盘；存回来以服务端的值为准。 */
      const 改 = async (补丁, 名字) => {
        set设置((旧) => ({ ...(旧 || {}), ...补丁 }))
        try {
          const 回应 = await 送(B + '/config', 补丁)
          if (回应 && 回应.config) set设置(回应.config)
          说一句((名字 || '设置') + ' 已保存')
        } catch (e) {
          说一句('保存失败：' + (e && e.message))
        }
      }

      const 查更新 = async () => {
        set忙('更新')
        try {
          const 回应 = await 取(B + '/update?refresh=1')
          set版本(回应)
          说一句(回应 && 回应.hasUpdate ? '仓库里已经有 v' + 回应.latest : '已经是最新版')
        } catch (e) {
          说一句('查不到：' + (e && e.message))
        }
        set忙('')
      }

      const 重置 = async () => {
        set忙('重置')
        try {
          await 送(B + '/reset', {})
          await 拉一次()
          说一句('已重置到基线')
        } catch (e) {
          说一句('重置失败：' + (e && e.message))
        }
        set忙('')
      }

      if (!设置) return h('div', { 'data-ym-root': '' }, h('div', { className: 'ym-note' }, '读取中…'))

      const 勾 = (键, 名) => h('input', {
        type: 'checkbox',
        checked: Boolean(设置[键]),
        onChange: (e) => 改({ [键]: e.target.checked }, 名),
      })

      const 预览 = (状态 && 状态.injectPreview) || { state: 'pending', text: '' }
      const 当前会话不在列表里 = Boolean(设置.targetSession)
        && 设置.targetSession !== '*'
        && !(会话们 || []).some((s) => s.id === 设置.targetSession)

      // ---------- 现在什么心情（分数当主角，版本与检查更新收在下面那条小字里） ----------
      const 版本一句话 = !版本
        ? '正在看有没有新版…'
        : 版本.hasUpdate
          ? '仓库里已经有 v' + 版本.latest + ' 了'
          : 版本.ok
            ? '已是最新'
            : '暂时查不到（' + (版本.error || '网络') + '）—— 这不代表有问题'
      const 心情区 = h('section', { className: 'ym-hero', 'data-ym-sec': 'hero' },
        h('img', { className: 'ym-avatar', src: 脸(状态 && 状态.mood), alt: '' }),
        h('div', { className: 'ym-hero-main' },
          h('div', { className: 'ym-score-row' },
            h('span', { className: 'ym-score', 'data-ym-score': '' },
              String(状态 && 状态.mood != null ? 状态.mood : '—')),
            h('span', { className: 'ym-score-label' }, (状态 && 状态.moodLabel) || '还没有心情')),
          h('div', { className: 'ym-hero-meta' },
            ((状态 && 状态.lastReason) || '还没有记录 —— 跟 TA 聊起来就有了'),
            (状态 && 状态.updatedAt ? '　' + 时刻(状态.updatedAt) : ''),
            (状态 && 状态.lastReason
              ? (状态.injectMode === 'off'
                ? '　· 心情不告诉它'
                : (状态.injectable ? '　· 这条还没跟它说' : '　· 这条已经说过了'))
              : '')),
          h('div', { className: 'ym-hero-util' },
            h('span', { className: 'ym-ver' }, '本机 v' + ((版本 && 版本.current) || '—') + ' · ' + 版本一句话),
            h('button', { className: 'ym-btn', disabled: 忙 === '更新', onClick: 查更新 },
              忙 === '更新' ? '查…' : '检查更新'),
            h('button', { className: 'ym-btn', disabled: 忙 === '重置', onClick: 重置 }, '重置到基线'))),
      )

      // ---------- 有新版本时才出现的一段 ----------
      const 更新区 = (版本 && 版本.hasUpdate)
        ? 区('↑', '有新版本 v' + 版本.latest,
          h('div', null,
            原文(更新命令(版本.repoUrl), false),
            h('div', { className: 'ym-hero-util' },
              h('button', {
                className: 'ym-btn',
                onClick: () => navigator.clipboard.writeText(更新命令(版本.repoUrl))
                  .then(() => 说一句('命令已复制'))
                  .catch(() => 说一句('复制不了，手动选中吧')),
              }, '复制命令'),
              版本.repoUrl
                ? h('a', { className: 'ym-btn', href: 版本.repoUrl, target: '_blank', rel: 'noreferrer' }, '去 GitHub 看看')
                : null)),
          '先卸旧版再装新版 —— 直接装可能拿到缓存里的旧副本。只查不装，更新命令自己复制去跑。',
          'update')
        : null

      // ---------- 情绪：七根细条，各一个色相 ----------
      const 情绪区 = 区('01', '情绪',
        h('div', { className: 'ym-dims', 'data-ym-dims': '' },
          ((状态 && 状态.dims) || []).map((一根) => h('div', { className: 'ym-dim', key: 一根.key, 'data-ym-dim': 一根.key },
            h('span', { className: 'ym-dim-name' }, 一根.label),
            h('div', { className: 'ym-track' },
              h('i', {
                className: 'ym-fill',
                style: {
                  width: Math.max(0, Math.min(100, Number(一根.value) || 0)) + '%',
                  background: 情绪色[一根.key] || 'rgba(128,128,128,.55)',
                },
              })),
            h('span', { className: 'ym-dim-val' }, String(一根.value || 0))))),
        null, 'dims')

      // ---------- 它会听到的那一句 ----------
      let 预览内容
      if (预览.state === 'off') {
        预览内容 = h('div', { className: 'ym-note' }, '现在选的是「不告诉它」—— 心情只记在后台，不影响它说话。')
      } else if (预览.state === 'minor') {
        预览内容 = h('div', { className: 'ym-note' }, '这次只是个小波动，够不上门槛 —— 记在后台，不打扰它。')
      } else if (预览.state === 'pending') {
        预览内容 = h('div', null,
          h('div', { className: 'ym-note' },
            状态 && 状态.updatedAt
              ? '下一次它开口时，会看到这句：'
              : '下一次它开口时，会看到这句（等有变化了才有内容）：'),
          原文(预览.text || '（这会儿没有可说的）', !预览.text))
      } else {
        预览内容 = h('div', null,
          h('div', { className: 'ym-note' },
            '最近一次说给 TA 的话'
            + (状态 && 状态.lastInjectedAt ? '（' + 时刻(状态.lastInjectedAt) + '）' : '')
            + (预览.replay
              ? ' —— 这句是按当时的记录还原的，字面可能略有出入：'
              : ' —— 同一件事不会再说第二遍，之后这句就留在对话记录里：')),
          原文(预览.text || '（还没有说过；等下一次心情有变化就有了）', !预览.text))
      }
      const 预览区 = 区('02', '它会听到的那句话', 预览内容,
        '同一次变化只说一次。说出去它就留在对话记录里，不会每轮重播变成背景音。', 'preview')

      // ---------- 称呼 ----------
      const 称呼区 = 区('03', '称呼',
        h('div', null,
          项('TA 叫什么（被关心的那个人）', h('input', {
            className: 'ym-field', value: 设置.ownerName || '', placeholder: '对方',
            onChange: (e) => set设置((旧) => ({ ...(旧 || {}), ownerName: e.target.value })),
            onBlur: () => 改({ ownerName: 设置.ownerName }, '称呼'),
          }), '这个称呼会写进判断提示词，也会出现在心情描述里。'),
          项('TA 自己叫什么（有心情的那个人）', h('input', {
            className: 'ym-field', value: 设置.selfName || '', placeholder: '伙伴',
            onChange: (e) => set设置((旧) => ({ ...(旧 || {}), selfName: e.target.value })),
            onBlur: () => 改({ selfName: 设置.selfName }, '称呼'),
          }), '换成自己的名字，提示词里就跟着换。')),
        '两个名字都留空也不要紧：填了才换，不填就是中性的「对方 / 伙伴」。', 'names')

      // ---------- 在哪些会话里生效 ----------
      const 会话选项 = (会话们 || []).map((s) => h('option', { key: s.id, value: s.id }, s.title))
      const 会话区 = 区('04', '在哪些会话里生效',
        h('select', {
          className: 'ym-field', value: 设置.targetSession || '',
          onChange: (e) => 改({ targetSession: e.target.value }, '目标会话'),
        },
          h('option', { key: 'all', value: '*' }, '所有会话（所有对话来源）'),
          h('option', { key: 'none', value: '' }, '（未选 —— 什么都不做）'),
          会话选项,
          // 当前值不在列表里（归档了、缓存没了）也得看得见，不然会以为设置丢了
          当前会话不在列表里
            ? h('option', { key: 'cur', value: 设置.targetSession },
              '（当前：' + 设置.targetSession.slice(0, 18) + '…）')
            : null),
        设置.targetSession
          ? '选「所有会话」= 桌面 / 微信 / QQ 每个对话都判、都在各自对话里说。数值（心情和七根情绪）全局一份，理由按会话分开存 —— 别的对话里说过的话不会跑到这边来。换会话不用重启。'
          : '⚠️ 还没选会话 —— 选一个、或者选「所有会话」，心情才会开始判断和注入（现在什么都不做）。', 'session')

      // ---------- 开关 ----------
      const 开关区 = 区('05', '开关',
        h('div', null,
          项('每轮判断心情', 勾('autoJudge', '每轮判断'),
            '关掉就完全不判断、不改数值（也不花判断的 token）。'),
          项('心情怎么告诉它', h('select', {
            className: 'ym-field', value: 设置.injectMode || 'event',
            onChange: (e) => 改({ injectMode: e.target.value }, '心情怎么告诉它'),
          },
            h('option', { key: 'off', value: 'off' }, '不告诉它（只记录，不影响）'),
            h('option', { key: 'label', value: 'label' }, '只说心情，不说为什么'),
            h('option', { key: 'event', value: 'event' }, '说心情 + 那件事（推荐）'),
          ), '影响它口气的唯一开关。选「说心情 + 那件事」时它看到两行：第一行是这会儿的底子，第二行是这段时间发生了什么 —— 底子真的会影响它怎么说话，那件事只是来历。')), null, 'switches')

      // ---------- 完整记录：紧凑表格 ----------
      const 时间线 = (状态 && 状态.timeline) || []
      const 记录行们 = 时间线.slice().reverse().slice(0, 40).map((条, i) => {
        const 值 = Number(条.delta) || 0
        const 色 = 值 > 0 ? 'ym-up' : (值 < 0 ? 'ym-down' : 'ym-flat')
        return h('tr', { key: i },
          h('td', { className: 'ym-t' }, 短时刻(条.at)),
          h('td', { className: 'ym-d' },
            h('span', { className: 色 }, (值 > 0 ? '+' : '') + 值),
            h('span', { className: 'ym-mood-mini' }, String(条.mood))),
          h('td', { className: 'ym-say' },
            h('span', null, 条.reason || '—'),
            条.kind === 'decay' ? h('span', { className: 'ym-tag' }, '自己平的') : null,
            条.conf != null && 条.kind !== 'decay'
              ? h('span', { className: 'ym-tag' }, '可信 ' + 条.conf)
              : null,
            h('span', { className: 'ym-tag' }, 房间标签(条.room))))
      })

      const 记录区 = 区('06', '完整记录',
        h('div', { className: 'ym-logwrap' },
          时间线.length === 0
            ? h('div', { className: 'ym-note' }, '还没有记录 —— 聊起来就有了。')
            : h('table', { className: 'ym-table', 'data-ym-table': '' },
              h('thead', null,
                h('tr', null,
                  h('th', null, '时间'),
                  h('th', null, '变化'),
                  h('th', null, '理由'))),
              h('tbody', null, 记录行们))),
        Number((状态 && 状态.timelineTotal) || 0) > 40
          ? '只显示最近 40 条，共 ' + 状态.timelineTotal + ' 条（各会话合起来）。'
          : '判定给的涨跌会先除以 3 再变成心情的分，所以这里的变化幅度通常很小 —— 那是设计好的。', 'log')

      return h('div', { 'data-ym-root': '' },
        心情区,
        更新区,
        情绪区,
        h('div', { className: 'ym-grid', 'data-ym-grid': '' },
          预览区,
          称呼区,
          会话区,
          开关区),
        记录区,
        h('div', { className: 'ym-flash' }, 提示),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 样式只挂一份，卸载时自己摘掉
        const 样式 = document.createElement('style')
        样式.setAttribute('data-plugin-css', 'dsh-yu-mood')
        样式.textContent = CSS
        document.head.appendChild(样式)
        ctx.effect(() => () => 样式.remove(), 'dsh-yu-mood: 设置页样式')

        const 插槽 = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!插槽) return
        插槽.inject('settings.section', () => 插槽.register(
          { name: 'settings.section', id: 'mood', order: 40, label: '鱼的心情' },
          () => h(面板),
        ))
      },
    }
  },
})
