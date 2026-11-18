<template>
  <div v-if="control.visible">
    <!-- the usual form; in camera mode without the parameter set lists -->
    <dispatch-renderer
      :visible="control.visible"
      :enabled="control.enabled"
      :readonly="control.readonly"
      :schema="control.schema"
      :uischema="detailUiSchema"
      :path="control.path"
      :renderers="control.renderers"
      :cells="control.cells"
      :root-schema="control.rootSchema"
    />

    <gphoto2-camera-parameter-sets
      v-if="cameraMode"
      :backend-index="backendIndex"
      :config="control.data"
      :enabled="control.enabled"
      @change="(field, value) => handleChange(composePaths(control.path, field), value)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type ControlElement, type GroupLayout, type Layout, type UISchemaElement, composePaths, findUISchema, Generate } from '@jsonforms/core'
import { DispatchRenderer, rendererProps, useJsonFormsControlWithDetail } from '@jsonforms/vue'
import cloneDeep from 'lodash/cloneDeep'
import isEmpty from 'lodash/isEmpty'
import Gphoto2CameraParameterSets from '@/components/gphoto2/Gphoto2CameraParameterSets.vue'
import { backendIndexFromPath } from '@/components/gphoto2/cameraConfig'
import { useNested } from '../util'
import { GPHOTO2_DETAIL_OPTION } from './gphoto2'

/**
 * gphoto2 backend settings. parameter_configuration decides how the parameter sets are edited:
 * 'manual' shows the usual lists, 'camera' shows summaries edited with the parameters read from the camera.
 */

const PARAMETER_SETS = ['parameterset_device_init', 'parameterset_standby', 'parameterset_video', 'parameterset_still']
const HIDDEN_ALWAYS = ['camera_mode_at_configuration'] // maintained by the camera view

const props = defineProps({ ...rendererProps<ControlElement>() })
const { control, handleChange } = useJsonFormsControlWithDetail(props)
const nested = useNested('object')

const cameraMode = computed(() => control.value.data?.parameter_configuration === 'camera')
const backendIndex = computed(() => backendIndexFromPath(control.value.path))

const propertyName = (element: UISchemaElement) => (element as ControlElement).scope?.split('/').pop() ?? ''

// same ui schema as the ObjectRenderer generates, minus the fields handled by the camera view
const detailUiSchema = computed<UISchemaElement>(() => {
  const generator = () => {
    const uiSchema = Generate.uiSchema(control.value.schema, 'Group', undefined, control.value.rootSchema)
    if (isEmpty(control.value.path)) uiSchema.type = 'VerticalLayout'
    else (uiSchema as GroupLayout).label = control.value.label
    return uiSchema
  }

  const result = cloneDeep(
    findUISchema(
      control.value.uischemas,
      control.value.schema,
      control.value.uischema.scope,
      control.value.path,
      generator,
      control.value.uischema,
      control.value.rootSchema
    )
  )

  result.options = { ...result.options, [GPHOTO2_DETAIL_OPTION]: true }
  if (nested.level > 0) {
    result.options = { ...result.options, bare: true, alignLeft: nested.level >= 4 || nested.parentElement === 'array' }
  }

  const hidden = cameraMode.value ? [...HIDDEN_ALWAYS, ...PARAMETER_SETS] : HIDDEN_ALWAYS
  const layout = result as Layout
  if (layout.elements) layout.elements = layout.elements.filter(element => !hidden.includes(propertyName(element)))
  return result
})
</script>
