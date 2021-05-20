module.exports = {
  dev: {
    type: "object",
    additionalProperties: false,
    required: ['theme'],
    properties: {
      theme: {
        type: "string"
      },
      autoprefixer: {
        type: "boolean",
        default: true
      },
      inverse: {
        type: "boolean"
      },
      defaultInverse: {
        type: "boolean"
      },
      direction: {
        type: "string",
        enum: ["ltr", "rtl"]
      },
      oppositeDirection: {
        type: "boolean"
      }
    },
    default: {
      inverse: true,
      autoprefixer: true,
      defaultInverse: false,
      direction: 'ltr',
      oppositeDirection: true,
      theme: 'default'
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
              autoprefixer: {
                type: "boolean",
                default: true
              },
              inverse: {
                type: "boolean"
              },              
              defaultInverse: {
                type: "boolean"
              },
              themeMode: {
                type: "string",
                enum: ["combined", "external"]
              },
              inverseMode: {
                type: "string",
                enum: ["combined", "external"]
              },
              direction: {
                "anyOf": [{
                    type: "string",
                    enum: ["ltr", "rtl"]
                  },
                  {
                    type: "boolean",
                    enum: [false]
                  }
                ]
              },
              oppositeDirection: {
                type: "boolean"
              }
            }
          }
        },
        additionalProperties: false
      },
      build: {
        type: "object",
        patternProperties: {
          "^[A-z_]+\w*$": {
            type: "object",
            required: ['configId'],
            properties: {
              configId: {
                type: "string",
                default: "default"
              },
              defaultTheme: {
                type: "string"
              },
              themes: {
                "anyOf": [{
                    type: "array",
                  },
                  {
                    type: "boolean",
                    enum: [false]
                  },
                  {
                    type: "string",
                    enum: ["*"]
                  }
                ]
              },
              version: {
                type: 'string'
              },
              excludeComponents: {
                type: 'array'
              },
              components: {
                "anyOf": [{
                    type: "array",
                  },
                  {
                    type: "string",
                    enum: ["*"]
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
          themeMode: "external",
          inverseMode: "combined",
          inverse: true,
          defaultInverse: false,
          autoprefixer: true,
          direction: 'ltr',
          oppositeDirection: true
        }
      },
      build: {
        default: {
          configId: "default",
          themes: "*",         
          defaultTheme: "default",
          components: "*",
          excludeComponents: []
        }
      }
    }
  }
}