const buildSwaggerUi = ({ specUrl, bundleUrl }) => `<link rel="stylesheet" href="${bundleUrl}/swagger-ui.css">
<script src="${bundleUrl}/swagger-ui-bundle.js"></script>
<script src="${bundleUrl}/swagger-ui-standalone-preset.js"></script>
<script id="swagger-ui-script" data-url="${specUrl}">
;(function (config) {
  function HideTopbarPlugin() {
    // this plugin overrides the Topbar component to return nothing
    return {
      components: {
        Topbar: function() { return null }
      }
    }
  }
  SwaggerUIBundle({
    url: config.url,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl,HideTopbarPlugin],
    layout: 'StandaloneLayout',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
    docExpansion: 'none',
  })
})(document.getElementById('swagger-ui-script').dataset)
</script>`

function blockSwaggerUiMacro ({ file }) {
  return function () {
    this.process((parent, specUrl, attrs) => {
      const doc = parent.getDocument()
      specUrl = `${specUrl}`
      const bundleUrl = 'https://unpkg.com/swagger-ui-dist@3.52.5'
      const contentScripts = buildSwaggerUi({ specUrl, bundleUrl })
      file.asciidoc.attributes['page-content-scripts'] = contentScripts
      return this.createBlock(parent, 'pass', '<div id="swagger-ui"></div>')
    })
  }
}

function register (registry, context) {
  registry.blockMacro('swagger_ui', blockSwaggerUiMacro(context))
}

module.exports.register = register