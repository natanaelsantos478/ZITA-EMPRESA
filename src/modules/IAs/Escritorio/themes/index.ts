import { retro } from './retro'
import { moderno } from './moderno'
import { profissional } from './profissional'
import type { Theme, ThemeName } from '../types'
export const THEMES: Record<ThemeName, Theme> = { retro, moderno, profissional }
