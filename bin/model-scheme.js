module.exports = {
    mode: {
        type: 'string',
        enum: ["development", "production"]
    },
    server: {
        type: "object",
        properties: {
            port: {
                type: "number"
            }
        }
    },
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
        }
    },
    version: {
        type: 'string',
        default: "1.0.0"
    },
    author: {
        type: 'string',
        default: 'unknown'
    },
    verbose: {
        type: 'boolean',
    },
    openInBrowser: {
        type: 'boolean',
        default: true
    },
    fs: {
        type: 'object',
        properties: {
            dirs: {
                type: 'object',
                properties: {
                    source: {
                        type: 'string'
                    },
                    dist: {
                        type: 'string'
                    }
                }
            },
            dist: {
                type: 'object',
                properties: {
                    css: {
                        type: 'string'
                    },
                    fonts: {
                        type: 'string'
                    },
                    img: {
                        type: 'string'
                    },
                    js: {
                        type: 'string'
                    }
                }
            },
            source: {
                type: 'object',
                properties: {
                    scss: {
                        type: 'string'
                    },
                    html: {
                        type: 'string'
                    },
                    icons: {
                        type: 'string'
                    }
                }
            }
        },
        default: {
            "dirs": {
                "source": "source",
                "dist": "dist"
            },
            "dist": {
                "css": "css",
                "fonts": "fonts",
                "img": "img",
                "js": "js"
            },
            "source": {
                "scss": "scss",
                "html": "html",
                "icons": "icons"
            }
        }
    }
}