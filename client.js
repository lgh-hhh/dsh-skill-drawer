/**
 * Client half of the skill drawer.
 *
 * A 320x340 menu anchored to the composer button (4px above it, left aligned),
 * rendered in `shell.overlay` so the composer card cannot clip it.
 *
 * - Categories are rows; clicking one expands its skills in place. The shell keeps a
 *   fixed height, so the clicked row never moves.
 * - The expanded category header sticks to the top while its list scrolls.
 * - A fixed footer strip shows what the hovered / keyboard-selected skill does.
 * - Insertion uses the official `inputActions.captureInsertion()` + `insertText()`,
 *   captured from the composer button slot's standard props.
 *
 * Crash safety: one lazy factory, wrapped registrations, ErrorBoundary on every entry,
 * component-local styles, no global CSS, no DOM writes outside our components.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-drawer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const PLUGIN_ID = 'skill-drawer'
    const SLOT_BUTTON = 'conversation.input.left'
    const SLOT_OVERLAY = 'shell.overlay'
    const VERSION = '0.11.0'
    const MENU_WIDTH = 280
    const MENU_HEIGHT = 270
    const MENU_GAP = 4
    const LANG_KEY = 'dsh-skill-drawer:lang'

    /* 界面文案（中/英）。技能名不翻译：它是命令。 */
    const TEXT = {
      zh: {
        search: '搜索技能…',
        loading: '正在读取技能…',
        failed: '读取失败：',
        retry: ' · 点击重试',
        noMatch: '没有匹配的技能',
        noSkills: '没有找到可用技能',
        readFailed: '读取失败',
        unavailable: '技能服务不可用',
        noSession: '缺少会话信息',
        draftChanged: '草稿已变化，请重试',
        from: '来自 ',
        step: (label, index, total) => `${label} · 第 ${index}/${total} 步`,
        all: '全部',
        other: '其他',
        userLevel: '用户级',
        projectLevel: '项目级',
        builtin: '内置',
        skill: '技能',
        button: '技能',
        dialogAria: '技能抽屉',
        langAria: '切换到英文',
      },
      en: {
        search: 'Search skills…',
        loading: 'Loading skills…',
        failed: 'Failed: ',
        retry: ' · click to retry',
        noMatch: 'No matching skills',
        noSkills: 'No skills found',
        readFailed: 'Failed to read',
        unavailable: 'Skill service unavailable',
        noSession: 'Session information missing',
        draftChanged: 'Draft changed, please retry',
        from: 'From ',
        step: (label, index, total) => `${label} · step ${index}/${total}`,
        all: 'All',
        other: 'Other',
        userLevel: 'User',
        projectLevel: 'Project',
        builtin: 'Built-in',
        skill: 'Skill',
        button: 'Skills',
        dialogAria: 'Skill drawer',
        langAria: 'Switch to Chinese',
      },
    }

    function detectLang() {
      try {
        const saved = window.localStorage && window.localStorage.getItem(LANG_KEY)
        if (saved === 'zh' || saved === 'en') return saved
      } catch {
        /* storage may be unavailable */
      }
      const nav = (typeof navigator !== 'undefined' && navigator.language) || 'zh'
      return /^zh/i.test(nav) ? 'zh' : 'en'
    }

    /* ------------------------------------------------------------- styling */
    const CSS = `
.sd-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  margin: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #e7eaf0);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.sd-btn:disabled { cursor: not-allowed; opacity: .4; }
.sd-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff);
  outline-offset: 2px;
}
.sd-btn[aria-expanded="true"] { color: var(--dsw-alias-brand-primary, #4f8cff); }
.sd-btn.sd-open {
  color: var(--dsw-alias-brand-primary, #4f8cff);
  background: rgba(79, 140, 255, .24);
  box-shadow: inset 0 0 0 1px rgba(79, 140, 255, .55);
}
@media (hover: hover) {
  .sd-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); }
  .sd-btn.sd-open:hover:not(:disabled) { background: rgba(79, 140, 255, .28); }
}
.sd-btn:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active, rgba(255,255,255,.12)); }
.sd-icon { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; }
.sd-icon svg { display: block; }

/* 宽度由数据直接算出来（见 menuWidthFor），打开时定死，展开/收起不变 */
.sd-menu-root { position: fixed; z-index: 60; width: 150px; }
.sd-menu {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: ${MENU_HEIGHT}px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.06));
  border-radius: var(--dsw-radius-md, 12px);
  /* 官方菜单是半透明面 + 背景模糊（--dsw-menu-surface-fill），不是不透明底。 */
  background: var(--dsw-menu-surface-fill, rgba(48,49,54,.64));
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  backdrop-filter: blur(18px) saturate(1.15);
  color: var(--dsw-alias-label-primary, #e7eaf0);
  box-shadow: var(--dsw-shadow-lv1, 0 8px 24px rgba(0,0,0,.4));
  animation: sd-fade .12s ease-out;
}
@keyframes sd-fade { from { opacity: 0 } to { opacity: 1 } }

.sd-search-wrap { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; padding: 6px 6px 0; }
.sd-search {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));
  border-radius: 6px;
  background: rgba(255,255,255,.04);
  color: var(--dsw-alias-label-primary, #e7eaf0);
  font: inherit;
  font-size: 11.5px;
  outline: none;
}
.sd-search::placeholder { color: var(--dsw-alias-label-tertiary, rgba(255,255,255,.4)); }
.sd-search:focus { border-color: var(--dsw-alias-brand-primary, #4f8cff); }
.sd-lang {
  flex: none;
  height: 26px;
  min-width: 32px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55));
  font: inherit;
  font-size: 10.5px;
  line-height: 24px;
  cursor: pointer;
}
.sd-lang:hover {
  color: var(--dsw-alias-label-primary, #e7eaf0);
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08));
}

.sd-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
  /* 上下边缘轻微渐隐：提示还有内容可以滚 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 6px, #000 calc(100% - 6px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 6px, #000 calc(100% - 6px), transparent 100%);
  /* 菜单不放滚动条：滚轮/键盘照常滚动，左右留白对称 */
  scrollbar-width: none;
}
.sd-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }

.sd-cat {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.sd-cat:hover, .sd-cat.sd-active { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); }
/* 展开 = 当前选中：用品牌蓝，和按钮打开态一致 */
.sd-cat.sd-expanded {
  background: rgba(79, 140, 255, .22);
  color: var(--dsw-alias-brand-primary, #4f8cff);
}
.sd-cat.sd-expanded .sd-count { color: rgba(79, 140, 255, .78); }
.sd-cat.sd-expanded.sd-active { background: rgba(79, 140, 255, .26); }
.sd-cat-name { flex: 1; }
.sd-count {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55));
  font-variant-numeric: tabular-nums;
}

.sd-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 12px);
  height: 30px;
  margin: 0 0 0 12px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,.62));
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.sd-item:hover, .sd-item.sd-active {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08));
  color: var(--dsw-alias-label-primary, #e7eaf0);
}
.sd-item-name {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);
  scrollbar-width: none;
}
.sd-item-name::-webkit-scrollbar { width: 0; height: 0; display: none; }
.sd-enter { font-size: 11px; opacity: 0; }
.sd-item:hover .sd-enter, .sd-item.sd-active .sd-enter { opacity: .7; }
.sd-step {
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(255,255,255,.42));
  font-variant-numeric: tabular-nums;
}
.sd-empty { padding: 6px 10px 8px 8px; font-size: 11px; color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55)); }
.sd-notice {
  margin: 2px 2px 6px;
  padding: 5px 8px;
  border-radius: 6px;
  background: rgba(240, 179, 106, .14);
  color: var(--dsw-alias-state-warn-label, #f0b36a);
  font-size: 11px;
  line-height: 1.4;
}
.sd-retry { display: block; width: 100%; border: none; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.sd-retry:hover { color: var(--dsw-alias-label-primary, #e7eaf0); }

.sd-card {
  position: fixed;
  z-index: 61;
  width: 240px;
  max-height: 200px;
  overflow: visible;
  box-sizing: border-box;
  padding: 9px 12px 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.06));
  border-radius: 10px;
  background: var(--dsw-menu-surface-fill, rgba(48,49,54,.64));
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  backdrop-filter: blur(18px) saturate(1.15);
  box-shadow: var(--dsw-shadow-lv1, 0 8px 24px rgba(0,0,0,.4));
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,.55));
  font-size: 11px;
  line-height: 1.55;
  pointer-events: none;
  animation: sd-fade .12s ease-out;
}
.sd-card::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 13px;
  border: 6px solid transparent;
  border-right-color: rgba(48, 49, 54, .92);
}
.sd-card.sd-card-left::before {
  left: auto;
  right: -6px;
  border-right-color: transparent;
  border-left-color: rgba(48, 49, 54, .92);
}
.sd-card-title {
  margin-bottom: 4px;
  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);
  font-size: 12px;
  color: var(--dsw-alias-label-primary, #e7eaf0);
}
.sd-card-zh {
  margin-bottom: 5px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, #e7eaf0);
}
.sd-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 10.5px;
  line-height: 1.5;
}
.sd-card-src { margin-top: 6px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary, rgba(255,255,255,.45)); }
.sd-card-chain { margin-top: 4px; font-size: 10.5px; color: var(--dsw-alias-brand-primary, #4f8cff); }
`

    function Styles() {
      return h('style', { 'data-skill-drawer-styles': 'true' }, CSS)
    }

    /* --------------------------------------------------------------- store */
    const store = {
      open: false,
      lang: detectLang(),
      anchor: null,
      inputActions: null,
      sessionId: null,
      skillsRemote: null,
      lastItems: [],
      lastSessionId: null,
      lastWidth: 150,
      notes: {},
      notesLoaded: false,
      listeners: new Set(),
      notify() {
        this.listeners.forEach((fn) => {
          try {
            fn()
          } catch {
            /* a listener must never break the drawer */
          }
        })
      },
      set(next) {
        if (this.open === next) return
        this.open = next
        this.notify()
      },
      setLang(next) {
        if (this.lang === next) return
        this.lang = next
        this.notify()
      },
      subscribe(fn) {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
      },
    }

    function useOpen() {
      const [open, setOpen] = React.useState(store.open)
      React.useEffect(() => store.subscribe(() => setOpen(store.open)), [])
      return open
    }

    function useLang() {
      const [lang, setLang] = React.useState(store.lang)
      React.useEffect(() => store.subscribe(() => setLang(store.lang)), [])
      return lang
    }

    /* 本机中文说明：由宿主接口读 ~/.dsh/skill-drawer/notes-zh.json。
       仓库里不带任何翻译；读不到时全部回退英文原文。 */
    function loadNotes() {
      if (store.notesLoaded) return
      store.notesLoaded = true
      try {
        fetch('/dsh-skill-drawer/api/notes', { headers: { accept: 'application/json' } })
          .then((response) => (response && response.ok ? response.json() : null))
          .then((data) => {
            if (!data || data.ok !== true || !data.notes || typeof data.notes !== 'object') return
            store.notes = data.notes
            store.notify()
          })
          .catch(() => {
            /* no local notes: keep original descriptions */
          })
      } catch {
        /* fetch unavailable */
      }
    }

    /** Insert `/name ` at the current caret. False means the draft moved under us. */
    function insertSkill(name) {
      const api = store.inputActions
      if (!api || typeof api.captureInsertion !== 'function' || typeof api.insertText !== 'function') {
        console.warn('[dsh-skill-drawer] inputActions unavailable; cannot insert')
        return false
      }
      try {
        const span = api.captureInsertion()
        const applied = api.insertText(`/${name} `, span)
        return applied !== false
      } catch (error) {
        console.warn('[dsh-skill-drawer] insert failed:', error)
        return false
      }
    }

    /* ============================================================================
     *  个人定制区 · PERSONAL
     *  开源默认是“什么都不改”。想按自己的习惯调整，只改这一块即可；
     *  git diff 会清楚显示你改了哪几行，升级时也只需要重新对照这一段。
     * ========================================================================== */
    const PERSONAL = {
      /* 不进抽屉的技能名前缀。
         默认隐藏 speckit-*：这些技能由「流程向导」负责安装与执行，直接插入命令
         在未安装的工作流里会跑不起来，列在抽屉里只会让人误以为能用。
         想全部显示就改成 []。 */
      hiddenPrefixes: ['speckit-'],

      /* 是否在列表里显示流程步骤标记（(2/5) 这种）。关掉就只显示卡片里的步骤。 */
      showChainStep: true,

      /* 是否在中文模式下额外显示英文原文（小字）。 */
      showOriginalUnderChinese: true,
    }
    /* ======================= 个人定制区结束 · END PERSONAL ==================== */

    /* --------------------------------------------------------- skills data */
    /* 分类规则：先按技能名/描述里的关键词自动归类；用户自定义分类下一轮做。 */
    const CATEGORY_RULES = [
      {
        id: 'selfmedia',
        name: '自媒体',
        en: 'Social',
        patterns: ['xiaohongshu', 'douyin', 'bilibili', 'wechat', '小红书', '抖音', 'b站', '自媒体', '内容运营', 'short-video', '短视频', '朋友圈'],
      },
      {
        id: 'marketing',
        name: '营销',
        en: 'Marketing',
        patterns: ['marketing', 'brand', 'seo', 'campaign', 'competitive', '营销', '品牌', '投放', '文案'],
      },
      { id: 'legal', name: '法务', en: 'Legal', patterns: ['legal', 'contract', 'compliance', '合同', '合规', '法务'] },
      {
        id: 'design',
        name: '设计',
        en: 'Design',
        patterns: ['design', 'diagram', 'illustration', 'ux', '设计', '架构图', '流程图', '视觉', '配色'],
      },
      { id: 'writing', name: '写作', en: 'Writing', patterns: ['writing', 'write', 'blog', 'article', '写作', '撰写', '润色'] },
      {
        id: 'code',
        name: '代码',
        en: 'Code',
        patterns: ['code', 'dev', 'tdd', 'test', 'review', 'git', 'debug', 'refactor', '代码', '测试', '审查', '调试', '重构'],
      },
      {
        id: 'office',
        name: '办公',
        en: 'Office',
        patterns: ['office', 'docx', 'xlsx', 'pptx', 'pdf', 'excel', 'word', '表格', '文档', '演示'],
      },
      { id: 'video', name: '视频', en: 'Video', patterns: ['video', 'remotion', 'caption', '剪辑', '视频', '字幕', '动画'] },
      {
        id: 'flow',
        name: '流程',
        en: 'Workflow',
        patterns: ['speckit', 'workflow', 'specify', 'brainstorm', 'superpowers', '流程', '构思', '规划'],
      },
    ]

    /* 中文说明来自本机 notes-zh.json（宿主接口读取），仓库里不保存任何翻译。 */

    /* 需要按顺序配合用的技能链：列表里标 (第几步/共几步)，卡片里说明是哪条流程。 */
    const SKILL_CHAINS = [
      {
        label: 'speckit 流程',
        labelEn: 'speckit flow',
        steps: ['speckit-specify', 'speckit-clarify', 'speckit-plan', 'speckit-tasks', 'speckit-implement', 'speckit-analyze'],
      },
      {
        label: '开发流程',
        labelEn: 'Dev flow',
        steps: ['brainstorming', 'writing-plans', 'executing-plans', 'code-review', 'finishing-a-development-branch'],
      },
      { label: '排错流程', labelEn: 'Debug flow', steps: ['systematic-debugging', 'diagnosing-bugs', 'tdd'] },
      { label: '视频流程', labelEn: 'Video flow', steps: ['remotion-create', 'remotion-markup', 'remotion-render'] },
    ]

    const CHAIN_INDEX = (() => {
      const index = new Map()
      for (const chain of SKILL_CHAINS) {
        chain.steps.forEach((name, position) => {
          if (!index.has(name)) {
            index.set(name, {
              label: chain.label,
              labelEn: chain.labelEn || chain.label,
              index: position + 1,
              total: chain.steps.length,
            })
          }
        })
      }
      return index
    })()

    function chainInfo(name) {
      return CHAIN_INDEX.get(name) || null
    }

    function chineseNote(name) {
      return Object.prototype.hasOwnProperty.call(store.notes, name) ? store.notes[name] : ''
    }

    function normalizeSkill(raw) {
      if (!raw || typeof raw.name !== 'string' || raw.name === '') return null
      const invocation = raw.invocation
      if (invocation && typeof invocation === 'object') {
        if (invocation['user-invocable'] === false || invocation.userInvocable === false) return null
      }
      return {
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : '',
        whenToUse: typeof raw.whenToUse === 'string' ? raw.whenToUse : '',
        source: typeof raw.source === 'string' ? raw.source : '',
        path: typeof raw.path === 'string' ? raw.path : '',
      }
    }

    /* 官方列表不一定给 source，就按路径猜：用户目录下的 .dsh/skills 算用户级，
       其余 .dsh/skills 算项目级；都判断不出来就返回空字符串，卡片里不显示这一行。 */
    function sourceOf(skill) {
      if (skill.source) return skill.source
      const path = (skill.path || '').replace(/\\/g, '/')
      if (!path.includes('/.dsh/skills/')) return ''
      if (/^\/(home|Users)\/[^/]+\/\.dsh\/skills\//i.test(path) || /^[A-Za-z]:\/Users\/[^/]+\/\.dsh\/skills\//i.test(path)) {
        return 'user'
      }
      return 'project'
    }

    function sourceLabel(skill, lang) {
      const t = TEXT[lang === 'en' ? 'en' : 'zh']
      const source = sourceOf(skill)
      if (source === 'user' || source === 'user-skill') return t.userLevel
      if (source === 'project' || source === 'project-skill') return t.projectLevel
      if (source === 'builtin' || source === 'built-in') return t.builtin
      return ''
    }

    function categoryOf(skill) {
      // 成链的技能统一进「流程」，按步骤排，避免 (4/5) 跑到别的分类里当第一条
      if (chainInfo(skill.name)) return 'flow'
      const hay = `${skill.name} ${skill.description} ${skill.whenToUse}`.toLowerCase()
      for (const rule of CATEGORY_RULES) {
        for (const pattern of rule.patterns) {
          if (hay.includes(pattern)) return rule.id
        }
      }
      return 'other'
    }

    /* 隐藏的前缀来自个人定制区；默认为空，所有技能都会显示。 */
    function isHiddenSkill(name) {
      return PERSONAL.hiddenPrefixes.some((prefix) => name.startsWith(prefix))
    }

    /* 成链的技能按步骤排，其他按名字排。 */
    function sortSkills(items) {
      return [...items].sort((left, right) => {
        const first = chainInfo(left.name)
        const second = chainInfo(right.name)
        if (first && second) {
          if (first.label !== second.label) return first.label.localeCompare(second.label)
          return first.index - second.index
        }
        if (first) return -1
        if (second) return 1
        return left.name.localeCompare(right.name)
      })
    }

    /* 搜索：名字、中文说明、英文描述都参与匹配。 */
    function matchesQuery(item, query) {
      return (
        item.name.toLowerCase().includes(query) ||
        chineseNote(item.name).toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query) ||
        (item.whenToUse || '').toLowerCase().includes(query)
      )
    }

    function buildCategories(skills) {
      if (!Array.isArray(skills) || skills.length === 0) return []
      const buckets = new Map()
      for (const rule of CATEGORY_RULES) buckets.set(rule.id, [])
      buckets.set('other', [])
      for (const skill of skills) buckets.get(categoryOf(skill)).push(skill)
      for (const [key, items] of buckets) buckets.set(key, sortSkills(items))
      const all = sortSkills(skills)
      const categories = [{ id: 'all', name: '全部', en: 'All', items: all, count: all.length }]
      for (const rule of CATEGORY_RULES) {
        const items = buckets.get(rule.id)
        if (items.length) {
          categories.push({ id: rule.id, name: rule.name, en: rule.en || rule.name, items, count: items.length })
        }
      }
      const other = buckets.get('other')
      if (other.length) categories.push({ id: 'other', name: '其他', en: 'Other', items: other, count: other.length })
      return categories
    }

    /* ------------------------------------------------------------------ ui */
    function StarIcon() {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M8 1.4l1.75 4.02 4.35.41-3.28 2.86.96 4.25L8 10.7l-3.78 2.24.96-4.25-3.28-2.86 4.35-.41z',
          fill: 'currentColor',
        }),
      )
    }

    function DrawerButton(props) {
      const open = useOpen()
      const lang = useLang()
      const t = TEXT[lang === 'en' ? 'en' : 'zh']
      const ref = React.useRef(null)

      React.useEffect(() => {
        store.anchor = ref.current
        return () => {
          store.anchor = null
        }
      }, [])

      React.useEffect(() => {
        store.inputActions = (props && props.inputActions) || null
      }, [props && props.inputActions])

      React.useEffect(() => {
        store.sessionId = (props && props.sessionId) || null
      }, [props && props.sessionId])

      return h(
        React.Fragment,
        null,
        h(Styles),
        h(
          'button',
          {
            ref,
            type: 'button',
            className: open ? 'sd-btn sd-open' : 'sd-btn',
            'aria-label': t.dialogAria,
            'aria-expanded': open ? 'true' : 'false',
            'data-skill-drawer-trigger': '',
            'data-build': VERSION,
            style: open
              ? { color: 'var(--dsw-alias-brand-primary, #4f8cff)', background: 'rgba(79,140,255,.24)' }
              : undefined,
            onClick: () => store.set(!open),
          },
          h('span', { className: 'sd-icon' }, h(StarIcon)),
          h('span', { className: 'sd-label' }, t.button),
        ),
      )
    }

    /** 菜单宽度：当前统一 150（长名字靠悬停滑动看全）。要恢复“按内容算”，改这里即可。 */
    function menuWidthFor() {
      return 150
    }

    function buildRows(categories, expanded) {
      // 分类原地展开：不重排，位置稳定；内容看不见时由 revealCategory 滚动补位
      const rows = []
      for (const category of categories) {
        rows.push({ key: `cat:${category.id}`, type: 'cat', category })
        if (expanded === category.id) {
          for (const item of category.items) {
            rows.push({ key: `skill:${item.name}`, type: 'skill', item, category })
          }
        }
      }
      return rows
    }

    function DrawerPanel() {
      const open = useOpen()
      const [pos, setPos] = React.useState(null)
      const [expanded, setExpanded] = React.useState(null)
      const [focusKey, setFocusKey] = React.useState(null)
      const rootRef = React.useRef(null)
      const rowsRef = React.useRef([])
      const focusRef = React.useRef(null)
      const queryRef = React.useRef('')
      const [query, setQuery] = React.useState('')
      const lang = useLang()
      const t = TEXT[lang === 'en' ? 'en' : 'zh']
      const scrollRef = React.useRef(null)
      const [card, setCard] = React.useState(null)
      const cardTimer = React.useRef(null)
      const [skillsData, setSkillsData] = React.useState({ status: 'idle', items: [], error: '' })
      const [reloadTick, setReloadTick] = React.useState(0)
      const [notice, setNotice] = React.useState('')
      const noticeTimer = React.useRef(null)

      const toggleLang = () => {
        const next = lang === 'zh' ? 'en' : 'zh'
        store.setLang(next)
        try {
          if (window.localStorage) window.localStorage.setItem(LANG_KEY, next)
        } catch {
          /* preference is best-effort */
        }
      }

      /* 原地展开后只滚必要的距离：分类行看得见、但下面技能被切掉时，
         把分类行顶到列表上方留一点边距，让展开内容进入视野。 */
      const revealCategory = (categoryId) => {
        window.requestAnimationFrame(() => {
          const scroller = scrollRef.current
          const node =
            rootRef.current && rootRef.current.querySelector(`[data-row-key="cat:${categoryId}"]`)
          if (!scroller || !node) return
          const box = scroller.getBoundingClientRect()
          const rect = node.getBoundingClientRect()
          const currentTop = rect.top - box.top + scroller.scrollTop
          const rowBottom = currentTop + rect.height
          const visibleBottom = scroller.scrollTop + scroller.clientHeight
          // 分类行下方至少要露出这么多，才不用滚
          const wanted = 140
          if (rowBottom + wanted > visibleBottom) {
            scroller.scrollTop = Math.max(0, currentTop - 4)
          }
        })
      }

      const flashNotice = (text) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current)
        setNotice(text)
        noticeTimer.current = setTimeout(() => {
          noticeTimer.current = null
          setNotice('')
        }, 2500)
      }

      const hideCard = () => {
        if (cardTimer.current) {
          clearTimeout(cardTimer.current)
          cardTimer.current = null
        }
        setCard(null)
      }

      const showCard = (row, element) => {
        if (cardTimer.current) clearTimeout(cardTimer.current)
        cardTimer.current = setTimeout(() => {
          try {
            const rect = element.getBoundingClientRect()
            setCard({ item: row.item, rect: { left: rect.left, right: rect.right, top: rect.top } })
          } catch {
            /* ignore stale element */
          }
        }, 200)
      }

      React.useEffect(
        () => () => {
          if (cardTimer.current) clearTimeout(cardTimer.current)
          if (noticeTimer.current) clearTimeout(noticeTimer.current)
        },
        [],
      )

      React.useEffect(() => {
        // 文案在 effect 内按当前语言取，避免切语言触发重新拉取
        const copy = TEXT[store.lang === 'en' ? 'en' : 'zh']
        if (!open) {
          setSkillsData(
            store.lastItems.length && store.lastSessionId === store.sessionId
              ? { status: 'ready', items: store.lastItems, error: '' }
              : { status: 'idle', items: [], error: '' },
          )
          return undefined
        }
        const remoteGetter = store.skillsRemote
        let remote = null
        try {
          remote = typeof remoteGetter === 'function' ? remoteGetter() : null
        } catch (error) {
          console.warn('[dsh-skill-drawer] skills service not ready:', error)
        }
        const sessionId = store.sessionId
        if (!remote || typeof remote.list !== 'function') {
          setSkillsData({ status: 'error', items: [], error: copy.unavailable })
          return undefined
        }
        if (!sessionId) {
          setSkillsData({ status: 'error', items: [], error: copy.noSession })
          return undefined
        }
        let cancelled = false
        const controller = new AbortController()
        // 有同一会话的缓存就直接显示旧数据，后台刷新：不闪“正在读取”
        const cacheValid = store.lastItems.length > 0 && store.lastSessionId === sessionId
        if (!cacheValid) setSkillsData({ status: 'loading', items: [], error: '' })
        let request
        try {
          request = remote.list({ sessionId }, controller.signal)
        } catch (error) {
          setSkillsData({ status: 'error', items: [], error: (error && error.message) || copy.readFailed })
          return undefined
        }
        Promise.resolve(request).then(
          (result) => {
            if (cancelled) return
            if (!result || result.ok === false) {
              const message = result && result.error && result.error.message
              setSkillsData({ status: 'error', items: [], error: message || copy.readFailed })
              return
            }
            const list = result.value && Array.isArray(result.value.skills) ? result.value.skills : []
            const items = []
            for (const raw of list) {
              const skill = normalizeSkill(raw)
              if (skill && !isHiddenSkill(skill.name)) items.push(skill)
            }
            setSkillsData({ status: 'ready', items, error: '' })
            store.lastItems = items
            store.lastSessionId = sessionId
            try {
              store.lastWidth = menuWidthFor(buildCategories(items))
            } catch {
              /* width is cosmetic */
            }
            setExpanded(null)
          },
          (error) => {
            if (cancelled || controller.signal.aborted) return
            setSkillsData({ status: 'error', items: [], error: (error && error.message) || copy.readFailed })
          },
        )
        return () => {
          cancelled = true
          controller.abort()
        }
      }, [open, reloadTick])

      const categories = buildCategories(skillsData.items)
      const normalizedQuery = query.trim().toLowerCase()
      const searchRows = normalizedQuery
        ? sortSkills(skillsData.items.filter((item) => matchesQuery(item, normalizedQuery))).map((item) => ({
            key: `skill:${item.name}`,
            type: 'skill',
            item,
          }))
        : null
      rowsRef.current = searchRows || buildRows(categories, expanded)
      focusRef.current = focusKey
      queryRef.current = normalizedQuery

      React.useEffect(() => {
        if (!open) return undefined
        loadNotes()
        const measure = () => {
          const el = store.anchor
          if (!el) {
            setPos(null)
            return
          }
          const rect = el.getBoundingClientRect()
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
          setPos({ left, bottom: window.innerHeight - rect.top + MENU_GAP })
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [open])

      React.useEffect(() => {
        if (!open) {
          setExpanded(null)
          setFocusKey(null)
          setQuery('')
          setCard(null)
          if (cardTimer.current) {
            clearTimeout(cardTimer.current)
            cardTimer.current = null
          }
          return undefined
        }
        const rows = () => rowsRef.current
        /* 键盘选中技能行时，也把说明卡片亮出来（和鼠标一致）。 */
        const revealCard = (key) => {
          const row = rows().find((entry) => entry.key === key)
          if (!row || row.type !== 'skill') {
            hideCard()
            return
          }
          const node = rootRef.current && rootRef.current.querySelector(`[data-row-key="${key}"]`)
          if (!node) return
          try {
            node.scrollIntoView({ block: 'nearest' })
          } catch {
            /* ignore */
          }
          showCard(row, node)
        }
        const move = (delta) => {
          const list = rows()
          if (!list.length) return
          const current = list.findIndex((row) => row.key === focusRef.current)
          let next = current + delta
          if (next < 0) next = list.length - 1
          if (next >= list.length) next = 0
          setFocusKey(list[next].key)
          revealCard(list[next].key)
        }
        /* Navigation keys belong to the drawer only while the drawer (or its trigger)
           owns focus; a user typing in the composer keeps its arrow keys. */
        const focusAllowsKeys = () => {
          const menu = rootRef.current
          if (!menu) return false
          const active = document.activeElement
          if (active === null || active === undefined || active === document.body) return true
          if (active === menu || menu.contains(active)) return true
          return !!(active.closest && active.closest('[data-skill-drawer-trigger]'))
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            store.set(false)
            return
          }
          if (!focusAllowsKeys()) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
            return
          }
          const list = rows()
          const active = list.find((row) => row.key === focusRef.current)
          if (event.key === 'ArrowRight') {
            if (active && active.type === 'cat') {
              event.preventDefault()
              setExpanded(active.category.id)
              revealCategory(active.category.id)
              hideCard()
            }
            return
          }
          if (event.key === 'ArrowLeft') {
            if (expanded) {
              event.preventDefault()
              setFocusKey(`cat:${expanded}`)
              setExpanded(null)
              hideCard()
            }
            return
          }
          if (event.key === 'Enter') {
            const target = active || (queryRef.current && list.length > 0 ? list[0] : null)
            if (!target) return
            event.preventDefault()
            if (target.type === 'cat') {
              const next = expanded === target.category.id ? null : target.category.id
              setExpanded(next)
              if (next) revealCategory(next)
            } else if (insertSkill(target.item.name)) {
              store.set(false)
            } else {
              flashNotice(t.draftChanged)
            }
          }
        }
        const onPointer = (event) => {
          const node = rootRef.current
          if (!node) return
          if (node.contains(event.target)) return
          if (event.target && event.target.closest && event.target.closest('[data-skill-drawer-trigger]')) return
          store.set(false)
        }
        window.addEventListener('keydown', onKey, true)
        document.addEventListener('mousedown', onPointer)
        return () => {
          window.removeEventListener('keydown', onKey, true)
          document.removeEventListener('mousedown', onPointer)
        }
      }, [open, expanded, lang])

      if (!open || !pos) return null

      const rows = rowsRef.current

      let cardElement = null
      if (card) {
        const width = 240
        let left = card.rect.right + 8
        let flipped = false
        if (left + width > window.innerWidth - 8) {
          left = card.rect.left - width - 8
          flipped = true
        }
        left = Math.max(8, left)
        const top = Math.max(8, Math.min(card.rect.top - 2, window.innerHeight - 200))
        const zh = chineseNote(card.item.name)
        const original = card.item.description || card.item.whenToUse || ''
        const primary = lang === 'en' ? original || zh : zh || original
        const secondary =
          lang === 'en'
            ? original
              ? zh
              : ''
            : zh && PERSONAL.showOriginalUnderChinese
              ? original
              : ''
        const chain = chainInfo(card.item.name)
        const chainLabel = chain ? (lang === 'en' ? chain.labelEn : chain.label) : ''
        const source = sourceLabel(card.item, lang)
        cardElement = h(
          'div',
          { className: flipped ? 'sd-card sd-card-left' : 'sd-card', style: { top, left } },
          h('div', { className: 'sd-card-title' }, `/${card.item.name}`),
          primary ? h('div', { className: 'sd-card-zh' }, primary) : null,
          secondary ? h('div', { className: 'sd-card-desc' }, secondary) : null,
          chain ? h('div', { className: 'sd-card-chain' }, t.step(chainLabel, chain.index, chain.total)) : null,
          source ? h('div', { className: 'sd-card-src' }, `${t.from}${source}`) : null,
        )
      }

      const elements = []
      if (skillsData.status === 'loading') {
        elements.push(h('div', { key: 'loading', className: 'sd-empty' }, t.loading))
      } else if (skillsData.status === 'error') {
        elements.push(
          h(
            'button',
            {
              key: 'error',
              type: 'button',
              className: 'sd-empty sd-retry',
              onClick: () => setReloadTick((value) => value + 1),
            },
            `${t.failed}${skillsData.error}${t.retry}`,
          ),
        )
      } else if (skillsData.status === 'ready' && rows.length === 0) {
        elements.push(
          h(
            'div',
            { key: 'empty', className: 'sd-empty' },
            queryRef.current ? t.noMatch : t.noSkills,
          ),
        )
      }
      for (const row of rows) {
        if (row.type === 'cat') {
          const isExpanded = expanded === row.category.id
          elements.push(
            h(
              'button',
              {
                key: row.key,
                type: 'button',
                'data-row-key': row.key,
                className: [
                  'sd-cat',
                  isExpanded ? 'sd-expanded' : '',
                  focusKey === row.key ? 'sd-active' : '',
                ]
                  .filter(Boolean)
                  .join(' '),
                'aria-expanded': isExpanded ? 'true' : 'false',
                onMouseEnter: () => {
                  setFocusKey(row.key)
                  hideCard()
                },
                onClick: () => {
                  const next = isExpanded ? null : row.category.id
                  setExpanded(next)
                  if (next) revealCategory(next)
                },
              },
              h('span', { className: 'sd-cat-name' }, lang === 'en' ? row.category.en || row.category.name : row.category.name),
              h('span', { className: 'sd-count' }, String(row.category.count)),
            ),
          )
        } else {
          const chain = chainInfo(row.item.name)
          elements.push(
            h(
              'button',
              {
                key: row.key,
                type: 'button',
                'data-row-key': row.key,
                className: focusKey === row.key ? 'sd-item sd-active' : 'sd-item',
                onMouseEnter: (event) => {
                  setFocusKey(row.key)
                  showCard(row, event.currentTarget)
                  const nameEl = event.currentTarget.querySelector('[data-sd-name]')
                  if (nameEl) nameEl.scrollTo({ left: nameEl.scrollWidth, behavior: 'smooth' })
                },
                onMouseLeave: (event) => {
                  const nameEl = event.currentTarget.querySelector('[data-sd-name]')
                  if (nameEl) nameEl.scrollTo({ left: 0, behavior: 'smooth' })
                  hideCard()
                },
                onClick: () => {
                  if (insertSkill(row.item.name)) store.set(false)
                  else flashNotice(t.draftChanged)
                },
              },
              h('span', { className: 'sd-item-name', 'data-sd-name': '' }, `/${row.item.name}`),
              chain && PERSONAL.showChainStep
                ? h('span', { className: 'sd-step', 'aria-hidden': 'true' }, `(${chain.index}/${chain.total})`)
                : null,
              h('span', { className: 'sd-enter', 'aria-hidden': 'true' }, '↵'),
            ),
          )
        }
      }

      if (notice) elements.unshift(h('div', { key: 'sd-notice', className: 'sd-notice' }, notice))
      const menuWidth = categories.length ? menuWidthFor(categories) : store.lastWidth

      return h(
        React.Fragment,
        null,
        h(Styles),
        h(
          'div',
          {
            ref: rootRef,
            className: 'sd-menu-root',
            style: { left: pos.left, bottom: pos.bottom, width: `${menuWidth || 150}px` },
            onMouseLeave: hideCard,
          },
          h(
            'div',
            { className: 'sd-menu', role: 'dialog', 'aria-label': t.dialogAria, 'data-build': VERSION },
            h(
              'div',
              { className: 'sd-search-wrap' },
              h('input', {
                className: 'sd-search',
                type: 'text',
                value: query,
                placeholder: t.search,
                'aria-label': t.search,
                onChange: (event) => {
                  setQuery(event.target.value)
                  setFocusKey(null)
                },
              }),
              h(
                'button',
                {
                  className: 'sd-lang',
                  type: 'button',
                  onClick: toggleLang,
                  'aria-label': t.langAria,
                },
                lang === 'zh' ? '中' : 'EN',
              ),
            ),
            h('div', { ref: scrollRef, className: 'sd-scroll' }, elements),
          ),
        ),
        cardElement,
      )
    }

    /* ------------------------------------------------------------ boundary */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        console.warn('[dsh-skill-drawer] ui crashed; entry hidden:', error)
      }

      render() {
        return this.state.failed ? null : this.props.children
      }
    }

    function wrapped(Component) {
      return function DrawerBoundary(props) {
        return h(Boundary, null, h(Component, props))
      }
    }

    /* --------------------------------------------------------------- apply */
    return {
      inject: ['slots', 'remote', 'remote.skills'],
      apply(ctx) {
        try {
          if (!ctx || !ctx.slots) {
            console.warn('[dsh-skill-drawer] slots service unavailable; client half inactive')
            return
          }
          try {
            store.skillsRemote = () => (ctx.remote && ctx.remote.skills ? ctx.remote.skills : null)
          } catch (error) {
            console.warn('[dsh-skill-drawer] skills remote unavailable:', error)
          }
          ctx.slots.inject(SLOT_BUTTON, () =>
            ctx.slots.register({ name: SLOT_BUTTON, id: PLUGIN_ID, order: 10 }, wrapped(DrawerButton)),
          )
        } catch (error) {
          console.warn('[dsh-skill-drawer] trigger slot skipped:', error)
        }

        try {
          ctx.slots.inject(SLOT_OVERLAY, () =>
            ctx.slots.register({ name: SLOT_OVERLAY, id: `${PLUGIN_ID}-menu`, order: 10 }, wrapped(DrawerPanel)),
          )
        } catch (error) {
          console.warn('[dsh-skill-drawer] overlay slot skipped:', error)
        }
      },
    }
  },
})
