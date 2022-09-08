module.exports = {
    plugins: {
        type: 'object',
        properties: {
            scss: {
                type: 'object'
            },
            html: {
                type: 'object'
            },
            icons: {
                type: 'object'
            }
        },
        default: {
            scss: {},
            html: {},
            icons: {}
        }
    },
    id: {
        type: "string",
        required: true
    },
    version: {
        type: 'number',
        required: true
    },
    author: {
        type: 'string',
        required: true
    }
}