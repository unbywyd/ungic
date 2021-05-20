module.exports = {
  dev: {
    type: "object",
    properties: {
      formatting: {
        "anyOf": [{
            type: 'string',
            enum: ['minifier', 'beautify']
          },
          {
            type: 'boolean',
            enum: [false]
          }
        ]
      },
      validation: {
        type: 'boolean'
      }
    },
    default: {
      formatting: 'beautify',
      validation: false
    }
  },
  release: {
    properties: {
      configs: {
        type: 'object',
        patternProperties: {
          "^[A-z_]+\w*$": {
            type: "object",
            properties: {
              formatting: {
                "anyOf": [{
                    type: 'string',
                    enum: ['minifier', 'beautify']
                  },
                  {
                    type: 'boolean',
                    enum: [false]
                  }
                ]
              },
              validation: {
                type: 'boolean'
              },
              includeLocalStyles: {
                type: 'boolean'
              },
              mergeInternalStyles: {
                type: 'boolean'
              },
              optimizeInternalStyles: {
                type: 'boolean'
              },
              includeLocalScripts: {
                type: 'boolean'
              },
              internalScriptsToFooter: {
                type: 'boolean'
              },
              externalScriptsToFooter: {
                type: 'boolean'
              },
              mergeInternalScripts: {
                type: 'boolean'
              },
              optimizeInternalScripts: {
                type: 'boolean'
              }
            }
          }
        }
      },
      build: {
        type: "object",
        patternProperties: {
          "^[A-z_]+\w*$": {
            type: "object",
            required: ['configId', 'pages'],
            properties: {
              version: {
                type: 'string'
              },
              configId: {
                type: "string",
                default: "default"
              },
              pages: {
                "anyOf": [{
                    type: "array",
                  },
                  {
                    type: "string",
                    enum: ["*"]
                  }
                ]
              },
              excludePages: {
                type: 'array'
              }
            }
          }
        },
        additionalProperties: false
      }
    },
    default: {
      configs: {
        default: {
          formatting: 'beautify',
          validation: false,
          includeLocalStyles: false,
          mergeInternalStyles: false,
          optimizeInternalStyles: false,
          includeLocalScripts: false,
          internalScriptsToFooter: false,
          externalScriptsToFooter: false,
          mergeInternalScripts: false,
          optimizeInternalScripts: false
        }
      },
      build: {
        default: {
          pages: "*",
          excludePages: [],
          configId: "default"
        }
      }
    }
  }
}