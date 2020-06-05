module.exports = {
    dev: {
        type: "object",
        properties: {
            config: {
                type: "object",
                properties: {
                    beautify: {
                        type: ['object', 'boolean'],
                    },
                    minifier: {
                        type: ['object', 'boolean']
                    },
                    validation: {
                        type: 'boolean'
                    }
                }
            }
        },
        default: {
            config: {
                beautify: true,
                minifier: false,
                validation: false
            }
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
                            beautify: {
                                type: ['object', 'boolean'],
                            },
                            minifier: {
                                type: ['object', 'boolean']
                            },
                            validation: {
                                type: 'boolean'
                            },
                            include_external_styles: {
                                type: 'boolean'
                            },
                            merge_internal_styles: {
                                type: 'boolean'
                            },
                            optimize_internal_styles: {
                                type: 'boolean'
                            },
                            include_local_scripts: {
                                type: 'boolean'
                            },
                            internal_scripts_in_footer: {
                                type: 'boolean'
                            },
                            external_scripts_in_footer: {
                                type: 'boolean'
                            },
                            merge_internal_scripts: {
                                type: 'boolean'
                            },
                            optimize_internal_scripts: {
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
                        required: ['version', 'name', 'config_id'],
                        properties: {
                            version: {
                                type: 'string'
                            },
                            config_id: {
                                type: "string",
                                default: "default"
                            },
                            name: {
                                type: 'string'
                            },
                            host: {
                                type: 'string'
                            },
                            icons_release: {
                                type: 'boolean'
                            },
                            scss_release: {
                                type: 'boolean'
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
                    beautify: false,
                    minifier: true,
                    validation: true
                }
            },
            build: {
                "main": {
                    name: 'main',
                    host: '/',
                    config_id: "default",
                    version: '0.0.1',
                    icons_release: true,
                    scss_release: true
                }
            }
        }
    }
}