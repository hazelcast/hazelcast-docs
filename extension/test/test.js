/* eslint-env mocha */
'use strict'

const picomatch = require('picomatch')
const { expect } = require('chai')
const { expr, mapRelative, processConfig } = require('./../lib/include')

describe('how does picomatch work', () => {
  it('true 2nd arg', () => {
    const matcher = picomatch('a/(?<b>*)/c/(?<d>*)/(?<f>*).adoc')
    const result1 = matcher('a/b/c/d/d.adoc')
    const result2 = matcher('a/b/c/d/d.adoc', true)
    expect(result1).to.equal(true)
    expect(result2.isMatch).to.equal(true)
    expect(result2.match.groups).to.deep.equal({ b: 'b', d: 'd', f: 'd' })
  })
})

describe('expr test', () => {
  it('basic', () => {
    const result = expr('a/{b}/c/{d}/{e}.adoc')
    expect(result({ b: 'bee', d: 'dee', e: 'eeeeee' })).to.equal('a/bee/c/dee/eeeeee.adoc')
  })
})

const config = {
  componentversions: [
    {
      name: 'foo',
      version: 'next',
      mappings: [
        {
          module: 'ROOT',
          family: 'page',
          path: {
            includes: ['**/*'],
          },
          relativemap: [
            {
              match: 'a/(?<b>*)/c/(?<d>*)/README.adoc',
              format: '{b}/{d}.adoc',
            },
          ],
        },
        {
          module: 'project',
          family: 'page',
          path: {
            includes: ['*/**/README.adoc'],
          },
          relativemap: [
            {
              match: '(?<project>*)/src/main/docs/README.adoc',
              format: 'projects/{project}.adoc',
            },
          ],
        },
      ],
    },
  ],
}

describe('processConfig test', () => {
  it('relative maps', () => {
    const mapped = processConfig(config)
    expect(mapped.length).to.equal(1)
    expect(mapped[0].nameMatch('foo')).to.equal(true)
    expect(mapped[0].nameMatch('bar')).to.equal(false)
    expect(mapped[0].versionMatch('next')).to.equal(true)
    expect(mapped[0].versionMatch('foo')).to.equal(false)
    expect(mapped[0].mappings[0].relativeMaps.length).to.equal(1)
    expect(mapped[0].mappings[0].relativeMaps[0].format({ b: 'x', d: 'y' })).to.equal('x/y.adoc')
  })
})

describe('mapRelative test', () => {
  it('mapRelative1', () => {
    const relativeMaps = processConfig(config)[0].mappings[0].relativeMaps
    const f = { path: 'a/foo/c/bar/README.adoc' }
    mapRelative(f, relativeMaps)
    expect(f.path).to.equal('foo/bar.adoc')
  })

  it('mapRelative2', () => {
    const relativeMaps = processConfig(config)[0].mappings[1].relativeMaps
    const f = { path: 'project/src/main/docs/README.adoc' }
    mapRelative(f, relativeMaps)
    expect(f.path).to.equal('projects/project.adoc')
  })
})
