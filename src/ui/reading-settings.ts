// ABOUTME: 移植自 qiaomu-rss-dsh 的阅读外观设置 (字体、字号、行距、版心宽度与多套阅读主题)

export interface ReadingSettings {
  readingTheme: 'auto' | 'light' | 'paper' | 'sage' | 'mist' | 'dark' | 'black';
  readingFont: 'serif' | 'sans' | 'sourceHanSerif' | 'sourceHanSans' | 'wenkai' | 'zhenkai' | 'custom';
  customFont: string;
  fontSize: number;
  lineHeight: number;
  textWidth: number;
  defaultVersion: 'original' | 'translation' | 'rewrite';
  showImages: boolean;
}

export const READING_DEFAULTS: ReadingSettings = {
  readingTheme: 'auto',
  readingFont: 'serif',
  customFont: '',
  fontSize: 19,
  lineHeight: 1.9,
  textWidth: 36,
  defaultVersion: 'rewrite',
  showImages: true,
};

export const THEMES: Record<string, [string, string] | null> = {
  auto: null,
  light: ['#ffffff', '#202124'],
  paper: ['#f5efdf', '#40382e'],
  sage: ['#e8eee3', '#29382c'],
  mist: ['#e7edf2', '#293741'],
  dark: ['#252525', '#dedede'],
  black: ['#090909', '#cccccc'],
};

export const FONTS: Record<string, { label: string; family: string }> = {
  serif: { label: '宋体', family: '"Songti SC","Noto Serif CJK SC",Georgia,serif' },
  sans: { label: '黑体', family: 'system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif' },
  sourceHanSerif: { label: '思源宋体', family: '"Source Han Serif SC","Noto Serif CJK SC","Songti SC",serif' },
  sourceHanSans: { label: '思源黑体', family: '"Source Han Sans SC","Noto Sans CJK SC","PingFang SC",sans-serif' },
  wenkai: { label: '霞鹜文楷', family: '"LXGW WenKai","Kaiti SC",serif' },
  zhenkai: { label: '朱雀仿宋', family: '"Zhuque Fangsong","Fangsong","STFangsong",serif' },
  custom: { label: '自选设备字体', family: 'serif' },
};

export const TEXT_WIDTHS = [
  { value: 28, label: '窄 · 28 字' },
  { value: 32, label: '偏窄 · 32 字' },
  { value: 36, label: '适中 · 36 字' },
  { value: 40, label: '偏宽 · 40 字' },
  { value: 44, label: '宽 · 44 字' },
];

export function fontStack(settings: ReadingSettings): string {
  if (settings.readingFont === 'custom') {
    const name = String(settings.customFont ?? '').trim();
    return name ? `${JSON.stringify(name)},${FONTS.serif.family}` : FONTS.serif.family;
  }
  return (FONTS[settings.readingFont] ?? FONTS.serif).family;
}
