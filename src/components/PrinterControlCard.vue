<template>
  <q-card v-if="available" flat class="q-mr-md q-mb-md printer-control-card">
    <q-card-section>
      <q-list>
        <q-item-label header class="row items-center">
          <span class="col">{{ $t('Printer') }}</span>
          <q-btn flat round dense size="sm" icon="sym_o_refresh" :loading="loading" :aria-label="$t('Refresh')" @click="load" />
        </q-item-label>

        <q-item v-if="error">
          <q-item-section class="text-negative">{{ error }}</q-item-section>
        </q-item>
        <q-item v-else-if="printers.length === 0 && !loading">
          <q-item-section class="text-grey-7">{{ $t('No printers set up in CUPS.') }}</q-item-section>
        </q-item>

        <q-item v-for="printer in printers" :key="printer.name" class="printer-control-card__printer">
          <q-item-section>
            <q-item-label class="row items-center no-wrap q-gutter-x-sm">
              <q-badge :color="stateColor(printer)" :label="stateLabel(printer)" />
              <q-badge v-if="printer.connected === false" color="negative" outline>
                <q-icon name="sym_o_usb_off" size="14px" class="q-mr-xs" />{{ $t('Not connected') }}
              </q-badge>
              <span class="text-weight-medium ellipsis">{{ printer.info || printer.name }}</span>
            </q-item-label>
            <q-item-label caption class="row items-center q-gutter-x-xs">
              <span>{{ printer.name }}</span>
              <template v-if="printer.connected === true">
                <q-icon name="sym_o_usb" />
                <span>{{ $t('connected via USB') }}</span>
              </template>
            </q-item-label>

            <q-item-label v-if="printer.connected === false" class="text-negative">
              {{ $t('The printer is not plugged in via USB. Check cable and power.') }}
            </q-item-label>

            <q-item-label v-if="!printer.accepting_jobs" class="text-warning">{{ $t('Does not accept new jobs.') }}</q-item-label>
            <q-item-label v-if="printer.state_message" class="text-body2">{{ printer.state_message }}</q-item-label>
            <q-item-label v-if="problemReasons(printer).length" class="q-gutter-xs">
              <q-chip
                v-for="reason in problemReasons(printer)"
                :key="reason"
                dense
                square
                size="sm"
                :color="reason.endsWith('-error') ? 'negative' : 'warning'"
                text-color="white"
                :label="reason"
              />
            </q-item-label>
            <q-item-label caption>{{ $t('{count} jobs in queue', { count: printer.queued_jobs }) }}</q-item-label>

            <q-item-label class="q-mt-sm row q-gutter-sm">
              <q-btn
                no-caps
                unelevated
                :color="needsResume(printer) ? 'primary' : 'grey-5'"
                icon="sym_o_play_arrow"
                :label="$t('Resume printer')"
                :loading="busy === `${printer.name}:resume`"
                @click="action(printer, 'resume')"
              />
              <q-btn
                no-caps
                outline
                color="negative"
                icon="sym_o_delete_sweep"
                :label="$t('Clear queue')"
                :disable="printer.queued_jobs === 0"
                :loading="busy === `${printer.name}:cancel-jobs`"
                @click="confirmClear = printer"
              />
            </q-item-label>

            <q-item-label class="q-mt-sm">
              <template v-if="isAutoResume(printer)">
                <q-icon name="sym_o_check_circle" color="positive" />
                <span class="text-caption q-ml-xs">{{ $t('Automatic resume after errors is on.') }}</span>
              </template>
              <template v-else>
                <div class="text-caption text-grey-8">
                  {{ $t('After an error (e.g. paper or ribbon empty) CUPS stops the printer until it is resumed manually.') }}
                </div>
                <q-btn
                  no-caps
                  flat
                  dense
                  color="primary"
                  icon="sym_o_autorenew"
                  :label="$t('Resume automatically after errors')"
                  :loading="busy === `${printer.name}:error-policy`"
                  @click="action(printer, 'error-policy', { policy: 'retry-current-job' })"
                />
              </template>
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>

    <q-dialog :model-value="confirmClear !== null" @update:model-value="v => !v && (confirmClear = null)">
      <q-card class="q-pa-sm" style="min-width: 350px" flat>
        <q-card-section class="row items-center no-wrap">
          <q-avatar icon="sym_o_delete_sweep" color="negative" text-color="white" />
          <p class="q-ml-sm q-mb-none">
            {{
              $t('Cancel all {count} jobs of {printer}? Pending prints are lost.', {
                count: confirmClear?.queued_jobs ?? 0,
                printer: confirmClear?.info || confirmClear?.name,
              })
            }}
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup no-caps flat :label="$t('BTN_LABEL_CANCEL')" color="primary" />
          <q-btn v-close-popup no-caps :label="$t('Clear queue')" color="negative" @click="confirmClear && action(confirmClear, 'cancel-jobs')" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { _fetch } from '@/util/fetch_api'

/**
 * Printer status and recovery for CUPS printers.
 * Needs the "printer_control" user plugin in the backend; the card stays hidden if it is not installed.
 */

interface PrinterInfo {
  name: string
  info: string
  model: string
  state: 'idle' | 'printing' | 'stopped' | 'unknown'
  state_reasons: string[]
  state_message: string
  accepting_jobs: boolean
  queued_jobs: number
  error_policy: string | null
  connection?: 'usb' | 'network' | 'other'
  /** only known for USB printers: is the device plugged in right now */
  connected?: boolean | null
}

const API = '/api/admin/printer-control/printers'
const POLL_INTERVAL_MS = 5000

const { t } = useI18n()
const available = ref(false)
const loading = ref(false)
const error = ref('')
const printers = ref<PrinterInfo[]>([])
const busy = ref<string | null>(null)
const confirmClear = ref<PrinterInfo | null>(null)

const stateLabel = (p: PrinterInfo) =>
  ({ idle: t('Ready'), printing: t('Printing'), stopped: t('Stopped'), unknown: t('Unknown') })[p.state] ?? p.state
const stateColor = (p: PrinterInfo) => ({ idle: 'positive', printing: 'info', stopped: 'negative', unknown: 'grey' })[p.state] ?? 'grey'
const needsResume = (p: PrinterInfo) => p.state === 'stopped' || !p.accepting_jobs
const isAutoResume = (p: PrinterInfo) => p.error_policy === 'retry-current-job' || p.error_policy === 'retry-job'
// "-report" reasons are informational (e.g. offline-report on many USB printers), only show warnings and errors
const problemReasons = (p: PrinterInfo) => p.state_reasons.filter(r => r.endsWith('-error') || r.endsWith('-warning'))

const load = async () => {
  loading.value = true
  try {
    const response = await _fetch(API)
    if (response.status === 404) {
      available.value = false // plugin not installed
      return
    }
    available.value = true
    if (!response.ok) {
      error.value = (await response.json().catch(() => null))?.detail ?? `${response.status} ${response.statusText}`
      return
    }
    error.value = ''
    printers.value = await response.json()
  } catch (err) {
    console.warn('printer control: cannot load printers', err)
  } finally {
    loading.value = false
  }
}

const action = async (printer: PrinterInfo, name: 'resume' | 'cancel-jobs' | 'error-policy', body?: object) => {
  busy.value = `${printer.name}:${name}`
  try {
    const response = await _fetch(`${API}/${encodeURIComponent(printer.name)}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => null))?.detail ?? `${response.status} ${response.statusText}`
      Notify.create({ message: String(detail), caption: t('Printer action failed'), color: 'negative', icon: 'sym_o_error' })
    } else {
      Notify.create({ message: t('Done.'), color: 'positive', icon: 'sym_o_check' })
    }
  } catch (err) {
    Notify.create({ message: String(err), caption: t('Printer action failed'), color: 'negative', icon: 'sym_o_error' })
  } finally {
    busy.value = null
    await load()
  }
}

let timer: ReturnType<typeof setInterval> | null = null
onMounted(async () => {
  await load()
  // keep polling only if the plugin is there
  if (available.value) timer = setInterval(load, POLL_INTERVAL_MS)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style lang="scss">
.printer-control-card {
  min-width: 320px;
  max-width: 480px;
}
</style>
