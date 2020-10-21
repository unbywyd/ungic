module.exports = {
    render: {
        properties: {
            id: {
                type: 'string'
            },
            timeout: {
                type: 'number'
            },
            pause: {
                type: 'boolean'
            },
            autorun: {
                type: 'boolean'
            }
        },
        default: {
            timeout: 50,
            pause: false,
            autorun: true
        }
    },
    startCodepoint: {
        type: 'number',
        default: 61696
    },
    sprites: {
        type: 'object',
        default: {
            className: 'sprite',
            maxWidth: 70,
            maxHeight: false
        },
        properties: {
            className: {
                type: 'string'
            },
            maxWidth: {
                type: 'number'
            },
            maxHeight: {
                "oneOf": [
                    { type: "boolean",  enum:[false]},
                    { type: "number" }
                ]
            }
        }
    },
    svgSprite: {
        type: 'object',
        default: {
            width: '2em',
            height: '2em',
            external: false,
            removeColors: true,
            className: 'svg-icon'
        },
        properties: {
            className: {
                type: 'string'
            },
            removeColors: {
                type: 'boolean'
            },
            external: {
                type: 'boolean'
            },
            width: {
                "oneOf": [
                    { type: "string" },
                    { type: "number" }
                ]
            },
            height: {
                "oneOf": [
                    { type: "string" },
                    { type: "number" }
                ]
            }
        }
    },
    fonts: {
        type: 'object',
        default: {
            name: 'ungic',
            fixedWidth: false,
            fontHeight: 512,
            centerHorizontally: true,
            normalize: true,
            fontWeight: 400,
            className: 'icon',
            fontSize: '2em',
            lables: true
        },
        properties: {
            lables: {
                type: 'boolean'
            },
            className: {
                type: 'string'
            },
            name: {
                type: 'string'
            },
            fixedWidth: {
                type: 'boolean'
            },
            fontHeight: {
                type: 'number'
            },
            fontWeight: {
                type: 'number'
            },
            centerHorizontally: {
                type: 'boolean'
            },
            normalize: {
                type: 'boolean'
            },
            fontSize: {
                "oneOf": [
                    { type: "string" },
                    { type: "number" }
                ]
            }
        }
    }
}