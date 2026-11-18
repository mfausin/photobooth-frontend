<template>
  <q-card class="gphoto2-picker column no-wrap">
    <q-card-section class="row items-center q-pb-sm no-wrap">
      <div class="col">
        <div class="text-h6">{{ t('Camera parameters') }}</div>
        <div class="text-caption text-grey-7">{{ setLabel }}</div>
      </div>
      <q-btn flat round icon="sym_o_close" @click="emit('cancel')" />
    </q-card-section>

    <!-- camera, mode and when it was read -->
    <q-card-section class="q-py-sm">
      <div v-if="loading" class="row items-center q-gutter-sm">
        <q-spinner size="sm" />
        <span>{{ t('Reading the camera...') }}</span>
      </div>

      <q-banner v-else-if="error" dense rounded class="bg-red-1 text-negative">
        <template #avatar><q-icon name="sym_o_error" /></template>
        <div>{{ t('The camera could not be read.') }}</div>
        <div class="text-caption">{{ error }}</div>
        <div class="text-caption q-mt-xs text-grey-9">
          {{
            t(
              'Check that the camera is switched on, connected by USB and the gphoto2 backend is enabled. You can always enter parameters manually in the list.'
            )
          }}
        </div>
        <template #action>
          <q-btn flat color="negative" icon="sym_o_refresh" :label="t('Try again')" @click="load(true)" />
        </template>
      </q-banner>

      <div v-else-if="cameraConfig" class="row items-center q-gutter-sm">
        <q-chip square icon="sym_o_photo_camera" class="q-ml-none">{{ cameraConfig.model ?? t('Unknown camera') }}</q-chip>
        <q-chip v-if="cameraConfig.mode" square icon="sym_o_tune" color="primary" text-color="white">
          {{ t('Mode') }}: {{ cameraConfig.mode.value }}
          <q-tooltip>{{ cameraConfig.mode.label }} ({{ cameraConfig.mode.name }})</q-tooltip>
        </q-chip>
        <q-chip v-else square icon="sym_o_help" color="grey-4">{{ t('Mode not detected') }}</q-chip>
        <q-space />
        <span v-if="readAt" class="text-caption text-grey-7">{{ t('Read at {time}', { time: readAt.toLocaleTimeString() }) }}</span>
        <q-btn flat dense icon="sym_o_refresh" :label="t('Read again')" @click="load(true)" />
      </div>

      <div v-if="cameraConfig" class="text-caption text-grey-8 q-mt-sm">
        {{
          t('Available parameters and values depend on the mode of the camera. Set the camera to the mode it is used in at the event before reading.')
        }}
      </div>
    </q-card-section>

    <q-card-section v-if="cameraConfig" class="row items-center q-col-gutter-sm q-py-none">
      <q-input v-model="filter" dense outlined clearable class="col-12 col-sm" :placeholder="t('Search parameter')">
        <template #prepend><q-icon name="sym_o_search" /></template>
      </q-input>
      <div class="col-auto row q-gutter-md">
        <q-toggle v-model="onlySettable" dense :label="t('Only settable')" />
        <q-toggle v-model="onlySelected" dense :label="t('Only selected')" />
      </div>
    </q-card-section>

    <q-separator v-if="cameraConfig" class="q-mt-sm" />

    <!-- parameters grouped by section -->
    <q-card-section v-if="cameraConfig" class="col scroll q-pa-none">
      <q-list dense>
        <template v-for="group in groups" :key="group.section">
          <q-item-label header class="text-weight-bold">{{ group.section }}</q-item-label>
          <q-item v-for="widget in group.widgets" :key="widget.name" :class="{ 'text-grey-6': !widget.settable }">
            <q-item-section side top>
              <q-checkbox
                :model-value="selection.get(widget.name)?.checked ?? false"
                :disable="!widget.settable"
                @update:model-value="(checked: boolean) => setChecked(widget, checked)"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label>
                {{ widget.label }}
                <code class="q-ml-xs text-grey-7">{{ widget.name }}</code>
              </q-item-label>
              <q-item-label caption>
                {{ t('Camera') }}: {{ widget.value === '' ? '–' : widget.value }}
                <span v-if="!widget.settable"> · {{ widget.readonly ? t('read only') : t('not supported by the app') }}</span>
              </q-item-label>
              <q-item-label v-if="invalidValue(widget)" caption class="text-negative">
                {{
                  t('The value "{value}" from the parameter set is not available in the current mode.', { value: selection.get(widget.name)?.value })
                }}
              </q-item-label>
            </q-item-section>

            <q-item-section v-if="selection.get(widget.name)?.checked" side class="value-editor">
              <q-select
                v-if="widget.type === 'radio' || widget.type === 'menu'"
                :model-value="selection.get(widget.name)?.value"
                :options="widget.choices ?? []"
                dense
                outlined
                options-dense
                :error="invalidValue(widget)"
                hide-bottom-space
                @update:model-value="(value: string) => setValue(widget, value)"
              />
              <q-btn-toggle
                v-else-if="widget.type === 'toggle'"
                :model-value="selection.get(widget.name)?.value"
                dense
                no-caps
                toggle-color="primary"
                :options="[
                  { label: t('Off'), value: '0' },
                  { label: t('On'), value: '1' },
                ]"
                @update:model-value="(value: string) => setValue(widget, value)"
              />
              <q-input
                v-else
                :model-value="selection.get(widget.name)?.value"
                dense
                outlined
                @update:model-value="value => setValue(widget, String(value ?? ''))"
              />
            </q-item-section>
          </q-item>
        </template>

        <q-item v-if="!groups.length">
          <q-item-section class="text-grey-7">{{ t('No parameters match the filter.') }}</q-item-section>
        </q-item>

        <!-- entries of the parameter set the camera does not know -->
        <template v-if="unknownParameters.length">
          <q-item-label header class="text-weight-bold text-warning">{{ t('Not reported by the camera') }}</q-item-label>
          <q-item v-for="parameter in unknownParameters" :key="parameter.name">
            <q-item-section side><q-icon name="sym_o_warning" color="warning" /></q-item-section>
            <q-item-section :class="{ 'text-strike text-grey-6': removed.has(parameter.name) }">
              <q-item-label> <code>{{ parameter.name }}</code> = {{ parameter.value }} </q-item-label>
              <q-item-label caption>
                {{ t('This camera does not have this parameter in the current mode, setting it will fail.') }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                dense
                no-caps
                :icon="removed.has(parameter.name) ? 'sym_o_undo' : 'sym_o_delete'"
                :label="removed.has(parameter.name) ? t('Keep') : t('Remove')"
                @click="toggleRemoved(parameter.name)"
              />
            </q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-card-section>

    <div v-if="!cameraConfig" class="col" />
    <q-separator />
    <q-card-actions align="right" class="q-pa-md">
      <span v-if="cameraConfig" class="text-caption text-grey-7 q-mr-md">{{ t('{count} parameters selected', { count: checkedCount }) }}</span>
      <q-btn flat :label="t('Cancel')" @click="emit('cancel')" />
      <q-btn unelevated color="primary" :label="t('Apply')" :disable="!cameraConfig" @click="apply" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type Gphoto2CameraConfig,
  type Gphoto2ConfigWidget,
  type Gphoto2Parameters,
  type Selection,
  defaultValueFor,
  isValidValue,
  mergeSelection,
  readCameraConfig,
} from './cameraConfig'

/**
 * Pick parameters for a gphoto2 parameter set from the ones the connected camera reports,
 * with the values the camera allows in its current mode.
 */

const props = defineProps<{
  backendIndex: number
  parameters: Gphoto2Parameters[]
  setLabel?: string
}>()
const emit = defineEmits<{ apply: [parameters: Gphoto2Parameters[]]; cancel: [] }>()
const { t } = useI18n()

const loading = ref(false)
const error = ref<string | null>(null)
const cameraConfig = ref<Gphoto2CameraConfig | null>(null)
const readAt = ref<Date | null>(null)

const filter = ref<string | null>('')
const onlySettable = ref(true)
const onlySelected = ref(false)

// name -> checked/value, prefilled from the parameter set
const selection = ref(new Map<string, Selection>())

const initSelection = (config: Gphoto2CameraConfig) => {
  const map = new Map<string, Selection>()
  for (const widget of config.widgets) {
    const existing = props.parameters.find(parameter => parameter.name === widget.name)
    if (existing) map.set(widget.name, { checked: existing.enabled && widget.settable, value: existing.value })
  }
  selection.value = map
}

const load = async (force = false) => {
  loading.value = true
  error.value = null
  try {
    const entry = await readCameraConfig(props.backendIndex, force)
    cameraConfig.value = entry.config
    readAt.value = entry.readAt
    initSelection(entry.config)
  } catch (exc) {
    error.value = exc instanceof Error ? exc.message : String(exc)
  } finally {
    loading.value = false
  }
}
onMounted(() => load())

const setChecked = (widget: Gphoto2ConfigWidget, checked: boolean) => {
  const current = selection.value.get(widget.name)
  selection.value.set(widget.name, { checked, value: current?.value ?? defaultValueFor(widget) })
}

const setValue = (widget: Gphoto2ConfigWidget, value: string) => {
  selection.value.set(widget.name, { checked: true, value })
}

const invalidValue = (widget: Gphoto2ConfigWidget): boolean => {
  const selected = selection.value.get(widget.name)
  return !!selected?.checked && widget.settable && !isValidValue(widget, selected.value)
}

const groups = computed(() => {
  const needle = (filter.value ?? '').trim().toLowerCase()
  const result: { section: string; widgets: Gphoto2ConfigWidget[] }[] = []

  for (const widget of cameraConfig.value?.widgets ?? []) {
    if (onlySettable.value && !widget.settable) continue
    if (onlySelected.value && !selection.value.get(widget.name)?.checked) continue
    if (needle && !`${widget.name} ${widget.label}`.toLowerCase().includes(needle)) continue

    let group = result.find(entry => entry.section === widget.section)
    if (!group) result.push((group = { section: widget.section, widgets: [] }))
    group.widgets.push(widget)
  }
  return result
})

const unknownParameters = computed(() => {
  const names = new Set((cameraConfig.value?.widgets ?? []).map(widget => widget.name))
  return props.parameters.filter(parameter => parameter.name !== '' && !names.has(parameter.name))
})

// entries the camera does not know, to be removed on apply
const removed = ref(new Set<string>())
const toggleRemoved = (name: string) => {
  if (removed.value.has(name)) removed.value.delete(name)
  else removed.value.add(name)
}

const checkedCount = computed(() => [...selection.value.values()].filter(selected => selected.checked).length)

const apply = () =>
  emit(
    'apply',
    mergeSelection(props.parameters, selection.value).filter(parameter => !removed.value.has(parameter.name))
  )
</script>

<style scoped>
.gphoto2-picker {
  width: 900px;
  max-width: 100%;
  height: 85vh;
}
.value-editor {
  min-width: 180px;
  max-width: 260px;
}
</style>
