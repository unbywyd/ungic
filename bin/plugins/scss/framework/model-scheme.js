module.exports = {
    top_selector: {
        type: 'string',
        default: 'html'
    },
    rtl_prefix: {
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
            prefixType: "attribute"
        }
    },
    dev: {
        type: "object",
        required: ['default_theme'],
        properties: {
            default_theme: {
                type: "string"
            },
            config: {
                type: "object",
                properties: {
                    autoprefixer: {
                        type: "boolean",
                        default: true
                    },
                    inverse: {
                        type: ["boolean"]
                    },
                    direction: {
                        type: ["string"],
                        enum: ["ltr", "rtl"]
                    },
                    opposite_direction: {
                        type: ["boolean"]
                    }
                }
            }
        },
        default: {
            config: {
                inverse: true,
                autoprefixer: true,
                direction: 'ltr',
                opposite_direction: true
            },
            default_theme: 'default'
        }
    },
    release: {
        properties: {
            config: {
                type: 'object',
                patternProperties: {
                    "^[A-z_]+\w*$": {
                        type: "object",
                        properties: {
                            autoprefixer: {
                                type: "boolean",
                                default: true
                            },
                            inverse: {
                                type: ["boolean"]
                            },
                            default_inverse: {
                                type: ["boolean"]
                            },
                            theme_mode: {
                                type: ["string"],
                                enum: ["combined", "external"]
                            },
                            direction: {
                                "anyOf": [
                                    {
                                        type: ["string"],
                                        enum: ["ltr", "rtl"]
                                    },
                                    {
                                        type: ["boolean"],
                                        enum: [false]
                                    }
                                ]
                            },
                            opposite_direction: {
                                type: ["boolean"]
                            }
                        }
                    }
                },
                additionalProperties: false
            },
            build: {
                type: "object",
                patternProperties: {
                    "^[A-z_]+\w*$": {
                        type: "object",
                        required: ['components', 'default_theme'],
                        properties: {
                            config: {
                                type: "string",
                                default: "default"
                            },
                            themes: {
                                type: 'array'
                            },
                            version: {
                                type: 'string'
                            },
                            default_theme: {
                                type: 'string'
                            },
                            components: {
                                "anyOf": [
                                    {
                                        type: ["array"],
                                    },
                                    {
                                        type: ["string"],
                                        enum: ["*"]
                                    }
                                ]
                            }
                        }
                    }
                },
                additionalProperties: false
            }
        },
        default: {
            config: {
                default: {
                    theme_mode: "external",
                    inverse: true,
                    default_inverse: false,
                    autoprefixer: true,
                    direction: 'ltr',
                    opposite_direction: true
                }
            },
            build: {
                "main": {
                    config: "default",
                    components: "*",
                    default_theme: 'default',
                    version: '0.0.1'
                }
            }
        }
    }
}