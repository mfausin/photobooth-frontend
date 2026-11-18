<template>
  <!-- render the gphoto2 settings as object control, so Gphoto2BackendRenderer takes over -->
  <dispatch-renderer :schema="schema" :uischema="controlUiSchema" :path="path" :enabled="enabled" :renderers="renderers" :cells="cells" />
</template>

<script setup lang="ts">
import type { ControlElement, Layout } from '@jsonforms/core'
import { DispatchRenderer, rendererProps } from '@jsonforms/vue'

/**
 * oneOf tabs (backend type selection) render each option as generated layout. For the gphoto2 option the layout is
 * replaced by a control on the option's root, which is handled by Gphoto2BackendRenderer.
 */

defineProps({ ...rendererProps<Layout>() })

const controlUiSchema: ControlElement = { type: 'Control', scope: '#' }
</script>
