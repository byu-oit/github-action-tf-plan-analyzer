const { existsSync, readFileSync, writeFileSync } = require('fs')
const path = require('path')
const { fileURLToPath } = require('url')

const [sarifFile, repositoryRoot] = process.argv.slice(2)

if (!sarifFile || !repositoryRoot) {
  throw new Error('Usage: rebase-sarif.js <sarif-file> <repository-root>')
}

const sarif = JSON.parse(readFileSync(sarifFile, 'utf8'))
const root = path.resolve(repositoryRoot)

for (const run of sarif.runs || []) {
  const uriBases = run.originalUriBaseIds || {}

  for (const result of run.results || []) {
    for (const location of result.locations || []) {
      const physicalLocation = location.physicalLocation || {}
      const artifact = physicalLocation.artifactLocation
      const base = artifact && uriBases[artifact.uriBaseId]
      const baseUri = base && base.uri

      if (!artifact || !artifact.uri || !baseUri) continue

      let absolutePath
      try {
        const absoluteUrl = new URL(artifact.uri, baseUri)
        if (absoluteUrl.protocol !== 'file:') continue
        absolutePath = fileURLToPath(absoluteUrl)
      } catch (error) {
        continue
      }

      const relativePath = path.relative(root, absolutePath)
      const isInRepository = relativePath !== '' &&
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)

      if (!isInRepository || !existsSync(absolutePath)) continue

      artifact.uri = relativePath.split(path.sep).join('/')
      delete artifact.uriBaseId
    }
  }
}

writeFileSync(sarifFile, `${JSON.stringify(sarif, null, 2)}\n`)
