module.exports = {
    dirAttribute: {
        type: 'string',
        default: 'dir'
    },
    htmlIsRootElement: {
        type: 'boolean',
        default: true
    },
    generateThemeColorsVars: {
        type: 'boolean',
        default: false
    },
    themeColorsVarsMode: {
        type: 'boolean',
        default: false
    },
    cleancss: {
        "anyOf": [
            {
                type: 'object'
            },
            {
                type: 'boolean'
            }
        ],
        default: true
    }
}