export function publicXdocSchema({ version, definitions }) {
  const sdkVersion = version.split(' ')[0]
  return {
    schemaVersion: 'cli-agent/v1',
    version,
    commands: {
      pptx: {
        patchSchema: {
          jsonSchema: { $defs: definitions },
        },
      },
    },
    build: {
      schemaVersion: 'xdoc-build/v1',
      product: 'xdoc-cli',
      customerId: 'public',
      licenseId: 'not-applicable',
      buildId: 'build-public-test',
      edition: 'public-cli',
      pdfium: {
        provider: 'example/pdfium',
        version: '1.0.0.0',
        commit: '0123456789abcdef',
        sha256: 'a'.repeat(64),
        linkMode: 'static',
      },
    },
    authContract: {
      schemaVersion: 'xdoc-auth-contract-registry/v1',
      buildProfile: 'production',
      buildId: 'build-public-test',
      sdkVersion,
      trustProfileSha256: 'b'.repeat(64),
    },
  }
}

export function markdownShellCommands(markdown) {
  const commands = []
  for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
    let current = []
    for (const line of block[1].split('\n')) {
      if (!line.trim()) {
        if (current.length > 0) commands.push(current.join('\n'))
        current = []
        continue
      }
      const continuesPrevious = current.at(-1)?.trimEnd().endsWith('\\')
      if (current.length > 0 && !continuesPrevious && !/^\s/.test(line)) {
        commands.push(current.join('\n'))
        current = []
      }
      current.push(line)
    }
    if (current.length > 0) commands.push(current.join('\n'))
  }
  return commands
}
