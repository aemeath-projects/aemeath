/** 主题注册表：定义所有可选配色主题及其浅色/深色变体。 */
export interface ThemeColors {
  [key: string]: string
}

export interface ThemeDefinition {
  id: string
  name: string
  description: string
  light: ThemeColors
  dark: ThemeColors
}

export const themes: ThemeDefinition[] = [
  {
    id: 'aemeath',
    name: '爱弥斯',
    description: '青粉主色调，温暖柔和',
    light: {
      primary: '#22DFF2',
      secondary: '#E66A9F',
      accent: '#F0B34A',
      error: '#D62451',
      info: '#1F8FE0',
      success: '#16B8A6',
      warning: '#E8935B',
      background: '#FFF3F8',
      surface: '#FFFFFF',
      'on-primary': '#073040',
      'on-secondary': '#3D0A20',
      'on-accent': '#2B2005',
      'on-error': '#FFFFFF',
      'on-info': '#04152A',
      'on-success': '#04201C',
      'on-warning': '#2B1B0A',
      'on-background': '#1A1A2E',
      'on-surface': '#1E293B',
      'gradient-blue': 'linear-gradient(135deg, #22DFF2 0%, #64FFDA 100%)',
      'gradient-pink': 'linear-gradient(135deg, #E66A9F 0%, #FFD1DC 100%)',
    },
    dark: {
      primary: '#3FFEFB',
      secondary: '#F595C2',
      accent: '#FFC873',
      error: '#FF6F91',
      info: '#4FC3F7',
      success: '#2FE0C9',
      warning: '#FFB26B',
      background: '#100E33',
      surface: '#1B1846',
      'on-primary': '#052A2E',
      'on-secondary': '#341A26',
      'on-accent': '#2B2005',
      'on-error': '#341018',
      'on-info': '#052030',
      'on-success': '#052A26',
      'on-warning': '#2B1B0A',
      'on-background': '#E2E8F0',
      'on-surface': '#CBD5E1',
      'gradient-space': 'linear-gradient(180deg, #100E33 0%, #241A5A 100%)',
    },
  },
]

export function getThemeById(id: string): ThemeDefinition {
  return themes.find((t) => t.id === id) ?? themes[0]!
}
