module.exports = {
  dev: {
    type: "object",
    properties: {
      svgIconsMode: {
        type: 'string',
        enum: ["svgSprite", "fonts"]
      },
      svgIcons: {
        type: "boolean"
      },
      sprites: {
        type: "boolean"
      }
    },
    default: {
      svgIconsMode: 'fonts',
      sprites: true,
      svgIcons: true
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
              svgIconsMode: {
                type: 'string',
                enum: ["svgSprite", "fonts"]
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
            required: ['configId'],
            properties: {
              version: {
                type: 'string'
              },
              configId: {
                type: "string"
              },
              svgIcons: {
                "anyOf": [{
                    type: "string"
                  },
                  {
                    type: "array"
                  },
                  {
                    type: "boolean"
                  }
                ]
              },
              sprites: {
                "anyOf": [{
                    type: "string"
                  },
                  {
                    type: "array"
                  },
                  {
                    type: "boolean"
                  }
                ]
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
          svgIconsMode: 'fonts'
        }
      },
      build: {
        default: {
          configId: 'default',
          svgIcons: true,
          sprites: '**/*.png'
        }
      }
    }
  }
}