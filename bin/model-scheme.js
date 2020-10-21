module.exports = {
    mode: {
        type: 'string',
        enum: ["development", "production"],
        default: "development"
    },
    server: {
        type: "object",
        properties: {
            port: {
                type: "number"
            }
        },
        default: {
            port: 2020
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
    build: {
        type: 'object',
        properties: {
            releases: {
                type: "object",
                patternProperties: {
                    "^[A-z_]+\w*$": {
                        type: "object",
                        required: ['scssBuildName', 'htmlBuildName', 'iconsBuildName'],
                        properties: {
                            saveAssetsDirs: {
                                type: 'array'
                            },
                            version: {
                                type: 'string'
                            },
                            combineIcons: {
                                type: 'boolean'
                            },
                            combineScssComponents: {
                                type: 'boolean'
                            },
                            IncludeOnlyUsedComponents: {
                                type: 'boolean'
                            },
                            scssBuildName: {
                                type: 'string'
                            },
                            htmlBuildName: {
                                type: 'string'
                            },
                            iconsBuildName: {
                                type: 'string'
                            }
                        }
                    }
                }
            },
            plugins: {
                type: 'object',
                properties: {
                    icons: {
                        type: 'object'
                    },
                    scss: {
                        type: 'object'
                    },
                    html: {
                        type: 'object'
                    }
                }
            }
        },
        default: {
            releases: {
                default: {
                    saveAssetsDirs: ['img', 'imgs', 'images'],
                    scssBuildName: "default",
                    htmlBuildName: "default",
                    iconsBuildName: "default",
                    IncludeOnlyUsedComponents: false,
                    combineIcons: true,
                    combineScssComponents: true
                }
            }
        }
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
                required: ['source', 'dist', 'temp'],
                properties: {
                    source: {
                        type: 'string'
                    },
                    dist: {
                        type: 'string'
                    },
                    temp: {
                        type: 'string'
                    }
                }
            },
            dist: {
                type: 'object',
                required: ['css', 'fonts', 'img'],
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
                required: ['scss', 'html', 'icons'],
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
                "dist": "dist",
                "temp": "temp"
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