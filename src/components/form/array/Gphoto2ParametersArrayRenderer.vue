<template>
  <div v-if="control.visible">
    <!-- the usual list (manual editing always stays possible), with the camera picker next to its label -->
    <array-list-renderer v-bind="props">
      <template #actions>
        <div class="row items-center no-wrap q-gutter-sm">
          <q-toggle v-model="discovery" dense size="sm" :label="t('Read parameters from the camera')">
            <q-tooltip>{{ t('Off: enter parameter names and values manually.') }}</q-tooltip>
          </q-toggle>
          <q-btn
            v-if="discovery"
            dense
            no-caps
            unelevated
            color="primary"
            icon="sym_o_photo_camera"
            :label="t('Choose from camera')"
            :disable="!control.enabled"
            @click="showPicker = true"
          />
        </div>
      </template>
    </array-list-renderer>

    <q-dialog v-model="showPicker" persistent :maximized="$q.screen.lt.md">
      <gphoto2-parameter-picker
        v-if="showPicker"
        :backend-index="backendIndex"
        :parameters="(control.data as Gphoto2Parameters[]) ?? []"
        :set-label="control.label"
        @cancel="showPicker = false"
        @apply="apply"
      />
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { type ControlElement } from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import ArrayListRenderer from './ArrayListRenderer.vue'
import Gphoto2ParameterPicker from '@/components/gphoto2/Gphoto2ParameterPicker.vue'
import { type Gphoto2Parameters, backendIndexFromPath, useGphoto2ParameterDiscovery } from '@/components/gphoto2/cameraConfig'

/**
 * Parameter sets of the gphoto2 backend: the regular list plus a picker that offers
 * the parameters and values reported by the connected camera.
 */

const props = defineProps({ ...rendererProps<ControlElement>() })
const { control, handleChange } = useJsonFormsControl(props)
const { t } = useI18n()
const $q = useQuasar()

const discovery = useGphoto2ParameterDiscovery()
const showPicker = ref(false)
const backendIndex = computed(() => backendIndexFromPath(control.value.path))

const apply = (parameters: Gphoto2Parameters[]) => {
  handleChange(control.value.path, parameters)
  showPicker.value = false
  Notify.create({ message: t('Parameters applied. Save the configuration to use them.'), color: 'positive' })
}
</script>
