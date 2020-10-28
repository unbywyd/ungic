module.exports = {
    beautify: {
        type: 'object',
        default: {}
    },
    minifier: {
        type: 'object',
        default: {}
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
    cleancss: {
        type: 'object',
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