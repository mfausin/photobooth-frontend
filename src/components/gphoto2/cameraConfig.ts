import { reactive } from 'vue'
import { _fetch } from '@/util/fetch_api'
import type { Gphoto2CameraConfig, Gphoto2ConfigWidget, Gphoto2Parameters } from '@/dto/generated'

export type { Gphoto2CameraConfig, Gphoto2ConfigWidget, Gphoto2Parameters }

/** Index of the backend in cameras.group_backends, taken from a form path like "group_backends.1.backend_config.parameterset_still". */
export const backendIndexFromPath = (path: string): number => {
  const match = /(?:^|\.)group_backends\.(\d+)\./.exec(path)
  return match ? Number(match[1]) : 0
}

export class CameraConfigError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface CacheEntry {
  config: Gphoto2CameraConfig
  readAt: Date
}

// shared by all parameter sets of a backend, so the camera is read once per backend until reloaded
const cache = reactive(new Map<number, CacheEntry>())

export const cachedCameraConfig = (backendIndex: number): CacheEntry | undefined => cache.get(backendIndex)

export async function readCameraConfig(backendIndex: number, force = false): Promise<CacheEntry> {
  const cached = cache.get(backendIndex)
  if (cached && !force) return cached

  const response = await _fetch(`/api/admin/cameras/gphoto2/${backendIndex}/config`)
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // keep the status text
    }
    throw new CameraConfigError(response.status, detail)
  }

  const entry: CacheEntry = { config: (await response.json()) as Gphoto2CameraConfig, readAt: new Date() }
  cache.set(backendIndex, entry)
  return entry
}

/** Mode as stored in camera_mode_at_configuration ('name=value'), empty if the camera has no known mode parameter. */
export const cameraModeString = (config: Gphoto2CameraConfig): string => (config.mode ? `${config.mode.name}=${config.mode.value}` : '')

/** Value the camera reports for a widget, as used in the parameter sets. */
export const defaultValueFor = (widget: Gphoto2ConfigWidget): string => {
  if (widget.type === 'toggle') return widget.value === '1' ? '1' : '0'
  return widget.value
}

/** Whether a value can be set for this widget in the camera's current mode. */
export const isValidValue = (widget: Gphoto2ConfigWidget, value: string): boolean => {
  if (widget.type === 'radio' || widget.type === 'menu') return (widget.choices ?? []).includes(value)
  if (widget.type === 'toggle') return ['0', '1', 'true', 'false'].includes(value.toLowerCase())
  return value !== ''
}

export interface Selection {
  checked: boolean
  value: string
}

/**
 * Merge the selection made in the picker into a parameter set.
 * - checked: entry is enabled with the chosen value (added at the end if new)
 * - unchecked: an existing entry is disabled, not deleted (keeps the note)
 * - entries the camera did not report stay as they are
 */
export function mergeSelection(parameters: Gphoto2Parameters[], selection: Map<string, Selection>): Gphoto2Parameters[] {
  const result = parameters.map(parameter => {
    const selected = selection.get(parameter.name)
    if (!selected) return { ...parameter }
    return selected.checked ? { ...parameter, enabled: true, value: selected.value } : { ...parameter, enabled: false }
  })

  const existing = new Set(parameters.map(parameter => parameter.name))
  for (const [name, selected] of selection) {
    if (selected.checked && !existing.has(name)) result.push({ enabled: true, name, value: selected.value, note: '' })
  }
  return result
}
