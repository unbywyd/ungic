module.exports = {
    start_codepoint: {
        type: 'number',
        default: 61696
    },
    icons_mode: {
        type: 'string',
        enum: ["svg_sprites", "fonts"],
        required: true,
        default: 'svg_sprites'
    },
    sprites: {
        type: 'object',
        default: {
            className: 'sprite',
            enabled: true
        },
        properties: {
            className: {
                type: 'string'
            },
            enabled: {
                type: 'boolean'
            }
        }
    },
    svg_sprites: {
        type: 'object',
        default: {
            width: '2em',
            height: '2em',
            external: false,
            className: 'svg-icon'
        },
        properties: {
            className: {
                type: 'string'
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
            className: 'icon',
            fontSize: '2em'
        },
        properties: {
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