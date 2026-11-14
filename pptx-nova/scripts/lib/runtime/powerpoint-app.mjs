import { spawnSync } from 'node:child_process'

// Application names remain data even when they contain quotes or backslashes.
export const POWERPOINT_APP_ID_SCRIPT = `on run argv
  set app_name to item 1 of argv
  return id of application app_name
end run
`

export function checkPowerPointApp(appName, timeoutMs, execute = spawnSync) {
  return execute('/usr/bin/osascript', ['-', appName], {
    input: POWERPOINT_APP_ID_SCRIPT,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: false,
  })
}
