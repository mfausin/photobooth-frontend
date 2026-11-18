<template>
  <div class="q-mt-md">
    <!-- camera status: model, current mode, mode the sets were chosen in -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row items-center q-gutter-sm q-py-sm">
        <q-icon name="sym_o_photo_camera" size="sm" />
        <template v-if="loading">
          <q-spinner size="sm" />
          <span>{{ t('Reading the camera...') }}</span>
        </template>
        <template v-else-if="cameraConfig">
          <span class="text-weight-medium">{{ cameraConfig.model ?? t('Unknown camera') }}</span>
          <q-chip v-if="cameraConfig.mode" dense square color="primary" text-color="white">
            {{ t('Mode') }}: {{ cameraConfig.mode.value }}
            <q-tooltip>{{ cameraConfig.mode.label }} ({{ cameraConfig.mode.name }})</q-tooltip>
          </q-chip>
          <q-chip v-else dense square color="grey-4">{{ t('Mode not detected') }}</q-chip>
        </template>
        <span v-else class="text-negative">{{ t('Camera not reachable') }}</span>
        <q-space />
        <span v-if="readAt" class="text-caption text-grey-7">{{ t('Read at {time}', { time: readAt.toLocaleTimeString() }) }}</span>
        <q-btn flat dense icon="sym_o_refresh" :label="t('Read again')" :loading="loading" @click="load(true)" />
      </q-card-section>

      <q-banner v-if="error && !loading" dense class="bg-orange-1">
        <template #avatar><q-icon name="sym_o_warning" color="warning" /></template>
        {{ t('The camera could not be read. The saved parameters are shown, editing needs the camera.') }}
        <div class="text-caption text-grey-8">{{ error }}</div>
        <div class="text-caption text-grey-8">
          {{
            t(
              'Check that the camera is switched on, connected by USB and the gphoto2 backend is enabled. You can also switch to manual configuration.'
            )
          }}
        </div>
      </q-banner>

      <q-banner v-if="modeMismatch" dense class="bg-orange-1">
        <template #avatar><q-icon name="sym_o_warning" color="warning" /></template>
        {{ t('The parameter sets were chosen in mode "{saved}", the camera is in mode "{current}" now.', modeMismatch) }}
        <div class="text-caption text-grey-8">
          {{ t('Available values depend on the mode. Set the mode dial back or choose the parameters again.') }}
        </div>
      </q-banner>

      <q-card-section v-if="savedMode" class="q-py-xs text-caption text-grey-7">
        {{ t('Parameter sets chosen in mode: {mode}', { mode: modeValue(savedMode) }) }}
      </q-card-section>
    </q-card>

    <!-- one summary per parameter set -->
    <div class="column q-gutter-sm">
      <q-card v-for="set in SETS" :key="set.key" flat bordered>
        <q-card-section class="row items-start no-wrap q-py-sm">
          <div class="col">
            <div class="text-subtitle2">{{ t(set.label) }}</div>
            <div class="text-caption text-grey-7 q-mb-xs">{{ t(set.description) }}</div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="parameter in enabledParameters(set.key)"
                :key="parameter.name"
                dense
                square
                :color="issue(parameter) ? 'orange-2' : 'grey-3'"
                :icon="issue(parameter) ? 'sym_o_warning' : undefined"
              >
                <code>{{ parameter.name }}</code>&nbsp;= {{ parameter.value }}
                <q-tooltip v-if="issue(parameter)">{{ issue(parameter) }}</q-tooltip>
              </q-chip>
              <span v-if="!enabledParameters(set.key).length" class="text-caption text-grey-6">{{ t('No parameters') }}</span>
              <span v-if="disabledCount(set.key)" class="text-caption text-grey-6 self-center">
                {{ t('+{count} disabled', { count: disabledCount(set.key) }) }}
              </span>
            </div>
          </div>
          <q-btn
            unelevated
            dense
            no-caps
            color="primary"
            icon="sym_o_edit"
            class="q-ml-sm"
            :label="t('Edit')"
            :disable="!enabled || !cameraConfig"
            @click="editing = set"
          >
            <q-tooltip v-if="!cameraConfig">{{ t('Needs the camera, read it again first.') }}</q-tooltip>
          </q-btn>
        </q-card-section>
      </q-card>
    </div>

    <q-dialog :model-value="!!editing" persistent :maximized="$q.screen.lt.md" @update:model-value="value => !value && (editing = null)">
      <gphoto2-parameter-picker
        v-if="editing"
        :backend-index="backendIndex"
        :parameters="config[editing.key] ?? []"
        :set-label="t(editing.label)"
        @cancel="editing = null"
        @apply="apply"
      />
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import Gphoto2ParameterPicker from './Gphoto2ParameterPicker.vue'
import { type Gphoto2Parameters, cachedCameraConfig, cameraModeString, isValidValue, readCameraConfig } from './cameraConfig'
import type { GroupCameraGphoto2 } from '@/dto/generated'

/** Parameter sets of a gphoto2 backend configured from the camera: summaries, camera status and the picker. */

type SetKey = 'parameterset_device_init' | 'parameterset_standby' | 'parameterset_video' | 'parameterset_still'

// labels/descriptions are translation keys
const SETS: { key: SetKey; label: string; description: string }[] = [
  { key: 'parameterset_device_init', label: 'Camera start', description: 'Applied once when the camera is connected.' },
  { key: 'parameterset_standby', label: 'Standby', description: 'Applied when the live view is not needed.' },
  { key: 'parameterset_video', label: 'Live view and video', description: 'Applied before the live view or a video starts.' },
  { key: 'parameterset_still', label: 'Photo', description: 'Applied right before a photo is taken.' },
]

const props = defineProps<{
  backendIndex: number
  config: GroupCameraGphoto2
  enabled: boolean
}>()
const emit = defineEmits<{ change: [field: keyof GroupCameraGphoto2, value: unknown] }>()
const { t } = useI18n()
const $q = useQuasar()

const loading = ref(false)
const error = ref<string | null>(null)
const editing = ref<(typeof SETS)[number] | null>(null)

// shared with the picker, so a read in the dialog updates the status here too
const cached = computed(() => cachedCameraConfig(props.backendIndex))
const cameraConfig = computed(() => (error.value ? null : (cached.value?.config ?? null)))
const readAt = computed(() => (cameraConfig.value ? cached.value?.readAt : null))

const load = async (force = false) => {
  loading.value = true
  error.value = null
  try {
    await readCameraConfig(props.backendIndex, force)
  } catch (exc) {
    error.value = exc instanceof Error ? exc.message : String(exc)
  } finally {
    loading.value = false
  }
}
onMounted(() => load())

const savedMode = computed(() => props.config.camera_mode_at_configuration ?? '')
// 'autoexposuremode=Manual' -> 'Manual'
const modeValue = (mode: string) => mode.split('=').slice(1).join('=') || mode

const modeMismatch = computed(() => {
  if (!cameraConfig.value || !savedMode.value) return null
  const current = cameraModeString(cameraConfig.value)
  return current === savedMode.value ? null : { saved: modeValue(savedMode.value), current: current ? modeValue(current) : t('unknown') }
})

const parametersOf = (key: SetKey): Gphoto2Parameters[] => props.config[key] ?? []
const enabledParameters = (key: SetKey) => parametersOf(key).filter(parameter => parameter.enabled)
const disabledCount = (key: SetKey) => parametersOf(key).filter(parameter => !parameter.enabled).length

const issue = (parameter: Gphoto2Parameters): string | null => {
  if (!cameraConfig.value) return null
  const widget = cameraConfig.value.widgets.find(entry => entry.name === parameter.name)
  if (!widget) return t('The camera does not report this parameter in the current mode.')
  if (!widget.settable) return t('The app cannot set this parameter.')
  if (!isValidValue(widget, parameter.value)) return t('This value is not available in the current mode.')
  return null
}

const apply = (parameters: Gphoto2Parameters[]) => {
  if (!editing.value) return
  emit('change', editing.value.key, parameters)
  if (cameraConfig.value) emit('change', 'camera_mode_at_configuration', cameraModeString(cameraConfig.value))
  editing.value = null
  $q.notify({ message: t('Parameters applied. Save the configuration to use them.'), color: 'positive' })
}
</script>
