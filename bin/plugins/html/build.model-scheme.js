module.exports = {
    dev: {
        type: "object",
        properties: {
            formatting: {
                "anyOf": [
                    {
                        type: 'string',
                        enum: ['minifier', 'beautify']
                    },
                    {
                        type: 'boolean',
                        enum: [false]
                    }
                ]
            },
            validation: {
                type: 'boolean'
            }
        },
        default: {
            formatting: 'beautify',
            validation: false
        }
    },
    release: {
        properties: {
            configs: {
                type: 'object',
                patternProperties: {
                    "^[A-z_]+\w*$": {
                        type: "object",
                        properties: {
                            formatting: {
                                "anyOf": [
                                    {
                                        type: 'string',
                                        enum: ['minifier', 'beautify']
                                    },
                                    {
                                        type: 'boolean',
                                        enum: [false]
                                    }
                                ]
                            },
                            validation: {
                                type: 'boolean'
                            },
                            includeExternalStyles: {
                                type: 'boolean'
                            },
                            mergeInternalStyles: {
                                type: 'boolean'
                            },
                            optimizeInternalStyles: {
                                type: 'boolean'
                            },
                            includeLocalScripts: {
                                type: 'boolean'
                            },
                            internalScriptsInFooter: {
                                type: 'boolean'
                            },
                            externalScriptsInFooter: {
                                type: 'boolean'
                            },
                            mergeInternalScripts: {
                                type: 'boolean'
                            },
                            optimizeInternalScripts: {
                                type: 'boolean'
                            }
                        }
                    }
                }
            },
            build: {
                type: "object",
                patternProperties: {
                    "^[A-z_]+\w*$": {
                        type: "object",
                        required: ['configId', 'pages', 'host'],
                        properties: {
                            version: {
                                type: 'string'
                            },
                            configId: {
                                type: "string",
                                default: "default"
                            },
                            pages: {
                                "anyOf": [
                                    {
                                        type: ["array"],
                                    },
                                    {
                                        type: ["string"],
                                        enum: ["*"]
                                    }
                                ]
                            },
                            excludePages: {
                                type: 'array'
                            },
                            host: {
                                type: 'string'
                            }
                        }
                    }
                },
                additionalProperties: false
            }
        },
        default: {
            configs: {
                default: {
                    formatting: 'beautify',
                    validation: false,
                    includeExternalStyles: false,
                    mergeInternalStyles: false,
                    optimizeInternalStyles: false,
                    includeLocalScripts: false,
                    internalScriptsInFooter: false,
                    externalScriptsInFooter: false,
                    mergeInternalScripts: false,
                    optimizeInternalScripts: false
                }
            },
            build: {
                default: {
                    pages: "*",
                    host: '/',
                    excludePages: [],
                    configId: "default"
                }
            }
        }
    }
}