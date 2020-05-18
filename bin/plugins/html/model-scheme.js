module.exports = {
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
    supported_types: {
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
    supported_include_types: {
        type: 'array',
        default: ['txt', 'hbs', 'html', 'md', 'mustache', 'pug', '_']
    },
    pretty: {
        type: ['object', 'boolean'],
        default: true
    },
    minifier: {
        type: ['object', 'boolean'],
        default: false
    },
    relative_src: {
        type: 'boolean',
        default: false
    },
    dev_validation: {
        type: 'boolean',
        default: false
    },
    release_validation: {
        type: 'boolean',
        default: true
    },
    delete_from_dist: {
        type: 'boolean',
        default: false
    }
}