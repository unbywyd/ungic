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
            svg: {
                type: 'object'
            }
        },
        default: {
            scss: {},
            html: {},
            svg: {}
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