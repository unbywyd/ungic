module.exports = {
    rtlPrefix: {
        type: "object",
        properties: {
            prefixType: {
                type: 'string',
                enum: ['attribute', 'class']
            },
            prefix: {
                type: 'string'
            }
        },
        default: {
            prefixType: "attribute",
            prefix: ''
        }
    },
    cleancss: {
        type: 'boolean',
        default: true
    }
}