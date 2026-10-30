/**
 * dsh-yu-mood · 浏览器半边：设置页里的「心情」这一页。
 * ============================================================================
 * 自注册（跟 dsh-bili-scroll 一样的约定）：
 *
 *     window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => ({ inject, apply }) })
 *
 * 这一页要说清三件事，顺序就是它们的轻重：
 *   1. 现在什么心情 —— 分数、脸、最近那件事；
 *   2. 它听到的是哪一句 —— 光有个分数不够，得让人看见原文；
 *   3. 这些数怎么调 —— 改完立刻生效（宿主那边原地改配置对象，不用重启）。
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

    /** 从仓库地址推一条更新命令；推不出来就给个占位，别瞎编地址。 */
    const 更新命令 = (仓库地址) => {
      const m = /github\.com\/([^/]+)\/([^/#?]+)/i.exec(String(仓库地址 || ''))
      if (!m) return 'dsh plugin --profile desktop add <这个插件的仓库地址>'
      return 'dsh plugin --profile desktop add github:' + m[1] + '/' + m[2].replace(/\.git$/i, '')
    }

    const CSS = `
[data-ym-root]{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;font-size:13px;line-height:1.6;}
[data-ym-root] .ym-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:rgba(127,127,127,.07);}
[data-ym-root] .ym-card-title{font-weight:600;opacity:.9;}
[data-ym-root] .ym-stack{display:flex;flex-direction:column;gap:8px;}
[data-ym-root] .ym-hint{opacity:.62;font-size:12px;}
[data-ym-root] .ym-line{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;}
[data-ym-root] .ym-grow{flex:1;min-width:180px;}
[data-ym-root] .ym-label{opacity:.9;}
[data-ym-root] .ym-field{padding:6px 9px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-size:13px;min-width:130px;font-family:inherit;}
[data-ym-root] .ym-field:disabled{opacity:.45;}
[data-ym-root] .ym-num{width:92px;min-width:92px;}
[data-ym-root] .ym-btn{padding:6px 12px;border-radius:7px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-size:13px;cursor:pointer;font-family:inherit;}
[data-ym-root] .ym-btn:hover{background:rgba(127,127,127,.12);}
[data-ym-root] .ym-btn:disabled{opacity:.5;cursor:default;}
[data-ym-root] .ym-top{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;background:rgba(127,127,127,.09);}
[data-ym-root] .ym-face{width:84px;height:66px;object-fit:contain;border-radius:10px;flex:0 0 auto;background:rgba(127,127,127,.10);}
[data-ym-root] .ym-score{font-size:30px;font-weight:600;line-height:1.1;}
[data-ym-root] .ym-sub{opacity:.68;font-size:12px;margin-top:4px;overflow-wrap:anywhere;}
[data-ym-root] .ym-quote{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.65;padding:10px 12px;border-radius:9px;border-left:3px solid rgba(127,127,127,.4);background:rgba(127,127,127,.10);overflow-wrap:anywhere;}
[data-ym-root] .ym-quote[data-faint]{opacity:.6;}
[data-ym-root] .ym-log{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto;}
[data-ym-root] .ym-row{display:flex;gap:8px;font-size:12px;line-height:1.7;align-items:baseline;}
[data-ym-root] .ym-t{opacity:.55;flex:0 0 82px;font-variant-numeric:tabular-nums;}
[data-ym-root] .ym-v{flex:0 0 34px;text-align:right;}
[data-ym-root] .ym-d{flex:0 0 44px;opacity:.8;font-variant-numeric:tabular-nums;}
[data-ym-root] .ym-say{flex:1;opacity:.85;overflow-wrap:anywhere;}
[data-ym-root] .ym-tag{opacity:.55;}
[data-ym-root] .ym-flash{min-height:16px;font-size:12px;opacity:.85;}
`

    // ------------------------------------------------------------------
    // 小零件（都是纯函数，谁用谁调）
    // ------------------------------------------------------------------

    /** 一张卡片：标题 + 说明 + 内容。 */
    const 卡 = (标题, 内容, 说明) => h('section', { className: 'ym-card' },
      标题 ? h('div', { className: 'ym-card-title' }, 标题) : null,
      说明 ? h('div', { className: 'ym-hint' }, 说明) : null,
      内容)

    /** 竖着摞几行（不要把数组直接丢给 React，那样每行还得补 key）。 */
    const 堆 = (...孩子) => h('div', { className: 'ym-stack' }, ...孩子)

    /** 一行：左边标签（可带一句说明），右边控件。 */
    const 行 = (标签, 控件, 说明) => h('div', { className: 'ym-line' },
      h('div', { className: 'ym-grow' },
        h('div', { className: 'ym-label' }, 标签),
        说明 ? h('div', { className: 'ym-hint' }, 说明) : null),
      控件)

    /** 原文块。 */
    const 原文 = (文本, 淡一点) => h('pre', { className: 'ym-quote', 'data-faint': 淡一点 ? '' : undefined }, 文本)

    // ------------------------------------------------------------------
    // 面板
    // ------------------------------------------------------------------

    function 面板() {
      const [设置, set设置] = React.useState(null)
      const [状态, set状态] = React.useState(null)
      const [会话们, set会话们] = React.useState([])
      const [厂商们, set厂商们] = React.useState([])
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
        if (房间 === '__shared__') return '（共用·平复）'
        const 找到 = (会话们 || []).find((x) => x.id === 房间)
        return '（' + String((找到 && 找到.title) || 房间).slice(0, 12) + '）'
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
        取(B + '/models').then((r) => set厂商们((r && r.providers) || [])).catch(() => {})
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

      if (!设置) return h('div', { 'data-ym-root': '' }, h('div', { className: 'ym-hint' }, '读取中…'))

      const 勾 = (键, 名) => h('input', {
        type: 'checkbox',
        checked: Boolean(设置[键]),
        onChange: (e) => 改({ [键]: e.target.checked }, 名),
      })

      /** 数字格：边输边改本地值，失焦才提交；提交前夹回范围。 */
      const 数字 = (键, 名, 说明, 低, 高) => 行(名, h('input', {
        className: 'ym-field ym-num',
        type: 'number', min: 低, max: 高,
        value: String(设置[键] == null ? '' : 设置[键]),
        onChange: (e) => set设置((旧) => ({ ...(旧 || {}), [键]: e.target.value })),
        onBlur: () => {
          const n = Math.max(低, Math.min(Number(设置[键]) || 0, 高))
          改({ [键]: n }, 名)
        },
      }), 说明)

      const 今天的额度 = String((状态 && 状态.saidToday) || 0)
      const 预览 = (状态 && 状态.injectPreview) || { state: 'pending', text: '' }
      const 供应商型号 = ((厂商们 || []).find((p) => p.id === 设置.judgeProvider) || {}).models || []
      const 当前会话不在列表里 = Boolean(设置.targetSession)
        && 设置.targetSession !== '*'
        && !(会话们 || []).some((s) => s.id === 设置.targetSession)

      // ---------- 版本 / 检查更新 ----------
      const 版本卡 = 卡(
        '插件版本 ' + ((版本 && 版本.current) || '—'),
        堆(
          h('div', { className: 'ym-hint' },
            !版本 ? '正在看有没有新版…'
              : 版本.hasUpdate ? '仓库里已经有 v' + 版本.latest + ' 了'
                : 版本.ok ? '已经是最新版'
                  : '暂时查不到（' + (版本.error || '网络') + '）—— 这不代表没有问题'),
          h('div', { className: 'ym-line' },
            h('button', { className: 'ym-btn', disabled: 忙 === '更新', onClick: 查更新 },
              忙 === '更新' ? '查…' : '检查更新')),
        ),
        '只查不装：更新命令自己复制去跑，插件不动自己的文件。',
      )

      const 更新卡 = (版本 && 版本.hasUpdate)
        ? 卡('有新版本 v' + 版本.latest,
          堆(
            h('div', { className: 'ym-hint' }, '先卸旧版再装新版 —— 直接装可能拿到缓存里的旧副本。'),
            原文(更新命令(版本.repoUrl), false),
            h('div', { className: 'ym-line' },
              h('button', {
                className: 'ym-btn',
                onClick: () => navigator.clipboard.writeText(更新命令(版本.repoUrl))
                  .then(() => 说一句('命令已复制'))
                  .catch(() => 说一句('复制不了，手动选中吧')),
              }, '复制命令'),
              版本.repoUrl
                ? h('a', {
                  className: 'ym-btn', href: 版本.repoUrl, target: '_blank', rel: 'noreferrer',
                  style: { textDecoration: 'none', display: 'inline-block' },
                }, '去 GitHub 看看')
                : null),
          ))
        : null

      // ---------- 现在什么心情 ----------
      const 顶栏 = h('div', { className: 'ym-top' },
        h('img', { className: 'ym-face', src: 脸(状态 && 状态.mood), alt: '' }),
        h('div', { className: 'ym-grow' },
          h('div', { className: 'ym-score' },
            (状态 && 状态.mood != null ? 状态.mood : '—')
            + (状态 && 状态.moodLabel ? '　' + 状态.moodLabel : '')),
          h('div', { className: 'ym-sub' },
            ((状态 && 状态.lastReason) || '还没有记录 —— 跟 TA 聊起来就有了'),
            (状态 && 状态.updatedAt ? '（' + 时刻(状态.updatedAt) + '）' : ''),
            (状态 && 状态.lastReason
              ? (状态.injectMode === 'off'
                ? '　· 心情不告诉它'
                : (状态.injectable ? '　· 这条还没跟它说' : '　· 这条已经说过了'))
              : '')),
        ),
        h('button', { className: 'ym-btn', disabled: 忙 === '重置', onClick: 重置 }, '重置到基线'),
      )

      // ---------- 它会听到的那一句 ----------
      let 预览内容
      if (预览.state === 'off') {
        预览内容 = h('div', { className: 'ym-hint' }, '现在选的是「不告诉它」—— 心情只记在后台，不影响它说话。')
      } else if (预览.state === 'minor') {
        预览内容 = h('div', { className: 'ym-hint' }, '这次只是个小波动，够不上门槛 —— 记在后台，不打扰它。')
      } else if (预览.state === 'pending') {
        预览内容 = 堆(
          h('div', { className: 'ym-hint' },
            状态 && 状态.updatedAt
              ? '下一次它开口时，会看到这句：'
              : '下一次它开口时，会看到这句（等有变化了才有内容）：'),
          原文(预览.text || '（这会儿没有可说的）', !预览.text),
        )
      } else {
        预览内容 = 堆(
          h('div', { className: 'ym-hint' },
            '最近一次说给 TA 的话'
            + (状态 && 状态.lastInjectedAt ? '（' + 时刻(状态.lastInjectedAt) + '）' : '')
            + (预览.replay
              ? ' —— 这句是按当时的记录还原的，字面可能略有出入：'
              : ' —— 同一件事不会再说第二遍，之后这句就留在对话记录里：')),
          原文(预览.text || '（还没有说过；等下一次心情有变化就有了）', !预览.text),
        )
      }
      const 预览卡 = 卡('它会听到的那句话', 预览内容,
        '同一次变化只说一次。说出去它就留在对话记录里，不会每轮重播变成背景音。')

      // ---------- 称呼 ----------
      const 称呼卡 = 卡('称呼',
        堆(
          行('TA 叫什么（被关心的那个人）', h('input', {
            className: 'ym-field', value: 设置.ownerName || '', placeholder: '对方',
            onChange: (e) => set设置((旧) => ({ ...(旧 || {}), ownerName: e.target.value })),
            onBlur: () => 改({ ownerName: 设置.ownerName }, '称呼'),
          }), '这个称呼会写进判断提示词，也会出现在心情描述里。'),
          行('TA 自己叫什么（有心情的那个人）', h('input', {
            className: 'ym-field', value: 设置.selfName || '', placeholder: '伙伴',
            onChange: (e) => set设置((旧) => ({ ...(旧 || {}), selfName: e.target.value })),
            onBlur: () => 改({ selfName: 设置.selfName }, '称呼'),
          }), '换成自己的名字，提示词里就跟着换。'),
          行('TA 平时怎么叫你（昵称）', h('input', {
            className: 'ym-field', value: 设置.selfAliases || '', placeholder: '小鱼,宝贝,亲爱的',
            onChange: (e) => set设置((旧) => ({ ...(旧 || {}), selfAliases: e.target.value })),
            onBlur: () => 改({ selfAliases: 设置.selfAliases }, '昵称'),
          }), '逗号分隔。判断时这些词会被当成「在叫你」，不会把「宝宝视频」当成一个东西的名字。'),
        ),
        '两个名字都留空也不要紧：填了才换，不填就是中性的「对方 / 伙伴」。')

      // ---------- 在哪些会话里生效 ----------
      const 会话选项 = (会话们 || []).map((s) => h('option', { key: s.id, value: s.id }, s.title))
      const 会话卡 = 卡('在哪些会话里生效',
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
            : null,
        ),
        设置.targetSession
          ? '选「所有会话」= 桌面 / 微信 / QQ 每个对话都判、都在各自对话里说。数值（心情和七根情绪）全局一份，理由按会话分开存 —— 别的对话里说过的话不会跑到这边来。换会话不用重启。'
          : '⚠️ 还没选会话 —— 选一个、或者选「所有会话」，心情才会开始判断和注入（现在什么都不做）。')

      // ---------- 判断用哪个模型 ----------
      const 模型卡 = 卡('判断用哪个模型',
        堆(
          行('provider（厂商）', h('select', {
            className: 'ym-field', value: 设置.judgeProvider || '',
            onChange: (e) => {
              const 选中 = e.target.value
              const 型号们 = ((厂商们 || []).find((p) => p.id === 选中) || {}).models || []
              // 换厂商就顺手选它第一个型号，别留一个对不上的旧型号
              改({ judgeProvider: 选中, judgeModel: 选中 ? ((型号们[0] && 型号们[0].id) || '') : '' }, '判断模型')
            },
          },
            h('option', { key: 'none', value: '' }, '（跟着会话走）'),
            (厂商们 || []).map((p) => h('option', { key: p.id, value: p.id }, p.name || p.id)),
            设置.judgeProvider && !(厂商们 || []).some((p) => p.id === 设置.judgeProvider)
              ? h('option', { key: 'cur', value: 设置.judgeProvider }, 设置.judgeProvider)
              : null,
          )),
          行('model（型号）', h('select', {
            className: 'ym-field', value: 设置.judgeModel || '', disabled: !设置.judgeProvider,
            onChange: (e) => 改({ judgeModel: e.target.value }, '判断模型'),
          },
            h('option', { key: 'none', value: '' }, '（默认）'),
            供应商型号.map((m) => h('option', { key: m.id, value: m.id }, m.name || m.id)),
            设置.judgeModel && !供应商型号.some((m) => m.id === 设置.judgeModel)
              ? h('option', { key: 'cur', value: 设置.judgeModel }, 设置.judgeModel)
              : null,
          )),
        ),
        '心情判断是一次很短的小调用：想更准就指到更强的模型，想省钱就指到便宜的；留空 = 跟着当前会话。')

      // ---------- 开关 ----------
      const 开关卡 = 卡('开关',
        堆(
          行('每轮判断心情', 勾('autoJudge', '每轮判断'),
            '关掉就完全不判断、不改数值（也不花判断的 token）。'),
          行('心情怎么告诉它', h('select', {
            className: 'ym-field', value: 设置.injectMode || 'event',
            onChange: (e) => 改({ injectMode: e.target.value }, '心情怎么告诉它'),
          },
            h('option', { key: 'off', value: 'off' }, '不告诉它（只记录，不影响）'),
            h('option', { key: 'label', value: 'label' }, '只说心情，不说为什么'),
            h('option', { key: 'event', value: 'event' }, '说心情 + 那件事（推荐）'),
          ), '影响它口气的唯一开关。选「说心情 + 那件事」时它看到两行：第一行是这会儿的底子，第二行是这段时间发生了什么 —— 底子真的会影响它怎么说话，那件事只是来历。'),
          数字('injectConfidence', '可信度门槛',
            '判断模型自己对这次判断有多确定（0–100，默认 60）。低于这个数就只记进后台、不进它的嘴。调高更保守，调低更爱说。',
            0, 100),
        ))

      // ---------- 数值 ----------
      const 数值卡 = 卡('心情怎么变',
        堆(
          数字('moodBase', '基线心情', '没事的时候心情会慢慢回到这个数（30–100）。', 30, 100),
          数字('moodFloor', '心情下限', '最低能掉到多少；0 = 不设底线（0–100）。', 0, 100),
          数字('decayHalfHours', '多久平复一半',
            '受一次影响之后，心里多久淡掉一半（小时）。大 = 隔夜还留着余温，小 = 来得快去得也快。', 1, 168),
          数字('sigMood', '心情变这么多才算',
            '判定给的涨跌够这个数才算一次「真有事」（1–30，默认 3）。⚠️ 心情值本身每轮只吃 1/3，所以这里比的是判定的原始值。',
            1, 30),
          数字('sigDim', '或者某根情绪变这么多',
            '任意一根涨跌够这个数也算（1–100，默认 5）。心疼+5、担心+5 这种「突然一下」才触发。', 1, 100),
          数字('injectPerDay', '每天最多说几次',
            '今天已经说过 ' + 今天的额度 + ' 次。到上限就只记账、不再打扰它，明天重新算。填 0 = 一次都不说（只看面板）。',
            0, 50),
        ),
        '上面两个数决定「什么才算一次值得告诉它的变化」：够不着就只记账（面板里看得到，不影响它说话）。调小它更敏感，调大它只在真动心的时候才变。')

      // ---------- 完整记录 ----------
      const 时间线 = (状态 && 状态.timeline) || []
      const 记录行们 = 时间线.slice().reverse().slice(0, 40).map((条, i) => h('div', { className: 'ym-row', key: i },
        h('span', { className: 'ym-t' }, 时刻(条.at)),
        h('span', { className: 'ym-v' }, String(条.mood)),
        h('span', { className: 'ym-d' }, (条.delta > 0 ? '+' : '') + (条.delta == null ? 0 : 条.delta)),
        h('span', { className: 'ym-say' },
          h('span', null, 条.reason || '—'),
          条.kind === 'decay' ? h('span', { className: 'ym-tag' }, '（自己平的）') : null,
          条.conf != null && 条.kind !== 'decay'
            ? h('span', { className: 'ym-tag' }, '（可信 ' + 条.conf + '）')
            : null,
          h('span', { className: 'ym-tag' }, 房间标签(条.room)))))

      const 记录卡 = 卡('完整记录',
        堆(
          h('div', { className: 'ym-log' },
            时间线.length === 0
              ? h('div', { className: 'ym-hint' }, '还没有记录 —— 聊起来就有了。')
              : 记录行们),
        ),
        Number((状态 && 状态.timelineTotal) || 0) > 40
          ? '只显示最近 40 条，共 ' + 状态.timelineTotal + ' 条（各会话合起来）。'
          : '判定给的涨跌会先除以 3 再变成心情的分，所以这里的变化幅度通常很小 —— 那是设计好的。')

      return h('div', { 'data-ym-root': '' },
        版本卡,
        更新卡,
        顶栏,
        预览卡,
        称呼卡,
        会话卡,
        模型卡,
        开关卡,
        数值卡,
        记录卡,
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
