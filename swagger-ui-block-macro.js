/**
 * Extends the AsciiDoc syntax to support SwaggerUI pages. The Swagger docs are inserted using redoc
 *
 * Usage:
 *
 * swagger_ui::{attachmentsdir}/rest-client-api.yaml[] – for files used as Antora attachments
 * swagger_ui::https://github.com/hazelcast/hazelcast-mono/blob/5.6.z/path/to/api.yaml[] – for files hosted on GitHub
 */

const githubCache = new Map()

const SWAGGER_ATTACHMENTS_FOLDER = '_attachments/swagger';

/**
 * Converts a GitHub blob URL to GitHub API URL
 * From: https://github.com/hazelcast/hazelcast-mono/blob/5.6.z/docs/rest/api.yaml
 * To: https://api.github.com/repos/hazelcast/hazelcast-mono/contents/docs/rest/api.yaml?ref=5.6.z
 */
function convertToGitHubApiUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/)
  if (match) {
    const [, org, repo, branch, filepath] = match
    return `https://api.github.com/repos/${org}/${repo}/contents/${filepath}?ref=${branch}`
  }
  throw new Error(`Invalid GitHub URL format: ${url}`)
}

function fetchFromGitHubSync(githubUrl, token) {
  const { execSync } = require('child_process')

  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required for fetching from GitHub')
  }

  try {
    const apiUrl = convertToGitHubApiUrl(githubUrl)

    console.log(`[swagger_ui] API URL: ${apiUrl}`)

    // Use curl to fetch from GitHub API synchronously
    const curlCmd = `curl -s -H "Accept: application/vnd.github.v3+json" -H "User-Agent: Hazelcast-Docs-Builder" -H "Authorization: Bearer ${token}" "${apiUrl}"`

    const response = execSync(curlCmd, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const json = JSON.parse(response)

    if (json.message) {
      throw new Error(`GitHub API error: ${json.message}`)
    }

    if (json.content) {
      // GitHub API returns content as base64
      const content = Buffer.from(json.content, 'base64').toString('utf8')
      return content
    } else {
      throw new Error('No content field in GitHub API response')
    }
  } catch (error) {
    throw new Error(`Failed to fetch from GitHub API: ${error.message}`)
  }
}

/**
 * Writes fetched YAML directly to the docs output directory
 * Returns the absolute URL for the Redoc component
 */
function writeYamlToOutput(file, githubUrl, yamlContent) {
  const fs = require('fs')
  const path = require('path')

  const filename = githubUrl.split('/').pop().split('?')[0]

  // Assuming output is docs/component/version/_attachments/swagger/
  const component = file.src.component
  const version = file.src.version

  const outputDir = path.join(process.cwd(), 'docs', component, version, SWAGGER_ATTACHMENTS_FOLDER)
  const outputPath = path.join(outputDir, filename)

  try {
    fs.mkdirSync(outputDir, {recursive: true})

    fs.writeFileSync(outputPath, yamlContent, 'utf8')

    console.log(`[swagger_ui] Wrote file to: ${outputPath}`)

    const versionPath = (!version || version === '~') ? '' : `/${version}`
    return `/${component}${versionPath}/${SWAGGER_ATTACHMENTS_FOLDER}/${filename}`
  } catch (error) {
    console.error(`[swagger_ui] Failed to write file: ${error.message}`)
    return null
  }
}

const buildSwaggerUi = ({specUrl}) => `
<redoc
      spec-url='${specUrl}'
      scroll-y-offset="60"
      theme='{
         "spacing": {
           "sectionVertical": "20"
         },
         "typography": {
           "fontFamily": "Open Sans",
           "headings": {
             "fontFamily": "PP Telegraf"
           },
           "code": {
             "fontFamily": "Roboto Mono"
           }
         },
         "rightPanel": {
           "backgroundColor": "#191d29"
         }
       }'
    ></redoc>
    <script src="https://cdn.redoc.ly/redoc/v2.1.4/bundles/redoc.standalone.js"></script>`

function handleGitHubUrl(file, specUrl) {
  let yamlContent = githubCache.get(specUrl)

  if (!yamlContent) {
    try {
      const githubToken = process.env.GITHUB_TOKEN

      console.log(`[swagger_ui] Fetching from GitHub API...`)
      yamlContent = fetchFromGitHubSync(specUrl, githubToken)

      githubCache.set(specUrl, yamlContent)
      console.log(`[swagger_ui] ✓ Fetched ${yamlContent.length} bytes`)
    } catch (error) {
      console.error(`[swagger_ui] Failed to fetch ${specUrl}: ${error.message}`)
    }
  }

  // Write YAML to output directory and get the URL
  if (yamlContent) {
    const localUrl = writeYamlToOutput(file, specUrl, yamlContent)
    if (localUrl) {
      console.log(`[swagger_ui] Using local URL: ${localUrl}`)
      specUrl = localUrl
    }
  }

  return specUrl;
}

function blockSwaggerUiMacro({file}) {
  return function () {
    this.process((parent, specUrl) => {
      if (specUrl.startsWith('https://github.com/hazelcast')) {
        console.log(`[swagger_ui] Detected GitHub URL: ${specUrl}`)
        specUrl = handleGitHubUrl(file, specUrl);
      }

      const contentScripts = buildSwaggerUi({specUrl})
      return this.createBlock(parent, 'pass', contentScripts)
    })
  }
}

function register(registry, context) {
  registry.blockMacro('swagger_ui', blockSwaggerUiMacro(context))
}

module.exports.register = register
