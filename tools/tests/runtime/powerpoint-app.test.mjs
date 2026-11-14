import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkPowerPointApp,
  POWERPOINT_APP_ID_SCRIPT,
} from '../../../pptx-nova/scripts/lib/runtime/powerpoint-app.mjs'

test('PowerPoint application names stay in argv, never in AppleScript source', () => {
  const result = { status: 0, stdout: 'com.microsoft.Powerpoint' }
  for (const app of [
    'Microsoft PowerPoint',
    'PowerPoint "Preview"',
    'PowerPoint\\Beta',
    '\\"\nerror "untrusted application name"\n--',
    '应用名称',
  ]) {
    const actual = checkPowerPointApp(app, 2345, (command, argv, options) => {
      assert.equal(command, '/usr/bin/osascript')
      assert.deepEqual(argv, ['-', app])
      assert.equal(options.input, POWERPOINT_APP_ID_SCRIPT)
      assert.equal(options.shell, false)
      assert.equal(options.timeout, 2345)
      return result
    })
    assert.equal(actual, result)
  }
})

test('PowerPoint availability failures retain their original diagnostic result', () => {
  const failure = { status: 1, stdout: '', stderr: 'Application not found', error: undefined }
  assert.equal(
    checkPowerPointApp('Missing PowerPoint', 1000, () => failure),
    failure,
  )
})
