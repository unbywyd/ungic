module.exports = {
    beautify: {
        type: 'object',
        default: {}
    },
    minifier: {
        type: 'object',
        default: {}
    },    
    cheerio: {
        type: 'object',
        default: {
            decodeEntities: false
        }
    },
    customTypeHandlers: {
        type: 'object',
        patternProperties: {
          "^[A-z_]+\w*$": {
            type: "object",
            required: ["transformer"],
            properties: {
                transformer: {
                    type: "string"
                },
                dev: {
                    type: "boolean",
                    default: false
                },
                includeHandler: {
                    "anyOf": [{
                        type: 'string'
                      },
                      {
                        type: 'boolean'
                      }
                    ]
                }
            }
          }
        }
    },
    replaceAmpToSymbol: {
        type: 'boolean',
        default: true
    },
    dirAttribute: {
        type: 'string',
        default: 'dir'
    },
    cleancss: {
        type: 'object',
        default: {}
    },
    relativeSrc: {
        type: 'boolean',
        default: false
    },
    deleteFromDist: {
        type: 'boolean',
        default: false
    }
}