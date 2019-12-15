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
            "html": "part",
            "md": "markdown",
            "json": "data",
            "yaml": "data"
        }
    },
    supported_include_types: {
        type: 'array',
        default: ['txt', 'hbs', 'html', 'md']
    },
    pretty: {
        type: 'boolean',
        default: true
    },
    relative_src: {
        type: 'boolean',
        default: true
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
    },
    relative_include: {
        type: 'boolean',
        default: true
    }
}