module.exports = {
    id: {
        type: "string",
        required: true
    },
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
            timeout: 0,
            pause: false,
            autorun: true
        }
    },
    project: {
        type: "object",
        properties: {
            id: {
                type: 'string'
            },
            version: {
                type: 'number'
            },
            author: {
                type: 'string'
            }
        }
    },
    fs: {
        type: 'object'
    }
}