/**
 * 设计令牌 —— JS 侧唯一事实来源。
 *
 * 值必须与 styles/fresh.css `:root` 中的 CSS 变量保持一致；
 * styles/tokens.test.ts 会断言每个 hex 都出现在 fresh.css 里，防止两侧漂移。
 * 页面代码不要再写裸 hex：CSS 里用 var(--fresh-*)，JS 里从这里取。
 */
export const palette = {
  /** --fresh-green 主绿 */
  green: '#4f7d58',
  /** --fresh-green-dark 深绿 */
  greenDark: '#355f40',
  /** --fresh-leaf 叶绿 */
  leaf: '#87a878',
  /** --fresh-mint 薄荷底 */
  mint: '#e7f0e3',
  /** --fresh-blue 薄雾蓝 */
  blue: '#6f9faa',
  /** --fresh-sky 天空底 */
  sky: '#e4f0f1',
  /** --fresh-sun 阳光黄 */
  sun: '#f2c86f',
  /** --fresh-peach 蜜桃 */
  peach: '#e99b7d',
  /** --fresh-lilac 丁香紫 */
  lilac: '#b7a7c8',
  /** --cm-red 柔化危险色 */
  red: '#c96f66',
  /** --fresh-ink 主文字 */
  ink: '#26362a',
  /** --fresh-text 次文字 */
  text: '#536657',
  /** --fresh-muted 弱文字（浅绿底上可读） */
  muted: '#5f6f62',
  /** --fresh-line 分隔线 */
  line: '#dde5da',
  /** --fresh-bg 页面底 */
  bg: '#f4f6ef',
  /** --fresh-paper 卡片纸 */
  paper: '#fffdf8',
  /** --fresh-paper-2 次级纸 */
  paper2: '#f9faf4',
  white: '#ffffff'
} as const

/**
 * Vant ConfigProvider 的 themeVars，由上方调色板派生。
 * 不要在 App.vue 里再写硬编码 hex。
 */
export const vantThemeVars = {
  primaryColor: palette.green,
  buttonPrimaryBackground: palette.green,
  buttonPrimaryBorderColor: palette.green,
  buttonPrimaryColor: palette.white,
  cellBackground: 'transparent',
  cellTextColor: palette.ink,
  cellLabelColor: palette.muted,
  fieldLabelColor: palette.text,
  fieldInputTextColor: palette.ink,
  fieldLabelWidth: '4.2em',
  fontSize: '15px',
  navBarTitleFontSize: '17px',
  navBarIconColor: palette.greenDark,
  background: palette.bg,
  background2: palette.paper,
  textColor: palette.ink,
  textColor2: palette.text,
  textColor3: palette.muted,
  borderColor: palette.line
} as const
