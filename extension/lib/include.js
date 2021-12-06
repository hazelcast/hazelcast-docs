'use strict'

const picomatch = require('picomatch')

module.exports.register = (context, { config }) => {
  const cvMappings = processConfig(config)
  const trace = config.trace
  const logger = context.require('@antora/logger')('antora-aggregate-collector')


  context.on('contentAggregated', ({ contentAggregate }) => {
    contentAggregate.forEach(({ name, version, files }) => {
      cvMappings.forEach(({ nameMatch, versionMatch, mappings }) => {
        if (nameMatch(name) && versionMatch(version)) {
          files.forEach((f) => {
            mappings.forEach(({
              module, family,
              urlMatch, startPathMatch, branchTagMatch,
              pathMatch,
              relativeMaps,
            }) => {
              if (urlMatch(f.src.origin.url) &&
                    startPathMatch(f.src.origin.startPath) &&
                    branchTagMatch(f.src.origin) &&
                    pathMatch(f.src.path)) {
                mapRelative(f, relativeMaps)
                f.path = `modules/${module}/${family}s/${f.path}`
                trace && logger.debug({ file: f.src, component: name, version }, `mapped file to ${f.path}`)
              }
            })
          })
        }
      })
    }
    )
  })
}

const GROUP_RX = /{([^}]+)}/g

function expr (format) {
  return (ctx) => format.replace(GROUP_RX, (_, name) => ctx[name])
}

function mapRelative (f, relativeMaps) {
  relativeMaps.forEach(({ match, format }) => {
    const m = match(f.path, true)
    if (m.isMatch) {
      const ctx = m.match.groups
      f.path = format(ctx)
    }
  })
}

function picomatcher ({ include, exclude }) {
  const options = exclude ? { ignore: exclude } : {}
  return picomatch(include, options)
}

const TRUE = () => true

function processConfig (config) {
  const mappings = config.componentversions.map(({ name, version, mappings }) => {
    return {
      nameMatch: name ? picomatch(name) : TRUE,
      versionMatch: version ? picomatch(version) : TRUE,
      mappings: mappings.map(({ module, family, path, origin, relativemap }) => {
        const { url, startPath, branch, tag } = (origin || {})
        return {
          module,
          family,
          pathMatch: (path && path.include) ? picomatcher(path) : TRUE,
          urlMatch: (url && url.include) ? picomatcher(url) : TRUE,
          startPathMatch: (startPath && startPath.include) ? picomatcher(startPath) : TRUE,
          branchTagMatch: branchTagMatcher(branch, tag),
          relativeMaps: relativemap ? relativemap.map(({ match, format }) => {
            return { match: picomatch(match), format: expr(format) }
          }) : [],
        }
      }),
    }
  })
  return mappings
  function branchTagMatcher (branch, tag) {
    const branchMatch = (branch && branch.include) ? picomatch(branch) : false
    const tagMatch = (tag && tag.include) ? picomatch(tag) : false
    if (branchMatch) {
      if (tagMatch) {
        return (origin) => branchMatch(origin.branch) || tagMatch(origin.tag)
      }
      return (origin) => branchMatch(origin.branch)
    } else if (tagMatch) {
      return (origin) => tagMatch(origin.tag)
    }
    return TRUE
  }
}

module.exports.expr = expr
module.exports.mapRelative = mapRelative
module.exports.processConfig = processConfig
