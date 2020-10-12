module.exports = {
    beautify: {
        type: 'object',
        default: {}
    },
    minifier: {
        type: 'object',
        default: {}
    },
    templates: {
        type: 'object',
        required: ['extname'],
        properties: {
            path: {
                type: 'string'
            },
            extname: {
                type: 'string'
            },
            global: {
                type: 'boolean'
            }
        },
        default: {
            path: './templates',
            global: true,
            extname: '.hbs'
        }
    },
    cheerio: {
        type: 'object',
        default: {
            decodeEntities: false
        }
    },
    replaceAmpToSymbol: {
        type: 'boolean',
        default: true
    },
    supportedTypes: {
        type: 'object',
        properties: {
            txt: {
                type: 'string'
            },
            hbs: {
                type: 'string',
                const: "template"
            },
            mustache: {
                type: 'string',
                const: "mustache_template"
            },
            pug: {
                type: 'string',
                const: "pug_template"
            },
            _: {
                type: 'string',
                const: "underscore_template"
            },
            html: {
                type: "string",
                const: "part"
            },
            md: {
                type: "string"
            },
            json: {
                type: "string"
            },
            yaml: {
                type: "string"
            }
        },
        default: {
            "txt": "text",
            "hbs": "template",
            "mustache": "mustache_template",
            "_": "underscore_template",
            "pug": "pug_template",
            "html": "part",
            "md": "markdown",
            "json": "data",
            "yaml": "data"
        }
    },
    supportedIncludeTypes: {
        type: 'array',
        default: ['txt', 'hbs', 'html', 'md', 'mustache', 'pug', '_']
    },
    cleancss: {
        type: ['object'],
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