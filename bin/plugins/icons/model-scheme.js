module.exports = {
    start_codepoint: {
        type: 'number',
        default: 61696
    },
    sprites: {
        type: 'object',
        default: {
            className: 'sprite'
        },
        properties: {
            className: {
                type: 'string'
            }
        }
    },
    svg_sprite: {
        type: 'object',
        default: {
            width: '2em',
            height: '2em',
            external: false,
            enabled: true,
            className: 'svg-icon'
        },
        properties: {
            className: {
                type: 'string'
            },
            enabled: {
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
    fonts_to_sprite: {
        type: 'boolean',
        default: false
    },
    fonts: {
        type: 'object',
        default: {
            name: 'ungic',
            fixedWidth: false,
            fontHeight: 512,
            centerHorizontally: true,
            normalize: true,
            enabled: true,
            className: 'icon'
        },
        properties: {
            className: {
                type: 'string'
            },
            enabled: {
                type: 'boolean'
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
            }
        }
    }
}