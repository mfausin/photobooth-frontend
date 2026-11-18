import type { JsonFormsRendererRegistryEntry, JsonSchema } from '@jsonforms/core'
import { and, rankWith, schemaMatches, schemaTypeIs } from '@jsonforms/core'

import { default as ArrayListRenderer } from './ArrayListRenderer.vue'
import { default as Gphoto2ParametersArrayRenderer } from './Gphoto2ParametersArrayRenderer.vue'

export const ArrayListRendererEntry: JsonFormsRendererRegistryEntry = {
  renderer: ArrayListRenderer,
  tester: rankWith(2.1, schemaTypeIs('array')),
}

// parameter sets of the gphoto2 backend (list[Gphoto2Parameters], title from the pydantic model config)
const isGphoto2Parameters = (schema: JsonSchema): boolean => {
  const items = schema.items as JsonSchema | undefined
  return !!items && !Array.isArray(items) && (items.title === 'Gphoto2 Parameters' || (items.$ref ?? '').endsWith('/Gphoto2Parameters'))
}

export const Gphoto2ParametersArrayRendererEntry: JsonFormsRendererRegistryEntry = {
  renderer: Gphoto2ParametersArrayRenderer,
  tester: rankWith(5, and(schemaTypeIs('array'), schemaMatches(isGphoto2Parameters))),
}

export const arrayRenderers = [ArrayListRendererEntry, Gphoto2ParametersArrayRendererEntry]
