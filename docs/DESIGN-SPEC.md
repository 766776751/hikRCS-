# rcsbox AGV/RCS 运维控制台 · UI 设计清单（GALAXY 研读版）

> 依据：GitHub 开源 UI 库 **uiverse-io/galaxy**（3500+ 社区组件，MIT 协议）实际研读提炼。
> 采样规模：Buttons 1231 / Cards 726 / loaders 718 / Toggle-switches 260 / Inputs 226 / Checkboxes 171 / Forms 180 / Tooltips 62 / Radio 102 / Notifications 23 / Patterns 103。
> 适用对象：rcsbox AGV/RCS 运维控制台全端（PC 表格端 + 移动卡片端）。
> 本清单是**唯一设计事实源**：所有图标尺寸、对齐、边距、动画数值均已固化为可执行规则，后续任何页面迭代必须引用本清单，禁止凭感觉调样式。

---

## 〇、总纲：单一技术栈决策（最高优先级）

**结论：全项目统一使用 React，彻底废弃 Vue，禁止 Vue + React 混用长期存在。**

理由与路径：

1. **现状问题**：项目当前是 Vue3（页面层）+ React（站点监控重写版）双栈共存。双栈意味着两套构建链（@vitejs/plugin-vue + @vitejs/plugin-react）、两套组件写法、两份样式约定，任何"改一处样式"都要在两套心智模型里对齐——这正是此前反复出现对齐/缩进错乱的土壤。
2. **统一方向**：以 React 为唯一 UI 技术栈。站点监控已用 React 重写并验证（`src-site/`），组件拆分方式（Toolbar/Card/Table/Legend 等纯函数组件 + hooks）已被证明可维护，全站照此推广。
3. **迁移顺序**（每迁移一页，删除对应 Vue 文件，保持仓库零死代码）：
   - 第 1 步：把 `src-site/` 升级为全站设计系统 `src-ui/`（tokens + 基础组件），站点监控改引用；
   - 第 2 步：首页 HomeView → React（卡片导航是其他页面的容器，先迁）；
   - 第 3 步：任务查询 / 任务取消 / 手动任务 → React；
   - 第 4 步：告警推送 / 推送日志 / 告警查询 → React；
   - 第 5 步：货架监控（最复杂，最后迁）→ React；
   - 第 6 步：MobileLayout / 路由外壳 → React Router，删除 Vue、@vitejs/plugin-vue、所有 .vue 文件。
4. **样式语言**：唯一使用 **纯 CSS（CSS 变量 + BEM 命名 + 模块化文件）**，不引入 Tailwind、CSS-in-JS、 Less/Sass。理由：与 galaxy 仓库组件（纯 HTML+CSS）可直接互译；运维控制台需要长期可审计的确定性样式；避免多一层抽象。
5. **接口层不变**：`/api/agv/*`、`/api/site-marks`、`/api/manual-task-url` 等后端契约保持稳定，前端只换渲染层。

---

## 一、设计令牌（Design Tokens）

全部令牌集中定义在 `src-ui/tokens.css`，**任何组件禁止写死颜色/字号/间距字面量**（图标尺寸白名单见第三章）。

### 1.1 色彩

**品牌色**（AGV 工业蓝）：
- `--brand-50: #eff6ff`（选中底）
- `--brand-100: #dbeafe`
- `--brand-400: #60a5fa`
- `--brand-500: #3b82f6`（主按钮底）
- `--brand-600: #2563eb`（链接/强调文字）
- `--brand-700: #1d4ed8`

**状态色（业务语义，全局唯一映射，禁止挪用）**：
- 无货/正常 → 绿 `#22c55e`，淡底 `#f0fdf4`
- 有货/警告中间态 → 黄 `#f59e0b`，淡底 `#fffbeb`（淡黄是用户钦定色）
- 满货/危险 → 红 `#ef4444`，淡底 `#fef2f2`
- 锁定/停用 → 灰 `#94a3b8`，淡底 `#f1f3f5`
- 告警查询入口 → 红（用户钦定红色字体）

**中性色**：`--ink-900 #0f172a / --ink-700 #334155 / --ink-500 #64748b / --ink-400 #94a3b8 / --ink-300 #c4c9d4 / --line-soft #e5e9f0 / --surface #ffffff / --bg #f6f8fb`。

**暗色主题预留**：所有令牌走 CSS 变量，暗色只需换 `:root[data-theme=dark]` 一层，组件零改动。暗色下表面 `#0f172a`、文字用 `--ink-100 #e2e8f0`，状态色提亮一档（绿 `#4ade80` / 黄 `#fbbf24` / 红 `#f87171`）。

### 1.2 字体与字号

- 字族：`system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`
- 字号阶梯（固定 7 档）：`12 / 13 / 14 / 16 / 18 / 22 / 28px`。禁止 rem/em 表达**组件尺寸**（galaxy 的教训：`width:1em` 随父级字号浮动，是图标失控的根因）；rem 仅允许用于正文字号。
- 行高：正文 1.5，卡片两行文字区 1.25（收紧以减小视觉中心偏移）。
- 字重：500（次强调）/ 600（卡片标题、表头）/ 700（数值、状态徽章）。
- 移动端输入框内**输入值**必须 ≥16px（防 iOS 聚焦缩放）；placeholder 单独允许 13px。

### 1.3 间距系统

4px 基数网格：`4 / 8 / 12 / 16 / 20 / 24 / 32`。卡片内边距固定 `10px 12px`（移动端）、`12px 16px`（PC）；列表项间距 `8px`（移动）/ `12px`（PC 分组间）。

### 1.4 圆角与阴影

- 圆角：控件 `8px`、卡片 `12px`、弹窗 `16px`、胶囊（徽章/分段器）`999px`。
- 阴影三档：
  - sm：`0 1px 3px rgba(15,23,42,.08)`
  - md：`0 4px 12px rgba(15,23,42,.10)`
  - lg（弹窗）：`0 12px 32px rgba(15,23,42,.16)`
- 状态色条（卡片/表格行左侧）：移动端 `inset 5px 0 0 <色>`，PC `inset 4px 0 0 <色>` + 同色淡底。

### 1.5 动效令牌

- 时长：微交互 `150ms`、悬停/开关 `250ms`、弹窗/页面转场 `300ms`、loader 循环 `800–1200ms`。
- 缓动：常规 `ease-out`；弹性（按下回弹）用 galaxy 高频曲线 `cubic-bezier(0.175, 0.885, 0.32, 1.275)`（back-out）。
- 全局遵守 `prefers-reduced-motion: reduce` → 时长归零、loader 降级为静态点。

---

## 二、布局与对齐铁律（防复发核心）

以下是历史踩坑的固化结论，**违反任何一条即视为 bug**：

1. **图标对齐只用 CSS Grid**：凡是"图标 + 多行文字"的卡片/列表项，容器必须 `display:grid; grid-template-columns:<图标宽>px 1fr; align-items:center`，图标 `grid-row: 1 / span 2; align-self:center; justify-self:center`。禁止用 flex `align-items:center` 表达跨行图标居中（flex 的视觉中心与文字区块中心天然有偏差），也禁止 absolute 定位图标（会脱离文档流、挤压判定复杂）。
2. **图标尺寸三档白名单 + 双重锁定**：卡片 26px / 表格 16px / 图例 20px。实现时必须同时写 HTML `width/height` 属性 + 内联样式，并 `:deep()`/后代选择器覆盖第三方全局样式。禁止 `font-size` 间接控制图片尺寸（em 依赖父级，必失控）。
3. **统一左 padding**：卡片内所有文字行（标题行、详情行、标签行）必须共享同一个左边界。正文列由 Grid 第 2 列统一决定，行内元素不允许额外 `margin-left` 缩进。
4. **文本溢出三件套**：所有可能超长的文字（站点名/载具编号/URL）必须 `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`，且 flex/grid 子项必须 `min-width:0`（没有 min-width:0 截断永远不生效——历史踩坑）。
5. **表格**：`table-layout:fixed; width:100%`，长内容列（更新时间）`white-space:nowrap` 并给固定列宽；弹窗内表格宽度 `min(1060px, 96vw)`。
6. **移动断点**：≤640px 走卡片布局，>640px 走 PC 表格（站点监控页专用断点；全局断点 767px 保留给外壳导航）。

---

## 三、按钮体系（12 种，全部规范化）

galaxy 按钮库三大主流手法：渐变底（454 例）、inset 双阴影 3D（153 例）、霓虹发光（text/box-shadow 叠加）。我们取其精华，收敛为 12 种，全部组件化为 `<Button variant size loading icon>`。

**通用规范**：高度 PC `36px` / 移动 `40px`；内边距 `0 16px`；圆角 `8px`（胶囊按钮 `999px`）；字号 14px/600；图标与文字 `gap:8px` 且图标固定 `width/height` 属性。所有按钮必带四态：`hover`（亮度/位移变化）→ `active`（下沉 1px + 阴影收缩）→ `focus-visible`（2px 品牌色 outline）→ `disabled`（opacity .5 + 禁用指针）。

1. **主按钮 primary**：`--brand-500` 底白字，hover 提亮至 `--brand-400`，active 下沉。用于每屏唯一主操作（查询、保存）。
2. **次按钮 secondary**：白底 + `--line-soft` 边框 + `--ink-700` 字，hover 边框转品牌色。
3. **幽灵按钮 ghost**：透明底，hover 淡灰底。用于工具栏次要操作。
4. **危险按钮 danger**：`#ef4444` 底白字。仅用于删除/取消任务，点击前必须二次确认弹窗。
5. **发光按钮 glow**（galaxy 霓虹手法，用户点名要求）：深色背景上使用。核心三件套——`background:#fff` 或品牌渐变底 + 常态 `box-shadow: 0 0 0 rgba(59,130,246,.4)` → hover `box-shadow: 0 0 20px rgba(59,130,246,.55)` + `transition: box-shadow .25s, transform .25s` + hover `translateY(-2px)`。**铁律：发光按钮文字必须近黑色 `--ink-900`，且 `:active`/`:focus-visible` 锁定黑色**（历史 bug：白底白字不可读）。
6. **渐变按钮 gradient**：`linear-gradient(135deg, #3b82f6, #8b5cf6)` 底白字，hover 渐变角度偏移（`background-position` 位移 + `background-size:200%`）。仅用于首页 hero 区快捷入口（数据看板）。
7. **3D 按钮 push**（galaxy inset 手法）：`box-shadow: 0 4px 0 var(--brand-700)` 实体底边，active 时 `translateY(4px)` + 底边归零，模拟物理按压。用于"刷新数据"这类高频反馈操作。
8. **加载按钮 loading**：点击后进入 loading 态——左侧出现 14px 旋转圈（见第五章 spinner-14），文字换成"处理中…"，按钮禁用防重复提交（PDA 防重复点击惯例沿用）。禁止文字闪烁。
9. **图标按钮 icon**：36×36 正方形，圆角 8px，仅图标无文字，必须带 `aria-label` + Tooltip。设置齿轮等实色高亮态用 `--brand-500` 底白色图标（用户要求的"选中凸显感"）。
10. **分段按钮 segmented**（RadioPills 升级版）：胶囊容器 `--bg` 底，选中项白底 + md 阴影 + `--brand-600` 字，切换动画 `250ms ease-out` 的背景滑块（`transform: translateX` 移动的公共滑块层，而非每项各自变色——galaxy 分段器最佳实践）。
11. **新粗野按钮 brutalist**（galaxy 特色，用于空状态引导/营销位）：3px 黑边框 + `4px 4px 0 #000` 硬偏移阴影，hover 时 `translate(2px,2px)` + 阴影缩至 `2px 2px 0`（"按进纸面"感）。仅在空状态插画区使用，业务区禁用。
12. **链接按钮 link**：无底无边，`--brand-600` 字，hover 下划线。用于"查看全部""导出"等行内动作。

---

## 四、卡片体系（7 种）

galaxy 卡片库 726 例提炼，结合本项目"状态驱动变色"核心业务：

1. **状态站点卡 site-card**（已实现，规范固化）：Grid 双列 `26px 1fr`；左列站点类型图标跨两行居中；右列两行——行1 站点名(600/0.84rem) + 右侧编码徽章(12px 灰底)，行2 详情 `类型 X · 载具 Y · 地图 Z`（12px，`--ink-500`）。整卡按状态着色：左侧色条 + 淡底（见 1.4）。hover `translateY(-2px)` + md 阴影，`transition 250ms`。
2. **导航功能卡 nav-card**（首页三入口卡）：标题(600) + 子按钮列表；子按钮两行式——主名 14px/600 + 特征行 12px/`--ink-400`；整卡即按钮，hover 时子按钮行背景泛起 `--brand-50`。带红色调 danger 子项（告警查询红字）。
3. **玻璃卡 glass-card**（galaxy backdrop-filter 手法，97 例）：`background: rgba(255,255,255,.65); backdrop-filter: blur(12px) saturate(1.4); border:1px solid rgba(255,255,255,.5)`。**仅用于**：hero 标题区、弹窗遮罩上的悬浮摘要条。业务表格区禁用（可读性优先）。
4. **统计卡 stat-card**（数据看板）：大数字 28px/700 + 标签 12px/`--ink-400` + 环比箭头；数字用 `font-variant-numeric: tabular-nums` 防跳动。
5. **渐变描边卡 gradient-border**：双层实现——外层渐变底 + `padding:1.5px` + 内层 `--surface` 底。用于"当前选中"的地图/图层选项，替代廉价的高亮边框。
6. **告警通知卡 alarm-toast**：见第六章。
7. **货架列单元 rack-cell**：色块即数据——绿/黄/红/灰纯色 + hover 提亮 15% + `title` 提示 `状态名 (n/total)`；点击打开列详情弹窗。

**通用交互**：所有可点卡片 `cursor:pointer` + hover 上浮 + `active` 时 `scale(.98)`；卡片圆角 12px、边框 `--line-soft`、阴影 sm → hover md。

---

## 五、开关 Toggle 与加载动画

### 5.1 开关（galaxy Toggle-switches 260 例的标准做法）

结构：隐藏 `checkbox` + `label` 绘制（可访问性 + 纯 CSS 动画）。
- 尺寸：44×24（移动端触控达标），滑块直径 18px；
- 轨道：关 = `--ink-300`，开 = `--brand-500`，过渡 `250ms ease-out`；
- 滑块：`translateX(20px)` + 常态白底 + `0 1px 3px rgba(0,0,0,.25)` 投影，galaxy 惯例再叠加开关瞬间的径向涟漪（`:active` 时滑块 `scale(.9)` 回弹）；
- **应用点**：轮询开关、仅看标记过滤、推送启用停用、暗色主题切换。主题开关用 galaxy 的"日/夜"变体：滑块内嵌太阳/月亮 SVG，切换时轨道颜色 `250ms` 渐变。

### 5.2 加载动画（loaders 718 例收敛为 4 种，全站禁用其他）

1. **spinner-14**：按钮内/行内加载。`border:2px solid rgba(59,130,246,.25); border-top-color: var(--brand-500); border-radius:50%; animation: spin .8s linear infinite`。尺寸档：14px（按钮内）/ 20px（行内）/ 32px（区块）。
2. **轨道 loader**（galaxy 双伪元素手法）：数据刷新时顶部细条——容器顶部 2px 品牌色进度条 `animation: slide 1.2s ease-in-out infinite`（0% `translateX(-100%)` → 100% `translateX(100%)`）。用于 30 秒轮询的静默刷新指示。
3. **骨架屏 skeleton**：首屏加载必用（替代转圈）。`linear-gradient(90deg, #eef1f5 25%, #f7f9fb 50%, #eef1f5 75%)` + `background-size:200%` + `animation: shimmer 1.2s infinite`；卡片骨架 = 圆角块（图标位 26×26 + 两行文字条），表格骨架 = 6 行灰条。形状必须与真实内容布局一致（Grid 结构复用）。
4. **点位脉冲 pulse**：地图/站点在线指示——8px 圆点 + `animation: pulse 1.6s ease-out infinite`（`box-shadow: 0 0 0 0 rgba(34,197,94,.5)` → `0 0 0 10px transparent`）。

**禁令**：禁止滚动数字、粒子、3D 旋转等装饰性 loader（运维工具要克制）；任何 loader 超过 8s 必须显示错误兜底。

---

## 六、通知 / 告警推送 / Tooltip

**Toast 通知**（替代原生 alert，4 级语义）：
- 位置：PC 右上角堆叠（间距 8px），移动端顶部居中、宽 `min(92vw, 360px)`；
- 结构：左侧状态色竖条(4px) + 图标 + 标题(600) + 正文(13px) + 关闭按钮；
- 动画：入场 `translateX(24px)→0 + opacity 0→1, 300ms back-out`；出场反向 200ms；自动关闭 4s，hover 时暂停倒计时；
- galaxay 细节采纳：通知卡内层用 `inset` 双向色阴影制造厚度感（`2px 2px 0 1px rgba(色,.5) inset, -2px -2px 0 1px rgba(色,.8) inset`）用于告警级别徽章。
- 应用映射：微信推送成功/失败、配置保存结果、接口错误（红色 + "重试"按钮）。

**Tooltip**（galaxy 62 例标准式）：
- 纯 CSS：`::after` 气泡 + `::before` 旋转 45° 的小方块箭头；
- 触发：hover 300ms 延迟显示，`opacity + translateY(4px→0)` 过渡；`pointer-events:none`；
- 用途：图标按钮说明、表格截断文本全文、状态色含义。深色底白字，圆角 8px，字号 12px。

---

## 七、输入 / 选择 / 表单规范

1. **输入框**：高 40px（移动）/ 36px（PC），边框 `--line-soft`，focus 时 `2px --brand-400` 边框 + `0 0 0 3px rgba(59,130,246,.15)` 外圈；placeholder 13px `--ink-400`（用户要求的小提示词）。搜索框右侧带清空 ×。
2. **下拉 Select**：优先用原生 `<select>` + 自绘箭头（galaxy 惯例，移动端体验最优）；自绘下拉仅在级联场景使用，弹出层带 `lg` 阴影 + 入场 `scale(.97→1)`。
3. **时间范围选择**：沿用 DateRangeField 弹窗（移动端 fixed 居中 `min(92vw,360px)`），文案 13–14px 防溢出（已修复规范固化为 `flex:1; min-width:0` 截断）。
4. **textarea**：min-height 92px、`resize:vertical`（手动任务链接弹窗规范）。
5. **弹窗**：宽 `440px`（表单）/ `min(1060px,96vw)`（数据详情）；`fit` 属性按内容收缩避免留白（用户钦定）；遮罩 `rgba(15,23,42,.45)` + 玻璃卡式 blur(4px)；入场 `scale(.96→1)+opacity` 300ms；Esc/点遮罩关闭；移动端底部抽屉式（`translateY(100%→0)`）。
6. **复选框/单选**：galaxy 手法——自绘 18px 圆角方框，选中时品牌底 + 白色对勾 SVG `stroke-dashoffset` 描边动画 200ms。

---

## 八、微交互与页面级动画

1. **列表交错入场**：卡片/表格行首载时 `animation: fadeUp .3s ease-out both; animation-delay: index * 30ms`（上限 10 项，多则取消延迟防呆等）。
2. **数字滚动**：统计卡数字变化用 300ms `transform` 无——直接 swap + 一次 `scale(1.06→1)` 微弹即可（克制）。
3. **页面转场**：路由切换 `fade + translateY(8px)` 250ms；移动端左右滑入。
4. **轮询数据刷新**：静默更新，只闪一次行底色（`--brand-50`，600ms 褪去）标记变更行——运维场景最需要"什么变了"的可视性。
5. **空状态**：图标(48px, `--ink-300`) + 一句话 + 新粗野按钮引导；禁止纯文字空白。
6. **错误状态**：红色图标 + 错误详情可展开（`<details>` 语义）+ "重新配置"按钮。

---

## 九、PC 表格与移动卡片双端规范

| 维度 | PC (>640px) | 移动 (≤640px) |
|---|---|---|
| 站点呈现 | 6 列表格：站点名称/类型/编号/载具编号/载具类型/地图 | 三要素 Grid 卡片 |
| 状态表达 | 行左侧 4px 色条 + 淡底 + 名称前圆点 | 卡片左侧 5px 色条 + 淡底 |
| 类型图标 | 16px + 徽章 | 26px Grid 左列 |
| 触控 | 悬停为主 | 点击热区 ≥44px |
| 筛选 | 常驻工具栏 | FilterPanel 默认收起（用户钦定） |
| 图例 | 表头下方一行 | 网格 3 列、图标 20px + 名称下方计数（用户钦定紧凑版） |

---

## 十、无障碍与性能红线

1. 所有交互元素可 Tab 聚焦，`focus-visible` 必须有 2px 可见环。
2. 图标按钮 100% 带 `aria-label`；开关带 `role="switch" aria-checked`。
3. 状态不允许只用颜色表达——色条之外必须叠加文字（状态图例/圆点+文字）。
4. 动画遵守 `prefers-reduced-motion`。
5. 组件按路由 code-split（React.lazy），站点监控 chunk 独立已验证；图标 PNG 用 `loading="lazy"`。
6. 单文件样式不超过 300 行——超限即拆组件。

---

## 十一、落地路线图与验收清单

**组件库建设顺序**（`src-ui/components/`）：
`Button(12变体) → Card(7变体) → Toggle → Spinner/Skeleton/TopLoader → Toast → Tooltip → Input/Select/DateRange → Modal → Table → StatusBadge/Legend → EmptyState → SegmentedPills`

**页面迁移顺序**：站点监控（已完成）→ 首页 → 任务三页 → 告警三页 → 货架监控 → 外壳/路由 → 删除 Vue 全家桶。

**每页验收清单**（合并前逐项打勾）：
- [ ] 无写死的颜色/字号/间距字面量（tokens 引用）
- [ ] 图标尺寸在三档白名单内且 width/height 双重锁定
- [ ] 图标+多行文字结构使用 Grid 布局
- [ ] 所有文本有截断三件套 + min-width:0
- [ ] 按钮/卡片四态齐全，发光按钮文字为黑色
- [ ] 加载使用 4 种 loader 之一 + 骨架屏
- [ ] 移动端触控热区 ≥44px，输入值字号 ≥16px
- [ ] 强刷后无样式抖动，暗色令牌可切换

---

## 十二、附录 A：核心组件落地 CSS（可直接抄进 src-ui）

以下 CSS 是本清单的**实现基准**，组件化时按此为底，改动需同步回本文件。

### A.1 按钮 · 发光按钮 glow（深底场景）

```css
.btn-glow {
  background: #ffffff;
  color: var(--ink-900);            /* 铁律：发光按钮文字必须近黑 */
  border: 1px solid rgba(255,255,255,.4);
  border-radius: 8px;
  padding: 0 16px;
  height: 36px;
  font-size: 14px; font-weight: 600;
  box-shadow: 0 0 0 rgba(59,130,246,.4);          /* 常态无光 */
  transition: box-shadow .25s ease-out, transform .25s ease-out;
}
.btn-glow:hover  { transform: translateY(-2px);
  box-shadow: 0 0 20px rgba(59,130,246,.55), 0 6px 18px rgba(4,12,34,.22); }
.btn-glow:active { transform: translateY(0) scale(.98);
  box-shadow: 0 0 10px rgba(59,130,246,.4); }
.btn-glow:focus-visible { outline: 2px solid var(--brand-400);
  outline-offset: 2px; color: var(--ink-900); }   /* 锁黑防白字 */
```

### A.2 按钮 · 3D 物理按压 push

```css
.btn-push {
  background: var(--brand-500); color: #fff; border: none;
  box-shadow: 0 4px 0 var(--brand-700);           /* 实体底边 */
  transition: transform .15s ease-out, box-shadow .15s ease-out;
}
.btn-push:active {
  transform: translateY(4px);                     /* 按下去 */
  box-shadow: 0 0 0 var(--brand-700);             /* 底边归零 */
}
```

### A.3 按钮 · 渐变流动 gradient

```css
.btn-gradient {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  background-size: 200% 200%;
  color: #fff; transition: background-position .4s ease-out;
}
.btn-gradient:hover { background-position: 100% 0; }
```

### A.4 开关 Toggle 完整实现

```css
.tg { position: relative; width: 44px; height: 24px; display: inline-block; }
.tg input { opacity: 0; width: 0; height: 0; }          /* 隐藏原生，保可访问 */
.tg-track { position: absolute; inset: 0; border-radius: 999px;
  background: var(--ink-300); transition: background .25s ease-out; cursor: pointer; }
.tg-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.25);
  transition: transform .25s ease-out; }
.tg input:checked + .tg-track { background: var(--brand-500); }
.tg input:checked + .tg-track .tg-knob { transform: translateX(20px); }
.tg input:focus-visible + .tg-track { outline: 2px solid var(--brand-400); }
.tg:active .tg-knob { scale: .9; }                      /* 按压缩放回弹 */
```

### A.5 四种 Loader 全量 CSS

```css
/* 1. spinner-14：按钮/行内 */
.sp { width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(59,130,246,.25);
  border-top-color: var(--brand-500);
  animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 2. 顶部进度细条：静默轮询指示 */
.topbar { position: fixed; top: 0; left: 0; height: 2px; width: 40%;
  background: linear-gradient(90deg, transparent, var(--brand-500));
  animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { 0% { transform: translateX(-100%);} 100% { transform: translateX(350%);} }

/* 3. 骨架屏 */
.sk { background: linear-gradient(90deg,#eef1f5 25%,#f7f9fb 50%,#eef1f5 75%);
  background-size: 200% 100%; border-radius: 8px;
  animation: shimmer 1.2s infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

/* 4. 在线脉冲点 */
.pulse { width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
  animation: pulse 1.6s ease-out infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); }
  100% { box-shadow: 0 0 0 10px rgba(34,197,94,0); } }
```

### A.6 Toast 通知（含 galaxy 厚度徽章手法）

```css
.toast { display: flex; gap: 10px; align-items: flex-start;
  background: var(--surface); border-radius: 12px; padding: 12px 14px;
  box-shadow: var(--shadow-lg); border-left: 4px solid var(--brand-500);
  animation: toastIn .3s cubic-bezier(.175,.885,.32,1.275) both; }
.toast--error   { border-left-color: #ef4444; }
.toast--success { border-left-color: #22c55e; }
.toast--warn    { border-left-color: #f59e0b; }
.toast.out { animation: toastOut .2s ease-in both; }
@keyframes toastIn  { from { opacity:0; transform: translateX(24px);} to { opacity:1; transform:none;} }
@keyframes toastOut { to   { opacity:0; transform: translateX(24px);} }
/* 级别徽章：inset 双向阴影厚度感（galaxy Notifications 手法） */
.toast .lvl { font-size: 11px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; padding: 2px 8px; border-radius: 6px;
  color: #fff; background: var(--brand-500);
  box-shadow: inset 2px 2px 0 1px rgba(255,255,255,.35),
              inset -2px -2px 0 1px rgba(0,0,0,.15); }
```

### A.7 Tooltip 纯 CSS（galaxy 标准式）

```css
.tt { position: relative; }
.tt::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 8px);
  left: 50%; transform: translate(-50%, 4px);
  background: var(--ink-900); color: #fff; font-size: 12px;
  padding: 6px 10px; border-radius: 8px; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
.tt::before { content: ""; position: absolute; bottom: calc(100% + 4px);
  left: 50%; width: 8px; height: 8px; background: var(--ink-900);
  transform: translate(-50%, 4px) rotate(45deg);
  opacity: 0; transition: opacity .2s, transform .2s; }
.tt:hover::after, .tt:hover::before { opacity: 1;
  transform: translate(-50%, 0) rotate(0); }        /* ::before 保留 rotate(45deg) */
.tt:hover::before { transform: translate(-50%, 0) rotate(45deg); }
```

### A.8 状态站点卡（Grid 铁律的实现基准）

```css
.site-card { display: grid; grid-template-columns: 26px 1fr;
  align-items: center; column-gap: 12px; row-gap: 4px;
  padding: 10px 12px; background: var(--surface);
  border: 1px solid var(--line-soft); border-radius: 12px;
  box-shadow: var(--shadow-sm);
  transition: transform .25s ease-out, box-shadow .25s ease-out; }
.site-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.site-card:active { transform: scale(.98); }
.site-card__icon { grid-row: 1 / span 2; align-self: center; justify-self: center; }
.site-card__line1, .site-card__line2 { grid-column: 2; min-width: 0; }
/* 状态染色 */
.site-card.st-empty    { background:#f0fdf4; box-shadow: inset 5px 0 0 #22c55e, var(--shadow-sm); }
.site-card.st-occupied { background:#fffbeb; box-shadow: inset 5px 0 0 #f59e0b, var(--shadow-sm); }
.site-card.st-full     { background:#fef2f2; box-shadow: inset 5px 0 0 #ef4444, var(--shadow-sm); }
.site-card.st-locked   { background:#f1f3f5; box-shadow: inset 5px 0 0 #94a3b8, var(--shadow-sm); }
```

### A.9 复选框描边动画

```css
.cb input { display: none; }
.cb-box { width: 18px; height: 18px; border-radius: 5px;
  border: 2px solid var(--ink-300); transition: all .2s ease-out; }
.cb input:checked + .cb-box { background: var(--brand-500); border-color: var(--brand-500); }
.cb-box svg path { stroke-dasharray: 24; stroke-dashoffset: 24; transition: stroke-dashoffset .2s ease-out .05s; }
.cb input:checked + .cb-box svg path { stroke-dashoffset: 0; }
```

---

## 十三、附录 B：逐页应用映射（改哪里、用什么）

| 页面 | 采用组件 | 关键规范 |
|---|---|---|
| 首页 Home | nav-card、glow 按钮（数据看板）、gradient 按钮（任务报表）、pulse | hero 深蓝渐变区是唯一允许玻璃卡与发光/渐变按钮的区域；三入口卡子按钮两行式 |
| 站点监控 | site-card、SiteTable、StatusLegend、TypeLegend、SegmentedPills、skeleton | Grid 铁律；断点 640px；状态四色；轮询 topbar 指示 |
| 任务查询 | Table、DateRange、Spinner、EmptyState | 表格 fixed 布局；查询按钮 loading 态防重复提交 |
| 任务取消 | Table、danger 按钮、Modal 确认 | 取消操作必须二次确认弹窗（红头） |
| 手动任务 | icon-button（齿轮实色）、Modal + textarea | URL 截断三件套；保存成功 Toast |
| 告警推送/日志 | Toast、stat-card、Table | 推送级别徽章用 inset 厚度手法 |
| 告警查询 | Table、danger 文字色 | 入口红字（用户钦定）；错误行可展开详情 |
| 数据看板 | stat-card、骨架屏 | 数字 tabular-nums；变更行闪底 600ms |
| 货架监控 | rack-cell 色块矩阵、Modal 宽表 | 列四态绿/黄/红/灰；层列只显数字；更新时间单行 |
| 设置/配置 | Toggle、Input、Select | 所有配置走 service_config.json，不碰客户库 |

---

## 十四、附录 C：治理规则（保证清单不腐烂）

1. **单一事实源**：tokens.css 与本清单同步演进；改令牌必须改文档，PR 描述引用章节号。
2. **禁止事项**（Code Review 一票否决）：
   - 写死颜色/字号/间距字面量（白名单：图标三档尺寸常量）；
   - 用 `font-size`/`em` 控制图标或组件尺寸；
   - flex 承担"图标 + 多行文字"跨行居中；
   - 新增第五种 loader、第十三种按钮变体；
   - 任何组件绕过 src-ui 直接引第三方 UI 库。
3. **命名约定**：设计系统组件前缀 `UI`（UIButton/UICard/UIToggle），页面级组件不带前缀；CSS 类 BEM：`块__元素--修饰`，设计系统层统一 `ui-` 前缀防冲突。
4. **文件结构**：
   ```
   src-ui/
     tokens.css          ← 全部令牌（本文第一章）
     base.css            ← reset + 全局铁律（第二章）
     components/         ← 附录 A 的组件化实现
     hooks/              ← usePolling / useMediaQuery
   src-pages/            ← 页面（只做数据编排 + 组合 src-ui）
   ```
5. **回滚安全**：每迁移一页保留旧实现于 git 历史即可，工作区不留死文件（用户钦定的"删除不需要的测试文件"惯例）。
6. **变更记录**：本文件末尾维护版本表；每次视觉迭代追加一行。

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-05 | 基于 galaxy 研读初版发布 |

---

*参考来源：github.com/uiverse-io/galaxy（MIT）。本清单适用于 rcs_box-0902-http6007-https6008 及后续版本，是全项目唯一设计事实源。*
